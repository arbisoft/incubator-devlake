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
	"encoding/json"
	"fmt"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/apache/incubator-devlake/core/errors"
)

func TestParseConfigValid(t *testing.T) {
	cfg, err := ParseConfig(validSMTPSource().with(envAllowedDomains, " Arbisoft.com, @example.org ,"))

	require.Nil(t, err)
	assert.True(t, cfg.Enabled)
	assert.Equal(t, DriverSMTP, cfg.Driver)
	assert.Equal(t, 587, cfg.SMTP.Port)
	assert.Equal(t, 15*time.Second, cfg.SMTP.Timeout)
	assert.Equal(t, []string{"arbisoft.com", "example.org"}, cfg.AllowedDomains)
	assert.Equal(t, 3, cfg.MaxRetries)
	assert.Equal(t, "smtp:smtp.gmail.com", cfg.Provider())
}

func TestParseConfigDisabledIsNeverAnError(t *testing.T) {
	cfg, err := ParseConfig(mapSource{envEnabled: "false", envDriver: "bogus"})

	assert.Nil(t, err)
	assert.False(t, cfg.Enabled)
	assert.Equal(t, defaultPort, cfg.SMTP.Port)
	assert.Equal(t, defaultTimeout, cfg.SMTP.Timeout)
}

func TestParseConfigLogDriverNeedsNoSMTPSettings(t *testing.T) {
	cfg, err := ParseConfig(mapSource{envEnabled: "true", envDriver: "LOG", envFromAddress: "a@arbisoft.com"})

	require.Nil(t, err)
	assert.True(t, cfg.Enabled)
	assert.Equal(t, DriverLog, cfg.Driver)
	assert.Equal(t, DriverLog, cfg.Provider())
}

func TestParseConfigInvalidTurnsMailOff(t *testing.T) {
	cases := []struct {
		name, key, value, want string
	}{
		{"unknown driver", envDriver, "sendgrid-api", "MAIL_DRIVER must be one of log, smtp"},
		{"missing from", envFromAddress, "", "MAIL_FROM_ADDRESS is required"},
		{"display-name from", envFromAddress, "DevLake <a@arbisoft.com>", "MAIL_FROM_ADDRESS is not a valid email address"},
		{"bad reply-to", envReplyTo, "not-an-email", "MAIL_REPLY_TO is not a valid email address"},
		{"retries too high", envMaxRetries, "11", "MAIL_MAX_RETRIES must be between 0 and 10"},
		{"negative retries", envMaxRetries, "-1", "MAIL_MAX_RETRIES must be between 0 and 10"},
		{"bad domain", envAllowedDomains, "localhost", `invalid domain "localhost"`},
		{"missing host", envSMTPHost, "", "SMTP_HOST is required"},
		{"host with a port", envSMTPHost, "smtp.gmail.com:587", "SMTP_HOST must be a host name or IP address only"},
		{"host with a scheme", envSMTPHost, "smtp://smtp.gmail.com", "SMTP_HOST must be a host name or IP address only"},
		{"host with a path", envSMTPHost, "smtp.gmail.com/mail", "SMTP_HOST must be a host name or IP address only"},
		{"host with a space", envSMTPHost, "smtp gmail.com", "SMTP_HOST must be a host name or IP address only"},
		{"port too high", envSMTPPort, "70000", "SMTP_PORT must be between 1 and 65535"},
		{"port not a number", envSMTPPort, "587a", "SMTP_PORT must be a whole number"},
		{"retries not a number", envMaxRetries, "three", "MAIL_MAX_RETRIES must be a whole number"},
		{"unknown security", envSMTPSecurity, "ssl", "SMTP_SECURITY must be one of starttls, tls, none"},
		{"unknown auth", envSMTPAuth, "xoauth2", "SMTP_AUTH must be one of plain, login, cram-md5, none"},
		{"missing password", envSMTPPassword, "", "SMTP_USERNAME and SMTP_PASSWORD are required"},
		{"password over plain text", envSMTPSecurity, "none", "SMTP_AUTH must be none when SMTP_SECURITY=none"},
		{"bad timeout", envSMTPTimeout, "fifteen", "SMTP_TIMEOUT must be a duration"},
		{"timeout too long", envSMTPTimeout, "10m", "SMTP_TIMEOUT must be a duration"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			cfg, err := ParseConfig(validSMTPSource().with(tc.key, tc.value))

			require.NotNil(t, err)
			assert.Equal(t, errors.BadInput, err.GetType())
			assert.Contains(t, err.Error(), tc.want)
			assert.NotContains(t, err.Error(), "app-password-secret")
			assert.False(t, cfg.Enabled, "invalid config must turn mail off")
		})
	}
}

func TestParseConfigAcceptsHostNamesAndIPs(t *testing.T) {
	for _, host := range []string{"smtp.gmail.com", "127.0.0.1", "::1", "mailhog"} {
		t.Run(host, func(t *testing.T) {
			cfg, err := ParseConfig(validSMTPSource().with(envSMTPHost, host))

			require.Nil(t, err)
			assert.Equal(t, host, cfg.SMTP.Host)
		})
	}
}

func TestParseConfigNoAuthNeedsNoCredentials(t *testing.T) {
	src := validSMTPSource().with(envSMTPAuth, "none").with(envSMTPSecurity, "none").
		with(envSMTPUsername, "").with(envSMTPPassword, "")

	cfg, err := ParseConfig(src)

	require.Nil(t, err)
	assert.True(t, cfg.Enabled)
}

func TestSecretIsRedacted(t *testing.T) {
	cfg, err := ParseConfig(validSMTPSource())
	require.Nil(t, err)

	asJSON, jsonErr := json.Marshal(cfg)
	require.NoError(t, jsonErr)
	for _, printed := range []string{fmt.Sprintf("%v", cfg), fmt.Sprintf("%+v", cfg), fmt.Sprintf("%#v", cfg), string(asJSON)} {
		assert.NotContains(t, printed, "app-password-secret")
	}
	assert.Equal(t, "app-password-secret", cfg.SMTP.Password.Reveal())
}

func TestParseConfigLinkBaseURL(t *testing.T) {
	cases := []struct {
		name, raw, want string
		valid           bool
	}{
		{name: "empty means no links", raw: "", want: "", valid: true},
		{name: "trailing slash removed", raw: " https://devlake.example.com/ ", want: "https://devlake.example.com", valid: true},
		{name: "path prefix kept", raw: "http://localhost:4000/devlake", want: "http://localhost:4000/devlake", valid: true},
		{name: "no scheme", raw: "devlake.example.com", valid: false},
		{name: "other scheme", raw: "javascript:alert(1)", valid: false},
		{name: "query", raw: "https://devlake.example.com?x=1", valid: false},
		{name: "fragment", raw: "https://devlake.example.com#top", valid: false},
		{name: "user info", raw: "https://user@devlake.example.com", valid: false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			cfg, err := ParseConfig(validSMTPSource().with(envLinkBaseURL, tc.raw))

			if !tc.valid {
				require.NotNil(t, err)
				assert.Contains(t, err.Error(), envLinkBaseURL)
				assert.False(t, cfg.Enabled)
				return
			}
			require.Nil(t, err)
			assert.True(t, cfg.Enabled)
			assert.Equal(t, tc.want, cfg.LinkBaseURL)
		})
	}
}
