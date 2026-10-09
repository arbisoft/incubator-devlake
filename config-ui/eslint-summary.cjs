/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements.  See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with
 * the License.  You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */

// Report-only ESLint formatter: totals per rule, then every file:line:col grouped by rule.
// Usage: eslint -c eslint.quality.config.mjs . -f ./eslint-summary.cjs
const path = require('path');

const RULE_PAD = 48;

module.exports = function summarize(results) {
  const summary = {};
  let totalErrors = 0;
  let totalWarnings = 0;

  results.forEach((result) => {
    const relativePath = path.relative(process.cwd(), result.filePath);

    result.messages.forEach((msg) => {
      const rule = msg.ruleId || 'unknown-rule';
      summary[rule] ??= { errors: 0, warnings: 0, locations: [] };

      const isError = msg.severity === 2;
      if (isError) {
        summary[rule].errors++;
        totalErrors++;
      } else {
        summary[rule].warnings++;
        totalWarnings++;
      }

      summary[rule].locations.push({
        file: relativePath,
        line: msg.line || 0,
        column: msg.column || 0,
        type: isError ? 'Error' : 'Warning',
      });
    });
  });

  const weight = (rule) => summary[rule].errors * 1000 + summary[rule].warnings;
  const sortedRules = Object.keys(summary).sort((a, b) => weight(b) - weight(a));
  const divider = '-'.repeat(RULE_PAD + 20);

  let output = '\n================ ESLINT SUMMARY ================\n';
  output += `${'Rule'.padEnd(RULE_PAD)} | Errors | Warnings\n${divider}\n`;
  sortedRules.forEach((rule) => {
    output += `${rule.padEnd(RULE_PAD)} | ${String(summary[rule].errors).padEnd(6)} | ${summary[rule].warnings}\n`;
  });
  output += `${divider}\n${'TOTALS'.padEnd(RULE_PAD)} | ${String(totalErrors).padEnd(6)} | ${totalWarnings}\n\n`;

  output += '================ WHERE TO FIX THEM ================\n';
  sortedRules.forEach((rule) => {
    output += `\n${rule} (${summary[rule].errors} errors, ${summary[rule].warnings} warnings)\n`;

    const sortedLocations = summary[rule].locations.sort((a, b) =>
      a.file === b.file ? a.line - b.line : a.file.localeCompare(b.file),
    );
    sortedLocations.forEach((loc) => {
      output += `   - [${loc.type.padEnd(7)}] ${loc.file}:${loc.line}:${loc.column}\n`;
    });
  });

  return `${output}\n`;
};
