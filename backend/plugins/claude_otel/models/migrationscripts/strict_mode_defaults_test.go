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
	"sync"
	"testing"

	"gorm.io/gorm/schema"
)

// Hourly upserts insert one metric column at a time. MySQL strict mode rejects that
// insert when any other NOT NULL column has no default.
func TestHourlyFactColumnsSupportStrictModePartialUpserts(t *testing.T) {
	for _, model := range []interface{}{
		&otelHourlyActivity20260914{},
		&otelHourlyModelUsage20260914{},
		&otelHourlyToolUsage20260914{},
	} {
		parsed, err := schema.Parse(model, &sync.Map{}, schema.NamingStrategy{})
		if err != nil {
			t.Fatalf("schema.Parse(%T) error = %v", model, err)
		}
		for _, field := range parsed.Fields {
			if field.NotNull && !field.PrimaryKey && !field.HasDefaultValue {
				t.Errorf("%s.%s is NOT NULL without a default", parsed.Table, field.DBName)
			}
		}
	}
}
