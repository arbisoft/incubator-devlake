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
	"fmt"
	"net/textproto"
	"strings"

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

// Send delivers msg in one SMTP session and returns its Message-ID. Each recipient gets their own
// copy, addressed only to them and sharing one Message-ID, so a server that rejects one address
// doesn't stop the others: go-mail drops the whole transaction when any RCPT TO fails. When some
// copies are delivered and others aren't, Send returns the Message-ID with a Partial error that
// names the failed recipients.
func (m *SMTPMailer) Send(ctx context.Context, msg *Message) (string, errors.Error) {
	copies := make([]*gomail.Msg, 0, len(msg.To))
	messageID := ""
	for _, to := range msg.To {
		gm, err := buildMsg(msg, to)
		if err != nil {
			return "", errors.Default.Wrap(Permanent(err), "build message: "+err.Error())
		}
		if messageID == "" {
			messageID = firstHeader(gm, gomail.HeaderMessageID)
		} else {
			gm.SetGenHeader(gomail.HeaderMessageID, messageID)
		}
		copies = append(copies, gm)
	}
	if len(copies) == 0 {
		return "", errors.Default.Wrap(Permanent(goerrors.New("no recipients")), "build message: no recipients")
	}
	// a client per send keeps Send safe for concurrent use; go-mail clients hold connection state
	client, err := gomail.NewClient(m.host, m.options...)
	if err != nil {
		return "", errors.Default.Wrap(Permanent(err), "create smtp client: "+err.Error())
	}
	sendErr := client.DialAndSendWithContext(ctx, copies...)
	if sendErr == nil {
		return messageID, nil
	}
	var failed []string
	var reasons []string
	allPermanent := true
	for i, gm := range copies {
		if !gm.HasSendError() {
			continue
		}
		copyErr := gm.SendError()
		failed = append(failed, msg.To[i])
		reasons = append(reasons, copyErr.Error())
		allPermanent = allPermanent && IsPermanent(classify(ctx, copyErr))
	}
	switch {
	case len(failed) == 0:
		// the session failed before any copy was tried: dial, TLS or authentication
		return "", errors.Default.Wrap(classify(ctx, sendErr), "send through "+m.host+": "+sendErr.Error())
	case len(failed) < len(copies):
		return messageID, errors.Default.Wrap(Partial(sendErr), fmt.Sprintf("not delivered to %d of %d recipients through %s: %s",
			len(failed), len(copies), m.host, strings.Join(reasons, "; ")))
	case allPermanent:
		return "", errors.Default.Wrap(Permanent(sendErr), "send through "+m.host+": "+strings.Join(reasons, "; "))
	default:
		return "", errors.Default.Wrap(sendErr, "send through "+m.host+": "+strings.Join(reasons, "; "))
	}
}

// buildMsg maps a Message to go-mail's message for one recipient: plain text first, HTML as the
// preferred alternative.
func buildMsg(msg *Message, to string) (*gomail.Msg, error) {
	gm := gomail.NewMsg()
	if err := gm.FromFormat(msg.FromName, msg.FromAddress); err != nil {
		return nil, err
	}
	if err := gm.To(to); err != nil {
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
