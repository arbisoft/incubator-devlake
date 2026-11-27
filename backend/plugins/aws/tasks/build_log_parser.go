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

package tasks

import (
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/plugins/aws/models"
)

// Names of the scope config fields that hold the log patterns.
const (
	awsFieldTrivyPattern     = "trivyTotalsPattern"
	awsFieldSmokeTestPattern = "smokeTestPattern"
	awsFieldRollbackPattern  = "rollbackPattern"
)

const (
	awsLogEchoMarker      = "echo "
	awsLogVariableMarker  = "${"
	awsLogUnderlineChar   = "="
	awsLogTargetLimit     = 255
	awsLogResultLimit     = 16
	awsLogTrivyTotalGroup = 1
	awsLogTrivyCountGroup = 2
	awsLogResultGroup     = 1
)

// awsTrivySeverityPair matches one `NAME: n` pair of a Trivy totals line.
var awsTrivySeverityPair = regexp.MustCompile(`([A-Za-z]+):\s*(\d+)`)

type awsTrivySeverity string

const (
	awsSeverityCritical awsTrivySeverity = "CRITICAL"
	awsSeverityHigh     awsTrivySeverity = "HIGH"
	awsSeverityMedium   awsTrivySeverity = "MEDIUM"
	awsSeverityLow      awsTrivySeverity = "LOW"
	awsSeverityUnknown  awsTrivySeverity = "UNKNOWN"
)

// awsLogPattern is a compiled scope config pattern with the text it was compiled from; the zero value is unset.
type awsLogPattern struct {
	Text   string
	Regexp *regexp.Regexp
}

func (p awsLogPattern) isSet() bool {
	return p.Regexp != nil
}

// compileAwsLogPattern compiles one scope config pattern; an empty pattern stays unset.
func compileAwsLogPattern(field, text string) (awsLogPattern, errors.Error) {
	if text == "" {
		return awsLogPattern{}, nil
	}
	compiled, err := errors.Convert01(regexp.Compile(text))
	if err != nil {
		return awsLogPattern{}, errors.BadInput.Wrap(err, "invalid value for `"+field+"`")
	}
	return awsLogPattern{Text: text, Regexp: compiled}, nil
}

// awsLogPatterns are the three log patterns of a scope config.
type awsLogPatterns struct {
	Trivy     awsLogPattern
	SmokeTest awsLogPattern
	Rollback  awsLogPattern
}

// compileAwsLogPatterns compiles the log patterns of a scope config.
func compileAwsLogPatterns(config *models.AwsScopeConfig) (awsLogPatterns, errors.Error) {
	var patterns awsLogPatterns
	var err errors.Error
	if patterns.Trivy, err = compileAwsLogPattern(awsFieldTrivyPattern, config.TrivyTotalsPattern); err != nil {
		return patterns, err
	}
	if patterns.SmokeTest, err = compileAwsLogPattern(awsFieldSmokeTestPattern, config.SmokeTestPattern); err != nil {
		return patterns, err
	}
	patterns.Rollback, err = compileAwsLogPattern(awsFieldRollbackPattern, config.RollbackPattern)
	return patterns, err
}

// awsAppliedPattern is a pattern that applies to a build.
type awsAppliedPattern struct {
	Name    models.AwsLogPatternName
	Pattern awsLogPattern
}

// applicable lists the set patterns that apply to a build; smoke test and rollback only apply to deployment builds.
func (p awsLogPatterns) applicable(deployment bool) []awsAppliedPattern {
	var applied []awsAppliedPattern
	if p.Trivy.isSet() {
		applied = append(applied, awsAppliedPattern{models.AwsLogPatternTrivy, p.Trivy})
	}
	if deployment && p.SmokeTest.isSet() {
		applied = append(applied, awsAppliedPattern{models.AwsLogPatternSmokeTest, p.SmokeTest})
	}
	if deployment && p.Rollback.isSet() {
		applied = append(applied, awsAppliedPattern{models.AwsLogPatternRollback, p.Rollback})
	}
	return applied
}

func (p awsLogPatterns) anySet() bool {
	return p.Trivy.isSet() || p.SmokeTest.isSet() || p.Rollback.isSet()
}

// awsLogLine is one line of a build log with the time of its log event.
type awsLogLine struct {
	Text string
	At   time.Time
}

// awsLogLines splits log events into lines; the newline that ends each event is not a line of its own.
func awsLogLines(events []AwsLogEvent) []awsLogLine {
	var lines []awsLogLine
	for _, event := range events {
		at := time.UnixMilli(event.Timestamp).UTC()
		for _, text := range strings.Split(strings.TrimSuffix(event.Message, "\n"), "\n") {
			lines = append(lines, awsLogLine{Text: strings.TrimRight(text, "\r"), At: at})
		}
	}
	return lines
}

// awsLogSignal is one parsed finding of a build log.
type awsLogSignal struct {
	Type     models.AwsLogPatternName
	Target   string
	Total    *int
	Critical *int
	High     *int
	Medium   *int
	Low      *int
	Unknown  *int
	Result   string
	LoggedAt time.Time
}

// awsLogParseResult holds the signals of a build log and how often each applied pattern matched.
type awsLogParseResult struct {
	Signals []awsLogSignal
	Counts  map[models.AwsLogPatternName]int
}

func isEchoedAwsLogLine(text string) bool {
	return strings.Contains(text, awsLogEchoMarker) || strings.Contains(text, awsLogVariableMarker)
}

func isAwsLogUnderline(text string) bool {
	text = strings.TrimSpace(text)
	return text != "" && strings.Trim(text, awsLogUnderlineChar) == ""
}

// awsTrivyTarget returns the target line of Trivy's `<target>` / `=====` / `Total:` layout above a match, or "".
func awsTrivyTarget(lines []awsLogLine, matchIndex int) string {
	underline := matchIndex - 1
	for underline >= 0 && strings.TrimSpace(lines[underline].Text) == "" {
		underline--
	}
	if underline < 1 || !isAwsLogUnderline(lines[underline].Text) {
		return ""
	}
	target := strings.TrimSpace(lines[underline-1].Text)
	if isAwsLogUnderline(target) {
		return ""
	}
	return truncateText(target, awsLogTargetLimit)
}

func awsLogGroup(match []string, group int) (string, bool) {
	if group >= len(match) {
		return "", false
	}
	return match[group], true
}

func awsTrivySignal(match []string, target string, at time.Time) awsLogSignal {
	signal := awsLogSignal{Type: models.AwsLogPatternTrivy, Target: target, LoggedAt: at}
	if total, ok := awsLogGroup(match, awsLogTrivyTotalGroup); ok {
		if n, err := strconv.Atoi(total); err == nil {
			signal.Total = &n
		}
	}
	counts, _ := awsLogGroup(match, awsLogTrivyCountGroup)
	for _, pair := range awsTrivySeverityPair.FindAllStringSubmatch(counts, -1) {
		n, err := strconv.Atoi(pair[2])
		if err != nil {
			continue
		}
		switch awsTrivySeverity(strings.ToUpper(pair[1])) {
		case awsSeverityCritical:
			signal.Critical = &n
		case awsSeverityHigh:
			signal.High = &n
		case awsSeverityMedium:
			signal.Medium = &n
		case awsSeverityLow:
			signal.Low = &n
		case awsSeverityUnknown:
			signal.Unknown = &n
		}
	}
	return signal
}

// parseAwsBuildLog finds the signals of one build log; echoed command lines are ignored.
func parseAwsBuildLog(lines []awsLogLine, patterns awsLogPatterns, deployment bool) awsLogParseResult {
	var kept []awsLogLine
	for _, line := range lines {
		if !isEchoedAwsLogLine(line.Text) {
			kept = append(kept, line)
		}
	}
	applied := patterns.applicable(deployment)
	result := awsLogParseResult{Counts: make(map[models.AwsLogPatternName]int, len(applied))}
	for _, pattern := range applied {
		result.Counts[pattern.Name] = 0
	}
	for i, line := range kept {
		for _, pattern := range applied {
			match := pattern.Pattern.Regexp.FindStringSubmatch(line.Text)
			if match == nil {
				continue
			}
			result.Counts[pattern.Name]++
			switch pattern.Name {
			case models.AwsLogPatternTrivy:
				result.Signals = append(result.Signals, awsTrivySignal(match, awsTrivyTarget(kept, i), line.At))
			default:
				signal := awsLogSignal{Type: pattern.Name, LoggedAt: line.At}
				if pattern.Name == models.AwsLogPatternSmokeTest {
					outcome, _ := awsLogGroup(match, awsLogResultGroup)
					signal.Result = truncateText(strings.ToLower(outcome), awsLogResultLimit)
				}
				result.Signals = append(result.Signals, signal)
			}
		}
	}
	return result
}
