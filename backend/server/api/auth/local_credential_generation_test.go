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

func TestPrepareLocalCredentialGeneratesNormalizedForcedChangeMaterial(t *testing.T) {
	runtime := newTestLocalRuntime(t)
	service := &Service{local: runtime}

	material, err := service.PrepareLocalCredential(" Admin.User ")
	if err != nil {
		t.Fatalf("PrepareLocalCredential() error = %v", err)
	}
	if material.LoginName != "admin.user" {
		t.Fatalf("LoginName = %q, want normalized admin.user", material.LoginName)
	}
	if material.TemporaryPassword == "" || material.PasswordHash == "" || material.TemporaryPassword == material.PasswordHash {
		t.Fatal("temporary credential material is incomplete or unsafe")
	}
	matched, _, verifyErr := runtime.hasher.Verify(material.PasswordHash, material.TemporaryPassword)
	if verifyErr != nil || !matched {
		t.Fatalf("temporary password did not verify against its hash: matched=%t err=%v", matched, verifyErr)
	}
}

func TestPrepareLocalCredentialRejectsInvalidLoginName(t *testing.T) {
	service := &Service{local: newTestLocalRuntime(t)}
	if _, err := service.PrepareLocalCredential("invalid username"); err == nil {
		t.Fatal("PrepareLocalCredential() succeeded for invalid username")
	}
}
