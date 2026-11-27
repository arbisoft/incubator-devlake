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
	"bytes"
	"encoding/json"
	"strings"

	"github.com/apache/incubator-devlake/core/errors"
)

const (
	environmentVariablesListSuffix = "nvironmentVariables"
	environmentVariablesStringKey  = "EnvironmentVariables"
	environmentVariableValueKey    = "value"
	emptyEnvironmentVariables      = "[]"
)

// decodeAwsJson decodes JSON keeping numbers exactly as written.
func decodeAwsJson(raw []byte, target interface{}) error {
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	return decoder.Decode(target)
}

// encodeAwsJson encodes JSON without HTML escaping or a trailing newline.
func encodeAwsJson(value interface{}) ([]byte, error) {
	var buf bytes.Buffer
	encoder := json.NewEncoder(&buf)
	encoder.SetEscapeHTML(false)
	if err := encoder.Encode(value); err != nil {
		return nil, err
	}
	return bytes.TrimRight(buf.Bytes(), "\n"), nil
}

func dropVariableValues(list []interface{}) {
	for _, item := range list {
		if variable, ok := item.(map[string]interface{}); ok {
			delete(variable, environmentVariableValueKey)
		}
	}
}

// redactVariablesString redacts a JSON string holding a list of variables; text that is not such a list becomes an empty list.
func redactVariablesString(text string) string {
	if text == "" {
		return text
	}
	var list []map[string]interface{}
	if decodeAwsJson([]byte(text), &list) != nil || list == nil {
		return emptyEnvironmentVariables
	}
	for _, variable := range list {
		delete(variable, environmentVariableValueKey)
	}
	redacted, err := encodeAwsJson(list)
	if err != nil {
		return emptyEnvironmentVariables
	}
	return string(redacted)
}

func redactAwsNode(node interface{}) {
	switch typed := node.(type) {
	case map[string]interface{}:
		for key, child := range typed {
			switch childValue := child.(type) {
			case []interface{}:
				if strings.HasSuffix(key, environmentVariablesListSuffix) {
					dropVariableValues(childValue)
				}
			case string:
				if key == environmentVariablesStringKey {
					typed[key] = redactVariablesString(childValue)
				}
			}
			redactAwsNode(typed[key])
		}
	case []interface{}:
		for _, child := range typed {
			redactAwsNode(child)
		}
	}
}

// redactAwsPayload removes every environment variable value anywhere in an AWS payload and keeps all other fields.
func redactAwsPayload(raw json.RawMessage) (json.RawMessage, errors.Error) {
	var payload interface{}
	if err := decodeAwsJson(raw, &payload); err != nil {
		return nil, errors.Default.Wrap(err, "decode AWS payload for redaction")
	}
	redactAwsNode(payload)
	redacted, err := encodeAwsJson(payload)
	if err != nil {
		return nil, errors.Default.Wrap(err, "encode redacted AWS payload")
	}
	return redacted, nil
}
