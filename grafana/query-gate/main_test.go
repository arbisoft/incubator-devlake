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

package main

import (
	"bytes"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestLoadShippedSkipsQueriesThatFailToCompile(t *testing.T) {
	dir := t.TempDir()
	body := `{"title": "D", "panels": [{"title": "P", "targets": [{"refId": "A", "rawSql": "SELECT $__interval"}, {"refId": "B", "rawSql": "SELECT 1"}]}]}`
	if err := os.WriteFile(filepath.Join(dir, "d.json"), []byte(body), 0o600); err != nil {
		t.Fatal(err)
	}
	var buf bytes.Buffer
	set, n, err := loadShipped(dir, slog.New(slog.NewJSONHandler(&buf, nil)))
	if err != nil {
		t.Fatal(err)
	}
	if n != 1 || set.Len() != 1 {
		t.Fatalf("errors %d templates %d, want 1 and 1", n, set.Len())
	}
	lines := strings.Split(strings.TrimSpace(buf.String()), "\n")
	if len(lines) != 1 || !strings.Contains(lines[0], `"msg":"shipped dashboard query skipped"`) || !strings.Contains(lines[0], `"location":"D :: P [A]"`) {
		t.Fatalf("log %q", buf.String())
	}
}

func TestLoadShippedMissingDirectory(t *testing.T) {
	var buf bytes.Buffer
	if _, _, err := loadShipped(filepath.Join(t.TempDir(), "missing"), slog.New(slog.NewJSONHandler(&buf, nil))); err == nil {
		t.Fatal("want error")
	}
}
