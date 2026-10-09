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

// Static census of e2e specs: tests, expects, skips, fixmes and backend assertions (see plan 5.2.5).
// Backend assertion = an expect / expect.soft / expect.poll whose subject (first argument; for poll, the returned expression) derives from a call to api/db or a support/api|db import (directly or via variables, access, methods, JSON/Math/Date wrappers); values only passed as arguments to other calls do not count.
// Usage: node e2e-tests/tools/census.mjs [--print | --write] [--root <e2e-tests dir>] [--baseline <file>] [--json <file>] [--report <file>...]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

const DEFAULT_E2E_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG_UI_ROOT = path.resolve(DEFAULT_E2E_ROOT, '..');
const DEFAULT_BASELINE = path.join(DEFAULT_E2E_ROOT, 'census.baseline.json');
const DEFAULT_REPORT = path.join(CONFIG_UI_ROOT, 'test-results', 'results.json');
const BACKEND_MODULE = /(^|\/)support\/(api|db)$/;
const BACKEND_ROOTS = ['api', 'db'];
const PURE_GLOBAL_CALLEES = /^(JSON\.stringify|Math\.\w+|String|Number)$/;
const TEST_VARIANTS = ['only', 'skip', 'fixme', 'fail', 'slow'];
const METRICS = ['tests', 'expects', 'backend', 'skips', 'fixmes'];
const LOWER_IS_BETTER = ['skips', 'fixmes'];

const out = (text = '') => process.stdout.write(`${text}\n`);

function parseArgs(argv) {
  const args = { mode: 'compare', root: DEFAULT_E2E_ROOT, baseline: DEFAULT_BASELINE, json: undefined, reports: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--print') args.mode = 'print';
    else if (arg === '--write') args.mode = 'write';
    else if (arg === '--root') args.root = path.resolve(argv[++i]);
    else if (arg === '--baseline') args.baseline = path.resolve(argv[++i]);
    else if (arg === '--json') args.json = path.resolve(argv[++i]);
    else if (arg === '--report') args.reports.push(path.resolve(argv[++i]));
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (args.reports.length === 0) args.reports.push(DEFAULT_REPORT);
  return args;
}

function findSpecs(dir) {
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...findSpecs(full));
    else if (entry.name.endsWith('.spec.ts')) found.push(full);
  }
  return found.sort();
}

function walk(node, visit) {
  visit(node);
  ts.forEachChild(node, (child) => walk(child, visit));
}

function unwrap(expr) {
  let node = expr;
  while (
    ts.isParenthesizedExpression(node) ||
    ts.isAwaitExpression(node) ||
    ts.isNonNullExpression(node) ||
    ts.isAsExpression(node)
  ) {
    node = node.expression;
  }
  return node;
}

// Names along a callee chain, e.g. `test.describe.skip` -> ['test', 'describe', 'skip']; the root may be any expression.
function calleeParts(callee) {
  const parts = [];
  let node = unwrap(callee);
  while (ts.isPropertyAccessExpression(node)) {
    parts.unshift(node.name.text);
    node = unwrap(node.expression);
  }
  if (ts.isIdentifier(node)) parts.unshift(node.text);
  return { root: ts.isIdentifier(node) ? node.text : undefined, parts };
}

function backendNamesOf(sf) {
  const names = new Set(BACKEND_ROOTS);
  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt) || !ts.isStringLiteral(stmt.moduleSpecifier)) continue;
    if (!BACKEND_MODULE.test(stmt.moduleSpecifier.text)) continue;
    const bindings = stmt.importClause?.namedBindings;
    if (!bindings) continue;
    if (ts.isNamespaceImport(bindings)) names.add(bindings.name.text);
    else bindings.elements.forEach((el) => names.add(el.name.text));
  }
  return names;
}

function bindingNames(name, into) {
  if (ts.isIdentifier(name)) into.push(name.text);
  else name.elements.forEach((el) => !ts.isOmittedExpression(el) && bindingNames(el.name, into));
}

// True when the expression's value is derived from a backend read (see the header for the rule).
function isBackendValue(expr, ctx) {
  const node = unwrap(expr);
  const any = (nodes) => nodes.some((n) => isBackendValue(n, ctx));
  if (ts.isIdentifier(node)) return ctx.backendNames.has(node.text) || ctx.tainted.has(node.text);
  if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node))
    return isBackendValue(node.expression, ctx);
  if (ts.isCallExpression(node)) {
    const callee = unwrap(node.expression);
    if (PURE_GLOBAL_CALLEES.test(callee.getText())) return any(node.arguments);
    if (ts.isIdentifier(callee)) return ctx.backendNames.has(callee.text);
    return ts.isPropertyAccessExpression(callee) && isBackendValue(callee.expression, ctx);
  }
  if (ts.isNewExpression(node)) return node.expression.getText() === 'Date' && any(node.arguments ?? []);
  if (ts.isBinaryExpression(node)) return any([node.left, node.right]);
  if (ts.isPrefixUnaryExpression(node)) return isBackendValue(node.operand, ctx);
  if (ts.isConditionalExpression(node)) return any([node.whenTrue, node.whenFalse]);
  if (ts.isTemplateExpression(node)) return any(node.templateSpans.map((span) => span.expression));
  if (ts.isArrayLiteralExpression(node)) return any(node.elements);
  if (ts.isObjectLiteralExpression(node)) {
    return any(
      node.properties.map((p) =>
        ts.isPropertyAssignment(p) ? p.initializer : ts.isShorthandPropertyAssignment(p) ? p.name : p,
      ),
    );
  }
  return false;
}

// The expression an expect.poll callback returns (concise body, or every `return` of a block body).
function returnedExpressions(fn) {
  if (!fn.body) return [];
  if (!ts.isBlock(fn.body)) return [fn.body];
  const found = [];
  const visit = (n) => {
    if (n !== fn && (ts.isFunctionLike(n) || ts.isClassLike(n))) return;
    if (ts.isReturnStatement(n) && n.expression) found.push(n.expression);
    ts.forEachChild(n, visit);
  };
  ts.forEachChild(fn.body, visit);
  return found;
}

function isBackendSubject(subject, ctx) {
  const node = unwrap(subject);
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
    return returnedExpressions(node).some((e) => isBackendValue(e, ctx));
  }
  return isBackendValue(node, ctx);
}

function taintedVariables(sf, backendNames) {
  const ctx = { backendNames, tainted: new Set() };
  const sources = [];
  walk(sf, (node) => {
    if (ts.isVariableDeclaration(node) && node.initializer) {
      const names = [];
      bindingNames(node.name, names);
      sources.push({ names, init: node.initializer });
    } else if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isIdentifier(node.left)
    ) {
      sources.push({ names: [node.left.text], init: node.right });
    }
  });
  let changed = true;
  while (changed) {
    changed = false;
    for (const { names, init } of sources) {
      if (names.every((n) => ctx.tainted.has(n))) continue;
      if (isBackendValue(init, ctx)) {
        names.forEach((n) => ctx.tainted.add(n));
        changed = true;
      }
    }
  }
  return ctx;
}

function isTestDeclaration(call, parts) {
  if (parts[0] !== 'test') return false;
  if (parts.length === 1) return true;
  if (parts.length !== 2 || !TEST_VARIANTS.includes(parts[1])) return false;
  if (parts[1] === 'only') return true;
  // test.skip(cond, reason) and test.fail() inside a test are annotations; only title + body declares a test.
  const [title, ...rest] = call.arguments;
  const titled = title && (ts.isStringLiteralLike(title) || ts.isTemplateExpression(title));
  return Boolean(titled && rest.some((a) => ts.isArrowFunction(a) || ts.isFunctionExpression(a)));
}

function countSpec(file) {
  const sf = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const backendNames = backendNamesOf(sf);
  const ctx = taintedVariables(sf, backendNames);
  const counts = { tests: 0, expects: 0, backend: 0, skips: 0, fixmes: 0 };
  walk(sf, (node) => {
    if (!ts.isCallExpression(node)) return;
    const { parts } = calleeParts(node.expression);
    const last = parts[parts.length - 1];
    if (isTestDeclaration(node, parts)) counts.tests++;
    if (parts.length > 1 && last === 'skip') counts.skips++;
    if (parts.length > 1 && last === 'fixme') counts.fixmes++;
    const isExpect =
      parts[0] === 'expect' && (parts.length === 1 || (parts.length === 2 && ['soft', 'poll'].includes(last)));
    if (isExpect) {
      counts.expects++;
      if (node.arguments[0] && isBackendSubject(node.arguments[0], ctx)) counts.backend++;
    }
  });
  return counts;
}

function collectCurrent(root) {
  const specs = {};
  for (const file of findSpecs(root)) specs[path.relative(root, file).split(path.sep).join('/')] = countSpec(file);
  return specs;
}

function sumCounts(entries) {
  const total = Object.fromEntries(METRICS.map((m) => [m, 0]));
  for (const entry of entries) for (const m of METRICS) total[m] += entry?.[m] ?? 0;
  return total;
}

// Groups the baseline and current spec names that a `moves` map ties together, so renames and splits compare in aggregate.
function buildGroups(baselineSpecs, currentSpecs, moves) {
  const parent = new Map();
  const find = (x) => {
    if (!parent.has(x)) parent.set(x, x);
    while (parent.get(x) !== x) x = parent.get(x);
    return x;
  };
  const union = (a, b) => parent.set(find(a), find(b));
  for (const [from, to] of Object.entries(moves)) [].concat(to).forEach((target) => union(from, target));
  const groups = new Map();
  for (const name of new Set([...Object.keys(baselineSpecs), ...Object.keys(currentSpecs), ...Object.keys(moves)])) {
    const key = find(name);
    if (!groups.has(key)) groups.set(key, new Set());
    groups.get(key).add(name);
  }
  return [...groups.values()].map((names) => [...names].sort());
}

function compare(baseline, current) {
  const moves = baseline.moves ?? {};
  const violations = [];
  for (const names of buildGroups(baseline.specs, current, moves)) {
    const before = sumCounts(names.map((n) => baseline.specs[n]));
    const inBaseline = names.some((n) => baseline.specs[n]);
    const after = sumCounts(names.map((n) => current[n]));
    const label = names.length === 1 ? names[0] : names.join(' + ');
    if (inBaseline && names.length === 1 && !current[names[0]]) {
      violations.push(`${label}: spec missing (add it to "moves" if it was renamed or split)`);
      continue;
    }
    if (!inBaseline) continue;
    for (const m of METRICS) {
      const worse = LOWER_IS_BETTER.includes(m) ? after[m] > before[m] : after[m] < before[m];
      if (worse) violations.push(`${label}: ${m} ${before[m]} -> ${after[m]}`);
    }
  }
  return violations;
}

function printTable(specs, baseline) {
  const rows = Object.entries(specs).map(([name, c]) => [name, ...METRICS.map((m) => String(c[m]))]);
  const total = sumCounts(Object.values(specs));
  rows.push(['TOTAL', ...METRICS.map((m) => String(total[m]))]);
  const header = ['spec', ...METRICS];
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const line = (cells) => cells.map((c, i) => (i === 0 ? c.padEnd(widths[i]) : c.padStart(widths[i]))).join('  ');
  out(line(header));
  out(widths.map((w) => '-'.repeat(w)).join('  '));
  rows.forEach((row, i) => {
    if (i === rows.length - 1) out(widths.map((w) => '-'.repeat(w)).join('  '));
    out(line(row));
  });
  if (baseline) {
    const base = sumCounts(Object.values(baseline.specs));
    out(`baseline totals: ${METRICS.map((m) => `${m}=${base[m]}`).join(' ')}`);
  }
}

function collectTests(suite, into) {
  for (const spec of suite.specs ?? []) for (const t of spec.tests ?? []) into.push(t);
  for (const child of suite.suites ?? []) collectTests(child, into);
}

function printReport(file) {
  if (!fs.existsSync(file)) {
    out(`Playwright report: none at ${path.relative(CONFIG_UI_ROOT, file)}`);
    return;
  }
  const tests = [];
  for (const suite of JSON.parse(fs.readFileSync(file, 'utf8')).suites ?? []) collectTests(suite, tests);
  const by = (status) => tests.filter((t) => t.status === status).length;
  out(
    `Playwright report ${path.relative(CONFIG_UI_ROOT, file)}: passed=${by('expected')} skipped=${by('skipped')} failed=${by('unexpected')} flaky=${by('flaky')}`,
  );
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const current = collectCurrent(args.root);
  const snapshot = { specs: current };
  let baseline;
  if (args.mode === 'compare') {
    if (!fs.existsSync(args.baseline)) throw new Error(`No baseline at ${args.baseline}; run with --write first.`);
    baseline = JSON.parse(fs.readFileSync(args.baseline, 'utf8'));
  }
  printTable(current, baseline);
  args.reports.forEach(printReport);
  if (args.json) fs.writeFileSync(args.json, `${JSON.stringify(snapshot, null, 2)}\n`);
  if (args.mode === 'write') {
    // Keep the recorded spec moves; a rewrite only refreshes the counts.
    const moves = fs.existsSync(args.baseline) ? (JSON.parse(fs.readFileSync(args.baseline, 'utf8')).moves ?? {}) : {};
    fs.writeFileSync(args.baseline, `${JSON.stringify({ moves, ...snapshot }, null, 2)}\n`);
    out(`Wrote ${path.relative(CONFIG_UI_ROOT, args.baseline)}`);
    return;
  }
  if (args.mode === 'compare') {
    const violations = compare(baseline, current);
    if (violations.length > 0) {
      out('CENSUS FAILED');
      violations.forEach((v) => out(`  ${v}`));
      process.exitCode = 1;
    } else {
      out('CENSUS OK');
    }
  }
}

main();
