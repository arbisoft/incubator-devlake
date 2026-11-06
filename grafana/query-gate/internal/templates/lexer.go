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

// Package templates compiles saved Grafana dashboard SQL into anchored matchers.
package templates

import "strings"

type lexState int

const (
	stateNormal lexState = iota
	stateSingleQuoted
	stateDoubleQuoted
	stateBacktick
	stateLineComment
	stateBlockComment
)

// lexer tracks the MySQL quote and comment state over literal template text.
type lexer struct {
	state      lexState
	pendingEsc bool
}

func (l *lexer) feed(text string) {
	i := 0
	if l.pendingEsc && len(text) > 0 {
		l.pendingEsc = false
		i = 1
	}
	for i < len(text) {
		c := text[i]
		switch l.state {
		case stateNormal:
			switch {
			case c == '\'':
				l.state = stateSingleQuoted
			case c == '"':
				l.state = stateDoubleQuoted
			case c == '`':
				l.state = stateBacktick
			case c == '#':
				l.state = stateLineComment
			case c == '-' && i+2 < len(text) && text[i+1] == '-' && isCommentSpace(text[i+2]):
				l.state = stateLineComment
				i += 2
			case c == '/' && i+1 < len(text) && text[i+1] == '*':
				l.state = stateBlockComment
				i++
			}
		case stateSingleQuoted, stateDoubleQuoted:
			quote := byte('\'')
			if l.state == stateDoubleQuoted {
				quote = '"'
			}
			switch {
			case c == '\\':
				if i+1 < len(text) {
					i++
				} else {
					l.pendingEsc = true
				}
			case c == quote && i+1 < len(text) && text[i+1] == quote:
				i++
			case c == quote:
				l.state = stateNormal
			}
		case stateBacktick:
			if c == '`' {
				if i+1 < len(text) && text[i+1] == '`' {
					i++
				} else {
					l.state = stateNormal
				}
			}
		case stateLineComment:
			if c == '\n' {
				l.state = stateNormal
			}
		case stateBlockComment:
			if c == '*' && i+1 < len(text) && text[i+1] == '/' {
				l.state = stateNormal
				i++
			}
		}
		i++
	}
}

func isCommentSpace(c byte) bool {
	return c == ' ' || c == '\t' || c == '\n'
}

func containsExecutableComment(text string) bool {
	return strings.Contains(text, "/*!")
}
