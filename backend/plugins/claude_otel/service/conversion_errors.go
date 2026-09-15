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

package service

import (
	stderrors "errors"
	"fmt"

	"github.com/go-sql-driver/mysql"
)

type conversionErrorCode string

const (
	errorInvalidPayload         conversionErrorCode = "invalid_payload"
	errorUnsupportedMetricKind  conversionErrorCode = "unsupported_metric_kind"
	errorUnsupportedTemporality conversionErrorCode = "unsupported_temporality"
	errorInvalidTimestamp       conversionErrorCode = "invalid_timestamp"
	errorInvalidValue           conversionErrorCode = "invalid_value"
	errorInvalidDimension       conversionErrorCode = "invalid_dimension"
	errorMissingUserIdentity    conversionErrorCode = "missing_user_identity"
	errorOutOfOrderCumulative   conversionErrorCode = "out_of_order_cumulative"
	errorInvalidSeriesState     conversionErrorCode = "invalid_series_state"
	errorMissingTeam            conversionErrorCode = "missing_team"
	errorInvalidAttribution     conversionErrorCode = "invalid_attribution"
	errorMissingOrganization    conversionErrorCode = "missing_organization"
	errorInvalidOrganization    conversionErrorCode = "invalid_organization"
	errorOrganizationMismatch   conversionErrorCode = "organization_mismatch"
	errorConnectionNotFound     conversionErrorCode = "connection_not_found"
	errorAmbiguousConnection    conversionErrorCode = "ambiguous_connection"
	errorConnectionLookup       conversionErrorCode = "connection_lookup_failed"
	errorLeaseLost              conversionErrorCode = "lease_lost"
	errorStorageFailure         conversionErrorCode = "storage_failure"
	errorStorageData            conversionErrorCode = "storage_data_rejected"
	errorRetryExhausted         conversionErrorCode = "retry_exhausted"
	errorConversionFailure      conversionErrorCode = "conversion_failure"
	diagnosticResourcesSkipped  conversionErrorCode = "resources_skipped"
)

// attributionErrorCodes identify one resource group's trusted-attribution failure. They
// skip only that resource group, so one team's lifecycle problem cannot suppress the
// valid teams merged into the same Collector request.
var attributionErrorCodes = map[conversionErrorCode]struct{}{
	errorMissingTeam:          {},
	errorInvalidAttribution:   {},
	errorMissingOrganization:  {},
	errorInvalidOrganization:  {},
	errorOrganizationMismatch: {},
	errorConnectionNotFound:   {},
	errorAmbiguousConnection:  {},
}

type conversionError struct {
	code      conversionErrorCode
	permanent bool
	err       error
}

func (e *conversionError) Error() string { return e.err.Error() }

func (e *conversionError) Unwrap() error { return e.err }

func permanentMetricError(code conversionErrorCode, format string, args ...interface{}) error {
	return &conversionError{code: code, permanent: true, err: fmt.Errorf(format, args...)}
}

func classifyConversionError(err error) (conversionErrorCode, bool, string) {
	if conversionErr, ok := err.(*conversionError); ok {
		return conversionErr.code, conversionErr.permanent, conversionErr.Error()
	}
	return errorConversionFailure, false, err.Error()
}

// deterministicMySQLDataErrors reject a value or row shape; retrying the same batch
// cannot succeed. Schema errors are excluded because an upgrade may briefly run the
// converter before pending migrations are applied.
var deterministicMySQLDataErrors = map[uint16]struct{}{
	1048: {}, // column cannot be null
	1264: {}, // out of range value
	1292: {}, // truncated incorrect value
	1364: {}, // field has no default value
	1366: {}, // incorrect value for column
	1406: {}, // data too long
}

// classifyStorageError marks deterministic MySQL data rejections as permanent so the
// batch is quarantined for operator replay instead of blocking the ordered queue.
func classifyStorageError(err error) error {
	var mysqlErr *mysql.MySQLError
	if stderrors.As(err, &mysqlErr) {
		if _, deterministic := deterministicMySQLDataErrors[mysqlErr.Number]; deterministic {
			return &conversionError{code: errorStorageData, permanent: true, err: err}
		}
	}
	return &conversionError{code: errorStorageFailure, err: err}
}
