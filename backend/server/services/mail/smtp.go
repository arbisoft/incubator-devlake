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
	"crypto/tls"
	goerrors "errors"
	"net/textproto"

	gomail "github.com/wneessen/go-mail"

	"github.com/apache/incubator-devlake/core/errors"
)

// smtpPermanentCode is the first SMTP reply code that means "don't retry" (RFC 5321 §4.2.1).
const smtpPermanentCode = 500

// smtpAuthTypes maps SMTP_AUTH values to go-mail's auth types. AuthNone sends no AUTH command.
var smtpAuthTypes = map[string]gomail.SMTPAuthType{
	AuthPlain:   gomail.SMTPAuthPlain,
	AuthLogin:   gomail.SMTPAuthLogin,
	AuthCramMD5: gomail.SMTPAuthCramMD5,
	AuthNone:    gomail.SMTPAuthNoAuth,
}

// SMTPMailer sends email through an SMTP server with go-mail (Adapter, GOF-S1). It works with any
// provider that offers SMTP: Gmail, SendGrid, SES, Mailgun, Brevo or Office 365.
type SMTPMailer struct {
	options []gomail.Option
	host    string
}

var _ Mailer = (*SMTPMailer)(nil)

// SMTPOption changes an SMTPMailer.
type SMTPOption func(*smtpSettings)

type smtpSettings struct {
	tlsConfig *tls.Config
}

// WithTLSConfig replaces the TLS settings, for example to trust a test server's certificate.
func WithTLSConfig(c *tls.Config) SMTPOption {
	return func(s *smtpSettings) { s.tlsConfig = c }
}

// NewSMTPMailer returns a driver for cfg, which ParseConfig has already validated. It does no I/O;
// each Send opens and closes its own connection.
func NewSMTPMailer(cfg SMTPConfig, opts ...SMTPOption) (*SMTPMailer, errors.Error) {
	if cfg.Host == "" {
		return nil, errors.BadInput.New("smtp mailer: host is required")
	}
	authType, ok := smtpAuthTypes[cfg.Auth]
	if !ok {
		return nil, errors.BadInput.New("smtp mailer: unknown auth type " + cfg.Auth)
	}
	settings := smtpSettings{tlsConfig: &tls.Config{ServerName: cfg.Host, MinVersion: tls.VersionTLS12}}
	for _, opt := range opts {
		opt(&settings)
	}
	options := []gomail.Option{
		gomail.WithPort(cfg.Port),
		gomail.WithTimeout(cfg.Timeout),
		gomail.WithTLSConfig(settings.tlsConfig),
		gomail.WithSMTPAuth(authType),
	}
	switch cfg.Security {
	case SecurityTLS:
		options = append(options, gomail.WithSSL())
	case SecurityNone:
		options = append(options, gomail.WithTLSPolicy(gomail.NoTLS))
	default:
		options = append(options, gomail.WithTLSPolicy(gomail.TLSMandatory))
	}
	if cfg.Auth != AuthNone {
		options = append(options, gomail.WithUsername(cfg.Username), gomail.WithPassword(cfg.Password.Reveal()))
	}
	// build one client now so option errors surface at startup, not on the first send
	if _, err := gomail.NewClient(cfg.Host, options...); err != nil {
		return nil, errors.BadInput.Wrap(err, "smtp mailer: invalid settings")
	}
	return &SMTPMailer{options: options, host: cfg.Host}, nil
}

// Send delivers msg in one SMTP session and returns its Message-ID.
func (m *SMTPMailer) Send(ctx context.Context, msg *Message) (string, errors.Error) {
	gm, err := buildMsg(msg)
	if err != nil {
		return "", errors.Default.Wrap(Permanent(err), "build message: "+err.Error())
	}
	// a client per send keeps Send safe for concurrent use; go-mail clients hold connection state
	client, err := gomail.NewClient(m.host, m.options...)
	if err != nil {
		return "", errors.Default.Wrap(Permanent(err), "create smtp client: "+err.Error())
	}
	if err := client.DialAndSendWithContext(ctx, gm); err != nil {
		return "", errors.Default.Wrap(classify(ctx, err), "send through "+m.host+": "+err.Error())
	}
	return firstHeader(gm, gomail.HeaderMessageID), nil
}

// buildMsg maps a Message to go-mail's message: plain text first, HTML as the preferred alternative.
func buildMsg(msg *Message) (*gomail.Msg, error) {
	gm := gomail.NewMsg()
	if err := gm.FromFormat(msg.FromName, msg.FromAddress); err != nil {
		return nil, err
	}
	if err := gm.To(msg.To...); err != nil {
		return nil, err
	}
	if msg.ReplyTo != "" {
		if err := gm.ReplyTo(msg.ReplyTo); err != nil {
			return nil, err
		}
	}
	gm.Subject(msg.Subject)
	gm.SetMessageID()
	gm.SetDate()
	gm.SetBodyString(gomail.TypeTextPlain, msg.TextBody)
	gm.AddAlternativeString(gomail.TypeTextHTML, msg.HTMLBody)
	return gm, nil
}

// classify marks errors that retrying can't fix. Cancellation, timeouts, network errors and 4xx
// replies stay temporary; 5xx replies (including failed authentication, 535) are permanent.
func classify(ctx context.Context, err error) error {
	if ctx.Err() != nil {
		return err
	}
	// go-mail's IsTemp is false for network failures too, so only a 5xx reply code counts as permanent
	var sendErr *gomail.SendError
	if goerrors.As(err, &sendErr) && sendErr.ErrorCode() >= smtpPermanentCode {
		return Permanent(err)
	}
	var protoErr *textproto.Error
	if goerrors.As(err, &protoErr) && protoErr.Code >= smtpPermanentCode {
		return Permanent(err)
	}
	if goerrors.Is(err, gomail.ErrPlainAuthNotSupported) {
		return Permanent(err)
	}
	return err
}

func firstHeader(gm *gomail.Msg, h gomail.Header) string {
	if values := gm.GetGenHeader(h); len(values) > 0 {
		return values[0]
	}
	return ""
}
