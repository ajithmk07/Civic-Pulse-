import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { generateActionBriefDeterministic } from '../server/ai_engine/action_brief.ts';
import { classifyComplaintDeterministic } from '../server/ai_engine/classifier.ts';
import { detectDuplicates } from '../server/ai_engine/duplicate_detector.ts';
import { summarizeComplaintDeterministic } from '../server/ai_engine/summarizer.ts';
import { createDatabaseConnection } from '../server/database.ts';
import { listReports, listStoredHotspots, loadDemoDataset } from '../server/services/report_service.ts';

test('Classifier accurately categorizes College Road pothole + waterlogging prompt example', () => {
  const result = classifyComplaintDeterministic(
    '',
    'There is a huge pothole near the college entrance. Rainwater is collecting inside it and vehicles are almost falling.'
  );

  assert.equal(result.primaryCategory, 'Road Damage');
  assert.equal(result.secondaryCategory, 'Waterlogging');
  assert.equal(result.suggestedDepartment, 'Public Works Department');
  assert.equal(result.safetyConcern, true);
});

test('Summarizer handles empty and malformed inputs without crashing or inventing facts', () => {
  const emptyCls = classifyComplaintDeterministic('', '');
  const emptyRes = summarizeComplaintDeterministic('', '   ', '', emptyCls);
  assert.ok(emptyRes.summary.includes('No valid complaint text'));

  const validCls = classifyComplaintDeterministic(
    'Overflowing bin at Old Market',
    'Municipal dustbin at Old Market Crossroad is overflowing with rotting waste onto the lane.'
  );
  const summary = summarizeComplaintDeterministic(
    'Overflowing bin at Old Market',
    'Municipal dustbin at Old Market Crossroad is overflowing with rotting waste onto the lane.',
    'Old Market Crossroad',
    validCls
  );
  assert.ok(summary.summary.includes('Old Market'));
  assert.ok(summary.summary.length > 20);
});

test('Duplicate detector finds known duplicates (>= 0.65 similarity, <= 150m) and rejects unrelated reports', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'civicpulse-dup-'));
  const db = createDatabaseConnection(':memory:');
  loadDemoDataset(db, {
    uploadsDir: path.join(tmpDir, 'uploads'),
    csvPath: path.join(tmpDir, 'sample.csv'),
  });

  const existing = listReports(db);

  // Known duplicate: new pothole report at College Road entrance
  const knownMatches = detectDuplicates(
    {
      reportId: 'NEW-TEST-1',
      title: 'Huge pothole near college entrance with rainwater',
      description:
        'There is a huge pothole near the college entrance on College Road. Rainwater is collecting inside it and vehicles are almost falling.',
      category: 'Road Damage',
      secondaryCategory: 'Waterlogging',
      latitude: 12.97214,
      longitude: 77.59486,
      locationName: 'College Road',
    },
    existing
  );

  assert.ok(knownMatches.length >= 1, 'Expected at least 1 duplicate match on College Road');
  assert.ok(knownMatches[0].similarityScore >= 0.65);
  assert.ok(knownMatches[0].distanceMeters <= 150);
  assert.equal(knownMatches[0].relatedReportId, 'DEMO-2026-0001');

  // Unrelated category at the exact same location should NOT match
  const unrelatedAtSameSpot = detectDuplicates(
    {
      reportId: 'NEW-TEST-2',
      title: 'Missed doorstep dry leaf garbage pickup',
      description: 'Sanitation van skipped collecting dry leaf waste bags outside gate.',
      category: 'Garbage Management',
      secondaryCategory: null,
      latitude: 12.97214,
      longitude: 77.59486,
      locationName: 'College Road',
    },
    existing
  );
  assert.equal(unrelatedAtSameSpot.length, 0);

  // Similar pothole wording 2.5 km away (> 150m) must NOT match College Road reports
  const farAwayPothole = detectDuplicates(
    {
      reportId: 'NEW-TEST-3',
      title: 'Huge pothole filled with rainwater causing bikes to skid',
      description:
        'Huge pothole with rainwater collecting inside it and vehicles almost falling.',
      category: 'Road Damage',
      secondaryCategory: 'Waterlogging',
      latitude: 12.9501,
      longitude: 77.615,
      locationName: 'Far South Suburb',
    },
    existing
  );
  assert.equal(farAwayPothole.length, 0);

  // Action brief uses actual stored information
  const hotspots = listStoredHotspots(db);
  assert.ok(hotspots.length >= 1);
  const topHotspot = hotspots[0];
  const clusterReports = existing.filter((r) => topHotspot.reportIds.includes(r.reportId));
  const brief = generateActionBriefDeterministic({
    targetType: 'hotspot',
    targetId: topHotspot.hotspotId,
    reports: clusterReports,
    hotspot: topHotspot,
  });

  assert.equal(brief.verifiedFacts.relatedReportCount, topHotspot.reportCount);
  assert.ok(brief.advisoryRecommendations.recommendedNextActions.length >= 3);
  assert.ok(brief.advisoryRecommendations.disclaimer.includes('verified database facts'));

  fs.rmSync(tmpDir, { recursive: true, force: true });
});
