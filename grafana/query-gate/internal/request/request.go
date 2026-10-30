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

// Package request parses and validates Grafana /api/ds/query bodies.
package request

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strings"
)

var (
	ErrInvalidJSON  = errors.New("invalid JSON")
	ErrAmbiguousKey = errors.New("ambiguous key")
	ErrShape        = errors.New("unexpected request shape")
)

// RejectReason says why a query is not allowed for a non-admin caller.
type RejectReason string

const (
	ReasonNoDatasourceUID RejectReason = "query has no datasource uid"
	ReasonExpression      RejectReason = "expression type not allowed"
	ReasonDatasource      RejectReason = "datasource not allowed"
	ReasonNoSQL           RejectReason = "query has no raw SQL"
)

const (
	exprUID        = "__expr__"
	mysqlType      = "mysql"
	maxDecodeDepth = 64
)

var ambiguousNames = []string{"queries", "datasource", "datasourceId", "uid", "type", "rawSql", "expression", "refId"}

var allowedExpressions = map[string]bool{
	"math": true, "reduce": true, "resample": true, "classic_conditions": true, "threshold": true,
}

// Query is the part of one query the gate inspects.
type Query struct {
	RefID, DatasourceUID, DatasourceType, RawSQL, ExprType string
	HasRawSQL                                              bool
}

// Request is a parsed /api/ds/query body.
type Request struct {
	Queries []Query
}

// Parse validates body and returns the parsed request with the canonical body to forward.
func Parse(body []byte) (*Request, []byte, error) {
	dec := json.NewDecoder(bytes.NewReader(body))
	dec.UseNumber()
	var root any
	if err := dec.Decode(&root); err != nil {
		return nil, nil, fmt.Errorf("%w: %v", ErrInvalidJSON, err)
	}
	if _, err := dec.Token(); !errors.Is(err, io.EOF) {
		return nil, nil, fmt.Errorf("%w: trailing data after the JSON object", ErrInvalidJSON)
	}
	obj, ok := root.(map[string]any)
	if !ok {
		return nil, nil, fmt.Errorf("%w: body is not a JSON object", ErrShape)
	}
	if err := checkKeys(obj, 0); err != nil {
		return nil, nil, err
	}
	req := &Request{}
	if raw, present := obj["queries"]; present {
		items, ok := raw.([]any)
		if !ok {
			return nil, nil, fmt.Errorf("%w: queries is not an array", ErrShape)
		}
		for _, item := range items {
			qo, ok := item.(map[string]any)
			if !ok {
				return nil, nil, fmt.Errorf("%w: query is not an object", ErrShape)
			}
			q, err := parseQuery(qo)
			if err != nil {
				return nil, nil, err
			}
			req.Queries = append(req.Queries, q)
		}
	}
	var out bytes.Buffer
	enc := json.NewEncoder(&out)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(obj); err != nil {
		return nil, nil, fmt.Errorf("%w: %v", ErrInvalidJSON, err)
	}
	return req, bytes.TrimSuffix(out.Bytes(), []byte("\n")), nil
}

func checkKeys(v any, depth int) error {
	if depth > maxDecodeDepth {
		return fmt.Errorf("%w: nesting too deep", ErrShape)
	}
	switch t := v.(type) {
	case map[string]any:
		for k, child := range t {
			for _, name := range ambiguousNames {
				if k != name && strings.EqualFold(k, name) {
					return fmt.Errorf("%w: %q", ErrAmbiguousKey, k)
				}
			}
			if err := checkKeys(child, depth+1); err != nil {
				return err
			}
		}
	case []any:
		for _, child := range t {
			if err := checkKeys(child, depth+1); err != nil {
				return err
			}
		}
	}
	return nil
}

func stringField(m map[string]any, key string) (string, bool, error) {
	raw, present := m[key]
	if !present {
		return "", false, nil
	}
	s, ok := raw.(string)
	if !ok {
		return "", true, fmt.Errorf("%w: %s is not a string", ErrShape, key)
	}
	return s, true, nil
}

func parseQuery(qo map[string]any) (Query, error) {
	var q Query
	var err error
	if q.RefID, _, err = stringField(qo, "refId"); err != nil {
		return q, err
	}
	if q.RawSQL, q.HasRawSQL, err = stringField(qo, "rawSql"); err != nil {
		return q, err
	}
	if raw, present := qo["datasource"]; present {
		ds, ok := raw.(map[string]any)
		if !ok {
			return q, fmt.Errorf("%w: datasource is not an object", ErrShape)
		}
		if q.DatasourceUID, _, err = stringField(ds, "uid"); err != nil {
			return q, err
		}
		if q.DatasourceType, _, err = stringField(ds, "type"); err != nil {
			return q, err
		}
	}
	if q.DatasourceUID == exprUID {
		if q.ExprType, _, err = stringField(qo, "type"); err != nil {
			return q, err
		}
	}
	return q, nil
}

// CheckQuery applies the non-admin rules and reports whether the SQL must match a saved query.
func CheckQuery(q Query, allowedUIDs map[string]bool) (needsMatch bool, reason RejectReason) {
	switch {
	case q.DatasourceUID == "":
		return false, ReasonNoDatasourceUID
	case q.DatasourceUID == exprUID:
		if q.DatasourceType != "" && q.DatasourceType != exprUID {
			return false, ReasonDatasource
		}
		if !allowedExpressions[q.ExprType] {
			return false, ReasonExpression
		}
		return false, ""
	case allowedUIDs[q.DatasourceUID]:
		if q.DatasourceType != "" && q.DatasourceType != mysqlType {
			return false, ReasonDatasource
		}
		if !q.HasRawSQL || q.RawSQL == "" {
			return false, ReasonNoSQL
		}
		return true, ""
	}
	return false, ReasonDatasource
}
