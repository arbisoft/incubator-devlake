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

// Runs jscpd (`jscpd:run`) with a JSON reporter, then prints totals and the clones grouped by file.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const tempDir = path.join(__dirname, '.jscpd-tmp');
const reportPath = path.join(tempDir, 'jscpd-report.json');
const PREVIEW_LENGTH = 80;

console.log('Scanning for duplicates...');

try {
  execFileSync('corepack', ['yarn', 'jscpd:run', '--reporters', 'json', '--output', './.jscpd-tmp'], {
    cwd: __dirname,
    stdio: 'ignore',
  });
} catch {
  // jscpd exits non-zero when it finds clones; the report is still written.
}

if (!fs.existsSync(reportPath)) {
  console.log('\nNo duplicates found.\n');
  process.exit(0);
}

const data = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
fs.rmSync(tempDir, { recursive: true, force: true });

const stats = data.statistics?.formats || {};
const totals = data.statistics?.total || {};

console.log('\n================ JSCPD SUMMARY ================');
console.log('Format       | Duplicated Lines | Clones | Files Analyzed');
console.log('---------------------------------------------------------');

Object.keys(stats).forEach((format) => {
  // jscpd v4 nests per-format stats under `total`; v5 puts them on the format itself.
  const formatTotals = stats[format].total || stats[format];
  const lines = String(formatTotals.duplicatedLines).padEnd(16);
  const clones = String(formatTotals.clones).padEnd(6);
  console.log(`${format.padEnd(12)} | ${lines} | ${clones} | ${formatTotals.sources}`);
});

console.log('---------------------------------------------------------');
console.log(
  `TOTALS       | ${String(totals.duplicatedLines || 0).padEnd(16)} | ${String(totals.clones || 0).padEnd(6)} | ${totals.sources || 0}`,
);

console.log('\n================ WHERE TO FIX THEM ================');

const duplicatesByFile = {};
const withSrc = (name) => (name.startsWith('src/') ? name : `src/${name}`);

(data.duplicates || []).forEach((dup) => {
  const file1 = withSrc(dup.firstFile.name);
  duplicatesByFile[file1] ??= [];

  let preview = dup.fragment
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join(' ');
  if (preview.length > PREVIEW_LENGTH) preview = `${preview.substring(0, PREVIEW_LENGTH)}...`;

  duplicatesByFile[file1].push({
    range1: `${dup.firstFile.start}-${dup.firstFile.end}`,
    file2: withSrc(dup.secondFile.name),
    range2: `${dup.secondFile.start}-${dup.secondFile.end}`,
    preview,
  });
});

const entries = Object.entries(duplicatesByFile);
if (entries.length === 0) {
  console.log('\nNo duplicates found.');
}

entries
  .sort((a, b) => b[1].length - a[1].length)
  .forEach(([file, dups]) => {
    console.log(`\n${file} (${dups.length} clones)`);
    dups.forEach((d) => {
      console.log(`   - ${file}:${d.range1} <---> ${d.file2}:${d.range2}`);
      console.log(`     Snippet: "${d.preview}"\n`);
    });
  });
console.log('\n');
