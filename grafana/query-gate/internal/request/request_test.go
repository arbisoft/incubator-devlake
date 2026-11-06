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

package request

import (
	"bytes"
	"encoding/json"
	"errors"
	"reflect"
	"strings"
	"testing"
)

func decode(t *testing.T, b []byte) any {
	t.Helper()
	dec := json.NewDecoder(bytes.NewReader(b))
	dec.UseNumber()
	var v any
	if err := dec.Decode(&v); err != nil {
		t.Fatalf("decode %s: %v", b, err)
	}
	return v
}

func TestParseCanonicalises(t *testing.T) {
	body := `{"from":"1700000000000","to":"now","queries":[{"refId":"A","datasource":{"uid":"mysql1","type":"mysql"},` +
		`"rawSql":"SELECT 1","rawSql":"SELECT a < b AND c & d, 'é' FROM t","maxDataPoints":1.50,"big":12345678901234567890,"note":"日本語"}]}`
	req, canon, err := Parse([]byte(body))
	if err != nil {
		t.Fatal(err)
	}
	if len(req.Queries) != 1 {
		t.Fatalf("queries = %d", len(req.Queries))
	}
	q := req.Queries[0]
	if q.RawSQL != "SELECT a < b AND c & d, 'é' FROM t" || !q.HasRawSQL {
		t.Fatalf("duplicate keys must keep the last value, got %q", q.RawSQL)
	}
	if q.RefID != "A" || q.DatasourceUID != "mysql1" || q.DatasourceType != "mysql" {
		t.Fatalf("query = %+v", q)
	}
	out := string(canon)
	for _, want := range []string{`a < b AND c & d`, `1.50`, `12345678901234567890`, `日本語`} {
		if !strings.Contains(out, want) {
			t.Errorf("canonical body lost %q: %s", want, out)
		}
	}
	if strings.Contains(out, `\u003c`) || strings.Contains(out, `\u0026`) || strings.Contains(out, "SELECT 1\"") {
		t.Errorf("canonical body escaped HTML or kept the duplicate: %s", out)
	}
	if strings.HasSuffix(out, "\n") {
		t.Error("canonical body has a trailing newline")
	}
	if !reflect.DeepEqual(decode(t, canon), decode(t, []byte(strings.Replace(body, `"rawSql":"SELECT 1",`, "", 1)))) {
		t.Error("canonical body does not re-parse to the same value")
	}
	_, again, err := Parse(canon)
	if err != nil || !bytes.Equal(again, canon) {
		t.Fatalf("canonical body is not stable: %v", err)
	}
}

func TestParseRejectsAmbiguousKeys(t *testing.T) {
	tests := map[string]string{
		"RAWSQL":            `{"queries":[{"RAWSQL":"SELECT 1"}]}`,
		"RawSql":            `{"queries":[{"RawSql":"SELECT 1"}]}`,
		"long s":            "{\"queries\":[{\"rawſql\":\"SELECT 1\"}]}",
		"Datasource":        `{"queries":[{"Datasource":{"uid":"x"}}]}`,
		"nested UID":        `{"queries":[{"datasource":{"UID":"x"}}]}`,
		"QUERIES":           `{"QUERIES":[]}`,
		"datasourceID":      `{"queries":[{"datasourceID":1}]}`,
		"Type on expr":      `{"queries":[{"datasource":{"uid":"__expr__"},"Type":"sql"}]}`,
		"RefID":             `{"queries":[{"refID":"A"}]}`,
		"Expression":        `{"queries":[{"Expression":"1"}]}`,
		"deep in array":     `{"queries":[{"a":[{"b":{"RawSQL":"x"}}]}]}`,
		"datasource type":   `{"queries":[{"datasource":{"uid":"x","TYPE":"mysql"}}]}`,
		"duplicate variant": `{"queries":[{"rawSql":"a","RAWSQL":"b"}]}`,
	}
	for name, body := range tests {
		t.Run(name, func(t *testing.T) {
			_, _, err := Parse([]byte(body))
			if !errors.Is(err, ErrAmbiguousKey) {
				t.Fatalf("err = %v, want ErrAmbiguousKey", err)
			}
		})
	}
}

func TestParseAcceptsUnrelatedKeys(t *testing.T) {
	body := `{"queries":[{"refId":"A","Format":"table","Other":1,"datasource":{"uid":"u","type":"mysql"},"rawSql":"x"}],"Range":{"from":"now"}}`
	if _, _, err := Parse([]byte(body)); err != nil {
		t.Fatal(err)
	}
}

func TestParseShapes(t *testing.T) {
	tests := []struct {
		name string
		body string
		want error
	}{
		{"not json", `nope`, ErrInvalidJSON},
		{"empty body", ``, ErrInvalidJSON},
		{"array body", `[]`, ErrShape},
		{"string body", `"x"`, ErrShape},
		{"trailing data", `{} {}`, ErrInvalidJSON},
		{"trailing garbage", `{} x`, ErrInvalidJSON},
		{"queries not array", `{"queries":{}}`, ErrShape},
		{"queries null", `{"queries":null}`, ErrShape},
		{"query not object", `{"queries":["x"]}`, ErrShape},
		{"string datasource", `{"queries":[{"datasource":"mysql1"}]}`, ErrShape},
		{"null datasource", `{"queries":[{"datasource":null}]}`, ErrShape},
		{"non-string rawSql", `{"queries":[{"rawSql":1}]}`, ErrShape},
		{"non-string uid", `{"queries":[{"datasource":{"uid":1}}]}`, ErrShape},
		{"non-string ds type", `{"queries":[{"datasource":{"uid":"a","type":[]}}]}`, ErrShape},
		{"non-string refId", `{"queries":[{"refId":{}}]}`, ErrShape},
		{"non-string expr type", `{"queries":[{"datasource":{"uid":"__expr__"},"type":3}]}`, ErrShape},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			_, _, err := Parse([]byte(tc.body))
			if !errors.Is(err, tc.want) {
				t.Fatalf("err = %v, want %v", err, tc.want)
			}
		})
	}
	req, canon, err := Parse([]byte(`{"from":"now-1h"}`))
	if err != nil || len(req.Queries) != 0 || string(canon) != `{"from":"now-1h"}` {
		t.Fatalf("absent queries: %v %+v %s", err, req, canon)
	}
	req, _, err = Parse([]byte(`{"queries":[{"refId":"A","datasource":{"uid":"__expr__","type":"__expr__"},"type":"math"},{"datasourceId":3}]}`))
	if err != nil || len(req.Queries) != 2 {
		t.Fatalf("expression query: %v %+v", err, req)
	}
	if q := req.Queries[0]; q.ExprType != "math" || q.DatasourceUID != "__expr__" || q.HasRawSQL {
		t.Fatalf("expression query = %+v", q)
	}
	if q := req.Queries[1]; q.DatasourceUID != "" {
		t.Fatalf("datasourceId must not produce a uid: %+v", q)
	}
}

func TestParseIgnoresTypeOnNonExpressionQueries(t *testing.T) {
	req, _, err := Parse([]byte(`{"queries":[{"datasource":{"uid":"u"},"type":"sql"}]}`))
	if err != nil || req.Queries[0].ExprType != "" {
		t.Fatalf("err = %v, query = %+v", err, req.Queries)
	}
}

func TestCheckQuery(t *testing.T) {
	allowed := map[string]bool{"mysql1": true}
	sql := func(uid, typ, raw string, has bool) Query {
		return Query{DatasourceUID: uid, DatasourceType: typ, RawSQL: raw, HasRawSQL: has}
	}
	expr := func(typ string) Query { return Query{DatasourceUID: "__expr__", ExprType: typ} }
	tests := []struct {
		name   string
		q      Query
		match  bool
		reason RejectReason
	}{
		{"allowed uid with type", sql("mysql1", "mysql", "SELECT 1", true), true, ""},
		{"allowed uid without type", sql("mysql1", "", "SELECT 1", true), true, ""},
		{"allowed uid wrong type", sql("mysql1", "prometheus", "SELECT 1", true), false, ReasonDatasource},
		{"allowed uid empty sql", sql("mysql1", "mysql", "", true), false, ReasonNoSQL},
		{"allowed uid no sql key", sql("mysql1", "mysql", "", false), false, ReasonNoSQL},
		{"missing uid", Query{DatasourceType: "mysql", RawSQL: "SELECT 1", HasRawSQL: true}, false, ReasonNoDatasourceUID},
		{"missing uid with only datasourceId", Query{RawSQL: "SELECT 1", HasRawSQL: true}, false, ReasonNoDatasourceUID},
		{"prometheus uid", sql("prom1", "prometheus", "up", true), false, ReasonDatasource},
		{"unlisted mysql uid", sql("mysql2", "mysql", "SELECT 1", true), false, ReasonDatasource},
		{"expr math", expr("math"), false, ""},
		{"expr reduce", expr("reduce"), false, ""},
		{"expr resample", expr("resample"), false, ""},
		{"expr classic", expr("classic_conditions"), false, ""},
		{"expr threshold", expr("threshold"), false, ""},
		{"expr sql", expr("sql"), false, ReasonExpression},
		{"expr unknown", expr("future"), false, ReasonExpression},
		{"expr no type", expr(""), false, ReasonExpression},
		{"expr wrong case", expr("Math"), false, ReasonExpression},
		{"expr with ds type", Query{DatasourceUID: "__expr__", DatasourceType: "__expr__", ExprType: "math"}, false, ""},
		{"expr with mysql ds type", Query{DatasourceUID: "__expr__", DatasourceType: "mysql", ExprType: "math"}, false, ReasonDatasource},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			match, reason := CheckQuery(tc.q, allowed)
			if match != tc.match || reason != tc.reason {
				t.Fatalf("got (%v, %q), want (%v, %q)", match, reason, tc.match, tc.reason)
			}
		})
	}
}
