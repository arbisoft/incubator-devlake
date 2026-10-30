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
 */

'use strict';

// Usage: NODE_PATH=config-ui/node_modules node grafana/query-gate/verify/browser/render.cjs [--topology staging|prod|both] [--only uid,uid] [--long] [--dry] [--concurrency N]

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '../../../..');
const DASHBOARDS_DIR = path.join(ROOT, 'grafana', 'dashboards');
const HOST_RULES = 'MAP aperture.arbisoft.com 127.0.0.1, MAP devlake-grafana.arbisoft.com 127.0.0.1';
const VIEWPORT = { width: 1600, height: 8000 };
const IDLE_MS = 2500;
const SETTLE_MAX_MS = 60000;
const SETTLE_EXTRA_MS = 500;
const LONG_RUN_MS = 6 * 60 * 1000;
const LONG_SAMPLE_MS = 30 * 1000;

const TOPOLOGIES = {
  staging: { base: 'https://aperture.arbisoft.com/grafana', origin: 'https://aperture.arbisoft.com', direct: 'http://127.0.0.1:3013/grafana' },
  prod: { base: 'https://devlake-grafana.arbisoft.com', origin: 'https://devlake-grafana.arbisoft.com', direct: null },
};

const USERS = {
  viewerA: { loginKey: 'GV_VIEWER_A_LOGIN', passwordKey: 'GV_VIEWER_A_PASSWORD' },
  viewerB: { loginKey: 'GV_VIEWER_B_LOGIN', passwordKey: 'GV_VIEWER_B_PASSWORD' },
  'gv-orgadmin': { loginKey: 'GV_ORGADMIN_LOGIN', passwordKey: 'GV_ORGADMIN_PASSWORD' },
  'gv-editor': { loginKey: 'GV_EDITOR_LOGIN', passwordKey: 'GV_EDITOR_PASSWORD' },
};

const STEP_SETS = {
  all: ['default', 'range-2y', 'vars', 'refresh'],
  light: ['default', 'refresh'],
  default: ['default'],
};

const PLAN = {
  staging: { viewerA: 'all', viewerB: 'all', 'gv-orgadmin': 'light', 'gv-editor': 'light' },
  prod: { viewerA: 'all', viewerB: 'default', 'gv-orgadmin': 'default', 'gv-editor': 'default' },
};

const RANGE_STEPS = { default: 'from=now-90d&to=now', 'range-2y': 'from=now-2y&to=now' };
const VAR_TYPES = ['query', 'custom'];

const FORGE_QUERY = 'orgId=1&from=now-1y&to=now&var-project=snap-Sophia&var-project=Supercal&var-project=edly-Github';
const BREAKOUT_QUERY = 'orgId=1&from=now-1y&to=now&var-user=a%5C&var-user=%29%29%20OR%201%3D1%20--%20';
const EDIT_PANEL_QUERY = 'orgId=1&editPanel=4';
const AI_UID = 'ai_throughput_overview';

const SPECIALS = [
  { name: 'forge', users: ['viewerB'], expectRejection: false, pages: (d) => [{ dash: d.byUid.get(AI_UID), query: FORGE_QUERY }, { dash: d.jiraProject, query: FORGE_QUERY }] },
  { name: 'breakout', users: ['viewerA'], expectRejection: true, pages: (d) => d.claudeUser.map((dash) => ({ dash, query: BREAKOUT_QUERY })) },
  { name: 'edit-panel', users: ['gv-editor', 'gv-orgadmin'], expectRejection: false, pages: (d) => [{ dash: d.byUid.get(AI_UID), query: EDIT_PANEL_QUERY }] },
];

const FAILING_TYPES = new Set(['unexpected-rejection', 'false-positive', 'replay-mismatch', 'frame-error-gate-only', 'missing-breakout-rejection', 'breakout-more-rows']);

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pathOf = (u) => new URL(u).pathname;
const isDsQuery = (u) => pathOf(u).endsWith('/api/ds/query');
const safeName = (s) => String(s).replace(/[^\w.-]+/g, '_');
const utcStamp = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');

function fail(msg, code = 2) {
  console.error(`error: ${msg}`);
  process.exit(code);
}

function parseArgs(argv) {
  const o = { topology: 'both', only: null, long: false, dry: false, concurrency: 3 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--long') o.long = true;
    else if (a === '--dry') o.dry = true;
    else if (a === '--topology') o.topology = argv[++i];
    else if (a === '--only') o.only = String(argv[++i] || '').split(',').filter(Boolean);
    else if (a === '--concurrency') o.concurrency = Number(argv[++i]);
    else fail(`unknown option ${a}`);
  }
  if (!['staging', 'prod', 'both'].includes(o.topology)) fail('--topology must be staging|prod|both');
  if (!Number.isInteger(o.concurrency) || o.concurrency < 1) fail('--concurrency must be a positive integer');
  return o;
}

function loadEnvFile(file) {
  const out = {};
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line.trim());
    if (m) out[m[1]] = m[2];
  }
  return out;
}

function loadCredentials(work) {
  const env = { ...loadEnvFile(path.join(work, 'users.env')), ...loadEnvFile(path.join(work, 'secrets.env')) };
  const creds = {};
  const missing = [];
  for (const [key, u] of Object.entries(USERS)) {
    const login = env[u.loginKey] || (key.startsWith('gv-') ? key : '');
    const password = env[u.passwordKey];
    if (!login) missing.push(u.loginKey);
    if (!password) missing.push(u.passwordKey);
    creds[key] = { login, password };
  }
  if (missing.length) fail(`missing in users.env/secrets.env: ${missing.join(', ')}`);
  return creds;
}

function walkJson(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walkJson(p));
    else if (e.name.endsWith('.json')) out.push(p);
  }
  return out;
}

function loadDashboards() {
  const all = walkJson(DASHBOARDS_DIR).sort().map((file) => {
    const j = JSON.parse(fs.readFileSync(file, 'utf8'));
    const rel = path.relative(ROOT, file).split(path.sep).join('/');
    const vars = ((j.templating && j.templating.list) || []).map((v) => v.name);
    return { file: rel, uid: j.uid, title: j.title, vars };
  });
  const bad = all.filter((d) => !d.uid);
  if (bad.length) fail(`dashboards without uid: ${bad.map((d) => d.file).join(', ')}`);
  return all;
}

function selectDashboards(all, only) {
  if (!only) return all;
  const unknown = only.filter((u) => !all.some((d) => d.uid === u));
  if (unknown.length) fail(`unknown dashboard uid: ${unknown.join(', ')}`);
  return all.filter((d) => only.includes(d.uid));
}

// Special-check inputs derived from the shipped set, filtered to the selected dashboards.
function specialInputs(all, selected) {
  const sel = new Set(selected.map((d) => d.uid));
  const byUid = new Map(all.filter((d) => sel.has(d.uid)).map((d) => [d.uid, d]));
  const jira = all.find((d) => d.file.includes('/Jira Dashboards/') && d.vars.includes('project'));
  return {
    byUid,
    jiraProject: jira && sel.has(jira.uid) ? jira : null,
    claudeUser: selected.filter((d) => d.file.startsWith('grafana/dashboards/Claude/') && d.vars.includes('user')),
  };
}

function specialPages(spec, inputs) {
  return spec.pages(inputs).filter((p) => p.dash);
}

function topologyNames(opts) {
  return opts.topology === 'both' ? ['staging', 'prod'] : [opts.topology];
}

function printPlan(opts, selected, all, inputs) {
  console.log(`dry run: ${selected.length} of ${all.length} shipped dashboards`);
  console.log(`concurrency: ${opts.concurrency} pages per user`);
  if (opts.long) {
    console.log('mode: long session (6 min, refresh=10s) as viewerA');
    for (const t of topologyNames(opts)) console.log(`  ${t}: ${TOPOLOGIES[t].base}/d/${AI_UID}?orgId=1&from=now-7d&to=now&refresh=10s`);
    return;
  }
  for (const t of topologyNames(opts)) {
    console.log(`\ntopology ${t}: ${TOPOLOGIES[t].base}${TOPOLOGIES[t].direct ? ' (replay against direct Grafana)' : ' (no replay)'}`);
    for (const [user, setName] of Object.entries(PLAN[t])) {
      const steps = STEP_SETS[setName];
      const fixed = steps.filter((s) => s !== 'vars').length * selected.length;
      const specials = SPECIALS.filter((s) => s.users.includes(user)).reduce((n, s) => n + specialPages(s, inputs).length, 0);
      const extra = steps.includes('vars') ? ' + variable scenarios (found at run time)' : '';
      console.log(`  ${user}: steps [${steps.join(', ')}]: ${fixed} dashboard scenarios${extra}, ${specials} special`);
    }
  }
  console.log('\nspecial checks:');
  for (const s of SPECIALS) {
    const pages = specialPages(s, inputs);
    console.log(`  ${s.name} (${s.users.join(', ')}): ${pages.map((p) => p.dash.uid).join(', ') || 'none selected'}`);
  }
  console.log('\ndashboards:');
  for (const d of selected) console.log(`  ${d.uid}  ${d.title}`);
}

// ---------- page capture ----------

function newScenario(dash, name, extra) {
  return {
    dashboard: dash.uid, title: dash.title, name, kind: extra.kind || 'main', expectRejection: !!extra.expectRejection,
    requests: [], apiErrors: [], console: [], scenarioErrors: [], findings: [],
  };
}

async function captureQuery(resp, scn) {
  const req = resp.request();
  const h = req.headers();
  const post = req.postData();
  let title = h['x-panel-title'] || '';
  try { title = decodeURIComponent(title); } catch { /* keep raw */ }
  const e = {
    search: new URL(resp.url()).search, status: resp.status(), dashboardUid: h['x-dashboard-uid'] || '',
    panelId: h['x-panel-id'] || '', panelTitle: title, postSha: post ? sha(post) : '', _post: post, _json: null,
    rejected: false, messageId: '', message: '', results: {},
  };
  scn.requests.push(e);
  try {
    const text = await resp.text();
    e.respSha = sha(text);
    e._json = JSON.parse(text);
  } catch {
    e.bodyUnreadable = true;
    return;
  }
  const j = e._json || {};
  e.messageId = j.messageId || '';
  e.message = typeof j.message === 'string' ? j.message.slice(0, 200) : '';
  e.rejected = j.messageId === 'querygate.blocked' || e.message.startsWith('Query gate');
  for (const [refId, r] of Object.entries(j.results || {})) {
    const frames = r.frames || [];
    const rows = frames.reduce((n, f) => n + ((f.data && f.data.values && f.data.values[0] && f.data.values[0].length) || 0), 0);
    e.results[refId] = { frames: frames.length, rows, ...(r.error ? { error: String(r.error).slice(0, 300) } : {}) };
  }
}

function attachRecorder(page, wsStat) {
  const rec = { cur: null, inflight: new Set(), pending: new Set(), lastEvent: Date.now() };
  page.on('request', (r) => {
    if (isDsQuery(r.url())) { rec.inflight.add(r); rec.lastEvent = Date.now(); }
  });
  page.on('requestfailed', (r) => {
    if (rec.inflight.delete(r)) rec.lastEvent = Date.now();
  });
  page.on('response', (resp) => {
    const url = resp.url();
    const scn = rec.cur;
    if (isDsQuery(url)) {
      rec.inflight.delete(resp.request());
      rec.lastEvent = Date.now();
      if (!scn) return;
      const p = captureQuery(resp, scn).catch(() => {});
      rec.pending.add(p);
      p.finally(() => rec.pending.delete(p));
    } else if (scn && pathOf(url).includes('/api/') && resp.status() >= 400) {
      scn.apiErrors.push({ path: pathOf(url), status: resp.status() });
    }
  });
  page.on('websocket', (ws) => {
    if (!ws.url().includes('/api/live/ws')) return;
    wsStat.opened++;
    let got = false;
    ws.on('framereceived', () => { if (!got) { got = true; wsStat.frames++; } });
    ws.on('close', () => { wsStat.closed++; });
  });
  page.on('console', (m) => {
    if (m.type() === 'error' && rec.cur) rec.cur.console.push(m.text().slice(0, 300));
  });
  return rec;
}

// The one settle helper: no /api/ds/query in flight for 2.5 s (max 60 s), then 500 ms more.
async function settle(rec) {
  const start = Date.now();
  rec.lastEvent = start;
  while (Date.now() - start < SETTLE_MAX_MS) {
    await sleep(100);
    if (rec.inflight.size === 0 && Date.now() - rec.lastEvent >= IDLE_MS) break;
  }
  await sleep(SETTLE_EXTRA_MS);
  await Promise.allSettled([...rec.pending]);
}

// ---------- differential replay ----------

function normalize(v) {
  if (Array.isArray(v)) return v.map(normalize);
  if (v && typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v).sort()) {
      if (k === 'traceID' || k.toLowerCase().includes('timing')) continue;
      o[k] = normalize(v[k]);
    }
    return o;
  }
  return v;
}

function firstDiff(a, b, p = '$') {
  if (JSON.stringify(a) === JSON.stringify(b)) return '';
  if (a && b && typeof a === 'object' && typeof b === 'object' && Array.isArray(a) === Array.isArray(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) {
      const d = firstDiff(a[k], b[k], `${p}.${k}`);
      if (d) return d;
    }
  }
  return p;
}

// Panels that select now() differ between the live request and its replay by seconds; only those cells are aligned.
function alignTimeFields(g, d, toleranceMs = 120000) {
  for (const [ref, r] of Object.entries((g && g.results) || {})) {
    const dr = d && d.results && d.results[ref];
    (r.frames || []).forEach((f, fi) => {
      const df = dr && dr.frames && dr.frames[fi];
      if (!df || !f.schema || !f.data || !df.data) return;
      (f.schema.fields || []).forEach((field, i) => {
        if (field.type !== 'time') return;
        const a = f.data.values && f.data.values[i];
        const b = df.data.values && df.data.values[i];
        if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return;
        if (a.every((v, k) => typeof v === 'number' && typeof b[k] === 'number' && Math.abs(v - b[k]) <= toleranceMs)) df.data.values[i] = a;
      });
    });
  }
  return d;
}

const errorRefs = (j) => Object.entries((j && j.results) || {}).filter(([, r]) => r && r.error).map(([k]) => k);

async function replayOne(st, e) {
  if (!e._post) return;
  let cookie = '';
  try {
    cookie = ((await st.ctx.cookies(st.topo.base + '/')).find((c) => c.name === 'grafana_session') || {}).value || '';
  } catch { /* replay proceeds without the cookie and will report the status */ }
  const rp = {};
  try {
    const res = await fetch(`${st.topo.direct}/api/ds/query${e.search}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: `grafana_session=${cookie}` } : {}) },
      body: e._post,
      signal: AbortSignal.timeout(60000),
    });
    rp.directStatus = res.status;
    let dj = null;
    try { dj = await res.json(); } catch { /* non-JSON body */ }
    rp.directErrorRefs = errorRefs(dj);
    if (e.rejected) rp.match = null;
    else if (e.status !== res.status) { rp.match = false; rp.reason = `status gate ${e.status} direct ${res.status}`; }
    else if (res.status === 200) {
      const d = firstDiff(normalize(e._json), normalize(alignTimeFields(e._json, dj)));
      rp.match = d === '';
      if (d) rp.reason = `body differs at ${d}`;
    } else rp.match = true;
  } catch (err) {
    rp.match = false;
    rp.reason = `direct request failed: ${String(err.message || err).slice(0, 120)}`;
  }
  e.replay = rp;
}

async function replayAll(st, scn) {
  if (!st.topo.direct) return;
  for (const e of scn.requests) await replayOne(st, e);
}

// ---------- evaluation ----------

function addFinding(scn, type, e, reason) {
  scn.findings.push({
    type, uid: scn.dashboard, scenario: scn.name, panelId: e ? e.panelId : '', panelTitle: e ? e.panelTitle : '',
    status: e ? e.status : '', reason: String(reason).slice(0, 200),
  });
}

function evaluate(scn, topo) {
  for (const e of scn.requests) {
    if (e.rejected) {
      if (scn.expectRejection) continue;
      addFinding(scn, 'unexpected-rejection', e, e.message || e.messageId);
      if (e.replay && e.replay.directStatus === 200) addFinding(scn, 'false-positive', e, 'gate rejected, direct Grafana answered 200');
      continue;
    }
    const gateErr = Object.entries(e.results).filter(([, r]) => r.error);
    if (e.replay) {
      if (e.replay.match === false) addFinding(scn, 'replay-mismatch', e, e.replay.reason);
      for (const [ref, r] of gateErr) {
        if (!e.replay.directErrorRefs.includes(ref)) addFinding(scn, 'frame-error-gate-only', e, `${ref}: ${r.error}`);
      }
    } else {
      if (e.status >= 400) addFinding(scn, 'ds-status', e, `no replay for ${topo}`);
      for (const [ref, r] of gateErr) addFinding(scn, 'frame-error-unreplayed', e, `${ref}: ${r.error}`);
    }
  }
  for (const a of scn.apiErrors) addFinding(scn, 'api-error', { panelId: '', panelTitle: '', status: a.status }, a.path);
  for (const m of scn.scenarioErrors) addFinding(scn, 'scenario-error', null, m);
}

function maxRowsByPanel(scn) {
  const m = new Map();
  for (const e of scn.requests) {
    if (e.rejected) continue;
    for (const [ref, r] of Object.entries(e.results)) {
      const k = `${e.panelId}|${ref}`;
      m.set(k, Math.max(m.get(k) || 0, r.rows));
    }
  }
  return m;
}

function evaluateBreakout(st, scn) {
  if (!scn.requests.some((e) => e.rejected)) addFinding(scn, 'missing-breakout-rejection', null, 'no gate rejection for the crafted user value');
  const base = st.scenarios.find((s) => s.kind === 'main' && s.name === 'default' && s.dashboard === scn.dashboard);
  const baseline = base ? maxRowsByPanel(base) : new Map();
  const now = maxRowsByPanel(scn);
  scn.breakoutPanels = [];
  for (const [k, rows] of now) {
    const [panelId, ref] = k.split('|');
    const b = baseline.get(k);
    scn.breakoutPanels.push({ panelId, refId: ref, rows, baselineRows: b === undefined ? null : b });
    if (b !== undefined && rows > b) {
      const e = scn.requests.find((r) => r.panelId === panelId) || null;
      addFinding(scn, 'breakout-more-rows', e, `${ref}: ${rows} rows, default had ${b}`);
    }
  }
}

async function screenshot(st, page, scn) {
  const dir = path.join(st.work, 'results', 'shots');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${st.topoName}-${safeName(st.user)}-${safeName(scn.dashboard)}-${safeName(scn.name)}.png`);
  await page.screenshot({ path: file }).catch(() => {});
}

// ---------- scenario runner ----------

async function runScenario(st, page, rec, dash, name, action, extra = {}) {
  const scn = newScenario(dash, name, extra);
  rec.cur = scn;
  st.scenarios.push(scn);
  try { await action(); } catch (err) { scn.scenarioErrors.push(String(err.message || err).slice(0, 300)); }
  await settle(rec);
  await replayAll(st, scn);
  evaluate(scn, st.topoName);
  if (extra.afterEvaluate) extra.afterEvaluate(scn);
  if (scn.findings.some((f) => FAILING_TYPES.has(f.type) || f.type === 'scenario-error')) await screenshot(st, page, scn);
  rec.cur = null;
}

const gotoUrl = (page, url) => page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
const dashUrl = (st, dash, query) => `${st.topo.base}/d/${dash.uid}?${query}`;

const listVariables = () => {
  const vs = (window.__grafanaSceneContext && window.__grafanaSceneContext.state.$variables && window.__grafanaSceneContext.state.$variables.state.variables) || [];
  return vs.map((v) => ({ name: v.state.name, type: v.state.type, hide: v.state.hide }));
};

const readVariable = (name) => {
  const vs = (window.__grafanaSceneContext && window.__grafanaSceneContext.state.$variables && window.__grafanaSceneContext.state.$variables.state.variables) || [];
  const v = vs.find((x) => x.state.name === name);
  if (!v) return null;
  const s = v.state;
  return { isMulti: !!s.isMulti, includeAll: !!s.includeAll, value: s.value, text: s.text, options: (s.options || []).map((o) => ({ value: o.value, text: o.text })) };
};

const changeVariable = async ({ name, value, text }) => {
  const vs = (window.__grafanaSceneContext && window.__grafanaSceneContext.state.$variables && window.__grafanaSceneContext.state.$variables.state.variables) || [];
  const v = vs.find((x) => x.state.name === name);
  if (!v || typeof v.changeValueTo !== 'function') return { error: 'variable or changeValueTo missing' };
  try { await v.changeValueTo(value, text); return { ok: true }; } catch (e) { return { error: String(e).slice(0, 200) }; }
};

const refreshTimeRange = () => {
  const t = window.__grafanaSceneContext && window.__grafanaSceneContext.state.$timeRange;
  if (!t || typeof t.onRefresh !== 'function') return { error: 'onRefresh missing' };
  t.onRefresh();
  return { ok: true };
};

async function evalOrThrow(page, fn, arg) {
  const r = await page.evaluate(fn, arg);
  if (r && r.error) throw new Error(r.error);
}

function variableChanges(v) {
  const opts = v.options.filter((o) => o.value !== '$__all');
  if (v.isMulti) {
    const out = [];
    if (opts[0]) out.push({ label: 'one', value: [opts[0].value], text: [opts[0].text] });
    if (opts.length >= 2) out.push({ label: 'two', value: [opts[0].value, opts[1].value], text: [opts[0].text, opts[1].text] });
    if (v.includeAll) out.push({ label: 'all', value: ['$__all'], text: ['All'] });
    return out;
  }
  return opts.length >= 2 ? [{ label: 'other', value: opts[1].value, text: opts[1].text, restore: { value: v.value, text: v.text } }] : [];
}

async function runVariables(st, page, rec, dash) {
  const names = (await page.evaluate(listVariables))
    .filter((v) => VAR_TYPES.includes(v.type) && v.hide !== 2)
    .map((v) => v.name);
  for (const name of names) {
    const v = await page.evaluate(readVariable, name);
    if (!v) continue;
    for (const c of variableChanges(v)) {
      await runScenario(st, page, rec, dash, `var:${name}:${c.label}`, async () => {
        await evalOrThrow(page, changeVariable, { name, value: c.value, text: c.text });
        if (c.restore) {
          await settle(rec);
          await evalOrThrow(page, changeVariable, { name, value: c.restore.value, text: c.restore.text });
        }
      });
    }
  }
}

async function runDashboardSteps(st, page, rec, dash, steps) {
  for (const step of steps) {
    if (RANGE_STEPS[step]) await runScenario(st, page, rec, dash, step, () => gotoUrl(page, dashUrl(st, dash, `orgId=1&${RANGE_STEPS[step]}`)));
    else if (step === 'refresh') await runScenario(st, page, rec, dash, 'refresh', () => evalOrThrow(page, refreshTimeRange));
    else if (step === 'vars') await runVariables(st, page, rec, dash);
  }
}

async function withPage(st, fn) {
  const page = await st.ctx.newPage();
  const rec = attachRecorder(page, st.ws);
  try { await fn(page, rec); } finally { await page.close().catch(() => {}); }
}

async function pool(items, n, fn) {
  let i = 0;
  const worker = async () => { while (i < items.length) await fn(items[i++]); };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
}

// Aborts the whole run when a response from a topology host did not come from the local copy.
function abortNotLocal(topo) {
  console.error(`not a local copy: ${topo.base}`);
  process.exit(3);
}

function guardContext(ctx) {
  const hosts = new Map(Object.values(TOPOLOGIES).map((t) => [new URL(t.base).host, t]));
  ctx.on('response', (resp) => {
    const topo = hosts.get(new URL(resp.url()).host);
    if (topo && resp.headers()['x-gv-local'] !== '1') abortNotLocal(topo);
  });
}

// Logs in from inside the page so the request uses Chromium's host mapping, after checking the copy is local.
async function login(ctx, topo, cred) {
  guardContext(ctx);
  const page = await ctx.newPage();
  try {
    const first = await page.goto(`${topo.base}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    if (!first || first.headers()['x-gv-local'] !== '1') abortNotLocal(topo);
    const status = await page.evaluate(async ({ base, user, password }) => {
      const r = await fetch(`${base}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user, password }), credentials: 'include' });
      return r.status;
    }, { base: topo.base, user: cred.login, password: cred.password });
    return status === 200;
  } finally {
    await page.close().catch(() => {});
  }
}

async function runUser(browser, ctxInfo) {
  const { topoName, user, cred, selected, inputs, opts, work } = ctxInfo;
  const topo = TOPOLOGIES[topoName];
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: VIEWPORT });
  const st = { ctx, topo, topoName, user, work, scenarios: [], ws: { opened: 0, frames: 0, closed: 0 }, loginOk: false };
  try {
    st.loginOk = await login(ctx, topo, cred).catch(() => false);
    if (!st.loginOk) return st;
    const steps = STEP_SETS[PLAN[topoName][user]];
    await pool(selected, opts.concurrency, (dash) => withPage(st, (page, rec) => runDashboardSteps(st, page, rec, dash, steps)));
    const pages = [];
    for (const spec of SPECIALS.filter((s) => s.users.includes(user))) {
      for (const p of specialPages(spec, inputs)) pages.push({ spec, ...p });
    }
    await pool(pages, opts.concurrency, ({ spec, dash, query }) => withPage(st, (page, rec) => runScenario(
      st, page, rec, dash, spec.name, () => gotoUrl(page, dashUrl(st, dash, query)),
      { kind: spec.name, expectRejection: spec.expectRejection, afterEvaluate: spec.name === 'breakout' ? (scn) => evaluateBreakout(st, scn) : undefined },
    )));
  } finally {
    await ctx.close().catch(() => {});
  }
  return st;
}

// ---------- long session ----------

async function runLong(browser, topoName, cred, work) {
  const topo = TOPOLOGIES[topoName];
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: VIEWPORT });
  const res = { topology: topoName, loginOk: false, events: [], cookieSamples: 0, cookieChanges: 0, checks: {} };
  try {
    res.loginOk = await login(ctx, topo, cred).catch(() => false);
    if (!res.loginOk) return res;
    const page = await ctx.newPage();
    page.on('response', (resp) => {
      const u = resp.url();
      if (isDsQuery(u)) {
        const ev = { t: Date.now(), kind: 'query', status: resp.status(), rejected: false };
        res.events.push(ev);
        resp.json().then((j) => { ev.rejected = j.messageId === 'querygate.blocked' || String(j.message || '').startsWith('Query gate'); }).catch(() => {});
      } else if (pathOf(u).endsWith('/api/user/auth-tokens/rotate')) {
        res.events.push({ t: Date.now(), kind: 'rotate', status: resp.status() });
      }
    });
    const sample = async () => {
      const c = (await ctx.cookies(topo.base + '/')).find((x) => x.name === 'grafana_session');
      return c ? sha(c.value) : '';
    };
    const t0 = Date.now();
    await gotoUrl(page, `${topo.base}/d/${AI_UID}?orgId=1&from=now-7d&to=now&refresh=10s`).catch(() => {});
    let last = await sample();
    res.cookieSamples = 1;
    while (Date.now() - t0 < LONG_RUN_MS) {
      await sleep(LONG_SAMPLE_MS);
      const cur = await sample();
      res.cookieSamples++;
      if (cur !== last) res.cookieChanges++;
      last = cur;
    }
    await sleep(500);
    res.checks = judgeLong(res, Date.now());
    fs.mkdirSync(path.join(work, 'results', 'shots'), { recursive: true });
    if (!Object.values(res.checks).every((c) => c.ok)) await page.screenshot({ path: path.join(work, 'results', 'shots', `long-${topoName}.png`) }).catch(() => {});
  } finally {
    await ctx.close().catch(() => {});
  }
  return res;
}

function judgeLong(res, end) {
  const q = res.events.filter((e) => e.kind === 'query');
  const rot = res.events.filter((e) => e.kind === 'rotate');
  const unrecovered = q.filter((e) => e.status === 401).filter((e) => {
    const r = rot.find((x) => x.status === 200 && x.t >= e.t && x.t <= e.t + 15000);
    return !(r && q.some((x) => x.status === 200 && x.t >= r.t && x.t <= e.t + 15000));
  });
  const recent = q.filter((e) => e.status === 200 && e.t >= end - 60000).length;
  return {
    noRejections: { ok: !q.some((e) => e.rejected), detail: `${q.filter((e) => e.rejected).length} rejections` },
    recover401: { ok: unrecovered.length === 0, detail: `${q.filter((e) => e.status === 401).length} 401s, ${unrecovered.length} not recovered` },
    cookieRotated: { ok: res.cookieChanges >= 2, detail: `${res.cookieChanges} cookie changes` },
    lastMinute: { ok: recent >= 4, detail: `${recent} successful queries in the last 60 s` },
  };
}

// ---------- reporting ----------

function printTable(header, rows) {
  const all = [header, ...rows];
  const w = header.map((_, i) => Math.max(...all.map((r) => String(r[i]).length)));
  for (const r of all) console.log(`  ${r.map((c, i) => String(c).padEnd(w[i])).join('  ')}`);
}

function summarize(st) {
  const reqs = st.scenarios.flatMap((s) => s.requests.map((e) => ({ s, e })));
  const findings = st.scenarios.flatMap((s) => s.findings);
  const panelsWithErr = new Set(reqs.filter(({ e }) => !e.rejected && Object.values(e.results).some((r) => r.error)).map(({ s, e }) => `${s.dashboard}|${e.panelId}`));
  const gateOnly = new Set(findings.filter((f) => f.type === 'frame-error-gate-only').map((f) => `${f.uid}|${f.panelId}`));
  const count = (t) => findings.filter((f) => f.type === t).length;
  return {
    dashboards: new Set(st.scenarios.filter((s) => s.kind === 'main').map((s) => s.dashboard)).size,
    scenarios: st.scenarios.length,
    queries: reqs.length,
    rejExpected: reqs.filter(({ s, e }) => e.rejected && s.expectRejection).length,
    rejUnexpected: reqs.filter(({ s, e }) => e.rejected && !s.expectRejection).length,
    api: st.scenarios.reduce((n, s) => n + s.apiErrors.length, 0),
    frameErr: `${panelsWithErr.size} (${gateOnly.size} gate-only)`,
    mismatches: count('replay-mismatch'),
    falsePositives: count('false-positive'),
    ws: st.ws.opened > 0 && st.ws.frames > 0 ? 'yes' : `no (${st.ws.opened} opened)`,
  };
}

function printSummary(states, loginFailures) {
  for (const topoName of Object.keys(TOPOLOGIES)) {
    const list = states.filter((s) => s.topoName === topoName);
    if (!list.length) continue;
    console.log(`\n== ${topoName}`);
    const header = ['user', 'dashboards', 'scenarios', 'ds/query', 'rej exp', 'rej unexp', 'api>=400', 'frame-err panels', 'mismatch', 'false pos', 'ws ok'];
    printTable(header, list.filter((s) => s.loginOk).map((s) => {
      const x = summarize(s);
      return [s.user, x.dashboards, x.scenarios, x.queries, x.rejExpected, x.rejUnexpected, x.api, x.frameErr, x.mismatches, x.falsePositives, x.ws];
    }));
    const opened = list.reduce((n, s) => n + s.ws.opened, 0);
    const frames = list.reduce((n, s) => n + s.ws.frames, 0);
    console.log(`  live websocket: ${opened} opened, ${frames} received a frame -> ${opened > 0 && frames > 0 ? 'ok' : 'NOT ok'}`);
  }
  for (const f of loginFailures) console.log(`\nlogin failed: ${f}`);
  const fmt = (st, f) => `  [${f.type}] ${st.topoName}/${st.user} ${f.uid} ${f.scenario} panel ${f.panelId || '-'} "${f.panelTitle}" status ${f.status || '-'}: ${f.reason}`;
  const entries = states.flatMap((st) => st.scenarios.flatMap((s) => s.findings.map((f) => ({ st, f }))));
  const failing = entries.filter(({ f }) => FAILING_TYPES.has(f.type));
  const info = entries.filter(({ f }) => !FAILING_TYPES.has(f.type));
  console.log(`\nunexpected items: ${failing.length}`);
  for (const { st, f } of failing) console.log(fmt(st, f));
  console.log(`\ninformational items (do not fail the run): ${info.length}`);
  for (const { st, f } of info) console.log(fmt(st, f));
  return failing.length;
}

function printLong(results) {
  console.log('\n== long session');
  let bad = 0;
  for (const r of results) {
    if (!r.loginOk) { console.log(`  ${r.topology}: login failed`); bad++; continue; }
    for (const [name, c] of Object.entries(r.checks)) {
      console.log(`  ${c.ok ? 'PASS' : 'FAIL'} ${r.topology} ${name}: ${c.detail}`);
      if (!c.ok) bad++;
    }
  }
  return bad;
}

const jsonReplacer = (k, v) => (k.startsWith('_') ? undefined : v);

function writeResults(work, ts, opts, states, longResults) {
  const dir = path.join(work, 'results');
  fs.mkdirSync(dir, { recursive: true });
  const out = { startedAt: ts, options: opts, topologies: {}, long: longResults };
  for (const st of states) {
    out.topologies[st.topoName] = out.topologies[st.topoName] || {};
    out.topologies[st.topoName][st.user] = { loginOk: st.loginOk, ws: st.ws, scenarios: st.scenarios };
  }
  const file = path.join(dir, `browser-${ts}.json`);
  fs.writeFileSync(file, JSON.stringify(out, jsonReplacer, 1));
  console.log(`\nresults: ${file}`);
}

// ---------- main ----------

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const work = process.env.GV_WORK;
  if (!work) fail('GV_WORK is required');
  const creds = loadCredentials(work);
  const all = loadDashboards();
  const selected = selectDashboards(all, opts.only);
  const inputs = specialInputs(all, selected);
  if (opts.dry) {
    printPlan(opts, selected, all, inputs);
    return 0;
  }
  const { chromium } = require('@playwright/test');
  const ts = process.env.GV_TS || utcStamp();
  const browser = await chromium.launch({ args: [`--host-resolver-rules=${HOST_RULES}`] });
  const states = [];
  let longResults = null;
  const loginFailures = [];
  let bad = 0;
  try {
    if (opts.long) {
      longResults = await Promise.all(topologyNames(opts).map((t) => runLong(browser, t, creds.viewerA, work)));
      bad = printLong(longResults);
    } else {
      for (const topoName of topologyNames(opts)) {
        for (const user of Object.keys(PLAN[topoName])) {
          const st = await runUser(browser, { topoName, user, cred: creds[user], selected, inputs, opts, work });
          states.push(st);
          if (!st.loginOk) loginFailures.push(`${topoName}/${user}`);
        }
      }
      bad = printSummary(states, loginFailures) + loginFailures.length;
    }
    writeResults(work, ts, opts, states, longResults);
  } finally {
    await browser.close().catch(() => {});
  }
  console.log(bad === 0 ? '\nPASS' : '\nFAIL');
  return bad === 0 ? 0 : 1;
}

main().then((code) => process.exit(code), (err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
