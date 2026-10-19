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

package services

import (
	"github.com/apache/incubator-devlake/core/dal"
	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/core/models"
)

// GetUserProjectMappings returns all project mappings for a given Grafana user login.
func GetUserProjectMappings(userLogin string) ([]*models.UserProjectMapping, errors.Error) {
	var mappings []*models.UserProjectMapping
	err := db.All(&mappings, dal.Where("user_login = ?", userLogin))
	if err != nil {
		return nil, errors.Default.Wrap(err, "error getting user project mappings")
	}
	return mappings, nil
}

// GetAllUserProjectMappings returns all mappings (for admin view).
func GetAllUserProjectMappings() ([]*models.UserProjectMapping, errors.Error) {
	var mappings []*models.UserProjectMapping
	err := db.All(&mappings, dal.Orderby("user_login, project_name"))
	if err != nil {
		return nil, errors.Default.Wrap(err, "error getting all user project mappings")
	}
	return mappings, nil
}

// CreateUserProjectMapping creates or updates a user→project mapping.
func CreateUserProjectMapping(mapping *models.UserProjectMapping) errors.Error {
	// verify the project exists
	if _, err := GetProject(mapping.ProjectName); err != nil {
		return errors.BadInput.New("project not found: " + mapping.ProjectName)
	}
	if err := db.CreateOrUpdate(mapping); err != nil {
		return errors.Default.Wrap(err, "error creating user project mapping")
	}
	return nil
}

// DeleteUserProjectMapping deletes a specific user→project mapping.
func DeleteUserProjectMapping(userLogin, projectName string) errors.Error {
	err := db.Delete(
		&models.UserProjectMapping{},
		dal.Where("user_login = ? AND project_name = ?", userLogin, projectName),
	)
	if err != nil {
		return errors.Default.Wrap(err, "error deleting user project mapping")
	}
	return nil
}

// DeleteAllMappingsForUser deletes all mappings for a given user.
func DeleteAllMappingsForUser(userLogin string) errors.Error {
	err := db.Delete(
		&models.UserProjectMapping{},
		dal.Where("user_login = ?", userLogin),
	)
	if err != nil {
		return errors.Default.Wrap(err, "error deleting user project mappings")
	}
	return nil
}

// GetUserProjectMappingsForLogins returns the mappings of the given logins in one query, ordered by login then project.
func GetUserProjectMappingsForLogins(userLogins []string) ([]*models.UserProjectMapping, errors.Error) {
	mappings := make([]*models.UserProjectMapping, 0)
	if len(userLogins) == 0 {
		return mappings, nil
	}
	err := db.All(&mappings, dal.Where("user_login IN ?", userLogins), dal.Orderby("user_login, project_name"))
	if err != nil {
		return nil, errors.Default.Wrap(err, "error getting user project mappings for logins")
	}
	return mappings, nil
}

// GetUserProjectMappingLogins returns the distinct logins that have at least one mapping.
func GetUserProjectMappingLogins() ([]string, errors.Error) {
	var logins []string
	err := db.Pluck("user_login", &logins, dal.From(&models.UserProjectMapping{}), dal.Groupby("user_login"), dal.Orderby("user_login"))
	if err != nil {
		return nil, errors.Default.Wrap(err, "error getting user project mapping logins")
	}
	return logins, nil
}

// inMappingTransaction runs work and then during in one transaction; any error or panic rolls everything back.
func inMappingTransaction(work func(tx dal.Transaction) errors.Error, during func() errors.Error) (err errors.Error) {
	tx := db.Begin()
	defer func() {
		if r := recover(); r != nil || err != nil {
			if rollbackErr := tx.Rollback(); rollbackErr != nil {
				logger.Error(rollbackErr, "user project mapping: failed to rollback")
			}
			if r != nil {
				err = errors.Default.New("user project mapping transaction panicked")
			}
		}
	}()
	if err = work(tx); err != nil {
		return err
	}
	if during != nil {
		if err = during(); err != nil {
			return err
		}
	}
	err = tx.Commit()
	return err
}

// ReplaceUserProjectMappings makes the login's mapped projects exactly the given set.
func ReplaceUserProjectMappings(login string, projectNames []string) errors.Error {
	return inMappingTransaction(func(tx dal.Transaction) errors.Error {
		var err errors.Error
		if len(projectNames) == 0 {
			err = tx.Delete(&models.UserProjectMapping{}, dal.Where("user_login = ?", login))
		} else {
			err = tx.Delete(&models.UserProjectMapping{}, dal.Where("user_login = ? AND project_name NOT IN ?", login, projectNames))
		}
		if err != nil {
			return errors.Default.Wrap(err, "error removing user project mappings")
		}
		for _, name := range projectNames {
			if err = tx.CreateIfNotExist(&models.UserProjectMapping{UserLogin: login, ProjectName: name}); err != nil {
				return errors.Default.Wrap(err, "error adding user project mapping")
			}
		}
		return nil
	}, nil)
}

// MoveUserProjectMappings re-keys the old login's rows to the new login, replacing any rows already stored under the new one.
// It returns how many rows under the new login were dropped; during runs inside the transaction and a failure rolls back.
func MoveUserProjectMappings(oldLogin, newLogin string, during func() errors.Error) (int64, errors.Error) {
	var dropped int64
	err := inMappingTransaction(func(tx dal.Transaction) errors.Error {
		count, err := tx.Count(dal.From(&models.UserProjectMapping{}), dal.Where("user_login = ?", newLogin))
		if err != nil {
			return errors.Default.Wrap(err, "error counting user project mappings")
		}
		dropped = count
		if err = tx.Delete(&models.UserProjectMapping{}, dal.Where("user_login = ?", newLogin)); err != nil {
			return errors.Default.Wrap(err, "error removing user project mappings")
		}
		if err = tx.UpdateColumn(&models.UserProjectMapping{}, "user_login", newLogin, dal.Where("user_login = ?", oldLogin)); err != nil {
			return errors.Default.Wrap(err, "error moving user project mappings")
		}
		return nil
	}, during)
	if err != nil {
		return 0, err
	}
	return dropped, nil
}

// DeleteUserProjectMappingsForLogin removes every row of the login; during runs inside the transaction and a failure rolls back.
func DeleteUserProjectMappingsForLogin(login string, during func() errors.Error) errors.Error {
	return inMappingTransaction(func(tx dal.Transaction) errors.Error {
		if err := tx.Delete(&models.UserProjectMapping{}, dal.Where("user_login = ?", login)); err != nil {
			return errors.Default.Wrap(err, "error deleting user project mappings")
		}
		return nil
	}, during)
}
