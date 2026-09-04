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

import "testing"

func TestAESGCMKeyring(t *testing.T) {
	primary := []byte("01234567890123456789012345678901")
	previous := []byte("abcdefghijklmnopqrstuvwxyz012345")
	keyring, err := newAESGCMKeyring("current", primary, "previous", previous)
	if err != nil {
		t.Fatal(err)
	}
	credential, err := keyring.Protect([]byte("client-secret"), []byte("provider:default"))
	if err != nil {
		t.Fatal(err)
	}
	if credential.KeyID != "current" || string(credential.Ciphertext) == "client-secret" {
		t.Fatal("credential was not protected with current key")
	}
	plaintext, err := keyring.Unprotect(credential, []byte("provider:default"))
	if err != nil || string(plaintext) != "client-secret" {
		t.Fatalf("Unprotect() = %q, %v", plaintext, err)
	}
	if _, err := keyring.Unprotect(credential, []byte("provider:other")); err == nil {
		t.Fatal("associated-data mismatch must fail")
	}
	credential.Ciphertext[0] ^= 1
	if _, err := keyring.Unprotect(credential, []byte("provider:default")); err == nil {
		t.Fatal("tampered ciphertext must fail")
	}
}

func TestAESGCMKeyringInvalidInputs(t *testing.T) {
	validKey := []byte("01234567890123456789012345678901")
	shortKey := []byte("short-key")

	// Empty primary key ID
	if _, err := newAESGCMKeyring("", validKey, "", nil); err == nil {
		t.Fatal("empty primary key ID must fail")
	}

	// Short / empty primary key
	if _, err := newAESGCMKeyring("k1", shortKey, "", nil); err == nil {
		t.Fatal("short primary key must fail")
	}
	if _, err := newAESGCMKeyring("k1", nil, "", nil); err == nil {
		t.Fatal("nil primary key must fail")
	}

	// Partial previous key config (ID without key or key without ID)
	if _, err := newAESGCMKeyring("k1", validKey, "k2", nil); err == nil {
		t.Fatal("previous key ID without key must fail")
	}
	if _, err := newAESGCMKeyring("k1", validKey, "", validKey); err == nil {
		t.Fatal("previous key without ID must fail")
	}

	// Duplicate key IDs
	if _, err := newAESGCMKeyring("k1", validKey, "k1", validKey); err == nil {
		t.Fatal("duplicate primary and previous key IDs must fail")
	}
}

func TestAESGCMKeyringUnprotectEdgeCases(t *testing.T) {
	primary := []byte("01234567890123456789012345678901")
	keyring, err := newAESGCMKeyring("k1", primary, "", nil)
	if err != nil {
		t.Fatal(err)
	}

	cred, err := keyring.Protect([]byte("my-secret"), []byte("auth_oidc:google"))
	if err != nil {
		t.Fatal(err)
	}

	// Unknown KeyID
	unknownCred := cred
	unknownCred.KeyID = "unknown-key-id"
	if _, err := keyring.Unprotect(unknownCred, []byte("auth_oidc:google")); err == nil {
		t.Fatal("unprotect with unknown KeyID must fail")
	}

	// Malformed Nonce
	badNonceCred := cred
	badNonceCred.Nonce = []byte("too-short")
	if _, err := keyring.Unprotect(badNonceCred, []byte("auth_oidc:google")); err == nil {
		t.Fatal("unprotect with malformed nonce must fail")
	}

	// Empty ciphertext
	emptyCipherCred := cred
	emptyCipherCred.Ciphertext = []byte{}
	if _, err := keyring.Unprotect(emptyCipherCred, []byte("auth_oidc:google")); err == nil {
		t.Fatal("unprotect with empty ciphertext must fail")
	}
}

func TestAESGCMKeyringRotationWorkflow(t *testing.T) {
	oldKey := []byte("abcdefghijklmnopqrstuvwxyz012345")
	newKey := []byte("01234567890123456789012345678901")

	// Phase 1: Encrypt with old single-key protector
	oldProtector, err := newAESGCMKeyring("v1", oldKey, "", nil)
	if err != nil {
		t.Fatal(err)
	}
	oldCred, err := oldProtector.Protect([]byte("client-secret-val"), []byte("provider:google"))
	if err != nil {
		t.Fatal(err)
	}
	if oldCred.KeyID != "v1" {
		t.Fatalf("oldCred KeyID = %q, want v1", oldCred.KeyID)
	}

	// Phase 2: Dual-key protector (v2 primary, v1 previous) reads old ciphertext
	dualProtector, err := newAESGCMKeyring("v2", newKey, "v1", oldKey)
	if err != nil {
		t.Fatal(err)
	}
	decrypted, err := dualProtector.Unprotect(oldCred, []byte("provider:google"))
	if err != nil {
		t.Fatalf("dualProtector failed to read old key: %v", err)
	}

	// Re-encrypt under current primary key
	newCred, err := dualProtector.Protect(decrypted, []byte("provider:google"))
	if err != nil {
		t.Fatal(err)
	}
	if newCred.KeyID != "v2" {
		t.Fatalf("newCred KeyID = %q, want v2", newCred.KeyID)
	}

	// Phase 3: Final single-key protector (v2 only) can read new ciphertext, fails closed on v1
	finalProtector, err := newAESGCMKeyring("v2", newKey, "", nil)
	if err != nil {
		t.Fatal(err)
	}
	verified, err := finalProtector.Unprotect(newCred, []byte("provider:google"))
	if err != nil {
		t.Fatalf("finalProtector failed to read v2 credential: %v", err)
	}
	if len(verified) == 0 {
		t.Fatal("verified secret was empty")
	}

	// Verify old v1 credential now fails closed with final protector
	if _, err := finalProtector.Unprotect(oldCred, []byte("provider:google")); err == nil {
		t.Fatal("finalProtector must fail closed when unprotecting v1 credential after v1 key removal")
	}
}
