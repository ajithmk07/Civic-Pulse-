import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createDatabaseConnection } from '../server/database.ts';
import {
  overrideReportPriority,
  reviewDuplicateLink,
  updateReportWorkflow,
} from '../server/services/assignment_service.ts';
import {
  getDashboardKpis,
  getReportDetail,
  loadDemoDataset,
  submitCitizenReport,
} from '../server/services/report_service.ts';
import { getPublicTrackingReport } from '../server/services/tracking_service.ts';

test('Full 5-minute Hackathon Demonstration Workflow executes end-to-end', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'civicpulse-e2e-'));
  const db = createDatabaseConnection(':memory:');

  loadDemoDataset(db, {
    uploadsDir: path.join(tmpDir, 'uploads'),
    csvPath: path.join(tmpDir, 'sample.csv'),
  });

  const kpisBefore = getDashboardKpis(db);

  // 1. Citizen submits new pothole complaint on College Road
  const submitted = await submitCitizenReport(db, {
    title: 'Huge pothole near college entrance collecting rainwater',
    description:
      'There is a huge pothole near the college entrance on College Road. Rainwater is collecting inside it and vehicles are almost falling.',
    category: 'Auto-Detect',
    latitude: 12.97213,
    longitude: 77.59485,
    locationName: 'College Road & Main Gate Corridor',
  });

  const reportId = submitted.report.reportId;
  assert.equal(submitted.report.category, 'Road Damage');
  assert.equal(submitted.report.secondaryCategory, 'Waterlogging');
  assert.ok(submitted.report.duplicateLinks.length >= 1);

  // 2. Authority confirms duplicate link -> recurrence increases without deleting citizen report
  const firstDupId = submitted.report.duplicateLinks[0].id!;
  const scoreBeforeConfirm = submitted.report.priorityScore;
  const confirmedDup = reviewDuplicateLink(db, firstDupId, 'Confirmed', 'Officer Kulkarni');
  assert.equal(confirmedDup.reviewStatus, 'Confirmed');

  const afterDupConfirm = getReportDetail(db, reportId)!;
  assert.ok(afterDupConfirm.recurrenceScore > submitted.report.recurrenceScore);
  assert.ok(afterDupConfirm.priorityScore >= scoreBeforeConfirm);

  // 3. Authority assigns Public Works Department and updates status to In Progress with internal + public notes
  const updated = updateReportWorkflow(db, reportId, {
    department: 'Public Works Department',
    assignedStaff: 'Eng. R. Kulkarni',
    status: 'In Progress',
    publicUpdate: 'Warning barricades installed; asphalt crew scheduled for morning repair.',
    internalNote: 'CONFIDENTIAL INTERNAL NOTE: Inspect culvert pipe joint #C-14.',
    changedBy: 'Admin Control Room',
  });
  assert.equal(updated.status, 'In Progress');
  assert.equal(updated.department, 'Public Works Department');

  // 4. Authority tests manual priority override with recorded justification
  const overridden = overrideReportPriority(db, reportId, {
    manualLevel: 'Critical',
    reason: 'Peak college exam week traffic requires immediate morning clearance.',
    changedBy: 'Chief Municipal Engineer',
  });
  assert.equal(overridden.priorityLevel, 'Critical');
  assert.equal(overridden.manualOverrideLevel, 'Critical');

  // 5. Citizen tracks complaint -> sees updated status & public timeline, NEVER sees confidential internal note
  const tracked = getPublicTrackingReport(db, reportId);
  assert.ok(tracked.report);
  assert.equal(tracked.report.status, 'In Progress');
  assert.equal(tracked.report.department, 'Public Works Department');
  assert.equal(tracked.report.priorityLevel, 'Critical');
  assert.ok(
    tracked.report.timeline.some((t) => t.publicUpdate.includes('Warning barricades installed'))
  );
  assert.ok(tracked.report.latestPublicUpdate.includes('Critical'));

  const serializedPublicPayload = JSON.stringify(tracked.report);
  assert.ok(
    !serializedPublicPayload.includes('CONFIDENTIAL INTERNAL NOTE'),
    'Internal authority notes must never leak to public tracking endpoint'
  );

  // 6. Dashboard KPIs dynamically reflect new submission
  const kpisAfter = getDashboardKpis(db);
  assert.equal(kpisAfter.totalReports, kpisBefore.totalReports + 1);
  assert.equal(kpisAfter.citizenReportCount, kpisBefore.citizenReportCount + 1);

  // 7. Invalid tracking ID handled cleanly
  const badTrack = getPublicTrackingReport(db, 'INVALID-ID');
  assert.ok(badTrack.error);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});
