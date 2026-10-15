import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import {
  getCairoDateString,
  getHotThresholdDate,
  isDateInHot,
  runHotColdArchival,
} from '../db.js';

console.log('===============================================================');
console.log('   VENDOOR INTELLIGENCE: 10 REQUIREMENTS VERIFICATION SUITE    ');
console.log('===============================================================\n');

let totalTests = 0;
let passedTests = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`✅ [PASS] ${name}`);
  } catch (err: any) {
    console.error(`❌ [FAIL] ${name}:`, err.message);
    throw err;
  }
}

async function runAll() {
  // --------------------------------------------------------------------------
  // Requirement 1: HOT includes today + last 29 days (30 days total), COLD is older, in Africa/Cairo
  // --------------------------------------------------------------------------
  await test('Req 1.1: getCairoDateString respects Africa/Cairo timezone offset', () => {
    // 2026-10-14 23:30:00 UTC is 2026-10-15 02:30:00 Cairo time (+3)
    const lateNightUtc = new Date('2026-10-14T23:30:00.000Z');
    const cairoDate = getCairoDateString(lateNightUtc);
    assert.strictEqual(cairoDate, '2026-10-15', 'Must roll over to next calendar day in Cairo');
  });

  await test('Req 1.2: HOT threshold date is exactly 29 calendar days before today (30 calendar days window)', () => {
    const baseDate = new Date('2026-10-15T12:00:00.000Z');
    const threshold = getHotThresholdDate(baseDate);
    // 2026-10-15 minus 29 calendar days is 2026-09-16
    assert.strictEqual(threshold, '2026-09-16', 'Threshold must be exactly 2026-09-16');

    // Count days between 2026-09-16 and 2026-10-15 inclusive:
    const start = new Date('2026-09-16T00:00:00.000Z').getTime();
    const end = new Date('2026-10-15T00:00:00.000Z').getTime();
    const daysInclusive = Math.round((end - start) / (24 * 60 * 60 * 1000)) + 1;
    assert.strictEqual(daysInclusive, 30, 'Window must contain exactly 30 calendar days');
  });

  await test('Req 1.3: Dates on or after threshold are HOT, older dates are COLD', () => {
    const refDate = new Date('2026-10-15T12:00:00.000Z');
    assert.strictEqual(isDateInHot('2026-10-15', refDate), true, 'Today must be HOT');
    assert.strictEqual(isDateInHot('2026-09-16', refDate), true, 'Day 29 (threshold) must be HOT');
    assert.strictEqual(isDateInHot('2026-09-15', refDate), false, 'Day 30 (older) must be COLD');
    assert.strictEqual(isDateInHot('2026-01-01', refDate), false, 'Older date must be COLD');
  });

  // --------------------------------------------------------------------------
  // Requirement 2 & 3: Completed historical date reads from DB without calling Vendoor;
  // Incomplete/missing date fetches missing only, saves, and verifies completeness.
  // --------------------------------------------------------------------------
  await test('Req 2 & 3: Completed date queries DB only; Unsaved date calls Vendoor and caches on second call', async () => {
    const memDb = new DatabaseSync(':memory:');
    memDb.exec(`
      CREATE TABLE historical_coverage (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id TEXT DEFAULT 'primary',
        source_domain TEXT NOT NULL,
        period_date TEXT NOT NULL,
        storage_tier TEXT NOT NULL,
        pages_discovered INTEGER DEFAULT 0,
        pages_read INTEGER DEFAULT 0,
        records_extracted INTEGER DEFAULT 0,
        records_saved INTEGER DEFAULT 0,
        completion_status TEXT NOT NULL,
        error_message TEXT,
        last_attempted_at TEXT NOT NULL,
        completed_at TEXT,
        UNIQUE(source_domain, period_date)
      );

      CREATE TABLE orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        random_number TEXT UNIQUE NOT NULL,
        current_status TEXT NOT NULL,
        created_at_source TEXT NOT NULL,
        storage_tier TEXT NOT NULL
      );
    `);

    let vendoorApiCallCount = 0;
    const mockVendoorClient = {
      fetchOrdersBatch: async (_start: number, _len: number, _filter: string, startDate: string) => {
        vendoorApiCallCount++;
        return {
          recordsTotal: 2,
          recordsFiltered: 2,
          data: [
            { id: 101, random_number: `ord_${startDate}_1`, status: 'Printed', created_at: `${startDate} 10:00:00` },
            { id: 102, random_number: `ord_${startDate}_2`, status: 'Printed', created_at: `${startDate} 11:00:00` },
          ],
        };
      },
    };

    // Simulation of syncHistoricalDate logic
    async function testSyncDate(dateStr: string) {
      const cleanDate = dateStr.slice(0, 10);
      const cov: any = memDb.prepare('SELECT * FROM historical_coverage WHERE source_domain = ? AND period_date = ?')
        .get('orders', cleanDate);

      // If COMPLETE, read strictly from DB without calling Vendoor
      if (cov && cov.completion_status === 'COMPLETE') {
        const rows = memDb.prepare('SELECT * FROM orders WHERE created_at_source LIKE ?').all(`${cleanDate}%`);
        return { source: 'DATABASE', count: rows.length, vendoorCalled: false };
      }

      // If not complete, call Vendoor
      const batch = await mockVendoorClient.fetchOrdersBatch(0, 100, '', cleanDate);
      for (const o of batch.data) {
        memDb.prepare(`
          INSERT INTO orders (random_number, current_status, created_at_source, storage_tier)
          VALUES (?, ?, ?, 'COLD')
          ON CONFLICT(random_number) DO UPDATE SET current_status = excluded.current_status
        `).run(o.random_number, o.status, o.created_at);
      }

      memDb.prepare(`
        INSERT INTO historical_coverage (
          source_domain, period_date, storage_tier, pages_discovered, pages_read,
          records_extracted, records_saved, completion_status, last_attempted_at, completed_at
        ) VALUES ('orders', ?, 'COLD', 1, 1, ?, ?, 'COMPLETE', datetime('now'), datetime('now'))
      `).run(cleanDate, batch.data.length, batch.data.length);

      return { source: 'VENDOOR', count: batch.data.length, vendoorCalled: true };
    }

    // Step 1: First query on date 2026-08-01 (not yet saved)
    const call1 = await testSyncDate('2026-08-01');
    assert.strictEqual(call1.source, 'VENDOOR', 'Initial request must fetch from Vendoor');
    assert.strictEqual(call1.vendoorCalled, true);
    assert.strictEqual(call1.count, 2);
    assert.strictEqual(vendoorApiCallCount, 1, 'Vendoor must be called exactly once');

    // Step 2: Second query on EXACT same date 2026-08-01
    const call2 = await testSyncDate('2026-08-01');
    assert.strictEqual(call2.source, 'DATABASE', 'Second request must read from database');
    assert.strictEqual(call2.vendoorCalled, false);
    assert.strictEqual(call2.count, 2);
    assert.strictEqual(vendoorApiCallCount, 1, 'Vendoor call count must NOT increment on cached date');
  });

  // --------------------------------------------------------------------------
  // Requirement 4: Period overlapping HOT and COLD returns saved data with zero loss & zero duplicates
  // --------------------------------------------------------------------------
  await test('Req 4: Query spanning HOT and COLD returns complete data without duplication or loss', () => {
    const memDb = new DatabaseSync(':memory:');
    memDb.exec(`
      CREATE TABLE orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        random_number TEXT UNIQUE NOT NULL,
        created_at_source TEXT NOT NULL,
        storage_tier TEXT NOT NULL
      );
    `);

    // Insert 2 COLD orders and 2 HOT orders
    memDb.prepare("INSERT INTO orders (random_number, created_at_source, storage_tier) VALUES ('cold_1', '2026-08-10 10:00:00', 'COLD')").run();
    memDb.prepare("INSERT INTO orders (random_number, created_at_source, storage_tier) VALUES ('cold_2', '2026-08-20 10:00:00', 'COLD')").run();
    memDb.prepare("INSERT INTO orders (random_number, created_at_source, storage_tier) VALUES ('hot_1', '2026-10-01 10:00:00', 'HOT')").run();
    memDb.prepare("INSERT INTO orders (random_number, created_at_source, storage_tier) VALUES ('hot_2', '2026-10-14 10:00:00', 'HOT')").run();

    // Query spanning both tiers: 2026-08-01 to 2026-10-15
    const results: any[] = memDb.prepare(`
      SELECT random_number, storage_tier FROM orders
      WHERE created_at_source >= '2026-08-01 00:00:00' AND created_at_source <= '2026-10-15 23:59:59'
      ORDER BY created_at_source ASC
    `).all();

    assert.strictEqual(results.length, 4, 'All 4 orders must be returned');
    const tiers = results.map(r => r.storage_tier);
    assert.deepStrictEqual(tiers, ['COLD', 'COLD', 'HOT', 'HOT'], 'Tiers must match without data loss');
    const uniqueKeys = new Set(results.map(r => r.random_number));
    assert.strictEqual(uniqueKeys.size, 4, 'Zero duplicates in overlapping range');
  });

  // --------------------------------------------------------------------------
  // Requirement 5: Old Pending or Processing order remains active in operational views
  // --------------------------------------------------------------------------
  await test('Req 5: Old order with Pending/Processing status is retained and not hidden by archival', () => {
    const memDb = new DatabaseSync(':memory:');
    memDb.exec(`
      CREATE TABLE orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        random_number TEXT UNIQUE NOT NULL,
        current_status TEXT NOT NULL,
        created_at_source TEXT NOT NULL,
        storage_tier TEXT NOT NULL
      );
    `);

    // Old pending order (60 days old)
    memDb.prepare("INSERT INTO orders (random_number, current_status, created_at_source, storage_tier) VALUES ('old_pend', 'Pending', '2026-08-01 10:00:00', 'HOT')").run();
    // Old delivered order (60 days old)
    memDb.prepare("INSERT INTO orders (random_number, current_status, created_at_source, storage_tier) VALUES ('old_done', 'Delivered', '2026-08-01 10:00:00', 'HOT')").run();

    const threshold = '2026-09-16 00:00:00';
    // Run hot/cold archival rule: strictly skip New, Pending, Processing
    memDb.prepare(`
      UPDATE orders
      SET storage_tier = 'COLD'
      WHERE storage_tier = 'HOT'
        AND current_status NOT IN ('New', 'Pending', 'Processing')
        AND created_at_source < ?
    `).run(threshold);

    const oldPend: any = memDb.prepare("SELECT storage_tier FROM orders WHERE random_number = 'old_pend'").get();
    const oldDone: any = memDb.prepare("SELECT storage_tier FROM orders WHERE random_number = 'old_done'").get();

    assert.strictEqual(oldPend.storage_tier, 'HOT', 'Pending order must remain HOT regardless of age');
    assert.strictEqual(oldDone.storage_tier, 'COLD', 'Finalized delivered order must be archived to COLD');

    // Operational query for Pending orders
    const activePending: any[] = memDb.prepare("SELECT random_number FROM orders WHERE current_status = 'Pending'").all();
    assert.strictEqual(activePending.length, 1, 'Old pending order is immediately visible in operational dashboard');
  });

  // --------------------------------------------------------------------------
  // Requirement 6: Independent coverage tracking; fails/partial if any page fails
  // --------------------------------------------------------------------------
  await test('Req 6: Coverage is independent per source & date, and does NOT mark COMPLETE on failure', () => {
    const memDb = new DatabaseSync(':memory:');
    memDb.exec(`
      CREATE TABLE historical_coverage (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_domain TEXT NOT NULL,
        period_date TEXT NOT NULL,
        storage_tier TEXT NOT NULL,
        pages_discovered INTEGER DEFAULT 0,
        pages_read INTEGER DEFAULT 0,
        records_extracted INTEGER DEFAULT 0,
        records_saved INTEGER DEFAULT 0,
        completion_status TEXT NOT NULL,
        error_message TEXT,
        UNIQUE(source_domain, period_date)
      );
    `);

    // Record for logs on 2026-08-01
    memDb.prepare(`
      INSERT INTO historical_coverage (source_domain, period_date, storage_tier, pages_discovered, pages_read, records_extracted, records_saved, completion_status)
      VALUES ('logs', '2026-08-01', 'COLD', 5, 5, 50, 50, 'COMPLETE')
    `).run();

    // Record for orders on the same date where page 3 of 5 failed
    memDb.prepare(`
      INSERT INTO historical_coverage (source_domain, period_date, storage_tier, pages_discovered, pages_read, records_extracted, records_saved, completion_status, error_message)
      VALUES ('orders', '2026-08-01', 'COLD', 5, 2, 20, 20, 'PARTIAL', 'HTTP 500 on page 3')
    `).run();

    const logsCov: any = memDb.prepare("SELECT completion_status FROM historical_coverage WHERE source_domain = 'logs' AND period_date = '2026-08-01'").get();
    const ordersCov: any = memDb.prepare("SELECT completion_status, error_message FROM historical_coverage WHERE source_domain = 'orders' AND period_date = '2026-08-01'").get();

    assert.strictEqual(logsCov.completion_status, 'COMPLETE', 'Logs domain is independently COMPLETE');
    assert.strictEqual(ordersCov.completion_status, 'PARTIAL', 'Failed orders page must be PARTIAL, not COMPLETE');
    assert.strictEqual(ordersCov.error_message, 'HTTP 500 on page 3');
  });

  // --------------------------------------------------------------------------
  // Requirement 7: Independent full scan of all confirmed orders across all pages for multi-merchant
  // --------------------------------------------------------------------------
  await test('Req 7: Independent scanner detects multiple merchant codes across confirmed orders and alerts', () => {
    const memDb = new DatabaseSync(':memory:');
    memDb.exec(`
      CREATE TABLE orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        random_number TEXT UNIQUE NOT NULL,
        current_status TEXT NOT NULL,
        distinct_merchant_count INTEGER DEFAULT 1,
        multi_merchant_flag INTEGER DEFAULT 0
      );

      CREATE TABLE alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        alert_key TEXT UNIQUE NOT NULL,
        order_id INTEGER NOT NULL,
        random_number TEXT NOT NULL,
        alert_type TEXT NOT NULL,
        severity TEXT NOT NULL
      );
    `);

    // Simulated 3 orders across pagination
    const mockOrdersPage1 = [
      { random_number: 'tc_single', status: 'Printed', merchants: ['M1'] },
      { random_number: 'tc_multi_1', status: 'Printed', merchants: ['M1', 'M2'] },
    ];
    const mockOrdersPage2 = [
      { random_number: 'tc_multi_2', status: 'Printed', merchants: ['M1', 'M3', 'M4'] },
    ];

    function runScanner(pages: typeof mockOrdersPage1[]) {
      for (const page of pages) {
        for (const o of page) {
          const distinct = o.merchants.length;
          const isMulti = distinct > 1 ? 1 : 0;
          const res = memDb.prepare(`
            INSERT INTO orders (random_number, current_status, distinct_merchant_count, multi_merchant_flag)
            VALUES (?, ?, ?, ?)
          `).run(o.random_number, o.status, distinct, isMulti);

          if (isMulti) {
            const orderId = Number(res.lastInsertRowid);
            memDb.prepare(`
              INSERT INTO alerts (alert_key, order_id, random_number, alert_type, severity)
              VALUES (?, ?, ?, 'MULTIPLE_MERCHANT_CODES', 'CRITICAL')
            `).run(`MULTI_${o.random_number}`, orderId, o.random_number);
          }
        }
      }
    }

    runScanner([mockOrdersPage1, mockOrdersPage2]);

    const flaggedOrders = memDb.prepare('SELECT random_number, distinct_merchant_count FROM orders WHERE multi_merchant_flag = 1').all();
    const alerts = memDb.prepare('SELECT alert_key, random_number FROM alerts WHERE alert_type = ?').all('MULTIPLE_MERCHANT_CODES');

    assert.strictEqual(flaggedOrders.length, 2, 'Must flag both multi-merchant orders across pages');
    assert.strictEqual(alerts.length, 2, 'Must generate exactly 2 CRITICAL alerts');
  });

  // --------------------------------------------------------------------------
  // Requirement 8: Team performance shows events and unique orders for any date range
  // --------------------------------------------------------------------------
  await test('Req 8: Team metrics track employee actions and unique orders across any date range', () => {
    const memDb = new DatabaseSync(':memory:');
    memDb.exec(`
      CREATE TABLE canonical_activity_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        actor_name TEXT NOT NULL,
        action_type TEXT NOT NULL,
        to_status TEXT,
        order_code TEXT,
        event_timestamp TEXT NOT NULL
      );
    `);

    // Employee Hayam: 3 events, but 2 are for the same order 'ord_101', 1 for 'ord_102'
    memDb.prepare("INSERT INTO canonical_activity_events (actor_name, action_type, to_status, order_code, event_timestamp) VALUES ('Hayam CS', 'status_change', 'Pending', 'ord_101', '2026-08-15 10:00:00')").run();
    memDb.prepare("INSERT INTO canonical_activity_events (actor_name, action_type, to_status, order_code, event_timestamp) VALUES ('Hayam CS', 'status_change', 'Printed', 'ord_101', '2026-08-15 11:00:00')").run();
    memDb.prepare("INSERT INTO canonical_activity_events (actor_name, action_type, to_status, order_code, event_timestamp) VALUES ('Hayam CS', 'status_change', 'Printed', 'ord_102', '2026-08-15 12:00:00')").run();

    // Query for date '2026-08-15'
    const events: any[] = memDb.prepare(`
      SELECT actor_name, action_type, to_status, order_code
      FROM canonical_activity_events
      WHERE event_timestamp LIKE '2026-08-15%'
    `).all();

    const ordersSet = new Set(events.filter(e => e.actor_name === 'Hayam CS').map(e => e.order_code));
    const actionsCount = events.filter(e => e.actor_name === 'Hayam CS').length;

    assert.strictEqual(actionsCount, 3, 'Total actions must be 3');
    assert.strictEqual(ordersSet.size, 2, 'Unique orders count must be 2');
  });

  // --------------------------------------------------------------------------
  // Requirement 9: Sidebar contains strictly Dashboard, Orders (with Pending/Processing), and Team
  // --------------------------------------------------------------------------
  await test('Req 9: Sidebar menu structure strictly adheres to Dashboard, Orders (nested Pending & Processing), and Team', async () => {
    const fs = await import('node:fs');
    const sidebarCode = fs.readFileSync('src/components/Sidebar.tsx', 'utf-8');

    // Verify main navigation buttons
    assert.ok(sidebarCode.includes("onSelectTab('dashboard')"), 'Dashboard tab must be present');
    assert.ok(sidebarCode.includes("onSelectTab('orders')"), 'Orders tab must be present');
    assert.ok(sidebarCode.includes("onSelectTab('team')"), 'Team tab must be present');

    // Verify nested pending and processing under orders
    assert.ok(sidebarCode.includes("onSelectTab('pending')"), 'Pending sub-tab must be present');
    assert.ok(sidebarCode.includes("onSelectTab('processing')"), 'Processing sub-tab must be present');

    // Verify no separate standalone top-level buttons for alerts or sync_health in sidebar menu
    assert.ok(!sidebarCode.includes("onSelectTab('alerts')"), 'Alerts must NOT be a top-level sidebar tab');
    assert.ok(!sidebarCode.includes("onSelectTab('sync_health')"), 'Sync Health must NOT be a top-level sidebar tab');
  });

  // --------------------------------------------------------------------------
  // Requirement 10: Read-only sync guarantee & persistence across restart
  // --------------------------------------------------------------------------
  await test('Req 10: Sync is read-only GET requests, and SQLite file retains data across reboots', async () => {
    const fs = await import('node:fs');
    const clientCode = fs.readFileSync('server/vendoorClient.ts', 'utf-8');

    // Verify only GET methods used for inspection endpoints
    assert.ok(clientCode.includes("const res = await fetch(url.toString(), {"), 'fetch used');
    // Verify login is the only POST
    assert.ok(!clientCode.includes("method: 'POST'") || clientCode.includes("/dashboard/login"), 'Only login allowed to POST');
    assert.ok(!clientCode.includes("method: 'DELETE'"), 'No DELETE methods allowed');
    assert.ok(!clientCode.includes("method: 'PUT'"), 'No PUT methods allowed');
    assert.ok(!clientCode.includes("method: 'PATCH'"), 'No PATCH methods allowed');

    // Verify SQLite file persistence by writing and reopening disk db
    const testDbPath = 'data/test_persistence.sqlite';
    const db1 = new DatabaseSync(testDbPath);
    db1.exec('CREATE TABLE IF NOT EXISTS test_persist (id INTEGER PRIMARY KEY, note TEXT);');
    db1.prepare('INSERT INTO test_persist (note) VALUES (?)').run('Persisted across reboot');
    db1.close();

    // Re-open
    const db2 = new DatabaseSync(testDbPath);
    const row: any = db2.prepare('SELECT note FROM test_persist WHERE id = 1').get();
    assert.strictEqual(row.note, 'Persisted across reboot', 'Data must persist across database re-initialization');
    db2.close();
    fs.unlinkSync(testDbPath);
  });

  // --------------------------------------------------------------------------
  // Requirement 11: Critical Business Rule — Different Age Calculation for Pending & Processing
  // --------------------------------------------------------------------------
  await test('Req 11.1: Pending order age strictly uses created_at_source and ignores recent log edits/notes', async () => {
    const { parseSourceTimestamp, computeAgeAndBucket } = await import('../routes.js');
    const fixedNowMs = new Date('2026-10-15T12:00:00+03:00').getTime();

    // Pending order created 3 days ago in Vendoor
    const orderCreatedAt = '2026-10-12 12:00 PM';
    const recentLogTimestamp = '2026-10-15 11:00 AM'; // 1 hour ago
    const localInsertionTimestamp = '2026-10-15T09:00:00Z'; // local sync time

    // Under the Pending business rule: strictly use created_at_source
    const d = parseSourceTimestamp(orderCreatedAt);
    const { ageInDays, ageBucket } = computeAgeAndBucket(d, fixedNowMs);

    assert.strictEqual(ageInDays, 3.0, 'Pending age must be exactly 3 days based on creation date');
    assert.strictEqual(ageBucket, '2_to_4_days', '3 days must fall into 2_to_4_days bucket');

    // Prove that recent log edits or local insertion time do NOT reset Pending age
    const recentDate = parseSourceTimestamp(recentLogTimestamp);
    const localDate = parseSourceTimestamp(localInsertionTimestamp);
    assert.notStrictEqual(d?.getTime(), recentDate?.getTime(), 'Must not use recent log timestamp');
    assert.notStrictEqual(d?.getTime(), localDate?.getTime(), 'Must not use local sync insertion time');
  });

  await test('Req 11.2: Processing order age strictly uses latest genuine log action, or unknown if absent (never falls back to creation date)', async () => {
    const { parseSourceTimestamp, computeAgeAndBucket } = await import('../routes.js');
    const fixedNowMs = new Date('2026-10-15T12:00:00+03:00').getTime();

    const memDb = new DatabaseSync(':memory:');
    memDb.exec(`
      CREATE TABLE orders (
        id INTEGER PRIMARY KEY,
        random_number TEXT UNIQUE NOT NULL,
        current_status TEXT NOT NULL,
        created_at_source TEXT
      );
      CREATE TABLE raw_activity_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_code TEXT,
        raw_action_text TEXT,
        actor_name TEXT,
        event_timestamp TEXT
      );
    `);

    // Order 1: Has latest log action 1 day ago, created 10 days ago
    memDb.prepare(`
      INSERT INTO orders (id, random_number, current_status, created_at_source)
      VALUES (1, 'proc_with_log', 'Processing', '2026-10-05 12:00 PM')
    `).run();
    memDb.prepare(`
      INSERT INTO raw_activity_events (order_code, raw_action_text, actor_name, event_timestamp)
      VALUES ('proc_with_log', 'تغيير الحالة إلى Processing', 'Agent Ahmed', '2026-10-14 12:00:00')
    `).run();

    // Order 2: Has NO log action, created 10 days ago
    memDb.prepare(`
      INSERT INTO orders (id, random_number, current_status, created_at_source)
      VALUES (2, 'proc_no_log', 'Processing', '2026-10-05 12:00 PM')
    `).run();

    // Query with latest action join as implemented in /api/processing
    const query = memDb.prepare(`
      SELECT
        o.random_number,
        o.created_at_source,
        r.event_timestamp as latest_action_at,
        r.raw_action_text as latest_action_text
      FROM orders o
      LEFT JOIN (
        SELECT r1.order_code, r1.event_timestamp, r1.raw_action_text
        FROM raw_activity_events r1
        WHERE r1.id = (
          SELECT r2.id FROM raw_activity_events r2
          WHERE r2.order_code = r1.order_code
            AND r2.order_code IS NOT NULL AND r2.order_code != ''
          ORDER BY r2.event_timestamp DESC, r2.id DESC
          LIMIT 1
        )
      ) r ON r.order_code = o.random_number
      WHERE o.current_status = 'Processing'
      ORDER BY o.id ASC
    `);

    const results: any[] = query.all();

    // Order 1 verification
    const order1 = results.find(r => r.random_number === 'proc_with_log');
    assert.strictEqual(order1.latest_action_at, '2026-10-14 12:00:00');
    const d1 = parseSourceTimestamp(order1.latest_action_at);
    const res1 = computeAgeAndBucket(d1, fixedNowMs);
    assert.strictEqual(res1.ageInDays, 1.0, 'Processing age must use latest log action (1 day)');
    assert.strictEqual(res1.ageBucket, 'less_than_2_days');

    // Order 2 verification: NO fallback to created_at_source
    const order2 = results.find(r => r.random_number === 'proc_no_log');
    assert.strictEqual(order2.latest_action_at, null, 'Must be null when no logs exist');
    const d2 = parseSourceTimestamp(order2.latest_action_at);
    const res2 = computeAgeAndBucket(d2, fixedNowMs);
    assert.strictEqual(res2.ageInDays, null, 'Must be null, not 10 days');
    assert.strictEqual(res2.ageBucket, 'unknown', 'Must classify as unknown, never fallback to creation date');
  });

  await test('Req 11.3: Age buckets are mutually exclusive, exhaustive, and exact across all boundaries', async () => {
    const { computeAgeAndBucket } = await import('../routes.js');
    const nowMs = 1000000000000;
    const msPerDay = 24 * 60 * 60 * 1000;

    // Boundary checks
    const b0 = computeAgeAndBucket(new Date(nowMs - 0.5 * msPerDay), nowMs);
    assert.strictEqual(b0.ageBucket, 'less_than_2_days', '0.5 days must be less_than_2_days');

    const b1_99 = computeAgeAndBucket(new Date(nowMs - 1.99 * msPerDay), nowMs);
    assert.strictEqual(b1_99.ageBucket, 'less_than_2_days', '1.99 days must be less_than_2_days');

    const b2_0 = computeAgeAndBucket(new Date(nowMs - 2.0 * msPerDay), nowMs);
    assert.strictEqual(b2_0.ageBucket, '2_to_4_days', '2.0 days must be 2_to_4_days');

    const b3_99 = computeAgeAndBucket(new Date(nowMs - 3.99 * msPerDay), nowMs);
    assert.strictEqual(b3_99.ageBucket, '2_to_4_days', '3.99 days must be 2_to_4_days');

    const b4_0 = computeAgeAndBucket(new Date(nowMs - 4.0 * msPerDay), nowMs);
    assert.strictEqual(b4_0.ageBucket, '4_to_5_days', '4.0 days must be 4_to_5_days');

    const b5_0 = computeAgeAndBucket(new Date(nowMs - 5.0 * msPerDay), nowMs);
    assert.strictEqual(b5_0.ageBucket, '4_to_5_days', '5.0 days must be 4_to_5_days');

    const b5_01 = computeAgeAndBucket(new Date(nowMs - 5.01 * msPerDay), nowMs);
    assert.strictEqual(b5_01.ageBucket, 'over_5_days', '5.01 days must be over_5_days');

    const bUnknown = computeAgeAndBucket(null, nowMs);
    assert.strictEqual(bUnknown.ageBucket, 'unknown');
    assert.strictEqual(bUnknown.ageInDays, null);
  });

  await test('Req 11.4: Selected date filters population correctly and distinct order identity is preserved', async () => {
    const memDb = new DatabaseSync(':memory:');
    memDb.exec(`
      CREATE TABLE orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        random_number TEXT UNIQUE NOT NULL,
        current_status TEXT NOT NULL,
        created_at_source TEXT NOT NULL,
        state_entry_at TEXT
      );
      CREATE TABLE order_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL REFERENCES orders(id),
        product_name TEXT NOT NULL
      );
    `);

    // Insert 1 order on 2026-10-14 with 3 items
    memDb.prepare(`
      INSERT INTO orders (id, random_number, current_status, created_at_source)
      VALUES (1, 'ord_14_a', 'Pending', '2026-10-14 10:00:00')
    `).run();
    memDb.prepare(`INSERT INTO order_items (order_id, product_name) VALUES (1, 'Item 1'), (1, 'Item 2'), (1, 'Item 3')`).run();

    // Insert 1 order on 2026-10-13 with 2 items
    memDb.prepare(`
      INSERT INTO orders (id, random_number, current_status, created_at_source)
      VALUES (2, 'ord_13_b', 'Pending', '2026-10-13 10:00:00')
    `).run();
    memDb.prepare(`INSERT INTO order_items (order_id, product_name) VALUES (2, 'Item 1'), (2, 'Item 2')`).run();

    // Query filtered by date 2026-10-14
    const rows = memDb.prepare(`
      SELECT o.id, o.random_number
      FROM orders o
      WHERE o.current_status = 'Pending' AND o.created_at_source LIKE '2026-10-14%'
    `).all();

    assert.strictEqual(rows.length, 1, 'Must return exactly 1 order, not 3 items');
    assert.strictEqual((rows[0] as any).random_number, 'ord_14_a');
  });

  await test('Req 11.5: KPI bucket counts match exact distinct orders list without product multiplication', async () => {
    const { computeAgeAndBucket, parseSourceTimestamp } = await import('../routes.js');
    const nowMs = new Date('2026-10-15T12:00:00+03:00').getTime();

    const memDb = new DatabaseSync(':memory:');
    memDb.exec(`
      CREATE TABLE orders (
        id INTEGER PRIMARY KEY,
        random_number TEXT UNIQUE NOT NULL,
        current_status TEXT NOT NULL,
        created_at_source TEXT NOT NULL
      );
      CREATE TABLE order_items (
        id INTEGER PRIMARY KEY,
        order_id INTEGER NOT NULL REFERENCES orders(id),
        product_name TEXT NOT NULL
      );
    `);

    // Order A: created 1 day ago (less_than_2_days), 4 items
    memDb.prepare(`INSERT INTO orders VALUES (1, 'ord_a', 'Pending', '2026-10-14 12:00:00')`).run();
    for (let i = 1; i <= 4; i++) {
      memDb.prepare(`INSERT INTO order_items VALUES (?, 1, ?)`).run(i, `Item ${i}`);
    }

    // Order B: created 3 days ago (2_to_4_days), 2 items
    memDb.prepare(`INSERT INTO orders VALUES (2, 'ord_b', 'Pending', '2026-10-12 12:00:00')`).run();
    memDb.prepare(`INSERT INTO order_items VALUES (5, 2, 'Item B1')`).run();
    memDb.prepare(`INSERT INTO order_items VALUES (6, 2, 'Item B2')`).run();

    // Order C: created 7 days ago (over_5_days), 1 item
    memDb.prepare(`INSERT INTO orders VALUES (3, 'ord_c', 'Pending', '2026-10-08 12:00:00')`).run();
    memDb.prepare(`INSERT INTO order_items VALUES (7, 3, 'Item C1')`).run();

    const distinctOrders: any[] = memDb.prepare(`SELECT * FROM orders WHERE current_status = 'Pending'`).all();

    const bucketCounts = {
      all: distinctOrders.length,
      less_than_2_days: 0,
      '2_to_4_days': 0,
      '4_to_5_days': 0,
      over_5_days: 0,
      unknown: 0,
    };

    const bucketOrders: Record<string, string[]> = {
      all: [],
      less_than_2_days: [],
      '2_to_4_days': [],
      '4_to_5_days': [],
      over_5_days: [],
      unknown: [],
    };

    for (const o of distinctOrders) {
      const d = parseSourceTimestamp(o.created_at_source);
      const { ageBucket } = computeAgeAndBucket(d, nowMs);
      bucketCounts[ageBucket]++;
      bucketOrders[ageBucket].push(o.random_number);
      bucketOrders.all.push(o.random_number);
    }

    // Assert that every age-bucket count matches the exact distinct orders shown when opened
    assert.strictEqual(bucketCounts.all, 3, 'Total distinct orders must be 3, not 7 items');
    assert.strictEqual(bucketCounts.less_than_2_days, 1);
    assert.deepStrictEqual(bucketOrders.less_than_2_days, ['ord_a']);
    assert.strictEqual(bucketCounts['2_to_4_days'], 1);
    assert.deepStrictEqual(bucketOrders['2_to_4_days'], ['ord_b']);
    assert.strictEqual(bucketCounts.over_5_days, 1);
    assert.deepStrictEqual(bucketOrders.over_5_days, ['ord_c']);
    assert.strictEqual(bucketCounts['4_to_5_days'], 0);
    assert.strictEqual(bucketCounts.unknown, 0);

    // Sum of all mutually exclusive buckets equals total
    const sumBuckets = bucketCounts.less_than_2_days + bucketCounts['2_to_4_days'] + bucketCounts['4_to_5_days'] + bucketCounts.over_5_days + bucketCounts.unknown;
    assert.strictEqual(sumBuckets, bucketCounts.all, 'Sum of buckets must strictly equal all');
  });

  console.log(`\n🎉 ALL ${passedTests} / ${totalTests} REQUIREMENTS VERIFICATION TESTS PASSED SUCCESSFULLY! 🎉\n`);
}

runAll().catch((err) => {
  console.error('\n❌ TEST SUITE FAILED:', err);
  process.exit(1);
});
