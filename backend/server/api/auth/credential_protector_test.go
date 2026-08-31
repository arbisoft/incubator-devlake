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

func TestAESGCMKeyringReadsPreviousKey(t *testing.T) {
	oldKey := []byte("abcdefghijklmnopqrstuvwxyz012345")
	old, err := newAESGCMKeyring("old", oldKey, "", nil)
	if err != nil {
		t.Fatal(err)
	}
	credential, err := old.Protect([]byte("client-secret"), []byte("provider:default"))
	if err != nil {
		t.Fatal(err)
	}
	rotated, err := newAESGCMKeyring("new", []byte("01234567890123456789012345678901"), "old", oldKey)
	if err != nil {
		t.Fatal(err)
	}
	plaintext, err := rotated.Unprotect(credential, []byte("provider:default"))
	if err != nil || string(plaintext) != "client-secret" {
		t.Fatalf("rotated Unprotect() = %q, %v", plaintext, err)
	}
}
