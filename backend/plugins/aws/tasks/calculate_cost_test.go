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
	"database/sql"
	"testing"
	"time"

	"github.com/apache/incubator-devlake/plugins/aws/models"
	"github.com/stretchr/testify/require"
)

func TestAwsBuildPriceUsageType(t *testing.T) {
	tests := []struct {
		environment, compute, want string
	}{
		{"LINUX_CONTAINER", "BUILD_GENERAL1_SMALL", "Build-Min:Linux:g1.small"},
		{"LINUX_CONTAINER", "BUILD_GENERAL1_MEDIUM", "Build-Min:Linux:g1.medium"},
		{"LINUX_CONTAINER", "BUILD_GENERAL1_2XLARGE", "Build-Min:Linux:g1.2xlarge"},
		{"ARM_CONTAINER", "BUILD_GENERAL1_LARGE", "Build-Min:ARM:g1.large"},
		{"LINUX_GPU_CONTAINER", "BUILD_GENERAL1_LARGE", "Build-Min:LinuxGPU:g1.large"},
		{"WINDOWS_SERVER_2019_CONTAINER", "BUILD_GENERAL1_MEDIUM", "Build-Min:Windows:g1.medium"},
		{"WINDOWS_CONTAINER", "BUILD_GENERAL1_MEDIUM", "Build-Min:Windows:g1.medium"},
		{"LINUX_LAMBDA_CONTAINER", "BUILD_LAMBDA_1GB", ""},
		{"LINUX_CONTAINER", "BUILD_LAMBDA_1GB", ""},
		{"LINUX_CONTAINER", "BUILD_GENERAL1_", ""},
		{"LINUX_CONTAINER", "ATTRIBUTE_BASED_COMPUTE", ""},
		{"MAC_ARM", "BUILD_GENERAL1_MEDIUM", ""},
		{"", "", ""},
	}
	for _, tt := range tests {
		t.Run(tt.environment+"/"+tt.compute, func(t *testing.T) {
			require.Equal(t, tt.want, awsBuildPriceUsageType(tt.environment, tt.compute))
		})
	}
}

func TestAwsBilledMinutesRoundsUp(t *testing.T) {
	start := time.Date(2026, 11, 20, 13, 0, 0, 0, time.UTC)
	tests := []struct {
		name    string
		elapsed time.Duration
		want    int
		ok      bool
	}{
		{"no time", 0, 0, true},
		{"one second", time.Second, 1, true},
		{"59 seconds", 59 * time.Second, 1, true},
		{"60 seconds", 60 * time.Second, 1, true},
		{"61 seconds", 61 * time.Second, 2, true},
		{"two minutes", 2 * time.Minute, 2, true},
		{"before the start", -time.Second, 0, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			minutes, ok := awsBilledMinutes(start, start.Add(tt.elapsed))
			require.Equal(t, tt.ok, ok)
			require.Equal(t, tt.want, minutes)
		})
	}
}

func TestMultiplyAwsMoneyKeepsDecimals(t *testing.T) {
	tests := []struct {
		minutes int
		price   string
		want    string
	}{
		{5, "0.0100000000", "0.0500000000"},
		{3, "0.0050000000", "0.0150000000"},
		{7, "0.1", "0.7000000000"},
		{3, "0.0000000001", "0.0000000003"},
		{0, "0.0100000000", "0.0000000000"},
		{1000000, "0.0050000000", "5000.0000000000"},
		{3, "0.1234567891", "0.3703703673"},
	}
	for _, tt := range tests {
		t.Run(tt.price, func(t *testing.T) {
			got, err := multiplyAwsMoney(tt.minutes, tt.price)
			require.Nil(t, err)
			require.Equal(t, tt.want, got)
		})
	}
	_, err := multiplyAwsMoney(1, "free")
	require.NotNil(t, err)
}

func TestNormalizeAwsDecimal(t *testing.T) {
	got, err := normalizeAwsDecimal("12.5")
	require.Nil(t, err)
	require.Equal(t, "12.5000000000", got)
	got, err = normalizeAwsDecimal("0.1234567891")
	require.Nil(t, err)
	require.Equal(t, "0.1234567891", got)
	_, err = normalizeAwsDecimal("")
	require.NotNil(t, err)
	_, err = normalizeAwsDecimal("abc")
	require.NotNil(t, err)
}

func TestAwsEstimateCost(t *testing.T) {
	at := time.Date(2026, 11, 20, 13, 0, 0, 0, time.UTC)
	prices := awsPriceBook{"Build-Min:Linux:g1.medium": {{PublishedAt: at.Add(-time.Hour), PriceUsd: "0.0100000000"}}}
	t.Run("price present", func(t *testing.T) {
		fields, err := awsEstimateCost(5, "Build-Min:Linux:g1.medium", at, prices)
		require.Nil(t, err)
		require.Equal(t, awsCostFields{
			Minutes:   sql.NullInt64{Int64: 5, Valid: true},
			UnitPrice: sql.NullString{String: "0.0100000000", Valid: true},
			Cost:      sql.NullString{String: "0.0500000000", Valid: true},
		}, fields)
	})
	t.Run("missing price leaves the cost NULL", func(t *testing.T) {
		fields, err := awsEstimateCost(5, "Build-Min:ARM:g1.small", at, prices)
		require.Nil(t, err)
		require.True(t, fields.Minutes.Valid)
		require.False(t, fields.UnitPrice.Valid)
		require.False(t, fields.Cost.Valid)
	})
	t.Run("no usage type leaves the cost NULL", func(t *testing.T) {
		fields, err := awsEstimateCost(5, "", at, prices)
		require.Nil(t, err)
		require.True(t, fields.Minutes.Valid)
		require.False(t, fields.Cost.Valid)
	})
}

func timePtr(t time.Time) *time.Time { return &t }

func TestAwsBuildCost(t *testing.T) {
	start := time.Date(2026, 11, 20, 13, 0, 0, 0, time.UTC)
	prices := awsPriceBook{"Build-Min:Linux:g1.medium": {{PublishedAt: start.Add(-time.Hour), PriceUsd: "0.0100000000"}}}
	build := func(mutate func(b *models.AwsCodebuildBuild)) *models.AwsCodebuildBuild {
		b := &models.AwsCodebuildBuild{
			BuildComplete: true, StartTime: timePtr(start), EndTime: timePtr(start.Add(61 * time.Second)),
			EnvironmentType: "LINUX_CONTAINER", ComputeType: "BUILD_GENERAL1_MEDIUM",
		}
		mutate(b)
		return b
	}
	t.Run("priced build", func(t *testing.T) {
		fields, usageType, err := awsBuildCost(build(func(*models.AwsCodebuildBuild) {}), prices)
		require.Nil(t, err)
		require.Equal(t, "Build-Min:Linux:g1.medium", usageType)
		require.Equal(t, int64(2), fields.Minutes.Int64)
		require.Equal(t, "0.0200000000", fields.Cost.String)
	})
	t.Run("lambda build keeps its minutes but has no cost", func(t *testing.T) {
		fields, usageType, err := awsBuildCost(build(func(b *models.AwsCodebuildBuild) { b.ComputeType = "BUILD_LAMBDA_1GB" }), prices)
		require.Nil(t, err)
		require.Equal(t, "", usageType)
		require.True(t, fields.Minutes.Valid)
		require.False(t, fields.Cost.Valid)
	})
	notBilled := map[string]func(b *models.AwsCodebuildBuild){
		"running build":    func(b *models.AwsCodebuildBuild) { b.BuildComplete = false },
		"no start":         func(b *models.AwsCodebuildBuild) { b.StartTime = nil },
		"no end":           func(b *models.AwsCodebuildBuild) { b.EndTime = nil },
		"end before start": func(b *models.AwsCodebuildBuild) { b.EndTime = timePtr(start.Add(-time.Minute)) },
	}
	for name, mutate := range notBilled {
		t.Run(name, func(t *testing.T) {
			fields, usageType, err := awsBuildCost(build(mutate), prices)
			require.Nil(t, err)
			require.Equal(t, "", usageType)
			require.Equal(t, awsCostFields{}, fields)
		})
	}
}

func TestAwsActionCost(t *testing.T) {
	start := time.Date(2026, 11, 20, 13, 0, 0, 0, time.UTC)
	prices := awsPriceBook{awsUsageTypeActionExecution: {{PublishedAt: start.Add(-time.Hour), PriceUsd: "0.0020000000"}}}
	action := func(mutate func(a *models.AwsActionExecution)) *models.AwsActionExecution {
		a := &models.AwsActionExecution{
			Category: "Build", Owner: "AWS", Status: string(models.AwsActionSucceeded),
			StartTime: timePtr(start), LastUpdateTime: timePtr(start.Add(125 * time.Second)),
		}
		mutate(a)
		return a
	}
	t.Run("billed on a V2 pipeline", func(t *testing.T) {
		fields, err := awsActionCost(models.AwsPipelineTypeV2, action(func(*models.AwsActionExecution) {}), prices)
		require.Nil(t, err)
		require.Equal(t, int64(3), fields.Minutes.Int64)
		require.Equal(t, "0.0060000000", fields.Cost.String)
	})
	t.Run("missing price", func(t *testing.T) {
		fields, err := awsActionCost(models.AwsPipelineTypeV2, action(func(*models.AwsActionExecution) {}), nil)
		require.Nil(t, err)
		require.True(t, fields.Minutes.Valid)
		require.False(t, fields.Cost.Valid)
	})
	tests := []struct {
		name         string
		pipelineType string
		mutate       func(a *models.AwsActionExecution)
	}{
		{"V1 pipeline", "V1", func(*models.AwsActionExecution) {}},
		{"unknown pipeline type", "", func(*models.AwsActionExecution) {}},
		{"approval", models.AwsPipelineTypeV2, func(a *models.AwsActionExecution) { a.Category = models.AwsCategoryApproval }},
		{"custom owner", models.AwsPipelineTypeV2, func(a *models.AwsActionExecution) { a.Owner = models.AwsOwnerCustom }},
		{"in progress", models.AwsPipelineTypeV2, func(a *models.AwsActionExecution) { a.Status = string(models.AwsActionInProgress) }},
		{"no start", models.AwsPipelineTypeV2, func(a *models.AwsActionExecution) { a.StartTime = nil }},
		{"no last update", models.AwsPipelineTypeV2, func(a *models.AwsActionExecution) { a.LastUpdateTime = nil }},
	}
	for _, tt := range tests {
		t.Run("not billed: "+tt.name, func(t *testing.T) {
			fields, err := awsActionCost(tt.pipelineType, action(tt.mutate), prices)
			require.Nil(t, err)
			require.Equal(t, awsCostFields{}, fields)
		})
	}
}

func TestAwsMissingPricesNoteOncePerUsageType(t *testing.T) {
	missing := awsMissingPrices{}
	priced := awsCostFields{Minutes: sql.NullInt64{Valid: true}, UnitPrice: sql.NullString{Valid: true}}
	unpriced := awsCostFields{Minutes: sql.NullInt64{Valid: true}}
	missing.note("Build-Min:Linux:g1.medium", unpriced)
	missing.note("Build-Min:Linux:g1.medium", unpriced)
	missing.note("Build-Min:ARM:g1.small", priced)
	missing.note("", unpriced)
	missing.note("Build-Min:ARM:g1.large", awsCostFields{})
	require.Equal(t, []string{"Build-Min:Linux:g1.medium"}, missing.sorted())
}

func TestAwsPriceBookPriceAt(t *testing.T) {
	day := func(d int) time.Time { return time.Date(2026, 11, d, 0, 0, 0, 0, time.UTC) }
	book := awsPriceBook{"u": {{PublishedAt: day(5), PriceUsd: "0.02"}, {PublishedAt: day(10), PriceUsd: "0.01"}}}
	tests := []struct {
		name      string
		usageType string
		at        time.Time
		want      string
		found     bool
	}{
		{"before every publication uses the oldest", "u", day(1), "0.02", true},
		{"on the first publication", "u", day(5), "0.02", true},
		{"between publications", "u", day(7), "0.02", true},
		{"on the newest publication", "u", day(10), "0.01", true},
		{"after the newest publication", "u", day(20), "0.01", true},
		{"unknown usage type", "other", day(20), "", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, found := book.priceAt(tt.usageType, tt.at)
			require.Equal(t, tt.found, found)
			require.Equal(t, tt.want, got)
		})
	}
	_, found := awsPriceBook(nil).priceAt("u", day(1))
	require.False(t, found)
}
