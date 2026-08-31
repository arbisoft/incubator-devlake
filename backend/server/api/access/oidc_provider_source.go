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
	"github.com/apache/incubator-devlake/core/dal"
	"github.com/apache/incubator-devlake/core/errors"
)

// LoadDatabaseOIDCProvider returns false until phase-two activation persists the
// singleton record. It also returns false before this migration exists, because auth
// starts before migrations and must preserve the environment bootstrap on that boot.
func LoadDatabaseOIDCProvider(db dal.Dal) (*OIDCProvider, bool, errors.Error) {
	if !db.HasTable((OIDCProviderConfiguration{}).TableName()) {
		return nil, false, nil
	}
	configuration := &OIDCProviderConfiguration{}
	if err := db.First(configuration, dal.Where("id = ?", OIDCProviderSourceKey)); err != nil {
		if db.IsErrorNotFound(err) {
			return nil, false, nil
		}
		return nil, false, err
	}
	provider := &OIDCProvider{}
	if err := db.First(provider, dal.Where("enabled = ? AND retired_at IS NULL", true)); err != nil {
		if db.IsErrorNotFound(err) {
			return nil, true, nil
		}
		return nil, true, err
	}
	return provider, true, nil
}
