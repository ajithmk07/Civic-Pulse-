import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createDatabaseConnection, initializeSchema } from '../server/database.ts';
import { updateReportWorkflow } from '../server/services/assignment_service.ts';
import {
  getDashboardKpis,
  getReportDetail,
  listReports,
  loadDemoDataset,
  submitCitizenReport,
} from '../server/services/report_service.ts';

test('Database initializes cleanly and tolerates repeated initialization', () => {
  const db = createDatabaseConnection(':memory:');
  initializeSchema(db);
  initializeSchema(db);

  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table'")
    .all() as Array<{ name: string }>;
  const names = new Set(tables.map((t) => t.name));

  assert.ok(names.has('reports'));
  assert.ok(names.has('duplicate_links'));
  assert.ok(names.has('activity_log'));
  assert.ok(names.has('hotspots'));
  assert.ok(names.has('departments'));
});

test('Complaint submission, retrieval, persistent status update, and activity log work', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'civicpulse-db-'));
  const dbPath = path.join(tmpDir, 'test.db');
  const db = createDatabaseConnection(dbPath);

  const created = await submitCitizenReport(
    db,
    {
      title: 'Broken streetlight outside Station Square exit',
      description:
        'Three streetlights outside the Station Square commuter walkway are completely dark at night.',
      category: 'Streetlight',
      latitude: 12.9758,
      longitude: 77.5872,
      locationName: 'Station Square',
    },
    ['/uploads/test_photo.png']
  );

  assert.match(created.report.reportId, /^CP-2026-\d{4}$/);
  assert.equal(created.report.status, 'Submitted');
  assert.deepEqual(created.report.imagePaths, ['/uploads/test_photo.png']);
  assert.equal(created.report.activityLog.length, 1);

  const updated = updateReportWorkflow(db, created.report.reportId, {
    status: 'In Progress',
    department: 'Electrical & Streetlight Division',
    assignedStaff: 'Tech. V. Prasad',
    publicUpdate: 'Repair van dispatched to inspect feeder cable.',
    internalNote: 'Check fuse pillar #11B.',
    changedBy: 'Duty Officer Rao',
  });

  assert.equal(updated.status, 'In Progress');
  assert.equal(updated.department, 'Electrical & Streetlight Division');
  assert.equal(updated.assignedStaff, 'Tech. V. Prasad');
  assert.equal(updated.activityLog.length, 2);

  // Re-open SQLite file from disk to verify true persistence
  const reopenedDb = createDatabaseConnection(dbPath);
  const persisted = getReportDetail(reopenedDb, created.report.reportId);
  assert.ok(persisted);
  assert.equal(persisted.status, 'In Progress');
  assert.equal(persisted.activityLog[0].newStatus, 'In Progress');
  assert.equal(persisted.activityLog[0].internalNote, 'Check fuse pillar #11B.');

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('Synthetic demo dataset loads >= 50 reports safely without overwriting citizen reports', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'civicpulse-seed-'));
  const db = createDatabaseConnection(':memory:');

  const citizenRes = await submitCitizenReport(db, {
    title: 'Citizen burst water pipe on Orchard Lane',
    description: 'Clean drinking water pipeline burst and leaking across Orchard Lane pavement.',
    category: 'Water Supply',
    latitude: 12.9669,
    longitude: 77.5951,
  });

  const firstLoad = loadDemoDataset(db, {
    uploadsDir: path.join(tmpDir, 'uploads'),
    csvPath: path.join(tmpDir, 'sample_reports.csv'),
  });

  assert.ok(firstLoad.insertedCount >= 50);
  assert.equal(firstLoad.totalReports, firstLoad.insertedCount + 1);
  assert.ok(fs.existsSync(path.join(tmpDir, 'sample_reports.csv')));

  // Second load must insert 0 duplicates and preserve citizen report
  const secondLoad = loadDemoDataset(db, {
    uploadsDir: path.join(tmpDir, 'uploads'),
    csvPath: path.join(tmpDir, 'sample_reports.csv'),
  });
  assert.equal(secondLoad.insertedCount, 0);

  const citizenStillThere = getReportDetail(db, citizenRes.report.reportId);
  assert.ok(citizenStillThere);
  assert.equal(citizenStillThere.isDemo, false);

  const kpis = getDashboardKpis(db);
  assert.ok((kpis.categoryCounts['Road Damage'] ?? 0) >= 15);
  assert.ok((kpis.categoryCounts['Waterlogging'] ?? 0) >= 10);
  assert.ok((kpis.categoryCounts['Garbage Management'] ?? 0) >= 8);
  assert.ok((kpis.categoryCounts['Streetlight'] ?? 0) >= 7);
  assert.ok((kpis.categoryCounts['Drainage'] ?? 0) >= 5);
  assert.ok((kpis.categoryCounts['Electrical Hazard'] ?? 0) >= 5);

  const all = listReports(db);
  assert.equal(all.length, firstLoad.totalReports);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});
