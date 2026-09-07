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

// ResolveActiveLocalCredential returns a credential only when its parent user
// remains visible and active. Authentication code uses this instead of joining
// credential and directory policy itself, so access admission stays owned here.
func (s *Service) ResolveActiveLocalCredential(loginName string) (*LocalCredential, *AccessUser, errors.Error) {
	credential := &LocalCredential{}
	if err := s.db.First(credential, dal.Where("login_name = ?", loginName)); err != nil {
		if s.db.IsErrorNotFound(err) {
			return nil, nil, errors.NotFound.New("local credential not found")
		}
		return nil, nil, errors.Default.Wrap(err, "error looking up local credential")
	}
	user := &AccessUser{}
	if err := s.db.First(user, dal.Where("id = ? AND status = ? AND hidden_at IS NULL", credential.AccessUserID, StatusActive)); err != nil {
		if s.db.IsErrorNotFound(err) {
			return nil, nil, errors.NotFound.New("local credential not found")
		}
		return nil, nil, errors.Default.Wrap(err, "error looking up local credential user")
	}
	return credential, user, nil
}
