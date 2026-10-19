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

import type { OtelReplayKind } from '../../src/api/otel/types';

import { runSql } from './db';

const sqlString = (value: string): string => `'${value.replace(/'/g, "''")}'`;

const DAY_MS = 86_400_000;
export const SEEDED_REPLAY_REQUESTER = 'e2e-replay-seed@example.test';
const REPLAY_TABLE = '_tool_claude_code_otel_replay_requests';
const AUDIT_TABLE = '_tool_claude_code_otel_audit_events';

export type SeededReplayStatus = 'completed' | 'failed';

export interface OtelAuditRow {
  action: string;
  oldValue: string | null;
  newValue: string | null;
}

export interface OtelReplayRow {
  id: number;
  kind: OtelReplayKind;
  status: string;
  requestedBy: string | null;
  rangeStart: string;
  rangeEnd: string;
}

export interface OtelRowMarks {
  replayId: number;
  auditId: number;
}

export interface OtelReplayRowFilter {
  pending?: boolean;
  requestedByLike?: string;
  connectionIds?: number[];
  after?: OtelRowMarks;
}

const sqlRows = (sql: string): string[][] =>
  runSql(sql)
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => line.split('\t'));

const sqlNullable = (value: string): string | null => (value === 'NULL' ? null : value);

// The organization a team's connection is bound to; undefined when unbound or missing.
export function otelOrganizationOf(teamName: string): string | undefined {
  const value = runSql(
    `SELECT organization_id FROM _tool_claude_code_otel_connections WHERE team_name = ${sqlString(teamName)} AND hidden_at IS NULL;`,
  ).trim();
  return value === '' || value === 'NULL' ? undefined : value;
}

// Audit rows of a connection, oldest first.
export function otelAuditEvents(connectionId: number): OtelAuditRow[] {
  return sqlRows(
    `SELECT action, old_value, new_value FROM ${AUDIT_TABLE} WHERE connection_id = ${Number(connectionId)} ORDER BY id;`,
  ).map(([action, oldValue, newValue]) => ({
    action,
    oldValue: sqlNullable(oldValue),
    newValue: sqlNullable(newValue),
  }));
}

function replayRows(where: string): OtelReplayRow[] {
  return sqlRows(
    `SELECT id, kind, status, requested_by, DATE_FORMAT(range_start, '%Y-%m-%d'), DATE_FORMAT(range_end, '%Y-%m-%d') FROM ${REPLAY_TABLE} ${where} ORDER BY id;`,
  ).map(([id, kind, status, requestedBy, rangeStart, rangeEnd]) => ({
    id: Number(id),
    kind: kind as OtelReplayKind,
    status,
    requestedBy: sqlNullable(requestedBy),
    rangeStart,
    rangeEnd,
  }));
}

// Replay requests queued for a connection, oldest first; range ends are exclusive UTC midnights.
export function otelReplayRequestsFor(connectionId: number): OtelReplayRow[] {
  return replayRows(`WHERE requested_for_connection_id = ${Number(connectionId)}`);
}

export function otelReplayRequestsAfter(replayId: number): OtelReplayRow[] {
  return replayRows(`WHERE id > ${Number(replayId)}`);
}

export function countOtelReplayRequests(): number {
  return Number(runSql(`SELECT COUNT(*) FROM ${REPLAY_TABLE};`).trim());
}

// Highest replay and audit ids now; rows created after it belong to the caller.
export function otelRowMarks(): OtelRowMarks {
  const [[replayId, auditId]] = sqlRows(
    `SELECT (SELECT COALESCE(MAX(id), 0) FROM ${REPLAY_TABLE}), (SELECT COALESCE(MAX(id), 0) FROM ${AUDIT_TABLE});`,
  );
  return { replayId: Number(replayId), auditId: Number(auditId) };
}

// Finished replay rows with past 31-day ranges, spread over time, requested by an e2e- email.
export function seedOtelReplayRequests(count: number, status: SeededReplayStatus): void {
  const todayStart = Math.floor(Date.now() / DAY_MS) * DAY_MS;
  const stamp = (ms: number) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
  const values = Array.from({ length: count }, (_, index) => {
    const start = todayStart - (40 + index) * DAY_MS;
    const end = start + 31 * DAY_MS;
    const created = Date.now() - (index + 1) * 3_600_000;
    const failed = status === 'failed';
    return `(${[
      sqlString(stamp(created)),
      sqlString(stamp(created)),
      sqlString(stamp(start)),
      sqlString(stamp(end)),
      sqlString(status),
      20 + index,
      index % 4,
      failed ? sqlString('seeded failure') : 'NULL',
      sqlString(stamp(created + 60_000)),
      sqlString(SEEDED_REPLAY_REQUESTER),
    ].join(', ')})`;
  });
  runSql(
    `INSERT INTO ${REPLAY_TABLE} (created_at, updated_at, range_start, range_end, status, replayed_batches, skipped_batches, error_message, completed_at, requested_by) VALUES ${values.join(', ')};`,
  );
}

// Removes the replay rows that match any filter field, and the audit rows of those connections or created after the marks.
export function deleteOtelReplayRows({
  pending,
  requestedByLike,
  connectionIds = [],
  after,
}: OtelReplayRowFilter): void {
  const replayConditions = [
    pending && `status = 'pending'`,
    requestedByLike && `requested_by LIKE ${sqlString(requestedByLike)}`,
    connectionIds.length > 0 && `requested_for_connection_id IN (${connectionIds.map(Number).join(', ')})`,
    after && `id > ${Number(after.replayId)}`,
  ].filter(Boolean);
  const auditConditions = [
    connectionIds.length > 0 && `connection_id IN (${connectionIds.map(Number).join(', ')})`,
    after && `id > ${Number(after.auditId)}`,
  ].filter(Boolean);
  const statements = [
    replayConditions.length > 0 && `DELETE FROM ${REPLAY_TABLE} WHERE ${replayConditions.join(' OR ')};`,
    auditConditions.length > 0 && `DELETE FROM ${AUDIT_TABLE} WHERE ${auditConditions.join(' OR ')};`,
  ].filter(Boolean);
  if (statements.length > 0) runSql(statements.join('\n'));
}
