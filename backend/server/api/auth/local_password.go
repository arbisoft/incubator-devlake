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
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"fmt"
	"io"
	"strings"
	"unicode/utf8"

	"golang.org/x/crypto/argon2"
)

const (
	localSessionProvider            = "local"
	localPasswordMinimumCharacters  = 15
	localPasswordMaximumBytes       = 1024
	localUsernameMinimumLength      = 3
	localUsernameMaximumLength      = 64
	argon2idVersion                 = 19
	localPasswordHashWorkers        = 2
	temporaryPasswordBytes          = 24
	localPasswordMaximumMemoryKiB   = 256 * 1024
	localPasswordMaximumIterations  = 10
	localPasswordMaximumParallelism = 16
	localPasswordMaximumSaltLength  = 64
	localPasswordMaximumKeyLength   = 64
)

type localPasswordHashConfig struct {
	MemoryKiB   uint32
	Iterations  uint32
	Parallelism uint8
	SaltLength  uint32
	KeyLength   uint32
	Workers     int
}

func defaultLocalPasswordHashConfig() localPasswordHashConfig {
	return localPasswordHashConfig{
		MemoryKiB:   19 * 1024,
		Iterations:  2,
		Parallelism: 1,
		SaltLength:  16,
		KeyLength:   32,
		Workers:     localPasswordHashWorkers,
	}
}

type localPasswordHasher struct {
	config  localPasswordHashConfig
	workers chan struct{}
}

func newLocalPasswordHasher(config localPasswordHashConfig) (*localPasswordHasher, error) {
	if config.MemoryKiB < 19*1024 || config.MemoryKiB > localPasswordMaximumMemoryKiB ||
		config.Iterations < 2 || config.Iterations > localPasswordMaximumIterations ||
		config.Parallelism == 0 || config.Parallelism > localPasswordMaximumParallelism ||
		config.SaltLength < 16 || config.SaltLength > localPasswordMaximumSaltLength ||
		config.KeyLength < 16 || config.KeyLength > localPasswordMaximumKeyLength {
		return nil, fmt.Errorf("local password hash parameters are outside the supported policy")
	}
	if config.Workers == 0 {
		config.Workers = localPasswordHashWorkers
	}
	if config.Workers < 1 {
		return nil, fmt.Errorf("local password hash workers must be positive")
	}
	return &localPasswordHasher{config: config, workers: make(chan struct{}, config.Workers)}, nil
}

func normalizeLocalUsername(input string) (string, error) {
	username := strings.ToLower(strings.TrimSpace(input))
	if len(username) < localUsernameMinimumLength || len(username) > localUsernameMaximumLength {
		return "", fmt.Errorf("local username must be %d-%d characters", localUsernameMinimumLength, localUsernameMaximumLength)
	}
	for index, character := range username {
		isLetter := character >= 'a' && character <= 'z'
		isDigit := character >= '0' && character <= '9'
		isPunctuation := character == '.' || character == '_' || character == '-'
		if (!isLetter && !isDigit && !isPunctuation) || (index == 0 && !isLetter && !isDigit) {
			return "", fmt.Errorf("local username contains unsupported characters")
		}
	}
	return username, nil
}

func validateLocalPassword(password string) error {
	if !utf8.ValidString(password) {
		return fmt.Errorf("local password must be valid UTF-8")
	}
	if len(password) > localPasswordMaximumBytes {
		return fmt.Errorf("local password exceeds %d bytes", localPasswordMaximumBytes)
	}
	if utf8.RuneCountInString(password) < localPasswordMinimumCharacters {
		return fmt.Errorf("local password must contain at least %d characters", localPasswordMinimumCharacters)
	}
	return nil
}

func generateTemporaryLocalPassword() (string, error) {
	bytes := make([]byte, temporaryPasswordBytes)
	if _, err := io.ReadFull(rand.Reader, bytes); err != nil {
		return "", fmt.Errorf("generate temporary local password: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(bytes), nil
}

func (h *localPasswordHasher) Hash(password string) (string, error) {
	return h.HashContext(context.Background(), password)
}

// HashContext waits for bounded Argon2 capacity until the caller cancels. Once
// Argon2 begins, the underlying implementation cannot be interrupted.
func (h *localPasswordHasher) HashContext(ctx context.Context, password string) (string, error) {
	if err := validateLocalPassword(password); err != nil {
		return "", err
	}
	salt := make([]byte, h.config.SaltLength)
	if _, err := io.ReadFull(rand.Reader, salt); err != nil {
		return "", fmt.Errorf("generate password hash salt: %w", err)
	}
	if err := h.acquire(ctx); err != nil {
		return "", err
	}
	defer h.release()
	key := argon2.IDKey([]byte(password), salt, h.config.Iterations, h.config.MemoryKiB, h.config.Parallelism, h.config.KeyLength)
	return fmt.Sprintf("$argon2id$v=%d$m=%d,t=%d,p=%d$%s$%s",
		argon2idVersion,
		h.config.MemoryKiB,
		h.config.Iterations,
		h.config.Parallelism,
		base64.RawStdEncoding.EncodeToString(salt),
		base64.RawStdEncoding.EncodeToString(key),
	), nil
}

func (h *localPasswordHasher) Verify(encodedHash, password string) (bool, bool, error) {
	return h.VerifyContext(context.Background(), encodedHash, password)
}

// VerifyContext waits for bounded Argon2 capacity until the caller cancels.
// An in-progress Argon2 computation remains non-cancelable by design.
func (h *localPasswordHasher) VerifyContext(ctx context.Context, encodedHash, password string) (bool, bool, error) {
	parameters, salt, expectedKey, err := parseLocalPasswordHash(encodedHash)
	if err != nil {
		return false, false, err
	}
	if err := h.acquire(ctx); err != nil {
		return false, false, err
	}
	defer h.release()
	actualKey := argon2.IDKey([]byte(password), salt, parameters.Iterations, parameters.MemoryKiB, parameters.Parallelism, uint32(len(expectedKey)))
	if subtle.ConstantTimeCompare(actualKey, expectedKey) != 1 {
		return false, false, nil
	}
	return true, !parameters.matches(h.config), nil
}

func (h *localPasswordHasher) acquire(ctx context.Context) error {
	select {
	case h.workers <- struct{}{}:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

func (h *localPasswordHasher) release() { <-h.workers }

func (config localPasswordHashConfig) matches(other localPasswordHashConfig) bool {
	return config.MemoryKiB == other.MemoryKiB &&
		config.Iterations == other.Iterations &&
		config.Parallelism == other.Parallelism &&
		config.SaltLength == other.SaltLength &&
		config.KeyLength == other.KeyLength
}

func parseLocalPasswordHash(encodedHash string) (localPasswordHashConfig, []byte, []byte, error) {
	parts := strings.Split(encodedHash, "$")
	if len(parts) != 6 || parts[0] != "" || parts[1] != "argon2id" || parts[2] != "v=19" {
		return localPasswordHashConfig{}, nil, nil, fmt.Errorf("local password hash is malformed")
	}
	parameters := localPasswordHashConfig{}
	parsed, err := fmt.Sscanf(parts[3], "m=%d,t=%d,p=%d", &parameters.MemoryKiB, &parameters.Iterations, &parameters.Parallelism)
	if err != nil || parsed != 3 || fmt.Sprintf("m=%d,t=%d,p=%d", parameters.MemoryKiB, parameters.Iterations, parameters.Parallelism) != parts[3] ||
		parameters.MemoryKiB < 19*1024 || parameters.MemoryKiB > localPasswordMaximumMemoryKiB ||
		parameters.Iterations < 2 || parameters.Iterations > localPasswordMaximumIterations ||
		parameters.Parallelism == 0 || parameters.Parallelism > localPasswordMaximumParallelism {
		return localPasswordHashConfig{}, nil, nil, fmt.Errorf("local password hash parameters are malformed")
	}
	salt, err := base64.RawStdEncoding.Strict().DecodeString(parts[4])
	if err != nil || len(salt) < 16 || len(salt) > localPasswordMaximumSaltLength {
		return localPasswordHashConfig{}, nil, nil, fmt.Errorf("local password hash salt is malformed")
	}
	key, err := base64.RawStdEncoding.Strict().DecodeString(parts[5])
	if err != nil || len(key) < 16 || len(key) > localPasswordMaximumKeyLength {
		return localPasswordHashConfig{}, nil, nil, fmt.Errorf("local password hash key is malformed")
	}
	parameters.SaltLength = uint32(len(salt))
	parameters.KeyLength = uint32(len(key))
	return parameters, salt, key, nil
}
