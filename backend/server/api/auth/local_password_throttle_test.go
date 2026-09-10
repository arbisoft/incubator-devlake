/*
Licensed to the Apache Software Foundation (ASF) under one or more
contributor license agreements.  See the NOTICE file distributed with
this work for additional information regarding copyright ownership.
The ASF licenses this file to You under the Apache License, Version 2.0
(the "License"); you may not use this file except in compliance with
the License.  You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

package auth

import (
	"context"
	"fmt"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/apache/incubator-devlake/core/dal"
	"github.com/apache/incubator-devlake/core/runner"
	"github.com/apache/incubator-devlake/impls/dalgorm"
	"github.com/apache/incubator-devlake/server/api/access"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func TestLocalPasswordHasherHonorsCanceledWorkerWait(t *testing.T) {
	hasher, err := newLocalPasswordHasher(localPasswordHashConfig{
		MemoryKiB:   19 * 1024,
		Iterations:  2,
		Parallelism: 1,
		SaltLength:  16,
		KeyLength:   32,
		Workers:     1,
	})
	if err != nil {
		t.Fatalf("newLocalPasswordHasher() error = %v", err)
	}
	hasher.workers <- struct{}{}

	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := hasher.HashContext(ctx, "a secure local password"); err != context.Canceled {
		t.Fatalf("HashContext() error = %v, want context.Canceled", err)
	}
	<-hasher.workers
}

// TestLocalLoginThrottleReservationsUseMySQLLocking exercises the lock and
// duplicate-key paths a mock DAL cannot model. It runs only against an explicitly
// disposable MySQL database, never a developer's configured DevLake database.
func TestLocalLoginThrottleReservationsUseMySQLLocking(t *testing.T) {
	dbURL := os.Getenv("AUTH_LOCAL_THROTTLE_E2E_DB_URL")
	if dbURL == "" {
		t.Skip("AUTH_LOCAL_THROTTLE_E2E_DB_URL is not set")
	}

	rgorm, err := runner.MakeDbConnection(dbURL, &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	if err != nil {
		t.Skipf("cannot connect to AUTH_LOCAL_THROTTLE_E2E_DB_URL: %v", err)
	}
	if err := rgorm.AutoMigrate(&access.LocalLoginAttempt{}); err != nil {
		t.Fatalf("AutoMigrate(LocalLoginAttempt) error = %v", err)
	}
	db := dalgorm.NewDalgorm(rgorm)

	throttle, err := newLocalLoginThrottle([]byte("local-rate-limit-key-with-at-least-32-bytes"))
	if err != nil {
		t.Fatalf("newLocalLoginThrottle() error = %v", err)
	}
	now := time.Date(2026, time.September, 9, 12, 0, 0, 0, time.UTC)
	throttle.now = func() time.Time { return now }
	loginName := fmt.Sprintf("throttle-%d", time.Now().UnixNano())
	clientIP := "198.51.100.10"
	buckets := throttle.buckets(loginName, clientIP)
	t.Cleanup(func() {
		if cleanupErr := rgorm.Where("bucket_key IN ?", []string{buckets[0].key, buckets[1].key}).Delete(&access.LocalLoginAttempt{}).Error; cleanupErr != nil {
			t.Errorf("cleanup local login attempts: %v", cleanupErr)
		}
	})

	const attempts = int(localLoginFailureLimit) + 3
	start := make(chan struct{})
	results := make(chan *localLoginReservation, attempts)
	errorsCh := make(chan error, attempts)
	var wg sync.WaitGroup
	for i := 0; i < attempts; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			reservation, allowed, reserveErr := reserveLocalLoginAttempt(db, throttle, loginName, clientIP)
			if reserveErr != nil {
				errorsCh <- reserveErr
				return
			}
			if allowed {
				results <- reservation
			}
		}()
	}
	close(start)
	wg.Wait()
	close(results)
	close(errorsCh)
	for reserveErr := range errorsCh {
		t.Errorf("Reserve() error = %v", reserveErr)
	}

	reservations := make([]*localLoginReservation, 0, localLoginFailureLimit)
	for reservation := range results {
		reservations = append(reservations, reservation)
	}
	if len(reservations) != int(localLoginFailureLimit) {
		t.Fatalf("allowed reservations = %d, want %d", len(reservations), localLoginFailureLimit)
	}

	if err := completeLocalLoginAttempt(db, throttle, reservations[0], localLoginAttemptFailed); err != nil {
		t.Fatalf("complete failed reservation: %v", err)
	}
	if _, allowed, reserveErr := reserveLocalLoginAttempt(db, throttle, loginName, clientIP); reserveErr != nil || allowed {
		t.Fatalf("reserve with failed and pending attempts = allowed:%t err:%v, want throttled", allowed, reserveErr)
	}
	if err := completeLocalLoginAttempt(db, throttle, reservations[1], localLoginAttemptSucceeded); err != nil {
		t.Fatalf("complete successful reservation: %v", err)
	}
	if _, allowed, reserveErr := reserveLocalLoginAttempt(db, throttle, loginName, clientIP); reserveErr != nil || !allowed {
		t.Fatalf("reserve after successful login = allowed:%t err:%v, want allowed", allowed, reserveErr)
	}

	now = now.Add(localLoginReservationLease + time.Second)
	if _, allowed, reserveErr := reserveLocalLoginAttempt(db, throttle, loginName, clientIP); reserveErr != nil || !allowed {
		t.Fatalf("reserve after lease expiry = allowed:%t err:%v, want allowed", allowed, reserveErr)
	}
}

func reserveLocalLoginAttempt(db dal.Dal, throttle *localLoginThrottle, loginName, clientIP string) (*localLoginReservation, bool, error) {
	tx := db.Begin()
	reservation, allowed, err := throttle.Reserve(tx, loginName, clientIP)
	if err != nil {
		_ = tx.Rollback()
		return nil, false, err
	}
	if err := tx.Commit(); err != nil {
		return nil, false, err
	}
	return reservation, allowed, nil
}

func completeLocalLoginAttempt(db dal.Dal, throttle *localLoginThrottle, reservation *localLoginReservation, outcome localLoginAttemptOutcome) error {
	tx := db.Begin()
	if err := throttle.Complete(tx, reservation, outcome); err != nil {
		_ = tx.Rollback()
		return err
	}
	return tx.Commit()
}
