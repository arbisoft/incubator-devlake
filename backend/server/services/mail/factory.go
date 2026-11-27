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
	"fmt"
	"sort"
	"strings"

	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/core/log"
)

// Driver names accepted in MAIL_DRIVER.
const (
	DriverSMTP = "smtp"
	DriverLog  = "log"
)

// mailerFactory builds one driver from the validated config.
type mailerFactory func(cfg Config, logger log.Logger) (Mailer, errors.Error)

// mailerFactories is the driver registry (Factory Method, GOF-C1). Adding a provider, for example an
// HTTP API driver, is one new entry here plus its Mailer implementation; no caller changes.
// Each entry returns a nil Mailer itself on error: passing a constructor's (*T, error) straight
// through would turn a nil *T into a non-nil Mailer that panics on first use.
// The map is never written after package init.
var mailerFactories = map[string]mailerFactory{
	DriverSMTP: func(cfg Config, _ log.Logger) (Mailer, errors.Error) {
		m, err := NewSMTPMailer(cfg.SMTP)
		if err != nil {
			return nil, err
		}
		return m, nil
	},
	DriverLog: func(_ Config, logger log.Logger) (Mailer, errors.Error) {
		m, err := NewLogMailer(logger)
		if err != nil {
			return nil, err
		}
		return m, nil
	},
}

// NewMailer returns the driver named by cfg.Driver. It returns a BadInput error for an unknown driver.
func NewMailer(cfg Config, logger log.Logger) (Mailer, errors.Error) {
	factory, ok := mailerFactories[cfg.Driver]
	if !ok {
		return nil, errors.BadInput.New(fmt.Sprintf("unknown mail driver %q; use one of %s",
			cfg.Driver, strings.Join(RegisteredDrivers(), ", ")))
	}
	return factory(cfg, logger)
}

// IsRegisteredDriver reports whether name is a known MAIL_DRIVER value.
func IsRegisteredDriver(name string) bool {
	_, ok := mailerFactories[name]
	return ok
}

// RegisteredDrivers returns the known MAIL_DRIVER values, sorted.
func RegisteredDrivers() []string {
	names := make([]string, 0, len(mailerFactories))
	for name := range mailerFactories {
		names = append(names, name)
	}
	sort.Strings(names)
	return names
}
