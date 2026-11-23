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
	"fmt"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/apache/incubator-devlake/core/dal"
	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/core/log"
	"github.com/apache/incubator-devlake/core/plugin"
	"github.com/apache/incubator-devlake/helpers/pluginhelper/api"
	"github.com/apache/incubator-devlake/plugins/aws/models"
)

var _ plugin.SubTaskEntryPoint = RefreshPrices

var RefreshPricesMeta = plugin.SubTaskMeta{
	Name:             "refreshPrices",
	EntryPoint:       RefreshPrices,
	EnabledByDefault: true,
	Description:      "refresh the public AWS CodeBuild and CodePipeline prices of the scope region",
	DomainTypes:      []string{plugin.DOMAIN_TYPE_CICD},
}

type awsPriceOffer string

const (
	awsOfferCodeBuild    awsPriceOffer = "CodeBuild"
	awsOfferCodePipeline awsPriceOffer = "AWSCodePipeline"
)

const (
	awsPriceListEndpoint = "https://pricing.us-east-1.amazonaws.com/"
	awsPriceListPath     = "offers/v1.0/aws/%s/current/%s/index.json"
	awsPriceListTimeout  = 2 * time.Minute
	awsPriceRefreshAge   = 24 * time.Hour
)

var awsPriceOffers = []awsPriceOffer{awsOfferCodeBuild, awsOfferCodePipeline}

// awsPricesFresh reports whether prices fetched at the given time are recent enough to skip a refresh.
func awsPricesFresh(newestFetch *time.Time, now time.Time) bool {
	return newestFetch != nil && now.Sub(*newestFetch) < awsPriceRefreshAge
}

// awsPriceUsageType strips the region prefix from a price list usage type and keeps only the ones the connector prices.
func awsPriceUsageType(usageType string) (string, bool) {
	_, stripped, found := strings.Cut(usageType, "-")
	if !found {
		return "", false
	}
	isBuild := strings.HasPrefix(stripped, awsUsageTypeBuildPrefix) && !strings.Contains(stripped, awsUsageTypeBuildReserved)
	return stripped, isBuild || stripped == awsUsageTypeActionExecution
}

// firstOnDemandDimension returns the first price dimension of the first on-demand term of a product.
func firstOnDemandDimension(terms map[string]AwsPriceTerm) (AwsPriceDimension, bool) {
	for _, termKey := range sortedKeys(terms) {
		dimensions := terms[termKey].PriceDimensions
		for _, rateCode := range sortedKeys(dimensions) {
			return dimensions[rateCode], true
		}
	}
	return AwsPriceDimension{}, false
}

func sortedKeys[V any](m map[string]V) []string {
	keys := make([]string, 0, len(m))
	for key := range m {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

// awsPricesFromFile keeps the CI/CD compute prices of one region found in an offer file.
func awsPricesFromFile(file *AwsPriceListFile, region string, fetchedAt time.Time) ([]models.AwsPrice, errors.Error) {
	publication, err := errors.Convert01(time.Parse(time.RFC3339, file.PublicationDate))
	if err != nil {
		return nil, errors.BadInput.Wrap(err, "read the publication date")
	}
	var prices []models.AwsPrice
	seen := make(map[string]bool)
	for _, sku := range sortedKeys(file.Products) {
		product := file.Products[sku]
		usageType, keep := awsPriceUsageType(product.Attributes.UsageType)
		if !keep || product.Attributes.RegionCode != region || seen[usageType] {
			continue
		}
		dimension, found := firstOnDemandDimension(file.Terms.OnDemand[product.Sku])
		if !found {
			continue
		}
		price, err := normalizeAwsDecimal(dimension.PricePerUnit.USD)
		if err != nil {
			return nil, errors.Default.Wrap(err, "read a unit price")
		}
		seen[usageType] = true
		prices = append(prices, models.AwsPrice{
			Region:          region,
			UsageType:       usageType,
			PublicationDate: publication.UTC(),
			Unit:            dimension.Unit,
			PriceUsd:        price,
			FetchedAt:       fetchedAt,
		})
	}
	return prices, nil
}

// fetchAwsPriceList downloads and decodes the offer file of one region.
func fetchAwsPriceList(client *api.ApiClient, offer awsPriceOffer, region string) (*AwsPriceListFile, errors.Error) {
	res, err := client.Get(fmt.Sprintf(awsPriceListPath, offer, region), nil, nil)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return nil, errors.HttpStatus(res.StatusCode).New("the price list answered with an error status")
	}
	var file AwsPriceListFile
	if err = errors.Convert(json.NewDecoder(res.Body).Decode(&file)); err != nil {
		return nil, err
	}
	return &file, nil
}

// newestAwsPriceFetch returns when the prices of a region were last fetched, or nil when there are none.
func newestAwsPriceFetch(db dal.Dal, region string) (*time.Time, errors.Error) {
	var rows []models.AwsPrice
	err := db.All(&rows, dal.Where("region = ?", region), dal.Orderby("fetched_at DESC"), dal.Limit(1))
	if err != nil {
		return nil, errors.Default.Wrap(err, "load the newest price fetch")
	}
	if len(rows) == 0 {
		return nil, nil
	}
	return &rows[0].FetchedAt, nil
}

// refreshAwsPrices fetches the offers of a region; a failed offer is skipped so the stored prices stay in use.
func refreshAwsPrices(db dal.Dal, logger log.Logger, client *api.ApiClient, region string, now time.Time) errors.Error {
	for _, offer := range awsPriceOffers {
		file, err := fetchAwsPriceList(client, offer, region)
		var prices []models.AwsPrice
		if err == nil {
			prices, err = awsPricesFromFile(file, region, now)
		}
		if err != nil {
			logger.Warn(err, "the %s price list of %s could not be read; the stored prices are used", offer, region)
			continue
		}
		if len(prices) == 0 {
			continue
		}
		if err = db.CreateOrUpdate(&prices); err != nil {
			return errors.Default.Wrap(err, "store the prices")
		}
	}
	return nil
}

// RefreshPrices stores the public CI/CD compute prices of the scope region, at most once a day.
func RefreshPrices(taskCtx plugin.SubTaskContext) errors.Error {
	data := taskCtx.GetData().(*AwsTaskData)
	logger := taskCtx.GetLogger()
	region := data.Scope.Region
	if api.AwsPartitionForRegion(region) != api.AwsPartitionAws {
		logger.Warn(nil, "the price list is only available in the aws partition; prices of %s are not refreshed", region)
		return nil
	}
	newest, err := newestAwsPriceFetch(taskCtx.GetDal(), region)
	if err != nil {
		return err
	}
	now := time.Now().UTC()
	if awsPricesFresh(newest, now) {
		return nil
	}
	client, err := api.NewApiClient(taskCtx.GetContext(), awsPriceListEndpoint, nil, awsPriceListTimeout, "", taskCtx)
	if err != nil {
		return errors.Default.Wrap(err, "create the price list client")
	}
	return refreshAwsPrices(taskCtx.GetDal(), logger, client, region, now)
}
