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
	"strings"
	"sync"

	"github.com/apache/incubator-devlake/core/log"
)

// recordingLogger keeps every formatted line. The generated mocks/core/log.Logger matches variadic
// arguments one by one, which makes "allow any log line" impractical, so tests use this instead.
type recordingLogger struct {
	mu    sync.Mutex // guards lines
	lines []string
}

var _ log.Logger = (*recordingLogger)(nil)

func (l *recordingLogger) add(level, format string, a ...interface{}) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.lines = append(l.lines, level+" "+fmt.Sprintf(format, a...))
}

func (l *recordingLogger) all() string {
	l.mu.Lock()
	defer l.mu.Unlock()
	return strings.Join(l.lines, "\n")
}

func (l *recordingLogger) IsLevelEnabled(log.LogLevel) bool               { return true }
func (l *recordingLogger) Printf(format string, a ...interface{})         { l.add("PRINT", format, a...) }
func (l *recordingLogger) Log(_ log.LogLevel, f string, a ...interface{}) { l.add("LOG", f, a...) }
func (l *recordingLogger) Debug(format string, a ...interface{})          { l.add("DEBUG", format, a...) }
func (l *recordingLogger) Info(format string, a ...interface{})           { l.add("INFO", format, a...) }
func (l *recordingLogger) Warn(err error, format string, a ...interface{}) {
	l.add("WARN", format+errSuffix(err), a...)
}
func (l *recordingLogger) Error(err error, format string, a ...interface{}) {
	l.add("ERROR", format+errSuffix(err), a...)
}
func (l *recordingLogger) Nested(string) log.Logger          { return l }
func (l *recordingLogger) GetConfig() *log.LoggerConfig      { return &log.LoggerConfig{} }
func (l *recordingLogger) SetStream(*log.LoggerStreamConfig) {}

func errSuffix(err error) string {
	if err == nil {
		return ""
	}
	return " err=" + strings.ReplaceAll(err.Error(), "%", "%%")
}

// mapSource is a config source backed by a map, standing in for viper.
type mapSource map[string]string

func (m mapSource) GetString(key string) string { return m[key] }

func (m mapSource) GetBool(key string) bool { return m[key] == "true" }

// validSMTPSource is a complete, valid Gmail-style config; tests change single keys.
func validSMTPSource() mapSource {
	return mapSource{
		envEnabled:        "true",
		envDriver:         "smtp",
		envFromAddress:    "devlake-alerts@arbisoft.com",
		envFromName:       "DevLake",
		envSMTPHost:       "smtp.gmail.com",
		envSMTPPort:       "587",
		envSMTPUsername:   "devlake-alerts@arbisoft.com",
		envSMTPPassword:   "app-password-secret",
		envSMTPSecurity:   "starttls",
		envSMTPAuth:       "plain",
		envSMTPTimeout:    "15s",
		envMaxRetries:     "3",
		envAllowedDomains: "arbisoft.com",
	}
}

func (m mapSource) with(key, value string) mapSource {
	out := make(mapSource, len(m)+1)
	for k, v := range m {
		out[k] = v
	}
	out[key] = value
	return out
}
