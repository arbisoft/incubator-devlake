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

package mail

import (
	"context"
	goerrors "errors"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/core/models"
)

// fakeQueue is an in-memory history table for the worker.
type fakeQueue struct {
	mu        sync.Mutex // guards the fields below
	rows      []*models.EmailHistory
	saves     int
	claims    int
	saveErr   errors.Error
	failSaves int // the first failSaves saves fail with saveErr; 0 means every save fails when saveErr is set
	listErr   errors.Error
	claimErr  errors.Error
	stolen    bool // another worker claims every row first
}

func (q *fakeQueue) DueQueued(now time.Time, limit int) ([]*models.EmailHistory, errors.Error) {
	q.mu.Lock()
	defer q.mu.Unlock()
	if q.listErr != nil {
		return nil, q.listErr
	}
	var out []*models.EmailHistory
	for _, r := range q.rows {
		if r.Status == models.EmailStatusQueued && (r.NextAttemptAt == nil || !r.NextAttemptAt.After(now)) && len(out) < limit {
			out = append(out, r)
		}
	}
	return out, nil
}

// Claim mirrors Store.Claim: the row must still be QUEUED and due, with the attempts value read.
func (q *fakeQueue) Claim(row *models.EmailHistory, token string, now, leaseUntil time.Time) (bool, errors.Error) {
	q.mu.Lock()
	defer q.mu.Unlock()
	q.claims++
	if q.claimErr != nil {
		return false, q.claimErr
	}
	if q.stolen || row.Status != models.EmailStatusQueued || (row.NextAttemptAt != nil && row.NextAttemptAt.After(now)) {
		return false, nil
	}
	row.Attempts++
	row.NextAttemptAt, row.ClaimToken, row.UpdatedAt = &leaseUntil, &token, now
	return true, nil
}

func (q *fakeQueue) Save(*models.EmailHistory) errors.Error {
	q.mu.Lock()
	defer q.mu.Unlock()
	q.saves++
	if q.failSaves > 0 && q.saves > q.failSaves {
		return nil
	}
	return q.saveErr
}

// fakeMailer returns the queued results in order, then success.
type fakeMailer struct {
	mu      sync.Mutex // guards the fields below
	results []error
	sent    []*Message
	onSend  func()
}

func (m *fakeMailer) Send(ctx context.Context, msg *Message) (string, errors.Error) {
	m.mu.Lock()
	m.sent = append(m.sent, msg)
	var err error
	if len(m.results) > 0 {
		err, m.results = m.results[0], m.results[1:]
	}
	onSend := m.onSend
	m.mu.Unlock()
	if onSend != nil {
		onSend()
	}
	if err != nil {
		return "", errors.Default.Wrap(err, "fake send: "+err.Error())
	}
	return "<id@fake>", nil
}

func queuedRow(id uint64) *models.EmailHistory {
	return &models.EmailHistory{
		ID: id, Sender: "devlake-alerts@arbisoft.com", Recipients: "a@arbisoft.com,b@arbisoft.com",
		Subject: "S", Content: "<p>h</p>", TextContent: "t", Status: models.EmailStatusQueued, Template: TemplateAlert,
	}
}

func constantBackoff(attempt int) time.Duration { return time.Duration(attempt) * time.Minute }

func newTestWorker(t *testing.T, q queueStore, m Mailer, maxRetries int, opts ...WorkerOption) (*Worker, *recordingLogger) {
	t.Helper()
	logger := &recordingLogger{}
	cfg := Config{FromName: "DevLake", ReplyTo: "team@arbisoft.com", MaxRetries: maxRetries, SMTP: SMTPConfig{Timeout: time.Second}}
	opts = append([]WorkerOption{WithWorkerClock(func() time.Time { return fixedNow }), WithBackoff(constantBackoff),
		WithSleep(func(time.Duration) {})}, opts...)
	w, err := NewWorker(q, m, cfg, logger, opts...)
	require.Nil(t, err)
	return w, logger
}

func TestWorkerSendsAQueuedRow(t *testing.T) {
	row := queuedRow(1)
	q, m := &fakeQueue{rows: []*models.EmailHistory{row}}, &fakeMailer{}
	w, logger := newTestWorker(t, q, m, 3)

	w.drain(context.Background())

	assert.Equal(t, models.EmailStatusSent, row.Status)
	assert.Equal(t, fixedNow, *row.SentOn)
	assert.Equal(t, "<id@fake>", *row.ProviderMessageId)
	assert.Equal(t, 1, row.Attempts)
	assert.Nil(t, row.ErrorMessage)
	assert.Nil(t, row.NextAttemptAt)
	assert.Equal(t, 1, q.claims, "the attempt is claimed before sending")
	assert.Equal(t, 1, q.saves, "and the outcome is saved after")
	require.Len(t, m.sent, 1)
	assert.Equal(t, &Message{
		FromAddress: "devlake-alerts@arbisoft.com", FromName: "DevLake", ReplyTo: "team@arbisoft.com",
		To: []string{"a@arbisoft.com", "b@arbisoft.com"}, Subject: "S", HTMLBody: "<p>h</p>", TextBody: "t",
	}, m.sent[0])
	assert.Contains(t, logger.all(), "INFO mail sent id=1 template=alert attempts=1")
	assert.NotContains(t, logger.all(), "a@arbisoft.com", "addresses are not logged")
}

func TestWorkerRetriesTemporaryFailuresThenFails(t *testing.T) {
	row := queuedRow(7)
	now := fixedNow
	temp := goerrors.New("421 try again later")
	q, m := &fakeQueue{rows: []*models.EmailHistory{row}}, &fakeMailer{results: []error{temp, temp, temp}}
	w, logger := newTestWorker(t, q, m, 2, WithWorkerClock(func() time.Time { return now }))

	w.drain(context.Background())
	assert.Equal(t, models.EmailStatusQueued, row.Status, "first failure is retried")
	assert.Equal(t, 1, row.Attempts)
	assert.Equal(t, fixedNow.Add(time.Minute), *row.NextAttemptAt)
	assert.Equal(t, "fake send: 421 try again later", *row.ErrorMessage, "the stored reason has no debug chain")

	w.drain(context.Background())
	assert.Equal(t, 1, row.Attempts, "not due yet: nothing is sent")

	now = fixedNow.Add(time.Minute)
	w.drain(context.Background())
	assert.Equal(t, 2, row.Attempts)
	assert.Equal(t, now.Add(2*time.Minute), *row.NextAttemptAt)

	now = now.Add(2 * time.Minute)
	w.drain(context.Background())
	assert.Equal(t, models.EmailStatusFailed, row.Status, "MAIL_MAX_RETRIES=2 allows 3 attempts")
	assert.Equal(t, 3, row.Attempts)
	assert.Nil(t, row.NextAttemptAt)
	assert.Nil(t, row.SentOn)
	assert.Contains(t, logger.all(), "WARN mail send will be retried id=7 attempts=1")
	assert.Contains(t, logger.all(), "ERROR mail failed id=7 template=alert attempts=3")
}

func TestWorkerFailsPermanentErrorsAtOnce(t *testing.T) {
	row := queuedRow(2)
	q := &fakeQueue{rows: []*models.EmailHistory{row}}
	m := &fakeMailer{results: []error{Permanent(goerrors.New("550 no such user"))}}
	w, _ := newTestWorker(t, q, m, 3)

	w.drain(context.Background())

	assert.Equal(t, models.EmailStatusFailed, row.Status)
	assert.Equal(t, 1, row.Attempts)
	assert.Contains(t, *row.ErrorMessage, "550 no such user")
}

func TestWorkerPicksUpRowsLeftByARestart(t *testing.T) {
	// a row that had one attempt before the restart and is now due
	past := fixedNow.Add(-time.Hour)
	row := queuedRow(3)
	row.Attempts, row.NextAttemptAt = 1, &past
	q, m := &fakeQueue{rows: []*models.EmailHistory{row}}, &fakeMailer{}
	w, _ := newTestWorker(t, q, m, 3)

	w.drain(context.Background())

	assert.Equal(t, models.EmailStatusSent, row.Status)
	assert.Equal(t, 2, row.Attempts)
}

func TestWorkerSkipsARowAnotherWorkerClaimed(t *testing.T) {
	row := queuedRow(8)
	q, m := &fakeQueue{rows: []*models.EmailHistory{row}, stolen: true}, &fakeMailer{}
	w, _ := newTestWorker(t, q, m, 3)

	assert.False(t, w.drain(context.Background()))

	assert.Empty(t, m.sent, "only the worker that won the claim sends")
	assert.Zero(t, q.saves)
	assert.Equal(t, models.EmailStatusQueued, row.Status)
}

func TestWorkerFailsARowWhoseLastAttemptWasInterrupted(t *testing.T) {
	// the process died during the last allowed attempt: the row is still QUEUED with every attempt spent
	row := queuedRow(6)
	row.Attempts = 4
	q, m := &fakeQueue{rows: []*models.EmailHistory{row}}, &fakeMailer{}
	w, logger := newTestWorker(t, q, m, 3)

	w.drain(context.Background())

	assert.Empty(t, m.sent, "an interrupted last attempt is not sent again")
	assert.Equal(t, models.EmailStatusFailed, row.Status)
	assert.Equal(t, 4, row.Attempts)
	assert.Equal(t, interruptedMessage, *row.ErrorMessage)
	assert.Equal(t, 1, q.saves)
	assert.Contains(t, logger.all(), "ERROR mail failed id=6 template=alert attempts=4")
}

func TestWorkerShutdownKeepsTheRowQueuedWithoutSpendingAnAttempt(t *testing.T) {
	row := queuedRow(4)
	ctx, cancel := context.WithCancel(context.Background())
	q := &fakeQueue{rows: []*models.EmailHistory{row}}
	m := &fakeMailer{results: []error{context.Canceled}, onSend: cancel}
	w, _ := newTestWorker(t, q, m, 3)

	w.drain(ctx)

	assert.Equal(t, models.EmailStatusQueued, row.Status)
	assert.Zero(t, row.Attempts)
	assert.Nil(t, row.NextAttemptAt, "due again on the next start")
}

func TestWorkerLogsStoreErrors(t *testing.T) {
	t.Run("list", func(t *testing.T) {
		q := &fakeQueue{listErr: errors.Default.New("db down")}
		w, logger := newTestWorker(t, q, &fakeMailer{}, 3)

		assert.False(t, w.drain(context.Background()))
		assert.Contains(t, logger.all(), "WARN mail worker: list queued emails")
	})
	t.Run("claim", func(t *testing.T) {
		q := &fakeQueue{rows: []*models.EmailHistory{queuedRow(5)}, claimErr: errors.Default.New("db down")}
		m := &fakeMailer{}
		w, logger := newTestWorker(t, q, m, 3)

		assert.False(t, w.drain(context.Background()))
		assert.Empty(t, m.sent, "nothing is sent when the attempt can't be recorded")
		assert.Contains(t, logger.all(), "ERROR mail worker: record email outcome id=5")
	})
}

func TestWorkerRetriesSavingTheOutcome(t *testing.T) {
	t.Run("a short outage", func(t *testing.T) {
		row := queuedRow(10)
		q := &fakeQueue{rows: []*models.EmailHistory{row}, saveErr: errors.Default.New("db blip"), failSaves: 2}
		m := &fakeMailer{}
		w, logger := newTestWorker(t, q, m, 3)

		assert.False(t, w.drain(context.Background()))

		assert.Len(t, m.sent, 1)
		assert.Equal(t, 3, q.saves, "the third try records the outcome")
		assert.Equal(t, models.EmailStatusSent, row.Status)
		assert.Contains(t, logger.all(), "WARN mail worker: save email outcome id=10 try=2; trying again")
	})
	t.Run("every try fails", func(t *testing.T) {
		row := queuedRow(11)
		q := &fakeQueue{rows: []*models.EmailHistory{row}, saveErr: errors.Default.New("db down")}
		m := &fakeMailer{}
		w, logger := newTestWorker(t, q, m, 3)

		w.drain(context.Background())

		assert.Equal(t, outcomeSaveTries, q.saves)
		assert.Len(t, m.sent, 1)
		assert.Contains(t, logger.all(), "ERROR mail worker: record email outcome id=11")
	})
}

func TestWorkerDrainReportsAFullBatch(t *testing.T) {
	q := &fakeQueue{}
	for i := 1; i <= defaultBatchSize+1; i++ {
		q.rows = append(q.rows, queuedRow(uint64(i)))
	}
	w, _ := newTestWorker(t, q, &fakeMailer{}, 3)

	assert.True(t, w.drain(context.Background()), "a full batch means more may be due")
	assert.False(t, w.drain(context.Background()), "the last row fits in a short batch")
}

func TestWorkerRunSendsOnNotifyAndStopsOnCancel(t *testing.T) {
	sent := make(chan struct{}, 4)
	q := &fakeQueue{}
	m := &fakeMailer{onSend: func() { sent <- struct{}{} }}
	ready := make(chan struct{}) // closed once "migrations" finish
	w, logger := newTestWorker(t, q, m, 3, WithPollInterval(time.Hour), WithReadiness(func() bool {
		select {
		case <-ready:
			return true
		default:
			return false
		}
	}))
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		defer close(done)
		w.Run(ctx)
	}()

	q.mu.Lock()
	q.rows = append(q.rows, queuedRow(9))
	q.mu.Unlock()
	close(ready)
	w.Notify()
	select {
	case <-sent:
	case <-time.After(5 * time.Second):
		t.Fatal("Run didn't send after Notify")
	}

	cancel()
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("Run didn't stop after cancel")
	}
	assert.Contains(t, logger.all(), "INFO mail worker stopped")
}

func TestNotifyNeverBlocks(t *testing.T) {
	w, _ := newTestWorker(t, &fakeQueue{}, &fakeMailer{}, 3)
	for i := 0; i < 5; i++ {
		w.Notify()
	}
	assert.Len(t, w.wake, 1)
}

func TestExponentialBackoff(t *testing.T) {
	cases := []struct {
		attempt int
		rnd     float64
		want    time.Duration
	}{
		{1, 0.5, time.Minute},
		{2, 0.5, 2 * time.Minute},
		{3, 0.5, 4 * time.Minute},
		{10, 0.5, 30 * time.Minute},
		{1, 0, 48 * time.Second},
		{1, 1, 72 * time.Second},
	}
	for _, tc := range cases {
		b := ExponentialBackoff(func() float64 { return tc.rnd })
		assert.Equal(t, tc.want, b(tc.attempt), "attempt %d rnd %v", tc.attempt, tc.rnd)
	}
}

func TestNewWorkerRejectsNil(t *testing.T) {
	_, err := NewWorker(nil, &fakeMailer{}, Config{}, &recordingLogger{})
	assert.NotNil(t, err)
	_, err = NewWorker(&fakeQueue{}, nil, Config{}, &recordingLogger{})
	assert.NotNil(t, err)
	_, err = NewWorker(&fakeQueue{}, &fakeMailer{}, Config{}, nil)
	assert.NotNil(t, err)
}
