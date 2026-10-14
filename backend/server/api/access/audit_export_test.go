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

package access

import (
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/mock"

	mockdal "github.com/apache/incubator-devlake/mocks/core/dal"
)

func TestRecordAuditEventStoresATargetWithoutADirectoryUser(t *testing.T) {
	db := &mockdal.Dal{}
	var stored *AuditEvent
	db.On("Create", mock.MatchedBy(func(entity interface{}) bool {
		event, ok := entity.(*AuditEvent)
		stored = event
		return ok
	})).Return(nil).Once()

	(&Service{db: db}).RecordAuditEvent("admin@example.com", "grafana_user.role", "bob@example.com", "grafana_id=5")

	if stored == nil || stored.ActorEmail != "admin@example.com" || stored.Action != "grafana_user.role" ||
		stored.TargetEmail != "bob@example.com" || stored.TargetID != 0 || stored.Detail != "grafana_id=5" {
		t.Fatalf("stored = %#v", stored)
	}
}

func TestActorLabelMatchesTheInternalLabel(t *testing.T) {
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	SetPrincipal(c, &Principal{UserID: 42, Role: RoleCustomerAdmin})
	if ActorLabel(c) != "local:42" || ActorLabel(c) != actorLabel(c) {
		t.Fatalf("label = %q", ActorLabel(c))
	}
}
