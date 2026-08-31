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
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"fmt"
	"io"
)

// ProtectedCredential is the persistent ciphertext contract. It deliberately
// contains no provider metadata beyond the key identifier; callers bind their
// own immutable record identity as authenticated associated data.
type ProtectedCredential struct {
	Ciphertext []byte
	Nonce      []byte
	KeyID      string
}

// CredentialProtector isolates credential persistence from key delivery. The
// initial keyring uses deployment-provided AES keys; a later KMS adapter can
// preserve this contract without changing provider storage or auth flows.
type CredentialProtector interface {
	Protect(plaintext, associatedData []byte) (ProtectedCredential, error)
	Unprotect(credential ProtectedCredential, associatedData []byte) ([]byte, error)
}

type aesGCMKeyring struct {
	primaryID string
	keys      map[string]cipher.AEAD
}

func newAESGCMKeyring(primaryID string, primaryKey []byte, previousID string, previousKey []byte) (CredentialProtector, error) {
	if primaryID == "" {
		return nil, fmt.Errorf("OIDC credential key ID is required")
	}
	primary, err := newAESGCM(primaryKey)
	if err != nil {
		return nil, fmt.Errorf("invalid OIDC credential primary key: %w", err)
	}
	keys := map[string]cipher.AEAD{primaryID: primary}
	if previousID != "" || len(previousKey) != 0 {
		if previousID == "" || len(previousKey) == 0 {
			return nil, fmt.Errorf("OIDC credential previous key ID and key must be configured together")
		}
		if previousID == primaryID {
			return nil, fmt.Errorf("OIDC credential key IDs must differ")
		}
		previous, err := newAESGCM(previousKey)
		if err != nil {
			return nil, fmt.Errorf("invalid OIDC credential previous key: %w", err)
		}
		keys[previousID] = previous
	}
	return &aesGCMKeyring{primaryID: primaryID, keys: keys}, nil
}

func newAESGCM(key []byte) (cipher.AEAD, error) {
	if len(key) != 32 {
		return nil, fmt.Errorf("key must be 32 bytes")
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	return cipher.NewGCM(block)
}

func (k *aesGCMKeyring) Protect(plaintext, associatedData []byte) (ProtectedCredential, error) {
	aead := k.keys[k.primaryID]
	nonce := make([]byte, aead.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return ProtectedCredential{}, fmt.Errorf("generate credential nonce: %w", err)
	}
	return ProtectedCredential{
		Ciphertext: aead.Seal(nil, nonce, plaintext, associatedData),
		Nonce:      nonce,
		KeyID:      k.primaryID,
	}, nil
}

func (k *aesGCMKeyring) Unprotect(credential ProtectedCredential, associatedData []byte) ([]byte, error) {
	aead, ok := k.keys[credential.KeyID]
	if !ok {
		return nil, fmt.Errorf("OIDC credential key %q is unavailable", credential.KeyID)
	}
	if len(credential.Nonce) != aead.NonceSize() {
		return nil, fmt.Errorf("OIDC credential nonce is malformed")
	}
	plaintext, err := aead.Open(nil, credential.Nonce, credential.Ciphertext, associatedData)
	if err != nil {
		return nil, fmt.Errorf("OIDC credential ciphertext is invalid")
	}
	return plaintext, nil
}
