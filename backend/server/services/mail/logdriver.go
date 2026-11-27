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
	"strings"

	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/core/log"
)

// LogMailer writes each email to the log instead of sending it. It is for local development and
// e2e tests. The body is never logged, and the recipients only at debug level.
type LogMailer struct {
	logger log.Logger
}

var _ Mailer = (*LogMailer)(nil)

// NewLogMailer returns a driver that logs through logger, which must not be nil.
func NewLogMailer(logger log.Logger) (*LogMailer, errors.Error) {
	if logger == nil {
		return nil, errors.Default.New("log mailer: nil logger")
	}
	return &LogMailer{logger: logger}, nil
}

// Send logs msg and sends nothing. It returns no message id.
func (m *LogMailer) Send(ctx context.Context, msg *Message) (string, errors.Error) {
	if err := ctx.Err(); err != nil {
		return "", errors.Default.Wrap(err, "log mailer: "+err.Error())
	}
	m.logger.Info("log mail driver: not sending email subject=%q recipients=%d", msg.Subject, len(msg.To))
	m.logger.Debug("log mail driver: recipients=%s", strings.Join(msg.To, ","))
	return "", nil
}
