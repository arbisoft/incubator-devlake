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

// Quality baseline: per-rule lint totals, knip findings and jscpd totals; counts may not grow (see LINT_TOOLING_SETUP.md).
// Usage: node tools/quality-baseline.mjs [--write] [--eslint <json>] [--knip <json>] [--jscpd <json>]
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE = path.join(ROOT, 'quality.baseline.json');
const MAX_BUFFER = 512 * 1024 * 1024;

const out = (text = '') => process.stdout.write(`${text}\n`);
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);

// ESLint, knip and jscpd exit non-zero when they find issues, so keep stdout either way.
const run = (cmd, cmdArgs) => {
  try {
    return execFileSync(cmd, cmdArgs, {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: MAX_BUFFER,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch (error) {
    return error.stdout ?? '';
  }
};
const load = (file, produce) => JSON.parse(file ? fs.readFileSync(file, 'utf8') : produce());

const eslintResults = load(option('--eslint'), () =>
  run('corepack', ['yarn', 'exec', 'eslint', '-c', 'eslint.quality.config.mjs', '.', '-f', 'json']),
);
const knipReport = load(option('--knip'), () => run('corepack', ['yarn', 'knip', '--reporter', 'json']));
const jscpdReport = load(option('--jscpd'), () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jscpd-'));
  run('corepack', ['yarn', 'jscpd:run', '--reporters', 'json', '--output', dir]);
  const text = fs.readFileSync(path.join(dir, 'jscpd-report.json'), 'utf8');
  fs.rmSync(dir, { recursive: true, force: true });
  return text;
});

const rules = {};
for (const file of eslintResults) {
  for (const msg of file.messages) {
    const rule = (rules[msg.ruleId || 'unknown-rule'] ??= { errors: 0, warnings: 0 });
    if (msg.severity === 2) rule.errors += 1;
    else rule.warnings += 1;
  }
}

const KNIP_KEYS = [
  'files',
  'dependencies',
  'devDependencies',
  'exports',
  'types',
  'duplicates',
  'unlisted',
  'unresolved',
  'binaries',
];
const knip = [];
for (const issue of knipReport.issues) {
  for (const key of KNIP_KEYS) {
    for (const item of issue[key] ?? []) {
      knip.push(`${key}:${issue.file}:${item.name ?? item.symbols?.map((s) => s.symbol).join('|') ?? ''}`);
    }
  }
}
knip.sort();

const total = jscpdReport.statistics.total;
const current = {
  eslint: Object.fromEntries(Object.entries(rules).sort(([a], [b]) => a.localeCompare(b))),
  knip,
  jscpd: { clones: total.clones, duplicatedLines: total.duplicatedLines },
};

if (flag('--write')) {
  fs.writeFileSync(BASELINE, `${JSON.stringify(current, null, 2)}\n`);
  out(`quality baseline written: ${BASELINE}`);
  process.exit(0);
}

const baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
const problems = [];

for (const [rule, now] of Object.entries(current.eslint)) {
  const was = baseline.eslint[rule] ?? { errors: 0, warnings: 0 };
  if (now.errors > was.errors) problems.push(`${rule}: errors ${was.errors} -> ${now.errors}`);
  if (now.warnings > was.warnings) problems.push(`${rule}: warnings ${was.warnings} -> ${now.warnings}`);
}
for (const finding of current.knip) {
  if (!baseline.knip.includes(finding)) problems.push(`knip: new finding ${finding}`);
}
for (const metric of ['clones', 'duplicatedLines']) {
  if (current.jscpd[metric] > baseline.jscpd[metric]) {
    problems.push(`jscpd ${metric}: ${baseline.jscpd[metric]} -> ${current.jscpd[metric]}`);
  }
}

if (problems.length) {
  out('QUALITY BASELINE EXCEEDED');
  problems.forEach((problem) => out(`  ${problem}`));
  process.exit(1);
}
out('QUALITY OK');
