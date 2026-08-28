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

package service

import (
	"sort"
	"strings"

	"github.com/apache/incubator-devlake/core/dal"
	"github.com/apache/incubator-devlake/core/errors"
	coremodels "github.com/apache/incubator-devlake/core/models"
	"github.com/apache/incubator-devlake/plugins/claude_otel/models"
)

const maxOtelProjectsPerConnection = 100

// ListOtelProjects returns the existing DevLake projects available for OTel placement.
func ListOtelProjects() ([]*models.OtelProjectSummary, errors.Error) {
	projects := make([]*coremodels.Project, 0)
	if err := db.All(&projects, dal.Orderby("name ASC")); err != nil {
		return nil, errors.Default.Wrap(err, "error listing projects for Claude Code OTel")
	}
	return projectSummariesFromProjects(projects), nil
}

func normalizeOtelProjectNames(projectNames []string) ([]string, errors.Error) {
	uniqueNames := make(map[string]struct{}, len(projectNames))
	for _, rawName := range projectNames {
		projectName := strings.TrimSpace(rawName)
		if projectName == "" {
			return nil, errors.BadInput.New("project name is required")
		}
		uniqueNames[projectName] = struct{}{}
	}
	if len(uniqueNames) == 0 {
		return nil, errors.BadInput.New("select at least one DevLake project")
	}
	if len(uniqueNames) > maxOtelProjectsPerConnection {
		return nil, errors.BadInput.New("select 100 projects or fewer")
	}

	names := make([]string, 0, len(uniqueNames))
	for projectName := range uniqueNames {
		names = append(names, projectName)
	}
	sort.Strings(names)
	return names, nil
}

func validateOtelProjectNames(projectNames []string) ([]string, errors.Error) {
	names, err := normalizeOtelProjectNames(projectNames)
	if err != nil {
		return nil, err
	}

	projects := make([]*coremodels.Project, 0, len(names))
	if err := db.All(&projects, dal.Where("name IN ?", names)); err != nil {
		return nil, errors.Default.Wrap(err, "error validating Claude Code OTel projects")
	}
	if len(projects) != len(names) {
		foundNames := make(map[string]struct{}, len(projects))
		for _, project := range projects {
			foundNames[project.Name] = struct{}{}
		}
		for _, name := range names {
			if _, found := foundNames[name]; !found {
				return nil, errors.BadInput.New("one or more selected DevLake projects no longer exist")
			}
		}
	}
	return names, nil
}

func createOtelConnectionProjects(tx dal.Transaction, connectionID uint64, projectNames []string) errors.Error {
	for _, projectName := range projectNames {
		placement := &models.OtelConnectionProject{ConnectionId: connectionID, ProjectName: projectName}
		if err := tx.Create(placement); err != nil {
			return errors.Default.Wrap(err, "error creating Claude Code OTel project placement")
		}
	}
	return nil
}

func getOtelConnectionProjects(connectionID uint64) ([]*models.OtelProjectSummary, errors.Error) {
	placements := make([]*models.OtelConnectionProject, 0)
	if err := db.All(&placements, dal.Where("connection_id = ?", connectionID), dal.Orderby("project_name ASC")); err != nil {
		return nil, errors.Default.Wrap(err, "error getting Claude Code OTel project placements")
	}
	return projectSummariesFromPlacements(placements), nil
}

func getOtelConnectionProjectNames(connectionID uint64) ([]string, errors.Error) {
	placements := make([]*models.OtelConnectionProject, 0)
	if err := db.All(&placements, dal.Where("connection_id = ?", connectionID), dal.Orderby("project_name ASC")); err != nil {
		return nil, errors.Default.Wrap(err, "error getting Claude Code OTel project placements")
	}
	names := make([]string, 0, len(placements))
	for _, placement := range placements {
		names = append(names, placement.ProjectName)
	}
	return names, nil
}

func projectSummariesFromProjects(projects []*coremodels.Project) []*models.OtelProjectSummary {
	summaries := make([]*models.OtelProjectSummary, 0, len(projects))
	for _, project := range projects {
		summaries = append(summaries, &models.OtelProjectSummary{Name: project.Name})
	}
	return summaries
}

func projectSummariesFromPlacements(placements []*models.OtelConnectionProject) []*models.OtelProjectSummary {
	summaries := make([]*models.OtelProjectSummary, 0, len(placements))
	for _, placement := range placements {
		summaries = append(summaries, &models.OtelProjectSummary{Name: placement.ProjectName})
	}
	return summaries
}

func attachOtelProjects(response *models.OtelConnectionWithCredentials) errors.Error {
	projects, err := getOtelConnectionProjects(response.Connection.ID)
	if err != nil {
		return err
	}
	response.Projects = projects
	return nil
}

// ListOtelConnectionsForProject returns visible OTel connections governed by one project.
func ListOtelConnectionsForProject(projectName string) ([]*models.OtelConnectionWithCredentials, errors.Error) {
	if strings.TrimSpace(projectName) == "" {
		return nil, errors.BadInput.New("project name is required")
	}
	connections := make([]*models.OtelConnection, 0)
	err := db.All(
		&connections,
		dal.Join("JOIN "+models.OtelConnectionProjectTable+" placements ON placements.connection_id = "+models.OtelConnectionTable+".id"),
		dal.Where("placements.project_name = ? AND "+models.OtelConnectionTable+".hidden_at IS NULL", projectName),
		dal.Orderby(models.OtelConnectionTable+".created_at DESC"),
	)
	if err != nil {
		return nil, errors.Default.Wrap(err, "error listing project Claude Code OTel connections")
	}
	return buildOtelConnectionResponses(connections)
}

// ReplaceOtelConnectionProjects changes only DevLake-side governance placement.
// It intentionally does not rotate credentials, rewrite htpasswd, or restart the Collector.
func ReplaceOtelConnectionProjects(id uint64, projectNames []string) ([]*models.OtelProjectSummary, errors.Error) {
	lifecycleMu.Lock()
	defer lifecycleMu.Unlock()

	if _, err := getOtelConnection(id); err != nil {
		return nil, err
	}
	names, err := validateOtelProjectNames(projectNames)
	if err != nil {
		return nil, err
	}

	tx := db.Begin()
	if err := tx.Delete(&models.OtelConnectionProject{}, dal.Where("connection_id = ?", id)); err != nil {
		_ = tx.Rollback()
		return nil, errors.Default.Wrap(err, "error replacing Claude Code OTel project placements")
	}
	if err := createOtelConnectionProjects(tx, id, names); err != nil {
		_ = tx.Rollback()
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, errors.Default.Wrap(err, "error committing Claude Code OTel project placements")
	}
	return projectSummariesFromNames(names), nil
}

// ValidateOtelProjectRemoval verifies that deleting a project cannot silently leave a live credential unowned.
func ValidateOtelProjectRemoval(projectName string) errors.Error {
	lifecycleMu.Lock()
	defer lifecycleMu.Unlock()

	placements := make([]*models.OtelConnectionProject, 0)
	if err := db.All(&placements, dal.Where("project_name = ?", projectName)); err != nil {
		return errors.Default.Wrap(err, "error getting Claude Code OTel project placements")
	}
	if len(placements) == 0 {
		return nil
	}

	for _, placement := range placements {
		connection, err := getOtelConnection(placement.ConnectionId)
		if err != nil {
			return err
		}
		projectNames, err := getOtelConnectionProjectNames(connection.ID)
		if err != nil {
			return err
		}
		if connection.Status == models.OtelConnectionStatusActive && len(projectNames) == 1 {
			return errors.BadInput.New("revoke the active Claude Code OTel connection before deleting its final project placement")
		}
	}
	return nil
}

// RemoveOtelProjectPlacements removes a deleted project's OTel-only association rows.
// The normal project service does not know about this plugin-owned table.
func RemoveOtelProjectPlacements(projectName string) errors.Error {
	lifecycleMu.Lock()
	defer lifecycleMu.Unlock()

	if err := db.Delete(&models.OtelConnectionProject{}, dal.Where("project_name = ?", projectName)); err != nil {
		return errors.Default.Wrap(err, "error removing Claude Code OTel project placements")
	}
	return nil
}

func projectSummariesFromNames(names []string) []*models.OtelProjectSummary {
	summaries := make([]*models.OtelProjectSummary, 0, len(names))
	for _, name := range names {
		summaries = append(summaries, &models.OtelProjectSummary{Name: name})
	}
	return summaries
}
