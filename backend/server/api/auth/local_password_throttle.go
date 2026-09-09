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
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"time"

	"github.com/apache/incubator-devlake/core/dal"
	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/server/api/access"
)

const (
	localLoginNameBucket = "login_name"
	localClientIPBucket  = "client_ip"

	localLoginFailureLimit             = uint(5)
	localLoginWindow                   = 15 * time.Minute
	localLoginCooldown                 = 15 * time.Minute
	localLoginReservationLease         = time.Minute
	localLoginRateLimitKeyMinimumBytes = 32
)

type localLoginThrottle struct {
	key          []byte
	failureLimit uint
	window       time.Duration
	cooldown     time.Duration
	now          func() time.Time
}

func newLocalLoginThrottle(key []byte) (*localLoginThrottle, error) {
	if len(key) < localLoginRateLimitKeyMinimumBytes {
		return nil, fmt.Errorf("local login rate-limit key must be at least %d bytes", localLoginRateLimitKeyMinimumBytes)
	}
	return &localLoginThrottle{
		key:          append([]byte(nil), key...),
		failureLimit: localLoginFailureLimit,
		window:       localLoginWindow,
		cooldown:     localLoginCooldown,
		now:          time.Now,
	}, nil
}

type localLoginThrottleBucket struct {
	kind string
	key  string
}

// localLoginReservation represents work admitted by both HMAC buckets. It is
// intentionally in-memory only: the database stores counts and leases, never
// a login name, IP address, or request identifier.
type localLoginReservation struct {
	buckets   []localLoginThrottleBucket
	expiresAt time.Time
}

type localLoginAttemptOutcome uint8

const (
	localLoginAttemptReleased localLoginAttemptOutcome = iota
	localLoginAttemptSucceeded
	localLoginAttemptFailed
)

// Reserve atomically admits at most failureLimit pending or failed attempts
// per bucket. Every caller must later Complete the reservation. A bounded lease
// releases capacity if a process dies after admission and before completion.
func (t *localLoginThrottle) Reserve(tx dal.Transaction, loginName, clientIP string) (*localLoginReservation, bool, errors.Error) {
	now := t.now()
	buckets := t.buckets(loginName, clientIP)
	attempts := make([]*access.LocalLoginAttempt, 0, len(buckets))
	for _, bucket := range buckets {
		attempt, err := t.lockAttempt(tx, bucket, now)
		if err != nil {
			return nil, false, err
		}
		attempts = append(attempts, attempt)
	}

	for _, attempt := range attempts {
		if t.normalizeAttempt(attempt, now) {
			if err := tx.Update(attempt); err != nil {
				return nil, false, errors.Default.Wrap(err, "error normalizing local login throttle")
			}
		}
		if t.isBlocked(attempt, now) || attempt.FailureCount+attempt.ReservationCount >= t.failureLimit {
			return nil, false, nil
		}
	}

	expiresAt := now.Add(localLoginReservationLease)
	for _, attempt := range attempts {
		if attempt.ReservationExpiresAt != nil && attempt.ReservationExpiresAt.After(now) && attempt.ReservationExpiresAt.Before(expiresAt) {
			expiresAt = *attempt.ReservationExpiresAt
		}
	}
	for _, attempt := range attempts {
		attempt.ReservationCount++
		attempt.ReservationExpiresAt = &expiresAt
		if err := tx.Update(attempt); err != nil {
			return nil, false, errors.Default.Wrap(err, "error reserving local login attempt")
		}
	}
	return &localLoginReservation{buckets: buckets, expiresAt: expiresAt}, true, nil
}

// Complete releases a previously admitted attempt. Successful authentication
// clears ordinary failures but retains other in-flight reservations. A canceled
// request only releases capacity. A stale lease is ignored so delayed work
// cannot alter a newer reservation window.
func (t *localLoginThrottle) Complete(tx dal.Transaction, reservation *localLoginReservation, outcome localLoginAttemptOutcome) errors.Error {
	if reservation == nil {
		return errors.Default.New("local login reservation is required")
	}
	now := t.now()
	for _, bucket := range reservation.buckets {
		attempt, err := t.lockAttempt(tx, bucket, now)
		if err != nil {
			return err
		}
		if t.normalizeAttempt(attempt, now) || attempt.ReservationExpiresAt == nil || !attempt.ReservationExpiresAt.Equal(reservation.expiresAt) || attempt.ReservationCount == 0 {
			if err := tx.Update(attempt); err != nil {
				return errors.Default.Wrap(err, "error completing local login reservation")
			}
			continue
		}

		attempt.ReservationCount--
		if attempt.ReservationCount == 0 {
			attempt.ReservationExpiresAt = nil
		}
		switch outcome {
		case localLoginAttemptSucceeded:
			attempt.FailureCount = 0
			attempt.WindowStartedAt = now
			attempt.BlockedUntil = nil
		case localLoginAttemptFailed:
			t.recordFailure(attempt, now)
		}
		if err := tx.Update(attempt); err != nil {
			return errors.Default.Wrap(err, "error completing local login reservation")
		}
	}
	return nil
}

func (t *localLoginThrottle) buckets(loginName, clientIP string) []localLoginThrottleBucket {
	return []localLoginThrottleBucket{
		{kind: localLoginNameBucket, key: t.bucketKey(localLoginNameBucket, loginName)},
		{kind: localClientIPBucket, key: t.bucketKey(localClientIPBucket, clientIP)},
	}
}

func (t *localLoginThrottle) bucketKey(kind, value string) string {
	hash := hmac.New(sha256.New, t.key)
	_, _ = hash.Write([]byte(kind))
	_, _ = hash.Write([]byte{0})
	_, _ = hash.Write([]byte(value))
	return hex.EncodeToString(hash.Sum(nil))
}

func (t *localLoginThrottle) lockAttempt(tx dal.Transaction, bucket localLoginThrottleBucket, now time.Time) (*access.LocalLoginAttempt, errors.Error) {
	attempt := &access.LocalLoginAttempt{
		BucketKind:      bucket.kind,
		BucketKey:       bucket.key,
		WindowStartedAt: now,
	}
	if err := tx.Create(attempt); err == nil {
		return attempt, nil
	} else if !tx.IsDuplicationError(err) {
		return nil, errors.Default.Wrap(err, "error creating local login throttle")
	}
	if err := tx.First(attempt, dal.Where("bucket_kind = ? AND bucket_key = ?", bucket.kind, bucket.key), dal.Lock(true, false)); err != nil {
		return nil, errors.Default.Wrap(err, "error locking concurrent local login throttle")
	}
	return attempt, nil
}

func (t *localLoginThrottle) normalizeAttempt(attempt *access.LocalLoginAttempt, now time.Time) bool {
	changed := false
	if attempt.ReservationExpiresAt != nil && !attempt.ReservationExpiresAt.After(now) {
		attempt.ReservationCount = 0
		attempt.ReservationExpiresAt = nil
		changed = true
	}
	if attempt.BlockedUntil != nil && !attempt.BlockedUntil.After(now) {
		attempt.FailureCount = 0
		attempt.WindowStartedAt = now
		attempt.BlockedUntil = nil
		changed = true
	} else if now.Sub(attempt.WindowStartedAt) >= t.window {
		attempt.FailureCount = 0
		attempt.WindowStartedAt = now
		attempt.BlockedUntil = nil
		changed = true
	}
	return changed
}

func (t *localLoginThrottle) isBlocked(attempt *access.LocalLoginAttempt, now time.Time) bool {
	return attempt.BlockedUntil != nil && attempt.BlockedUntil.After(now)
}

func (t *localLoginThrottle) recordFailure(attempt *access.LocalLoginAttempt, now time.Time) {
	attempt.FailureCount++
	if attempt.FailureCount >= t.failureLimit {
		blockedUntil := now.Add(t.cooldown)
		attempt.BlockedUntil = &blockedUntil
	}
}
