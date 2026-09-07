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

// Allowed reports whether both privacy-preserving buckets currently permit an
// attempt. Callers pass a transaction so the following failure/success update
// can share the same storage boundary as authentication state.
func (t *localLoginThrottle) Allowed(tx dal.Transaction, loginName, clientIP string) (bool, errors.Error) {
	for _, bucket := range t.buckets(loginName, clientIP) {
		attempt := &access.LocalLoginAttempt{}
		err := tx.First(attempt, dal.Where("bucket_kind = ? AND bucket_key = ?", bucket.kind, bucket.key))
		if err != nil {
			if tx.IsErrorNotFound(err) {
				continue
			}
			return false, errors.Default.Wrap(err, "error reading local login throttle")
		}
		if attempt.BlockedUntil != nil && attempt.BlockedUntil.After(t.now()) {
			return false, nil
		}
	}
	return true, nil
}

// RecordFailure increments both buckets with a row lock. A caller must invoke
// it in a transaction; callers must not split the read-modify-write sequence
// across transactions because that would lose concurrent failures.
func (t *localLoginThrottle) RecordFailure(tx dal.Transaction, loginName, clientIP string) (bool, errors.Error) {
	blocked := false
	for _, bucket := range t.buckets(loginName, clientIP) {
		bucketBlocked, err := t.recordFailure(tx, bucket)
		if err != nil {
			return false, err
		}
		blocked = blocked || bucketBlocked
	}
	return blocked, nil
}

// Reset removes both buckets after a successful authentication. The keys are
// HMAC values, so this does not persist a raw login name or client address.
func (t *localLoginThrottle) Reset(tx dal.Transaction, loginName, clientIP string) errors.Error {
	for _, bucket := range t.buckets(loginName, clientIP) {
		if err := tx.Delete(&access.LocalLoginAttempt{}, dal.Where("bucket_kind = ? AND bucket_key = ?", bucket.kind, bucket.key)); err != nil {
			return errors.Default.Wrap(err, "error clearing local login throttle")
		}
	}
	return nil
}

type localLoginThrottleBucket struct {
	kind string
	key  string
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

func (t *localLoginThrottle) recordFailure(tx dal.Transaction, bucket localLoginThrottleBucket) (bool, errors.Error) {
	now := t.now()
	attempt := &access.LocalLoginAttempt{}
	err := tx.First(
		attempt,
		dal.Where("bucket_kind = ? AND bucket_key = ?", bucket.kind, bucket.key),
		dal.Lock(true, false),
	)
	if err != nil {
		if !tx.IsErrorNotFound(err) {
			return false, errors.Default.Wrap(err, "error locking local login throttle")
		}
		attempt = &access.LocalLoginAttempt{
			BucketKind:      bucket.kind,
			BucketKey:       bucket.key,
			FailureCount:    1,
			WindowStartedAt: now,
		}
		if attempt.FailureCount >= t.failureLimit {
			blockedUntil := now.Add(t.cooldown)
			attempt.BlockedUntil = &blockedUntil
		}
		if createErr := tx.Create(attempt); createErr != nil {
			if tx.IsDuplicationError(createErr) {
				if readErr := tx.First(
					attempt,
					dal.Where("bucket_kind = ? AND bucket_key = ?", bucket.kind, bucket.key),
					dal.Lock(true, false),
				); readErr != nil {
					return false, errors.Default.Wrap(readErr, "error locking concurrent local login throttle")
				}
				return t.incrementFailure(tx, attempt, now)
			}
			return false, errors.Default.Wrap(createErr, "error creating local login throttle")
		}
		return attempt.BlockedUntil != nil, nil
	}

	return t.incrementFailure(tx, attempt, now)
}

func (t *localLoginThrottle) incrementFailure(tx dal.Transaction, attempt *access.LocalLoginAttempt, now time.Time) (bool, errors.Error) {
	if attempt.BlockedUntil != nil && attempt.BlockedUntil.After(now) {
		return true, nil
	}
	if now.Sub(attempt.WindowStartedAt) >= t.window {
		attempt.FailureCount = 0
		attempt.WindowStartedAt = now
		attempt.BlockedUntil = nil
	}
	attempt.FailureCount++
	if attempt.FailureCount >= t.failureLimit {
		blockedUntil := now.Add(t.cooldown)
		attempt.BlockedUntil = &blockedUntil
	}
	if updateErr := tx.Update(attempt); updateErr != nil {
		return false, errors.Default.Wrap(updateErr, "error updating local login throttle")
	}
	return attempt.BlockedUntil != nil, nil
}
