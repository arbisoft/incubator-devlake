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
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/apache/incubator-devlake/core/dal"
	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/core/models/common"
	"github.com/apache/incubator-devlake/plugins/claude_otel/models"
)

type OtelReplayState string

const (
	OtelReplayStatePending    OtelReplayState = "pending"
	OtelReplayStateWaiting    OtelReplayState = "waiting"
	OtelReplayStateProcessing OtelReplayState = "processing"
	OtelReplayStateCompleted  OtelReplayState = "completed"
	OtelReplayStateFailed     OtelReplayState = "failed"
)

const (
	replayDateLayout = "2006-01-02"
	// replayRetainedDays means the earliest pickable day is today minus 89.
	replayRetainedDays = 90
	// OtelReplayDefaultPageSize is the page size used when a caller does not choose one.
	OtelReplayDefaultPageSize = 20
	replayMaxPageSize         = 100
	replayDay                 = 24 * time.Hour
)

// OtelReplayRange is a pair of UTC calendar days, inclusive.
type OtelReplayRange struct {
	StartDate string `json:"startDate"`
	EndDate   string `json:"endDate"`
}

type OtelReplayInput struct {
	RequestedForConnectionId *uint64 `json:"requestedForConnectionId"`
	OtelReplayRange          `mapstructure:",squash"`
}

type OtelReplayView struct {
	Id                       uint64          `json:"id"`
	RequestedForConnectionId *uint64         `json:"requestedForConnectionId"`
	RequestedForTeamName     *string         `json:"requestedForTeamName"`
	Kind                     string          `json:"kind"`
	RangeStart               time.Time       `json:"rangeStart"`
	RangeEnd                 time.Time       `json:"rangeEnd"`
	State                    OtelReplayState `json:"state"`
	ReplayedBatches          int             `json:"replayedBatches"`
	SkippedBatches           int             `json:"skippedBatches"`
	ErrorMessage             *string         `json:"errorMessage"`
	RequestedBy              *string         `json:"requestedBy"`
	CreatedAt                time.Time       `json:"createdAt"`
	CompletedAt              *time.Time      `json:"completedAt"`
}

type OtelReplayPage struct {
	Replays []OtelReplayView `json:"replays"`
	Count   int64            `json:"count"`
}

type OtelReplayQueue struct {
	Queued []OtelReplayView `json:"queued"`
	Reused []OtelReplayView `json:"reused"`
}

type OtelRebindInput struct {
	OrganizationId string           `json:"organizationId"`
	Replay         *OtelReplayRange `json:"replay"`
}

type OtelRebindResult struct {
	Connection *models.OtelConnectionWithCredentials `json:"connection"`
	Replays    *OtelReplayQueue                      `json:"replays,omitempty"`
}

type OtelActiveReplay struct {
	Id                   uint64    `json:"id"`
	Kind                 string    `json:"kind"`
	RequestedForTeamName *string   `json:"requestedForTeamName"`
	RangeStart           time.Time `json:"rangeStart"`
	RangeEnd             time.Time `json:"rangeEnd"`
}

// replayChunk is a midnight-aligned [start, end) span.
type replayChunk struct {
	start time.Time
	end   time.Time
}

type replayAuditDetail struct {
	Queued []uint64          `json:"queued"`
	Reused []uint64          `json:"reused"`
	Ranges []OtelReplayRange `json:"ranges"`
}

func planReplayRanges(dates OtelReplayRange, createdAt *time.Time, now time.Time) ([]replayChunk, errors.Error) {
	start, startErr := time.ParseInLocation(replayDateLayout, dates.StartDate, time.UTC)
	end, endErr := time.ParseInLocation(replayDateLayout, dates.EndDate, time.UTC)
	if startErr != nil || endErr != nil {
		return nil, errors.BadInput.New("Use YYYY-MM-DD dates.")
	}
	today := now.UTC().Truncate(replayDay)
	earliest := today.AddDate(0, 0, -(replayRetainedDays - 1))
	if createdAt != nil {
		if createdDay := createdAt.UTC().Truncate(replayDay); createdDay.After(earliest) {
			earliest = createdDay
		}
	}
	if start.After(end) {
		return nil, errors.BadInput.New("The first day must be on or before the last day.")
	}
	if start.Before(earliest) || end.After(today) {
		return nil, errors.BadInput.New(fmt.Sprintf("Pick days from %s to %s (UTC).", earliest.Format(replayDateLayout), today.Format(replayDateLayout)))
	}
	chunks := make([]replayChunk, 0)
	limit := end.AddDate(0, 0, 1)
	for cursor := start; cursor.Before(limit); {
		next := cursor.Add(replayMaxRange)
		if next.After(limit) {
			next = limit
		}
		chunks = append(chunks, replayChunk{start: cursor, end: next})
		cursor = next
	}
	return chunks, nil
}

func replayActor(user *common.User) *string {
	if user == nil {
		return nil
	}
	return optionalString(firstNonEmpty(user.Email, user.Name))
}

func writeOtelAudit(tx dal.Transaction, user *common.User, action string, connectionId *uint64, oldValue, newValue *string, detail any) errors.Error {
	event := &models.OtelAuditEvent{Action: action, ConnectionId: connectionId, OldValue: oldValue, NewValue: newValue}
	if user != nil {
		event.ActorName = optionalString(user.Name)
		event.ActorEmail = optionalString(user.Email)
	}
	if detail != nil {
		encoded, err := json.Marshal(detail)
		if err != nil {
			return errors.Default.Wrap(err, "error recording Claude Code OTel audit event")
		}
		event.Detail = optionalString(string(encoded))
	}
	if err := tx.Create(event); err != nil {
		return errors.Default.Wrap(err, "error recording Claude Code OTel audit event")
	}
	return nil
}

// replayKinds are the request kinds every rebuild queues, in order.
var replayKinds = []string{models.OtelReplayKindMetrics, models.OtelReplayKindLogs}

func queueReplays(tx dal.Transaction, user *common.User, requestedFor *models.OtelConnection, chunks []replayChunk, now time.Time) (*OtelReplayQueue, errors.Error) {
	queue := &OtelReplayQueue{Queued: make([]OtelReplayView, 0), Reused: make([]OtelReplayView, 0)}
	var requestedForId *uint64
	var teamName *string
	if requestedFor != nil {
		requestedForId = &requestedFor.ID
		teamName = &requestedFor.TeamName
	}
	detail := replayAuditDetail{Queued: make([]uint64, 0), Reused: make([]uint64, 0), Ranges: make([]OtelReplayRange, 0, len(chunks))}
	for _, chunk := range chunks {
		detail.Ranges = append(detail.Ranges, OtelReplayRange{StartDate: chunk.start.Format(replayDateLayout), EndDate: chunk.end.AddDate(0, 0, -1).Format(replayDateLayout)})
		for _, kind := range replayKinds {
			request := &models.OtelReplayRequest{}
			err := tx.First(request,
				dal.Where("status = ? AND range_start <= ? AND range_end >= ? AND kind = ?", models.OtelReplayRequestStatusPending, chunk.start, chunk.end, kind),
				dal.Orderby("id ASC"),
			)
			if err == nil {
				detail.Reused = append(detail.Reused, request.ID)
				queue.Reused = append(queue.Reused, replayView(request, reusedTeamName(request, requestedFor), now))
				continue
			}
			if !tx.IsErrorNotFound(err) {
				return nil, errors.Default.Wrap(err, "error finding Claude Code OTel replay request")
			}
			request = &models.OtelReplayRequest{
				Kind:                     kind,
				RangeStart:               chunk.start,
				RangeEnd:                 chunk.end,
				Status:                   models.OtelReplayRequestStatusPending,
				RequestedBy:              replayActor(user),
				RequestedForConnectionId: requestedForId,
			}
			if err := tx.Create(request); err != nil {
				return nil, errors.Default.Wrap(err, "error creating Claude Code OTel replay request")
			}
			detail.Queued = append(detail.Queued, request.ID)
			queue.Queued = append(queue.Queued, replayView(request, teamName, now))
		}
	}
	if err := writeOtelAudit(tx, user, models.OtelAuditActionReplayRequested, requestedForId, nil, nil, detail); err != nil {
		return nil, err
	}
	return queue, nil
}

// reusedTeamName names a reused request's team only when it was requested for the same connection.
func reusedTeamName(request *models.OtelReplayRequest, requestedFor *models.OtelConnection) *string {
	if requestedFor == nil || request.RequestedForConnectionId == nil || *request.RequestedForConnectionId != requestedFor.ID {
		return nil
	}
	return &requestedFor.TeamName
}

func replayState(request *models.OtelReplayRequest, now time.Time) OtelReplayState {
	status := request.Status
	if status == models.OtelReplayRequestStatusProcessing && (request.LeaseUntil == nil || !request.LeaseUntil.After(now)) {
		status = models.OtelReplayRequestStatusPending
	}
	rebuildsDays := request.Kind == models.OtelReplayKindMetrics || request.Kind == ""
	if status == models.OtelReplayRequestStatusPending && rebuildsDays && request.RangeEnd.After(now.UTC().Truncate(replayDay)) {
		return OtelReplayStateWaiting
	}
	return OtelReplayState(status)
}

func replayView(request *models.OtelReplayRequest, teamName *string, now time.Time) OtelReplayView {
	return OtelReplayView{
		Id:                       request.ID,
		RequestedForConnectionId: request.RequestedForConnectionId,
		RequestedForTeamName:     teamName,
		Kind:                     request.Kind,
		RangeStart:               request.RangeStart,
		RangeEnd:                 request.RangeEnd,
		State:                    replayState(request, now),
		ReplayedBatches:          request.ReplayedBatches,
		SkippedBatches:           request.SkippedBatches,
		ErrorMessage:             request.ErrorMessage,
		RequestedBy:              request.RequestedBy,
		CreatedAt:                request.CreatedAt,
		CompletedAt:              request.CompletedAt,
	}
}

// CreateOtelReplay queues an all-teams rebuild for the chosen UTC days.
func CreateOtelReplay(user *common.User, input *OtelReplayInput) (queue *OtelReplayQueue, result errors.Error) {
	var requestedFor *models.OtelConnection
	var createdAt *time.Time
	if input.RequestedForConnectionId != nil {
		connection, err := getOtelConnection(*input.RequestedForConnectionId)
		if err != nil {
			return nil, err
		}
		if connection.HiddenAt != nil {
			return nil, errors.NotFound.New(fmt.Sprintf("otel connection %d not found", connection.ID))
		}
		requestedFor = connection
		createdAt = &connection.CreatedAt
	}
	now := time.Now()
	chunks, err := planReplayRanges(input.OtelReplayRange, createdAt, now)
	if err != nil {
		return nil, err
	}
	tx := db.Begin()
	defer rollbackOtelTransactionOnError(tx, &result)
	queue, err = queueReplays(tx, user, requestedFor, chunks, now)
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, errors.Default.Wrap(err, "error committing Claude Code OTel replay requests")
	}
	return queue, nil
}

// RebindOtelOrganization changes the Anthropic organization bound to a connection and can queue a rebuild in the same transaction.
func RebindOtelOrganization(user *common.User, id uint64, input *OtelRebindInput) (rebound *OtelRebindResult, result errors.Error) {
	lifecycleMu.Lock()
	defer lifecycleMu.Unlock()

	organizationId, ok := normalizeOrganizationID(strings.TrimSpace(input.OrganizationId))
	if !ok {
		return nil, errors.BadInput.New("Enter the organization ID as a UUID.")
	}
	tx := db.Begin()
	defer rollbackOtelTransactionOnError(tx, &result)
	connection, err := lockOtelConnection(tx, id)
	if err != nil {
		return nil, err
	}
	if connection.HiddenAt != nil {
		return nil, errors.NotFound.New(fmt.Sprintf("otel connection %d not found", id))
	}
	if connection.OrganizationId != nil {
		if stored, ok := normalizeOrganizationID(*connection.OrganizationId); ok && stored == organizationId {
			return nil, errors.BadInput.New("This connection is already bound to this organization.")
		}
	}
	oldValue := connection.OrganizationId
	connection.OrganizationId = &organizationId
	setOtelActor(user, connection, false)
	if err := tx.Update(connection); err != nil {
		return nil, errors.Default.Wrap(err, "error rebinding otel connection organization")
	}
	if err := writeOtelAudit(tx, user, models.OtelAuditActionOrganizationRebind, &id, oldValue, &organizationId, nil); err != nil {
		return nil, err
	}
	var queue *OtelReplayQueue
	if input.Replay != nil {
		now := time.Now()
		chunks, err := planReplayRanges(*input.Replay, &connection.CreatedAt, now)
		if err != nil {
			return nil, err
		}
		if queue, err = queueReplays(tx, user, connection, chunks, now); err != nil {
			return nil, err
		}
	}
	if err := tx.Commit(); err != nil {
		return nil, errors.Default.Wrap(err, "error committing otel connection organization rebind")
	}
	response, err := lifecycleResponse(connection)
	if err != nil {
		return nil, err
	}
	return &OtelRebindResult{Connection: response, Replays: queue}, nil
}

func ListOtelReplays(page, pageSize int) (*OtelReplayPage, errors.Error) {
	if page < 1 || pageSize < 1 || pageSize > replayMaxPageSize {
		return nil, errors.BadInput.New("Page must be 1 or more and page size between 1 and 100.")
	}
	count, err := db.Count(dal.From(&models.OtelReplayRequest{}))
	if err != nil {
		return nil, errors.Default.Wrap(err, "error counting Claude Code OTel replay requests")
	}
	requests := make([]*models.OtelReplayRequest, 0)
	if err := db.All(&requests, dal.Orderby("id DESC"), dal.Offset((page-1)*pageSize), dal.Limit(pageSize)); err != nil {
		return nil, errors.Default.Wrap(err, "error listing Claude Code OTel replay requests")
	}
	teamNames, lookupErr := replayTeamNames(requests)
	if lookupErr != nil {
		return nil, lookupErr
	}
	now := time.Now()
	views := make([]OtelReplayView, 0, len(requests))
	for _, request := range requests {
		var teamName *string
		if request.RequestedForConnectionId != nil {
			if name, found := teamNames[*request.RequestedForConnectionId]; found {
				teamName = &name
			}
		}
		views = append(views, replayView(request, teamName, now))
	}
	return &OtelReplayPage{Replays: views, Count: count}, nil
}

// replayTeamNames resolves requested-for team names in one query, hidden connections included.
func replayTeamNames(requests []*models.OtelReplayRequest) (map[uint64]string, errors.Error) {
	ids := make([]uint64, 0)
	seen := make(map[uint64]bool)
	for _, request := range requests {
		if request.RequestedForConnectionId != nil && !seen[*request.RequestedForConnectionId] {
			seen[*request.RequestedForConnectionId] = true
			ids = append(ids, *request.RequestedForConnectionId)
		}
	}
	names := make(map[uint64]string, len(ids))
	if len(ids) == 0 {
		return names, nil
	}
	connections := make([]*models.OtelConnection, 0, len(ids))
	if err := db.All(&connections, dal.Where("id IN ?", ids)); err != nil {
		return nil, errors.Default.Wrap(err, "error getting Claude Code OTel replay teams")
	}
	for _, connection := range connections {
		names[connection.ID] = connection.TeamName
	}
	return names, nil
}

func activeOtelReplay(now time.Time) (*OtelActiveReplay, errors.Error) {
	request := &models.OtelReplayRequest{}
	err := db.First(request, dal.Where("status = ? AND lease_until > ?", models.OtelReplayRequestStatusProcessing, now), dal.Orderby("id ASC"))
	if err != nil {
		if db.IsErrorNotFound(err) {
			return nil, nil
		}
		return nil, errors.Default.Wrap(err, "error getting active Claude Code OTel replay")
	}
	active := &OtelActiveReplay{Id: request.ID, Kind: request.Kind, RangeStart: request.RangeStart, RangeEnd: request.RangeEnd}
	if request.RequestedForConnectionId != nil {
		connection, err := getOtelConnection(*request.RequestedForConnectionId)
		if err == nil {
			active.RequestedForTeamName = &connection.TeamName
		} else if err.GetType() != errors.NotFound {
			return nil, err
		}
	}
	return active, nil
}
