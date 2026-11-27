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
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/apache/incubator-devlake/core/errors"
)

func TestNewMailerPicksTheDriverByName(t *testing.T) {
	cases := []struct {
		name   string
		cfg    Config
		assert func(t *testing.T, m Mailer)
	}{
		{"smtp", Config{Driver: DriverSMTP, SMTP: SMTPConfig{Host: "smtp.gmail.com", Port: 587, Auth: AuthNone, Security: SecurityStartTLS, Timeout: time.Second}},
			func(t *testing.T, m Mailer) { assert.IsType(t, &SMTPMailer{}, m) }},
		{"log", Config{Driver: DriverLog},
			func(t *testing.T, m Mailer) { assert.IsType(t, &LogMailer{}, m) }},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			m, err := NewMailer(tc.cfg, &recordingLogger{})
			require.Nil(t, err)
			tc.assert(t, m)
		})
	}
}

func TestNewMailerRejectsAnUnknownDriver(t *testing.T) {
	m, err := NewMailer(Config{Driver: "carrier-pigeon"}, &recordingLogger{})

	assert.Nil(t, m)
	require.NotNil(t, err)
	assert.Equal(t, errors.BadInput, err.GetType())
	assert.Contains(t, err.Error(), `unknown mail driver "carrier-pigeon"; use one of log, smtp`)
}

func TestNewMailerReturnsANilMailerWhenTheDriverFails(t *testing.T) {
	m, err := NewMailer(Config{Driver: DriverSMTP}, &recordingLogger{})

	require.NotNil(t, err)
	assert.True(t, m == nil, "a failed driver must return a nil interface, not a nil pointer inside one")
}

func TestRegisteredDriversAreSorted(t *testing.T) {
	assert.Equal(t, []string{DriverLog, DriverSMTP}, RegisteredDrivers())
	assert.True(t, IsRegisteredDriver(DriverSMTP))
	assert.False(t, IsRegisteredDriver(""))
}

func TestLogMailerLogsWithoutTheBodyOrAddressesAtInfo(t *testing.T) {
	logger := &recordingLogger{}
	m, err := NewLogMailer(logger)
	require.Nil(t, err)

	id, sendErr := m.Send(context.Background(), &Message{
		To: []string{"a@arbisoft.com", "b@arbisoft.com"}, Subject: "Hello", HTMLBody: "<p>secret body</p>", TextBody: "secret body",
	})

	require.Nil(t, sendErr)
	assert.Empty(t, id)
	assert.Contains(t, logger.all(), `INFO log mail driver: not sending email subject="Hello" recipients=2`)
	assert.Contains(t, logger.all(), "DEBUG log mail driver: recipients=a@arbisoft.com,b@arbisoft.com")
	assert.NotContains(t, logger.all(), "secret body")
}

func TestLogMailerHonorsCancellation(t *testing.T) {
	m, err := NewLogMailer(&recordingLogger{})
	require.Nil(t, err)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	_, sendErr := m.Send(ctx, &Message{})

	require.NotNil(t, sendErr)
	assert.True(t, goerrors.Is(sendErr, context.Canceled))
}

func TestNewLogMailerRejectsNilLogger(t *testing.T) {
	_, err := NewLogMailer(nil)
	assert.NotNil(t, err)
}

func TestPermanentMarksAndUnwraps(t *testing.T) {
	base := goerrors.New("550 no such user")
	wrapped := errors.Default.Wrap(Permanent(base), "send")

	assert.True(t, IsPermanent(wrapped))
	assert.False(t, IsPermanent(errors.Default.Wrap(base, "send")))
	assert.Nil(t, Permanent(nil))
}

func TestNormalizeAddress(t *testing.T) {
	cases := []struct {
		in, want string
		ok       bool
	}{
		{" Ali@Arbisoft.COM ", "ali@arbisoft.com", true},
		{"a.b+tag@sub.example.org", "a.b+tag@sub.example.org", true},
		{"Name <a@arbisoft.com>", "", false},
		{"a@localhost", "", false},
		{"legacy-login", "", false},
		{"a@b.com,c@d.com", "", false},
		{"a@b.com\r\nBcc: x@y.com", "", false},
		{"", "", false},
	}
	for _, tc := range cases {
		t.Run(tc.in, func(t *testing.T) {
			got, ok := normalizeAddress(tc.in)
			assert.Equal(t, tc.ok, ok)
			assert.Equal(t, tc.want, got)
		})
	}
}
