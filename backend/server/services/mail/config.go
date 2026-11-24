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

// Package mail sends alert and report emails and records each one in _devlake_email_history.
// The provider is chosen and configured entirely from config/.env.
package mail

import (
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/apache/incubator-devlake/core/errors"
)

// Env keys read by ParseConfig. Defaults live in core/config/config_viper.go.
const (
	envEnabled        = "MAIL_ENABLED"
	envDriver         = "MAIL_DRIVER"
	envFromAddress    = "MAIL_FROM_ADDRESS"
	envFromName       = "MAIL_FROM_NAME"
	envReplyTo        = "MAIL_REPLY_TO"
	envTemplateDir    = "MAIL_TEMPLATE_DIR"
	envAllowedDomains = "MAIL_ALLOWED_RECIPIENT_DOMAINS"
	envMaxRetries     = "MAIL_MAX_RETRIES"
	envSMTPHost       = "SMTP_HOST"
	envSMTPPort       = "SMTP_PORT"
	envSMTPUsername   = "SMTP_USERNAME"
	envSMTPPassword   = "SMTP_PASSWORD"
	envSMTPSecurity   = "SMTP_SECURITY"
	envSMTPAuth       = "SMTP_AUTH"
	envSMTPTimeout    = "SMTP_TIMEOUT"
)

// SMTP security modes.
const (
	SecurityStartTLS = "starttls"
	SecurityTLS      = "tls"
	SecurityNone     = "none"
)

// SMTP auth types.
const (
	AuthPlain   = "plain"
	AuthLogin   = "login"
	AuthCramMD5 = "cram-md5"
	AuthNone    = "none"
)

const (
	maxPort           = 65535
	maxRetries        = 10               // more than this only delays a FAILED row by hours
	maxSMTPTimeout    = 5 * time.Minute  // a single SMTP command never needs longer
	defaultPort       = 587              // submission port, used by Gmail with STARTTLS
	defaultMaxRetries = 3                // matches the MAIL_MAX_RETRIES default
	defaultTimeout    = 15 * time.Second // matches the SMTP_TIMEOUT default
)

var (
	validSecurity = map[string]bool{SecurityStartTLS: true, SecurityTLS: true, SecurityNone: true}
	validAuth     = map[string]bool{AuthPlain: true, AuthLogin: true, AuthCramMD5: true, AuthNone: true}
)

// Secret holds a value that must never be printed. Its String and MarshalJSON redact it.
type Secret string

// String redacts the secret.
func (Secret) String() string { return "[redacted]" }

// GoString redacts the secret for %#v.
func (Secret) GoString() string { return "[redacted]" }

// MarshalJSON redacts the secret.
func (Secret) MarshalJSON() ([]byte, error) { return []byte(`"[redacted]"`), nil }

// Reveal returns the raw value. Only the SMTP driver calls it.
func (s Secret) Reveal() string { return string(s) }

// SMTPConfig is the smtp driver's settings.
type SMTPConfig struct {
	Host     string
	Port     int
	Username string
	Password Secret
	Security string // starttls, tls or none
	Auth     string // plain, login, cram-md5 or none
	Timeout  time.Duration
}

// Config is the mail service's settings, read once at startup.
type Config struct {
	Enabled        bool
	Driver         string
	FromAddress    string
	FromName       string
	ReplyTo        string
	TemplateDir    string   // empty means the built-in templates only
	AllowedDomains []string // lowercase; empty allows every domain
	MaxRetries     int      // retries after the first attempt
	SMTP           SMTPConfig
}

// Provider names the provider for the history table, for example "smtp:smtp.gmail.com".
func (c Config) Provider() string {
	if c.Driver == DriverSMTP {
		return DriverSMTP + ":" + c.SMTP.Host
	}
	return c.Driver
}

// configSource is what ParseConfig reads; core/config.ConfigReader satisfies it. Numbers are read as
// strings so a typo is reported instead of silently becoming 0.
type configSource interface {
	GetBool(key string) bool
	GetString(key string) string
}

// ParseConfig reads and checks the mail settings. A disabled service is never an error. When mail is
// enabled and a setting is missing or invalid, it returns a BadInput error naming every bad setting
// and a Config with Enabled false, so the caller can log the error and keep running without mail.
func ParseConfig(src configSource) (Config, errors.Error) {
	cfg := Config{
		Enabled:        src.GetBool(envEnabled),
		Driver:         strings.ToLower(strings.TrimSpace(src.GetString(envDriver))),
		FromAddress:    strings.TrimSpace(src.GetString(envFromAddress)),
		FromName:       strings.TrimSpace(src.GetString(envFromName)),
		ReplyTo:        strings.TrimSpace(src.GetString(envReplyTo)),
		TemplateDir:    strings.TrimSpace(src.GetString(envTemplateDir)),
		AllowedDomains: splitDomains(src.GetString(envAllowedDomains)),
		SMTP: SMTPConfig{
			Host:     strings.TrimSpace(src.GetString(envSMTPHost)),
			Username: strings.TrimSpace(src.GetString(envSMTPUsername)),
			Password: Secret(src.GetString(envSMTPPassword)),
			Security: strings.ToLower(strings.TrimSpace(src.GetString(envSMTPSecurity))),
			Auth:     strings.ToLower(strings.TrimSpace(src.GetString(envSMTPAuth))),
		},
	}
	port, portErr := parseNumber(envSMTPPort, src.GetString(envSMTPPort), defaultPort)
	retries, retriesErr := parseNumber(envMaxRetries, src.GetString(envMaxRetries), defaultMaxRetries)
	timeout, timeoutErr := parseTimeout(src.GetString(envSMTPTimeout))
	cfg.SMTP.Port, cfg.MaxRetries, cfg.SMTP.Timeout = port, retries, timeout
	if !cfg.Enabled {
		return cfg, nil
	}
	problems := cfg.problems()
	for _, p := range []string{portErr, retriesErr, timeoutErr} {
		if p != "" {
			problems = append(problems, p)
		}
	}
	if len(problems) > 0 {
		cfg.Enabled = false
		return cfg, errors.BadInput.New("invalid mail config: " + strings.Join(problems, "; "))
	}
	return cfg, nil
}

// problems lists every invalid setting. It never includes the password.
func (c Config) problems() []string {
	var out []string
	if !IsRegisteredDriver(c.Driver) {
		out = append(out, fmt.Sprintf("%s must be one of %s", envDriver, strings.Join(RegisteredDrivers(), ", ")))
	}
	if c.FromAddress == "" {
		out = append(out, envFromAddress+" is required")
	} else if _, ok := normalizeAddress(c.FromAddress); !ok {
		out = append(out, envFromAddress+" is not a valid email address")
	}
	if c.ReplyTo != "" {
		if _, ok := normalizeAddress(c.ReplyTo); !ok {
			out = append(out, envReplyTo+" is not a valid email address")
		}
	}
	if c.MaxRetries < 0 || c.MaxRetries > maxRetries {
		out = append(out, fmt.Sprintf("%s must be between 0 and %d", envMaxRetries, maxRetries))
	}
	for _, d := range c.AllowedDomains {
		if strings.Contains(d, "@") || !strings.Contains(d, ".") {
			out = append(out, fmt.Sprintf("%s has an invalid domain %q", envAllowedDomains, d))
		}
	}
	if c.Driver == DriverSMTP {
		out = append(out, c.SMTP.problems()...)
	}
	return out
}

func (s SMTPConfig) problems() []string {
	var out []string
	if s.Host == "" {
		out = append(out, envSMTPHost+" is required")
	}
	if s.Port < 1 || s.Port > maxPort {
		out = append(out, fmt.Sprintf("%s must be between 1 and %d", envSMTPPort, maxPort))
	}
	if !validSecurity[s.Security] {
		out = append(out, envSMTPSecurity+" must be one of starttls, tls, none")
	}
	if !validAuth[s.Auth] {
		out = append(out, envSMTPAuth+" must be one of plain, login, cram-md5, none")
	}
	if s.Auth != AuthNone && validAuth[s.Auth] && (s.Username == "" || s.Password == "") {
		out = append(out, envSMTPUsername+" and "+envSMTPPassword+" are required unless "+envSMTPAuth+"=none")
	}
	if s.Auth != AuthNone && s.Security == SecurityNone {
		// never send the password over an unencrypted connection
		out = append(out, envSMTPAuth+" must be none when "+envSMTPSecurity+"=none")
	}
	return out
}

// parseNumber reads a whole number. An empty value uses fallback; anything else that isn't a number
// is reported and also falls back, so the range checks don't repeat the message.
func parseNumber(key, raw string, fallback int) (int, string) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return fallback, ""
	}
	n, err := strconv.Atoi(raw)
	if err != nil {
		return fallback, key + " must be a whole number"
	}
	return n, ""
}

// parseTimeout reads SMTP_TIMEOUT as a Go duration. An empty value uses the default.
func parseTimeout(raw string) (time.Duration, string) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return defaultTimeout, ""
	}
	d, err := time.ParseDuration(raw)
	if err != nil || d <= 0 || d > maxSMTPTimeout {
		return defaultTimeout, fmt.Sprintf("%s must be a duration between 1s and %s, for example 15s", envSMTPTimeout, maxSMTPTimeout)
	}
	return d, ""
}

// splitDomains turns "a.com, B.com," into ["a.com", "b.com"].
func splitDomains(raw string) []string {
	var out []string
	for _, part := range strings.Split(raw, ",") {
		if d := strings.ToLower(strings.TrimSpace(part)); d != "" {
			out = append(out, strings.TrimPrefix(d, "@"))
		}
	}
	return out
}
