//go:build verify

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

package suite

import (
	"bufio"
	"encoding/json"
	"os"
	"sort"
	"strings"
	"testing"
)

func TestGateLogsAreClean(t *testing.T) {
	logs := os.Getenv("GV_LOGS")
	if logs == "" {
		t.Skip("GV_LOGS is not set")
	}
	forbidden := []string{"gvc_", "gvm_", "grafana_session", "rawSql", "Authorization", "Bearer "}
	for _, v := range secrets(t) {
		if v != "" {
			forbidden = append(forbidden, v)
		}
	}
	counts := map[string]int{}
	rejected := 0
	for _, path := range strings.Split(logs, ",") {
		f, err := os.Open(strings.TrimSpace(path))
		if err != nil {
			t.Fatalf("open log: %v", err)
		}
		sc := bufio.NewScanner(f)
		sc.Buffer(make([]byte, 1<<20), 1<<20)
		for n := 1; sc.Scan(); n++ {
			line := strings.TrimSpace(sc.Text())
			if line == "" {
				continue
			}
			var m map[string]any
			if err := json.Unmarshal([]byte(line), &m); err != nil {
				t.Errorf("%s:%d: not JSON", path, n)
				continue
			}
			for _, bad := range forbidden {
				if strings.Contains(line, bad) {
					t.Errorf("%s:%d: line contains a forbidden token (%d chars)", path, n, len(bad))
				}
			}
			if strings.Contains(strings.ToLower(line), "select ") {
				t.Errorf("%s:%d: line contains SQL text", path, n)
			}
			event, _ := m["event"].(string)
			reason, _ := m["reason"].(string)
			counts[event+" / "+reason]++
			if event == "rejected" {
				rejected++
				for _, k := range []string{"login", "reason", "path"} {
					// A request with no credentials has no login to log.
					if k == "login" && reason == "unauthenticated" {
						continue
					}
					if s, _ := m[k].(string); s == "" {
						t.Errorf("%s:%d: rejected line has empty %s", path, n, k)
					}
				}
			}
		}
		f.Close()
		if err := sc.Err(); err != nil {
			t.Errorf("%s: %v", path, err)
		}
	}
	if rejected == 0 {
		t.Error("no \"event\":\"rejected\" line in the logs")
	}
	keys := make([]string, 0, len(counts))
	for k := range counts {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, k := range keys {
		t.Logf("%6d  %s", counts[k], k)
	}
}
