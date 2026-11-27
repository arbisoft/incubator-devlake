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
	netmail "net/mail"
	"strings"

	"github.com/apache/incubator-devlake/core/errors"
)

// Message is one email ready to send. Every address is a bare, valid address.
type Message struct {
	FromAddress string
	FromName    string
	ReplyTo     string // optional
	To          []string
	Subject     string
	HTMLBody    string
	TextBody    string
}

// Mailer sends one message through a provider.
//
// Send returns the provider's message id (empty when the provider has none) or an error. A send that
// reached some recipients but not all returns the message id and an error marked with Partial. An error
// that retrying can't fix (a rejected address, failed authentication, a 5xx reply) is marked with
// Permanent, so IsPermanent reports true for it; every other error is treated as temporary. The
// error's own message (errors.Error.Messages) states the provider's reason, because that message,
// not the debug chain from Error(), is what the history table shows admins.
// Implementations honor ctx cancellation and are safe for concurrent use.
type Mailer interface {
	Send(ctx context.Context, msg *Message) (string, errors.Error)
}

// permanentError marks a send failure that retrying can't fix. It deliberately has no Unwrap: when
// core/errors wraps a plain error, its Unwrap jumps to the root cause (cockroachdb errors.Cause), which
// would skip this marker. As a leaf it stays findable with errors.As; its text keeps the cause's message.
type permanentError struct{ cause error }

func (p *permanentError) Error() string { return p.cause.Error() }

// Permanent marks err as a failure that retrying can't fix. Drivers call it; it returns nil for nil.
func Permanent(err error) error {
	if err == nil {
		return nil
	}
	return &permanentError{cause: err}
}

// partialError marks a send that reached some recipients but not all. Like permanentError it is a
// leaf, so errors.As finds it through core/errors wrapping.
type partialError struct{ cause error }

func (p *partialError) Error() string { return p.cause.Error() }

// Partial marks err as a send that was delivered to some recipients only. Drivers return it with the
// Message-ID; the worker records the email as SENT and keeps the error for the failed recipients.
// It returns nil for nil.
func Partial(err error) error {
	if err == nil {
		return nil
	}
	return &partialError{cause: err}
}

// IsPartial reports whether err, or anything it wraps, was marked with Partial.
func IsPartial(err error) bool {
	var p *partialError
	return goerrors.As(err, &p)
}

// IsPermanent reports whether err, or anything it wraps, was marked with Permanent.
func IsPermanent(err error) bool {
	var p *permanentError
	return goerrors.As(err, &p)
}

// normalizeAddress returns addr lowercased when it is a single bare email address ("a@b.com",
// not "Name <a@b.com>"), and false otherwise.
func normalizeAddress(addr string) (string, bool) {
	addr = strings.TrimSpace(addr)
	if addr == "" || strings.ContainsAny(addr, "\r\n<>, ") {
		return "", false
	}
	parsed, err := netmail.ParseAddress(addr)
	if err != nil || parsed.Address != addr || !strings.Contains(addr[strings.LastIndex(addr, "@")+1:], ".") {
		return "", false
	}
	return strings.ToLower(addr), true
}
