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

// Verifies the /otel page renders the degraded and unhealthy ingestion states computed by the backend.
import { test, expect } from '../fixtures';
import { loginAsAdmin } from '../auth-helpers';
import { runSql } from '../support/db';
import { OtelPage } from '../support/pages/otel';

const CLEANUP_SQL = `DELETE FROM _raw_otel_claude_code_metric_batches
  WHERE payload_sha256 = UNHEX(SHA2('e2e-health-degraded',256))
     OR payload_sha256 IN (SELECT UNHEX(SHA2(CONCAT('e2e-health-perr-', seq),256)) FROM (SELECT 1 AS seq UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5) seqs);`;

test.describe.serial('Ingestion health panel renders degraded/unhealthy states', () => {
  test.beforeEach(async ({ context }) => {
    await loginAsAdmin(context);
  });

  test.afterAll(() => {
    runSql(CLEANUP_SQL);
  });

  test('degraded backlog age is visible on /otel', async ({ page }) => {
    // A retryable batch with a future next_attempt_at counts as backlog but is not claimed by the live converter.
    runSql(`
      SET @now := UTC_TIMESTAMP(3);
      INSERT INTO _raw_otel_claude_code_metric_batches
        (created_at, updated_at, received_at, payload_sha256, payload_proto, payload_schema_version, resource_count, datapoint_count, status, attempt_count, next_attempt_at)
      VALUES (@now, @now, DATE_SUB(@now, INTERVAL 6 MINUTE), UNHEX(SHA2('e2e-health-degraded',256)), 0x0a00, 1, 1, 1, 'retryable_error', 1, DATE_ADD(@now, INTERVAL 1 HOUR));
    `);
    const otel = new OtelPage(page);
    await otel.open();
    await expect(otel.ingestionHeading).toBeVisible();
    await expect(otel.healthStatus('degraded')).toBeVisible({ timeout: 15_000 });
    await expect(otel.healthMessage('raw backlog is older than 5 minutes')).toBeVisible();
    runSql(CLEANUP_SQL);
  });

  test('unhealthy permanent-error count is visible on /otel', async ({ page }) => {
    runSql(`
      SET @now := UTC_TIMESTAMP(3);
      INSERT INTO _raw_otel_claude_code_metric_batches
        (created_at, updated_at, received_at, payload_sha256, payload_proto, payload_schema_version, resource_count, datapoint_count, status, attempt_count, processed_at, processing_error_code)
      SELECT @now, @now, DATE_SUB(@now, INTERVAL seq MINUTE), UNHEX(SHA2(CONCAT('e2e-health-perr-', seq),256)), 0x0a00,1,1,1,'permanent_error',12, DATE_SUB(@now, INTERVAL seq MINUTE), 'invalid_payload'
      FROM (SELECT 1 AS seq UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5) seqs;
    `);
    const otel = new OtelPage(page);
    await otel.open();
    await expect(otel.ingestionHeading).toBeVisible();
    await expect(otel.healthStatus('unhealthy')).toBeVisible({ timeout: 15_000 });
    await expect(otel.healthMessage('five or more permanent errors occurred in the last 24 hours')).toBeVisible();
    runSql(CLEANUP_SQL);
  });
});
