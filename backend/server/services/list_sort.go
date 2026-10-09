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

package services

import (
	"fmt"
	"sort"
	"strings"

	"github.com/apache/incubator-devlake/core/errors"
)

const (
	sortOrderAsc  = "asc"
	sortOrderDesc = "desc"
)

// SortQuery holds the optional sort params shared by the list endpoints.
type SortQuery struct {
	SortBy    string `form:"sortBy"`
	SortOrder string `form:"sortOrder"`
}

// sortSpec maps the public sortBy names to trusted ORDER BY expressions.
type sortSpec struct {
	columns       map[string]string
	defaultColumn string
	tieBreaker    string
	nullsLastKeys map[string]bool
}

// orderBy returns the ORDER BY expression; only whitelist values and fixed keywords are used.
func (s SortQuery) orderBy(spec sortSpec) (string, errors.Error) {
	order := strings.ToLower(s.SortOrder)
	switch order {
	case "":
		order = sortOrderDesc
	case sortOrderAsc, sortOrderDesc:
	default:
		return "", errors.BadInput.New("invalid sortOrder: expected asc or desc")
	}
	key := s.SortBy
	column, ok := spec.columns[key]
	if key == "" {
		column, ok = spec.defaultColumn, true
	}
	if !ok {
		keys := make([]string, 0, len(spec.columns))
		for k := range spec.columns {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		return "", errors.BadInput.New(fmt.Sprintf("invalid sortBy: expected one of %s", strings.Join(keys, ", ")))
	}
	direction := strings.ToUpper(order)
	expr := column + " " + direction
	if spec.nullsLastKeys[key] {
		expr = column + " IS NULL, " + expr
	}
	if spec.tieBreaker != "" && spec.tieBreaker != column {
		expr += ", " + spec.tieBreaker + " " + direction
	}
	return expr, nil
}
