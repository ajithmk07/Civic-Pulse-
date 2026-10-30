import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { detectGeographicHotspots } from '../server/ai_engine/hotspot_detector.ts';
import { calculateExplainablePriority } from '../server/ai_engine/priority_engine.ts';
import { createDatabaseConnection } from '../server/database.ts';
import { listStoredHotspots, loadDemoDataset } from '../server/services/report_service.ts';

test('Priority Engine follows exact weighted formula and confirmed-only recurrence rule', () => {
  const zeroConfirmed = calculateExplainablePriority({
    title: 'Broken streetlight pole',
    description: 'Streetlight lamp is dark along residential street.',
    category: 'Streetlight',
    secondaryCategory: null,
    latitude: 12.9634,
    longitude: 77.598,
    safetyConcern: false,
    confirmedRelatedCount: 0,
  });

  const expectedFormula = Math.round(
    0.35 * zeroConfirmed.severityScore +
      0.3 * zeroConfirmed.urgencyScore +
      0.2 * zeroConfirmed.recurrenceScore +
      0.15 * zeroConfirmed.impactScore
  );
  assert.equal(zeroConfirmed.baseFormulaScore, expectedFormula);
  assert.equal(zeroConfirmed.priorityScore, expectedFormula);
  assert.equal(zeroConfirmed.safetyOverride, false);

  const threeConfirmed = calculateExplainablePriority({
    title: 'Broken streetlight pole',
    description: 'Streetlight lamp is dark along residential street.',
    category: 'Streetlight',
    secondaryCategory: null,
    latitude: 12.9634,
    longitude: 77.598,
    safetyConcern: false,
    confirmedRelatedCount: 3,
  });

  assert.ok(threeConfirmed.recurrenceScore > zeroConfirmed.recurrenceScore);
  assert.ok(threeConfirmed.priorityScore > zeroConfirmed.priorityScore);
});

test('Safety Override triggers Critical priority for exposed live electrical wires', () => {
  const hazardEval = calculateExplainablePriority({
    title: 'Exposed live electrical wires dangling on footpath',
    description:
      'Snapped overhead cable has left exposed live wires sparking near pedestrians.',
    category: 'Electrical Hazard',
    secondaryCategory: null,
    latitude: 12.9785,
    longitude: 77.602,
    safetyConcern: true,
    confirmedRelatedCount: 0,
  });

  assert.equal(hazardEval.safetyOverride, true);
  assert.ok(hazardEval.safetyOverrideReason?.includes('Safety Override'));
  assert.ok(hazardEval.priorityScore >= 90);
  assert.equal(hazardEval.priorityLevel, 'Critical');
});

test('Haversine DBSCAN hotspot detector identifies College Road cluster and handles sparse data', () => {
  // Insufficient data (< 3 points) returns empty list safely
  const sparse = detectGeographicHotspots([
    {
      reportId: 'R1',
      latitude: 12.97,
      longitude: 77.59,
      category: 'Road Damage',
      priorityLevel: 'Medium',
      priorityScore: 50,
    },
  ]);
  assert.equal(sparse.length, 0);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'civicpulse-hs-'));
  const db = createDatabaseConnection(':memory:');
  loadDemoDataset(db, {
    uploadsDir: path.join(tmpDir, 'uploads'),
    csvPath: path.join(tmpDir, 'sample.csv'),
  });

  const hotspots = listStoredHotspots(db);
  assert.ok(hotspots.length >= 3, 'Expected College Road, Old Market, and Industrial Ring clusters');

  const collegeCluster = hotspots.find((h) => h.areaName.includes('College Road'));
  assert.ok(collegeCluster, 'Expected College Road hotspot to be detected');
  assert.equal(collegeCluster.reportCount, 14);
  assert.equal(collegeCluster.dominantCategory, 'Road Damage');
  assert.ok(collegeCluster.description.includes('requires'));

  fs.rmSync(tmpDir, { recursive: true, force: true });
});
