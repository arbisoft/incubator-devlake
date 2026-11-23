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
	"math/big"

	"github.com/apache/incubator-devlake/core/errors"
)

// awsMoneyDecimals is the number of decimals of the money columns.
const awsMoneyDecimals = 10

// parseAwsDecimal reads a decimal string without going through floating point.
func parseAwsDecimal(text string) (*big.Rat, errors.Error) {
	value, ok := new(big.Rat).SetString(text)
	if !ok {
		return nil, errors.BadInput.New("not a decimal amount")
	}
	return value, nil
}

// normalizeAwsDecimal validates a decimal string and returns it with the decimals of the money columns.
func normalizeAwsDecimal(text string) (string, errors.Error) {
	value, err := parseAwsDecimal(text)
	if err != nil {
		return "", err
	}
	return value.FloatString(awsMoneyDecimals), nil
}

// multiplyAwsMoney returns minutes times a unit price as a decimal string.
func multiplyAwsMoney(minutes int, unitPrice string) (string, errors.Error) {
	price, err := parseAwsDecimal(unitPrice)
	if err != nil {
		return "", errors.Default.Wrap(err, "read the unit price")
	}
	return new(big.Rat).Mul(big.NewRat(int64(minutes), 1), price).FloatString(awsMoneyDecimals), nil
}
