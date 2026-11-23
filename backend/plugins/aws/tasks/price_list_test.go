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
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

const syntheticPriceList = `{
  "publicationDate": "2026-11-01T00:00:00Z",
  "products": {
    "SKU1": {"sku": "SKU1", "attributes": {"usagetype": "USE2-Build-Min:Linux:g1.medium", "regionCode": "us-east-2"}},
    "SKU2": {"sku": "SKU2", "attributes": {"usagetype": "USE2-Build-Min:Linux:g1.small", "regionCode": "us-east-2"}},
    "SKU3": {"sku": "SKU3", "attributes": {"usagetype": "USW2-Build-Min:Linux:g1.medium", "regionCode": "us-west-2"}},
    "SKU4": {"sku": "SKU4", "attributes": {"usagetype": "USE2-Build-Min:Linux:Reserved:g1.medium", "regionCode": "us-east-2"}},
    "SKU5": {"sku": "SKU5", "attributes": {"usagetype": "USE2-actionExecutionMinute", "regionCode": "us-east-2"}},
    "SKU6": {"sku": "SKU6", "attributes": {"usagetype": "USE2-Lambda-GB-Second", "regionCode": "us-east-2"}},
    "SKU7": {"sku": "SKU7", "attributes": {"usagetype": "Request", "regionCode": "us-east-2"}},
    "SKU8": {"sku": "SKU8", "attributes": {"usagetype": "USE2-Build-Min:ARM:g1.small", "regionCode": "us-east-2"}}
  },
  "terms": {"OnDemand": {
    "SKU1": {"SKU1.T1": {"priceDimensions": {"SKU1.T1.R1": {"unit": "minutes", "pricePerUnit": {"USD": "0.0100000000"}}}}},
    "SKU2": {"SKU2.T1": {"priceDimensions": {"SKU2.T1.R1": {"unit": "minutes", "pricePerUnit": {"USD": "0.0050000000"}}}}},
    "SKU3": {"SKU3.T1": {"priceDimensions": {"SKU3.T1.R1": {"unit": "minutes", "pricePerUnit": {"USD": "0.0900000000"}}}}},
    "SKU4": {"SKU4.T1": {"priceDimensions": {"SKU4.T1.R1": {"unit": "minutes", "pricePerUnit": {"USD": "0.0800000000"}}}}},
    "SKU5": {"SKU5.T1": {"priceDimensions": {"SKU5.T1.R1": {"unit": "action-exec-minute", "pricePerUnit": {"USD": "0.0020000000"}}}}},
    "SKU6": {"SKU6.T1": {"priceDimensions": {"SKU6.T1.R1": {"unit": "GB-Second", "pricePerUnit": {"USD": "0.0000100000"}}}}}
  }}
}`

func TestAwsPricesFromFile(t *testing.T) {
	var file AwsPriceListFile
	require.NoError(t, json.Unmarshal([]byte(syntheticPriceList), &file))
	fetchedAt := time.Date(2026, 11, 24, 2, 0, 0, 0, time.UTC)
	prices, err := awsPricesFromFile(&file, "us-east-2", fetchedAt)
	require.Nil(t, err)
	publication := time.Date(2026, 11, 1, 0, 0, 0, 0, time.UTC)
	got := map[string]string{}
	for _, price := range prices {
		got[price.UsageType] = price.PriceUsd
		require.Equal(t, "us-east-2", price.Region)
		require.Equal(t, publication, price.PublicationDate)
		require.Equal(t, fetchedAt, price.FetchedAt)
	}
	require.Equal(t, map[string]string{
		"Build-Min:Linux:g1.medium": "0.0100000000",
		"Build-Min:Linux:g1.small":  "0.0050000000",
		"actionExecutionMinute":     "0.0020000000",
	}, got)
	for _, price := range prices {
		if price.UsageType == awsUsageTypeActionExecution {
			require.Equal(t, "action-exec-minute", price.Unit)
		}
	}
}

func TestAwsPricesFromFileRejectsBadFiles(t *testing.T) {
	var file AwsPriceListFile
	require.NoError(t, json.Unmarshal([]byte(syntheticPriceList), &file))
	file.PublicationDate = "yesterday"
	_, err := awsPricesFromFile(&file, "us-east-2", time.Now())
	require.NotNil(t, err)

	require.NoError(t, json.Unmarshal([]byte(syntheticPriceList), &file))
	dimension := file.Terms.OnDemand["SKU1"]["SKU1.T1"].PriceDimensions["SKU1.T1.R1"]
	dimension.PricePerUnit.USD = "free"
	file.Terms.OnDemand["SKU1"]["SKU1.T1"].PriceDimensions["SKU1.T1.R1"] = dimension
	_, err = awsPricesFromFile(&file, "us-east-2", time.Now())
	require.NotNil(t, err)
}

func TestAwsPriceUsageType(t *testing.T) {
	tests := []struct {
		raw, want string
		keep      bool
	}{
		{"USE2-Build-Min:Linux:g1.medium", "Build-Min:Linux:g1.medium", true},
		{"USE2-Build-Min:Linux:Reserved:g1.medium", "Build-Min:Linux:Reserved:g1.medium", false},
		{"EUC1-actionExecutionMinute", "actionExecutionMinute", true},
		{"USE2-actionExecutionMinute-extra", "actionExecutionMinute-extra", false},
		{"actionExecutionMinute", "", false},
		{"USE2-Build-Min", "Build-Min", false},
	}
	for _, tt := range tests {
		t.Run(tt.raw, func(t *testing.T) {
			got, keep := awsPriceUsageType(tt.raw)
			require.Equal(t, tt.keep, keep)
			if tt.keep {
				require.Equal(t, tt.want, got)
			}
		})
	}
}

func TestAwsPricesFresh(t *testing.T) {
	now := time.Date(2026, 11, 24, 12, 0, 0, 0, time.UTC)
	tests := []struct {
		name    string
		fetched *time.Time
		want    bool
	}{
		{"never fetched", nil, false},
		{"an hour ago", timePtr(now.Add(-time.Hour)), true},
		{"just under a day", timePtr(now.Add(-24*time.Hour + time.Second)), true},
		{"a day ago", timePtr(now.Add(-24 * time.Hour)), false},
		{"two days ago", timePtr(now.Add(-48 * time.Hour)), false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			require.Equal(t, tt.want, awsPricesFresh(tt.fetched, now))
		})
	}
}

func TestFetchAwsPriceList(t *testing.T) {
	var path string
	client := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		path = r.URL.Path
		_, _ = w.Write([]byte(syntheticPriceList))
	})
	file, err := fetchAwsPriceList(client, awsOfferCodeBuild, "us-east-2")
	require.Nil(t, err)
	require.Equal(t, "/offers/v1.0/aws/CodeBuild/current/us-east-2/index.json", path)
	require.Equal(t, "2026-11-01T00:00:00Z", file.PublicationDate)

	_, err = fetchAwsPriceList(newTestClient(t, func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	}), awsOfferCodePipeline, "us-east-2")
	require.NotNil(t, err)

	_, err = fetchAwsPriceList(newTestClient(t, func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`<html>`))
	}), awsOfferCodePipeline, "us-east-2")
	require.NotNil(t, err)
}
