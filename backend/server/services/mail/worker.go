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
	"math/rand"
	"strings"
	"time"

	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/core/log"
	"github.com/apache/incubator-devlake/core/models"
)

const (
	defaultPollInterval = 30 * time.Second // picks up rows left by a restart or a missed wake-up
	defaultBatchSize    = 20               // rows sent per wake-up before the worker checks again
	smtpRoundTrips      = 8                // dial, EHLO, STARTTLS, EHLO, AUTH, MAIL, RCPT, DATA: one SMTP_TIMEOUT each at most
	backoffBase         = time.Minute      // wait before the first retry
	backoffCap          = 30 * time.Minute // longest wait between retries
	backoffJitter       = 0.2              // ±20% so retries don't line up with the poll ticks
	maxErrorMessageLen  = 2000             // keeps a provider's long reply from bloating the row
)

// queueStore is what the worker needs from the history table.
type queueStore interface {
	DueQueued(now time.Time, limit int) ([]*models.EmailHistory, errors.Error)
	Save(row *models.EmailHistory) errors.Error
}

// Backoff returns how long to wait after the given failed attempt (1 for the first).
type Backoff func(attempt int) time.Duration

// ExponentialBackoff doubles backoffBase per attempt up to backoffCap, with ±20% jitter from rnd,
// which returns a value in [0, 1).
func ExponentialBackoff(rnd func() float64) Backoff {
	return func(attempt int) time.Duration {
		wait := backoffBase
		for i := 1; i < attempt && wait < backoffCap; i++ {
			wait *= 2
		}
		if wait > backoffCap {
			wait = backoffCap
		}
		factor := 1 + backoffJitter*(2*rnd()-1)
		return time.Duration(float64(wait) * factor)
	}
}

// Worker sends QUEUED rows one at a time and records the outcome. The row is the retry state:
// attempts, next_attempt_at and status live in the database, so a restart resumes where it stopped.
// Only one Worker may run per database.
type Worker struct {
	store        queueStore
	mailer       Mailer
	logger       log.Logger
	fromName     string
	replyTo      string
	maxAttempts  int
	sendTimeout  time.Duration
	now          func() time.Time
	backoff      Backoff
	ready        func() bool
	pollInterval time.Duration
	batchSize    int
	wake         chan struct{}
}

var _ notifier = (*Worker)(nil)

// WorkerOption changes a Worker.
type WorkerOption func(*Worker)

// WithWorkerClock replaces the clock; tests pass a fixed time.
func WithWorkerClock(now func() time.Time) WorkerOption { return func(w *Worker) { w.now = now } }

// WithBackoff replaces the retry wait (Strategy, GOF-B1).
func WithBackoff(b Backoff) WorkerOption { return func(w *Worker) { w.backoff = b } }

// WithReadiness makes the worker wait until ready returns true, for example until migrations ran.
func WithReadiness(ready func() bool) WorkerOption { return func(w *Worker) { w.ready = ready } }

// WithPollInterval changes how often the worker looks for due rows without being woken.
func WithPollInterval(d time.Duration) WorkerOption { return func(w *Worker) { w.pollInterval = d } }

// NewWorker returns a worker that sends through mailer with cfg's sender details and retry limit.
// store, mailer and logger must not be nil. It starts nothing; call Run.
func NewWorker(store queueStore, mailer Mailer, cfg Config, logger log.Logger, opts ...WorkerOption) (*Worker, errors.Error) {
	if store == nil || mailer == nil || logger == nil {
		return nil, errors.Default.New("mail worker: nil dependency")
	}
	w := &Worker{
		store:        store,
		mailer:       mailer,
		logger:       logger,
		fromName:     cfg.FromName,
		replyTo:      cfg.ReplyTo,
		maxAttempts:  cfg.MaxRetries + 1,
		sendTimeout:  cfg.SMTP.Timeout * smtpRoundTrips,
		now:          time.Now,
		backoff:      ExponentialBackoff(rand.Float64), // jitter only; not security sensitive
		ready:        func() bool { return true },
		pollInterval: defaultPollInterval,
		batchSize:    defaultBatchSize,
		wake:         make(chan struct{}, 1),
	}
	for _, opt := range opts {
		opt(w)
	}
	if w.sendTimeout <= 0 {
		w.sendTimeout = defaultTimeout * smtpRoundTrips
	}
	return w, nil
}

// Notify wakes the worker without blocking. Wake-ups while it is busy collapse into one.
func (w *Worker) Notify() {
	select {
	case w.wake <- struct{}{}:
	default:
	}
}

// Run sends due rows until ctx is cancelled. It blocks, so start it in a goroutine owned by the
// caller, which stops it by cancelling ctx. Rows QUEUED before a restart are sent on the first pass.
func (w *Worker) Run(ctx context.Context) {
	ticker := time.NewTicker(w.pollInterval)
	defer ticker.Stop()
	w.logger.Info("mail worker started maxAttempts=%d", w.maxAttempts)
	for {
		if w.ready() && w.drain(ctx) {
			w.Notify() // a full batch: there may be more due rows
		}
		select {
		case <-ctx.Done():
			w.logger.Info("mail worker stopped")
			return
		case <-ticker.C:
		case <-w.wake:
		}
	}
}

// drain sends one batch of due rows. It reports whether the batch was full and every row was
// recorded, which means more rows may be due now.
func (w *Worker) drain(ctx context.Context) bool {
	rows, err := w.store.DueQueued(w.now().UTC(), w.batchSize)
	if err != nil {
		w.logger.Warn(err, "mail worker: list queued emails")
		return false
	}
	recorded := 0
	for _, row := range rows {
		if ctx.Err() != nil {
			return false
		}
		if err := w.process(ctx, row); err != nil {
			w.logger.Error(err, "mail worker: record email outcome id=%d", row.ID)
			continue
		}
		recorded++
	}
	return len(rows) == w.batchSize && recorded == len(rows)
}

// process makes one attempt to send row and saves the outcome. The attempt is counted before
// sending, so a crash mid-send can't make the worker retry forever.
func (w *Worker) process(ctx context.Context, row *models.EmailHistory) errors.Error {
	row.Attempts++
	row.UpdatedAt = w.now().UTC()
	if err := w.store.Save(row); err != nil {
		return err
	}
	sendCtx, cancel := context.WithTimeout(ctx, w.sendTimeout)
	messageID, sendErr := w.mailer.Send(sendCtx, w.message(row))
	cancel()
	if sendErr != nil && ctx.Err() != nil {
		// shutting down: leave the row QUEUED for the next start, without spending an attempt
		row.Attempts--
	}
	o := decide(row.Attempts, w.maxAttempts, sendErr, ctx.Err() != nil, w.now().UTC(), w.backoff)
	apply(row, o, messageID)
	if err := w.store.Save(row); err != nil {
		return err
	}
	w.logOutcome(row, sendErr)
	return nil
}

func (w *Worker) message(row *models.EmailHistory) *Message {
	return &Message{
		FromAddress: row.Sender,
		FromName:    w.fromName,
		ReplyTo:     w.replyTo,
		To:          strings.Split(row.Recipients, ","),
		Subject:     row.Subject,
		HTMLBody:    row.Content,
		TextBody:    row.TextContent,
	}
}

func (w *Worker) logOutcome(row *models.EmailHistory, sendErr error) {
	switch row.Status {
	case models.EmailStatusSent:
		w.logger.Info("mail sent id=%d template=%s attempts=%d", row.ID, row.Template, row.Attempts)
	case models.EmailStatusFailed:
		w.logger.Error(sendErr, "mail failed id=%d template=%s attempts=%d", row.ID, row.Template, row.Attempts)
	default:
		if sendErr != nil {
			w.logger.Warn(sendErr, "mail send will be retried id=%d attempts=%d", row.ID, row.Attempts)
		}
	}
}

// outcome is what to record after one attempt.
type outcome struct {
	status        string
	sentOn        *time.Time
	nextAttemptAt *time.Time
	errorMessage  *string
}

// decide turns one attempt's result into the row's next state. It does no I/O.
//   - success: SENT now;
//   - shutting down: stays QUEUED, due again at once;
//   - permanent error, or attempts used up: FAILED with the error;
//   - otherwise: stays QUEUED until now + backoff(attempts), with the error kept for the screen.
func decide(attempts, maxAttempts int, sendErr error, shuttingDown bool, now time.Time, backoff Backoff) outcome {
	if sendErr == nil {
		return outcome{status: models.EmailStatusSent, sentOn: &now}
	}
	msg := errorText(sendErr)
	if shuttingDown {
		return outcome{status: models.EmailStatusQueued, errorMessage: msg}
	}
	if IsPermanent(sendErr) || attempts >= maxAttempts {
		return outcome{status: models.EmailStatusFailed, errorMessage: msg}
	}
	next := now.Add(backoff(attempts))
	return outcome{status: models.EmailStatusQueued, nextAttemptAt: &next, errorMessage: msg}
}

func apply(row *models.EmailHistory, o outcome, messageID string) {
	row.Status = o.status
	row.SentOn = o.sentOn
	row.NextAttemptAt = o.nextAttemptAt
	row.ErrorMessage = o.errorMessage
	if o.status == models.EmailStatusSent {
		row.ProviderMessageId = optional(messageID)
	}
	if o.sentOn != nil {
		row.UpdatedAt = *o.sentOn
	}
}

// errorText is the readable reason kept on the row: the project error's own messages, without the
// debug chain that Error() renders for logs.
func errorText(err error) *string {
	msg := err.Error()
	if lakeErr := errors.AsLakeErrorType(err); lakeErr != nil {
		if formatted := lakeErr.Messages().Format(); formatted != "" {
			msg = formatted
		}
	}
	if runes := []rune(msg); len(runes) > maxErrorMessageLen {
		msg = string(runes[:maxErrorMessageLen])
	}
	return &msg
}
