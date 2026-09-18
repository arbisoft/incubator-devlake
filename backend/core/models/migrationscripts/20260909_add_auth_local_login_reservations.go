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

package migrationscripts

import (
	"github.com/apache/incubator-devlake/core/context"
	"github.com/apache/incubator-devlake/core/dal"
	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/core/plugin"
)

var _ plugin.MigrationScript = (*addAuthLocalLoginReservations)(nil)

// addAuthLocalLoginReservations preserves the already-applied local credential
// migration while extending the durable rate-limit state for atomic admission.
type addAuthLocalLoginReservations struct{}

func (*addAuthLocalLoginReservations) Up(basicRes context.BasicRes) errors.Error {
	db := basicRes.GetDal()
	if !db.HasColumn("auth_local_login_attempts", "reservation_count") {
		if err := db.AddColumn("auth_local_login_attempts", "reservation_count", dal.ColumnType("bigint NOT NULL DEFAULT 0")); err != nil {
			return err
		}
	}
	if !db.HasColumn("auth_local_login_attempts", "reservation_expires_at") {
		if err := db.AddColumn("auth_local_login_attempts", "reservation_expires_at", dal.ColumnType("timestamp NULL")); err != nil {
			return err
		}
	}
	return nil
}

func (*addAuthLocalLoginReservations) Version() uint64 { return 20260909000001 }

func (*addAuthLocalLoginReservations) Name() string { return "add local login reservations" }
