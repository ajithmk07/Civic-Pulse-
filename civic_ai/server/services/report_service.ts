import crypto from 'node:crypto';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import {
  PRIORITY_LEVELS,
  type CivicCategory,
  type CivicReport,
  type CivicReportDetail,
  type DashboardKPIs,
  type DuplicateMatch,
  type GeographicHotspot,
  type PriorityEvaluation,
  type PriorityLevel,
  type WorkflowStatus,
} from '../../src/types/civic.ts';
import { classifyComplaint, classifyComplaintDeterministic } from '../ai_engine/classifier.ts';
import { detectDuplicates } from '../ai_engine/duplicate_detector.ts';
import { detectGeographicHotspots } from '../ai_engine/hotspot_detector.ts';
import { calculateExplainablePriority } from '../ai_engine/priority_engine.ts';
import { summarizeComplaint, summarizeComplaintDeterministic } from '../ai_engine/summarizer.ts';
import {
  buildSyntheticDataset,
  ensureDemoEvidenceAssets,
  writeSampleReportsCsv,
} from '../data/synthetic_generator.ts';
import { validateComplaintSubmission } from '../utils/validation.ts';

function safeJsonParse<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== 'string' || !raw.trim()) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function mapRowToCivicReport(row: Record<string, unknown>): CivicReport {
  const defaultEval: PriorityEvaluation = {
    severityScore: Number(row.severity_score ?? 0),
    urgencyScore: Number(row.urgency_score ?? 0),
    recurrenceScore: Number(row.recurrence_score ?? 0),
    impactScore: Number(row.impact_score ?? 0),
    baseFormulaScore: Number(row.priority_score ?? 0),
    priorityScore: Number(row.priority_score ?? 0),
    priorityLevel: (row.priority_level as PriorityLevel) || 'Low',
    safetyConcern: Boolean(row.safety_concern),
    safetyOverride: Boolean(row.safety_override),
    safetyOverrideReason: (row.safety_override_reason as string) || null,
    explanations: [],
    contributions: [],
    advisoryNotice: 'Advisory AI score for municipal triage support only.',
  };

  const manualLevel = (row.manual_override_level as PriorityLevel | null) || null;
  const effectiveLevel = manualLevel ?? ((row.priority_level as PriorityLevel) || 'Low');

  return {
    reportId: String(row.report_id),
    title: String(row.title),
    description: String(row.description),
    imagePaths: safeJsonParse<string[]>(row.image_path, []),
    locationName: String(row.location_name || 'Unspecified Location'),
    category: row.category as CivicCategory,
    secondaryCategory: (row.secondary_category as CivicCategory | null) || null,
    latitude: row.latitude !== null && row.latitude !== undefined ? Number(row.latitude) : null,
    longitude: row.longitude !== null && row.longitude !== undefined ? Number(row.longitude) : null,
    aiSummary: String(row.ai_summary || ''),
    severityScore: Number(row.severity_score ?? 0),
    urgencyScore: Number(row.urgency_score ?? 0),
    recurrenceScore: Number(row.recurrence_score ?? 0),
    impactScore: Number(row.impact_score ?? 0),
    priorityScore: Number(row.priority_score ?? 0),
    priorityLevel: effectiveLevel,
    priorityExplanation: safeJsonParse<PriorityEvaluation>(row.priority_explanation, defaultEval),
    safetyConcern: Boolean(row.safety_concern),
    safetyOverride: Boolean(row.safety_override),
    safetyOverrideReason: (row.safety_override_reason as string | null) || null,
    manualOverrideLevel: manualLevel,
    manualOverrideReason: (row.manual_override_reason as string | null) || null,
    department: String(row.department || 'Unassigned'),
    assignedStaff: String(row.assigned_staff || 'Unassigned'),
    status: (row.status as WorkflowStatus) || 'Submitted',
    isDemo: Boolean(row.is_demo),
    confirmedDuplicateCount: Number(row.confirmed_dup_count ?? 0),
    suggestedDuplicateCount: Number(row.suggested_dup_count ?? 0),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export interface ReportFilterOptions {
  search?: string;
  category?: string;
  priority?: string;
  status?: string;
  sortBy?: 'priority_desc' | 'priority_asc' | 'newest' | 'oldest';
}

export function listReports(db: DatabaseSync, filters: ReportFilterOptions = {}): CivicReport[] {
  const conditions: string[] = [];
  const params: Array<string | number> = [];

  if (filters.search && filters.search.trim()) {
    const q = `%${filters.search.trim()}%`;
    conditions.push(
      '(r.report_id LIKE ? OR r.title LIKE ? OR r.description LIKE ? OR r.location_name LIKE ? OR r.department LIKE ?)'
    );
    params.push(q, q, q, q, q);
  }

  if (filters.category && filters.category !== 'All') {
    conditions.push('(r.category = ? OR r.secondary_category = ?)');
    params.push(filters.category, filters.category);
  }

  if (filters.status && filters.status !== 'All') {
    conditions.push('r.status = ?');
    params.push(filters.status);
  }

  if (filters.priority && filters.priority !== 'All') {
    conditions.push('COALESCE(r.manual_override_level, r.priority_level) = ?');
    params.push(filters.priority);
  }

  let orderClause = 'r.priority_score DESC, r.created_at DESC';
  if (filters.sortBy === 'priority_asc') {
    orderClause = 'r.priority_score ASC, r.created_at DESC';
  } else if (filters.sortBy === 'newest') {
    orderClause = 'r.created_at DESC';
  } else if (filters.sortBy === 'oldest') {
    orderClause = 'r.created_at ASC';
  }

  const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const query = `
    SELECT
      r.*,
      (
        SELECT COUNT(*) FROM duplicate_links dl
        WHERE (dl.source_report_id = r.report_id OR dl.related_report_id = r.report_id)
          AND dl.review_status = 'Confirmed'
      ) AS confirmed_dup_count,
      (
        SELECT COUNT(*) FROM duplicate_links dl
        WHERE (dl.source_report_id = r.report_id OR dl.related_report_id = r.report_id)
          AND dl.review_status = 'Suggested'
      ) AS suggested_dup_count
    FROM reports r
    ${whereSql}
    ORDER BY ${orderClause}
  `;

  const rows = db.prepare(query).all(...params) as Array<Record<string, unknown>>;
  return rows.map(mapRowToCivicReport);
}

export function getReportDetail(db: DatabaseSync, reportId: string): CivicReportDetail | null {
  const row = db
    .prepare(
      `
      SELECT
        r.*,
        (
          SELECT COUNT(*) FROM duplicate_links dl
          WHERE (dl.source_report_id = r.report_id OR dl.related_report_id = r.report_id)
            AND dl.review_status = 'Confirmed'
        ) AS confirmed_dup_count,
        (
          SELECT COUNT(*) FROM duplicate_links dl
          WHERE (dl.source_report_id = r.report_id OR dl.related_report_id = r.report_id)
            AND dl.review_status = 'Suggested'
        ) AS suggested_dup_count
      FROM reports r
      WHERE r.report_id = ?
    `
    )
    .get(reportId) as Record<string, unknown> | undefined;

  if (!row) return null;

  const base = mapRowToCivicReport(row);

  const dupRows = db
    .prepare(
      `
      SELECT
        dl.id,
        dl.source_report_id,
        dl.related_report_id,
        dl.similarity_score,
        dl.distance_meters,
        dl.review_status,
        dl.confirmed_at,
        other.report_id AS peer_id,
        other.title AS peer_title,
        other.category AS peer_category,
        other.status AS peer_status,
        other.location_name AS peer_location
      FROM duplicate_links dl
      JOIN reports other
        ON other.report_id = CASE
          WHEN dl.source_report_id = ? THEN dl.related_report_id
          ELSE dl.source_report_id
        END
      WHERE dl.source_report_id = ? OR dl.related_report_id = ?
      ORDER BY dl.similarity_score DESC
    `
    )
    .all(reportId, reportId, reportId) as Array<Record<string, unknown>>;

  const duplicateLinks: DuplicateMatch[] = dupRows.map((d) => ({
    id: Number(d.id),
    sourceReportId: String(d.source_report_id),
    relatedReportId: String(d.peer_id),
    relatedTitle: String(d.peer_title),
    relatedCategory: d.peer_category as CivicCategory,
    relatedStatus: d.peer_status as WorkflowStatus,
    relatedLocationName: String(d.peer_location),
    similarityScore: Number(d.similarity_score),
    distanceMeters: Number(d.distance_meters),
    reviewStatus: d.review_status as DuplicateMatch['reviewStatus'],
    confirmedAt: (d.confirmed_at as string | null) || null,
  }));

  const logRows = db
    .prepare(
      `
      SELECT id, report_id, previous_status, new_status, public_update, internal_note, changed_by, created_at
      FROM activity_log
      WHERE report_id = ?
      ORDER BY id DESC
    `
    )
    .all(reportId) as Array<Record<string, unknown>>;

  const activityLog = logRows.map((l) => ({
    id: Number(l.id),
    reportId: String(l.report_id),
    previousStatus: (l.previous_status as string | null) || null,
    newStatus: String(l.new_status),
    publicUpdate: String(l.public_update || ''),
    internalNote: String(l.internal_note || ''),
    changedBy: String(l.changed_by || 'System'),
    createdAt: String(l.created_at),
  }));

  return {
    ...base,
    duplicateLinks,
    activityLog,
  };
}

function generateUniqueTrackingId(db: DatabaseSync): string {
  const year = 2026;
  const checkStmt = db.prepare('SELECT 1 FROM reports WHERE report_id = ?');
  for (let attempt = 0; attempt < 20; attempt++) {
    const num = 1000 + crypto.randomInt(0, 9000);
    const candidate = `CP-${year}-${num}`;
    if (!checkStmt.get(candidate)) {
      return candidate;
    }
  }
  return `CP-${year}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

export function refreshHotspots(
  db: DatabaseSync,
  options: { epsMeters?: number; minSamples?: number } = {}
): GeographicHotspot[] {
  const allReports = listReports(db);
  const hotspots = detectGeographicHotspots(
    allReports.map((r) => ({
      reportId: r.reportId,
      latitude: r.latitude,
      longitude: r.longitude,
      category: r.category,
      priorityLevel: r.priorityLevel,
      priorityScore: r.priorityScore,
      locationName: r.locationName,
    })),
    options
  );

  db.exec('DELETE FROM hotspots;');
  const insertStmt = db.prepare(`
    INSERT INTO hotspots (
      hotspot_id, area_name, latitude, longitude, radius_meters,
      report_count, dominant_category, category_breakdown,
      priority_level, highest_score, report_ids, description, generated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const h of hotspots) {
    insertStmt.run(
      h.hotspotId,
      h.areaName,
      h.latitude,
      h.longitude,
      h.radiusMeters,
      h.reportCount,
      h.dominantCategory,
      JSON.stringify(h.categoryBreakdown),
      h.priorityLevel,
      h.highestScore,
      JSON.stringify(h.reportIds),
      h.description,
      h.generatedAt
    );
  }

  return hotspots;
}

export function listStoredHotspots(db: DatabaseSync): GeographicHotspot[] {
  const rows = db
    .prepare('SELECT * FROM hotspots ORDER BY report_count DESC, highest_score DESC')
    .all() as Array<Record<string, unknown>>;

  return rows.map((r) => ({
    hotspotId: String(r.hotspot_id),
    areaName: String(r.area_name || ''),
    latitude: Number(r.latitude),
    longitude: Number(r.longitude),
    radiusMeters: Number(r.radius_meters),
    reportCount: Number(r.report_count),
    dominantCategory: r.dominant_category as CivicCategory,
    categoryBreakdown: safeJsonParse<Record<string, number>>(r.category_breakdown, {}),
    priorityLevel: r.priority_level as PriorityLevel,
    highestScore: Number(r.highest_score ?? 0),
    reportIds: safeJsonParse<string[]>(r.report_ids, []),
    description: String(r.description),
    generatedAt: String(r.generated_at),
  }));
}

export async function submitCitizenReport(
  db: DatabaseSync,
  rawPayload: Record<string, unknown>,
  imagePaths: string[] = []
): Promise<{
  report: CivicReportDetail;
  classificationSource: string;
  summarySource: string;
}> {
  const validation = validateComplaintSubmission(rawPayload);
  if (!validation.valid || !validation.data) {
    throw new Error(validation.errors.join(' '));
  }

  const data = validation.data;

  // Prevent accidental double-click identical submission within 60 seconds
  const recentDuplicate = db
    .prepare(
      `
      SELECT report_id FROM reports
      WHERE LOWER(title) = LOWER(?) AND LOWER(description) = LOWER(?)
        AND ABS(latitude - ?) < 0.0001 AND ABS(longitude - ?) < 0.0001
        AND created_at >= ?
    `
    )
    .get(
      data.title,
      data.description,
      data.latitude,
      data.longitude,
      new Date(Date.now() - 60_000).toISOString()
    ) as { report_id: string } | undefined;

  if (recentDuplicate) {
    const existingDetail = getReportDetail(db, recentDuplicate.report_id);
    if (existingDetail) {
      return {
        report: existingDetail,
        classificationSource: 'cached-idempotent',
        summarySource: 'cached-idempotent',
      };
    }
  }

  const reportId = generateUniqueTrackingId(db);
  const nowIso = new Date().toISOString();

  // Step 1: AI Classification
  const classification = await classifyComplaint(data.title, data.description, data.category);

  // Step 2: AI Summarization
  const summaryRes = await summarizeComplaint(
    data.title,
    data.description,
    data.locationName,
    classification
  );

  // Step 3: Genuine TF-IDF + Haversine Duplicate Detection against existing reports
  const existingReports = listReports(db);
  const detectedDuplicates = detectDuplicates(
    {
      reportId,
      title: data.title,
      description: data.description,
      category: classification.primaryCategory,
      secondaryCategory: classification.secondaryCategory,
      latitude: data.latitude,
      longitude: data.longitude,
      locationName: data.locationName,
    },
    existingReports
  );

  // Step 4: Explainable Priority Engine (unconfirmed duplicate suggestions do NOT inflate verified recurrence)
  const priorityEval = calculateExplainablePriority({
    title: data.title,
    description: data.description,
    category: classification.primaryCategory,
    secondaryCategory: classification.secondaryCategory,
    latitude: data.latitude,
    longitude: data.longitude,
    locationName: data.locationName,
    safetyConcern: classification.safetyConcern,
    safetyReasons: classification.safetyReasons,
    confirmedRelatedCount: 0,
  });

  db.exec('BEGIN TRANSACTION;');
  try {
    db.prepare(
      `
      INSERT INTO reports (
        report_id, title, description, image_path, location_name,
        category, secondary_category, latitude, longitude, ai_summary,
        severity_score, urgency_score, recurrence_score, impact_score,
        priority_score, priority_level, priority_explanation,
        safety_concern, safety_override, safety_override_reason,
        department, assigned_staff, status, is_demo, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, 'Unassigned', 'Submitted', 0, ?, ?
      )
    `
    ).run(
      reportId,
      data.title,
      data.description,
      JSON.stringify(imagePaths),
      data.locationName,
      classification.primaryCategory,
      classification.secondaryCategory,
      data.latitude,
      data.longitude,
      summaryRes.summary,
      priorityEval.severityScore,
      priorityEval.urgencyScore,
      priorityEval.recurrenceScore,
      priorityEval.impactScore,
      priorityEval.priorityScore,
      priorityEval.priorityLevel,
      JSON.stringify(priorityEval),
      priorityEval.safetyConcern ? 1 : 0,
      priorityEval.safetyOverride ? 1 : 0,
      priorityEval.safetyOverrideReason,
      classification.suggestedDepartment,
      nowIso,
      nowIso
    );

    const insertDup = db.prepare(
      `
      INSERT OR IGNORE INTO duplicate_links (
        source_report_id, related_report_id, similarity_score, distance_meters, review_status, confirmed_at
      ) VALUES (?, ?, ?, ?, 'Suggested', NULL)
    `
    );
    for (const dup of detectedDuplicates.slice(0, 6)) {
      insertDup.run(reportId, dup.relatedReportId, dup.similarityScore, dup.distanceMeters);
    }

    db.prepare(
      `
      INSERT INTO activity_log (
        report_id, previous_status, new_status, public_update, internal_note, changed_by, created_at
      ) VALUES (?, NULL, 'Submitted', ?, ?, 'CivicPulse AI Intake', ?)
    `
    ).run(
      reportId,
      `Complaint registered and routed to ${classification.suggestedDepartment} for initial review.`,
      `AI Classification: ${classification.primaryCategory}${
        classification.secondaryCategory ? ` + ${classification.secondaryCategory}` : ''
      } (${Math.round(classification.confidence * 100)}% confidence). ${
        detectedDuplicates.length
      } potential duplicate(s) flagged for review.`,
      nowIso
    );

    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }

  refreshHotspots(db);
  const fullDetail = getReportDetail(db, reportId);
  if (!fullDetail) {
    throw new Error('Failed to retrieve newly created complaint.');
  }

  return {
    report: fullDetail,
    classificationSource: classification.engineSource,
    summarySource: summaryRes.engineSource,
  };
}

export function recalculateReportPriorityFromLinks(db: DatabaseSync, reportId: string): void {
  const row = db.prepare('SELECT * FROM reports WHERE report_id = ?').get(reportId) as
    | Record<string, unknown>
    | undefined;
  if (!row) return;

  const countRow = db
    .prepare(
      `
      SELECT COUNT(*) AS cnt FROM duplicate_links
      WHERE (source_report_id = ? OR related_report_id = ?)
        AND review_status = 'Confirmed'
    `
    )
    .get(reportId, reportId) as { cnt: number };

  const classification = classifyComplaintDeterministic(
    String(row.title),
    String(row.description),
    row.category as CivicCategory
  );

  const updatedEval = calculateExplainablePriority({
    title: String(row.title),
    description: String(row.description),
    category: row.category as CivicCategory,
    secondaryCategory: (row.secondary_category as CivicCategory | null) || null,
    latitude: row.latitude !== null ? Number(row.latitude) : null,
    longitude: row.longitude !== null ? Number(row.longitude) : null,
    locationName: String(row.location_name || ''),
    safetyConcern: Boolean(row.safety_concern) || classification.safetyConcern,
    safetyReasons: classification.safetyReasons,
    confirmedRelatedCount: Number(countRow?.cnt ?? 0),
  });

  db.prepare(
    `
    UPDATE reports
    SET severity_score = ?,
        urgency_score = ?,
        recurrence_score = ?,
        impact_score = ?,
        priority_score = ?,
        priority_level = ?,
        priority_explanation = ?,
        safety_concern = ?,
        safety_override = ?,
        safety_override_reason = ?,
        updated_at = ?
    WHERE report_id = ?
  `
  ).run(
    updatedEval.severityScore,
    updatedEval.urgencyScore,
    updatedEval.recurrenceScore,
    updatedEval.impactScore,
    updatedEval.priorityScore,
    updatedEval.priorityLevel,
    JSON.stringify(updatedEval),
    updatedEval.safetyConcern ? 1 : 0,
    updatedEval.safetyOverride ? 1 : 0,
    updatedEval.safetyOverrideReason,
    new Date().toISOString(),
    reportId
  );
}

/**
 * Loads the 52-report synthetic demonstration dataset idempotently.
 * NEVER deletes or overwrites existing citizen or modified demo reports.
 */
export function loadDemoDataset(
  db: DatabaseSync,
  options: { uploadsDir?: string; csvPath?: string } = {}
): { insertedCount: number; totalReports: number; hotspotsCount: number } {
  const uploadsDir = options.uploadsDir ?? path.resolve(process.cwd(), 'uploads');
  const csvPath = options.csvPath ?? path.resolve(process.cwd(), 'data', 'sample_reports.csv');

  const evidenceUrls = ensureDemoEvidenceAssets(uploadsDir);
  const seedRecords = buildSyntheticDataset(evidenceUrls);
  writeSampleReportsCsv(csvPath, seedRecords);

  const checkExists = db.prepare('SELECT 1 FROM reports WHERE report_id = ?');
  const insertReport = db.prepare(`
    INSERT INTO reports (
      report_id, title, description, image_path, location_name,
      category, secondary_category, latitude, longitude, ai_summary,
      severity_score, urgency_score, recurrence_score, impact_score,
      priority_score, priority_level, priority_explanation,
      safety_concern, safety_override, safety_override_reason,
      department, assigned_staff, status, is_demo, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?, 1, ?, ?
    )
  `);

  const insertActivity = db.prepare(`
    INSERT INTO activity_log (
      report_id, previous_status, new_status, public_update, internal_note, changed_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  let insertedCount = 0;

  db.exec('BEGIN TRANSACTION;');
  try {
    for (const rec of seedRecords) {
      if (checkExists.get(rec.reportId)) {
        continue;
      }

      const classification = classifyComplaintDeterministic(
        rec.title,
        rec.description,
        rec.category
      );
      const summary = summarizeComplaintDeterministic(
        rec.title,
        rec.description,
        rec.locationName,
        classification
      );
      const priorityEval = calculateExplainablePriority({
        title: rec.title,
        description: rec.description,
        category: rec.category,
        secondaryCategory: classification.secondaryCategory,
        latitude: rec.latitude,
        longitude: rec.longitude,
        locationName: rec.locationName,
        safetyConcern: classification.safetyConcern,
        safetyReasons: classification.safetyReasons,
        confirmedRelatedCount: 0,
      });

      insertReport.run(
        rec.reportId,
        rec.title,
        rec.description,
        JSON.stringify(rec.imagePath ? [rec.imagePath] : []),
        rec.locationName,
        rec.category,
        classification.secondaryCategory,
        rec.latitude,
        rec.longitude,
        summary.summary,
        priorityEval.severityScore,
        priorityEval.urgencyScore,
        priorityEval.recurrenceScore,
        priorityEval.impactScore,
        priorityEval.priorityScore,
        priorityEval.priorityLevel,
        JSON.stringify(priorityEval),
        priorityEval.safetyConcern ? 1 : 0,
        priorityEval.safetyOverride ? 1 : 0,
        priorityEval.safetyOverrideReason,
        rec.department,
        rec.assignedStaff,
        rec.status,
        rec.createdAt,
        rec.createdAt
      );

      insertActivity.run(
        rec.reportId,
        null,
        'Submitted',
        'Demonstration report ingested into CivicPulse AI.',
        'Synthetic seed dataset initialization.',
        'CivicPulse Demo Seeder',
        rec.createdAt
      );

      if (rec.status !== 'Submitted') {
        insertActivity.run(
          rec.reportId,
          'Submitted',
          rec.status,
          rec.publicUpdate,
          rec.internalNote,
          rec.assignedStaff !== 'Unassigned' ? rec.assignedStaff : 'Municipal Duty Officer',
          rec.createdAt
        );
      }

      insertedCount += 1;
    }

    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }

  // Run duplicate detection across newly inserted demo reports
  if (insertedCount > 0) {
    const allStored = listReports(db);
    const insertDup = db.prepare(`
      INSERT OR IGNORE INTO duplicate_links (
        source_report_id, related_report_id, similarity_score, distance_meters, review_status, confirmed_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);

    for (const r of allStored) {
      if (!r.isDemo) continue;
      const matches = detectDuplicates(
        {
          reportId: r.reportId,
          title: r.title,
          description: r.description,
          category: r.category,
          secondaryCategory: r.secondaryCategory,
          latitude: r.latitude,
          longitude: r.longitude,
          locationName: r.locationName,
        },
        allStored
      );

      for (const m of matches) {
        // Order pair lexicographically so A->B and B->A don't create duplicate mirror rows
        const [firstId, secondId] =
          r.reportId < m.relatedReportId
            ? [r.reportId, m.relatedReportId]
            : [m.relatedReportId, r.reportId];

        const existingPair = db
          .prepare(
            `SELECT id FROM duplicate_links WHERE (source_report_id = ? AND related_report_id = ?) OR (source_report_id = ? AND related_report_id = ?)`
          )
          .get(firstId, secondId, secondId, firstId);

        if (!existingPair) {
          // Pre-confirm DEMO-2026-0001 <-> DEMO-2026-0002 to showcase confirmed recurrence out of the box, keep others Suggested for live review!
          const isPreConfirmed =
            firstId === 'DEMO-2026-0001' && secondId === 'DEMO-2026-0002';
          insertDup.run(
            secondId,
            firstId,
            m.similarityScore,
            m.distanceMeters,
            isPreConfirmed ? 'Confirmed' : 'Suggested',
            isPreConfirmed ? '2026-10-29T12:00:00.000Z' : null
          );
        }
      }
    }

    recalculateReportPriorityFromLinks(db, 'DEMO-2026-0001');
    recalculateReportPriorityFromLinks(db, 'DEMO-2026-0002');
  }

  const hotspots = refreshHotspots(db);
  const totalRow = db.prepare('SELECT COUNT(*) AS cnt FROM reports').get() as { cnt: number };

  return {
    insertedCount,
    totalReports: Number(totalRow.cnt),
    hotspotsCount: hotspots.length,
  };
}

export function getDashboardKpis(db: DatabaseSync): DashboardKPIs {
  const reports = listReports(db);
  const hotspotCountRow = db.prepare('SELECT COUNT(*) AS cnt FROM hotspots').get() as {
    cnt: number;
  };
  const dupCountsRows = db
    .prepare('SELECT review_status, COUNT(*) AS cnt FROM duplicate_links GROUP BY review_status')
    .all() as Array<{ review_status: string; cnt: number }>;

  let confirmedDuplicates = 0;
  let suggestedDuplicates = 0;
  for (const row of dupCountsRows) {
    if (row.review_status === 'Confirmed') confirmedDuplicates = Number(row.cnt);
    if (row.review_status === 'Suggested') suggestedDuplicates = Number(row.cnt);
  }

  const distinctDupReportsRow = db
    .prepare(
      `
      SELECT COUNT(DISTINCT source_report_id) AS cnt
      FROM duplicate_links
      WHERE review_status IN ('Confirmed', 'Suggested')
    `
    )
    .get() as { cnt: number };

  const categoryCounts: Record<string, number> = {};
  const statusCounts: Record<string, number> = {};
  const priorityCounts: Record<PriorityLevel, number> = {
    Critical: 0,
    High: 0,
    Medium: 0,
    Low: 0,
  };

  let pendingReports = 0;
  let resolvedReports = 0;
  let demoReportCount = 0;
  let citizenReportCount = 0;

  for (const r of reports) {
    categoryCounts[r.category] = (categoryCounts[r.category] ?? 0) + 1;
    statusCounts[r.status] = (statusCounts[r.status] ?? 0) + 1;
    if ((PRIORITY_LEVELS as readonly string[]).includes(r.priorityLevel)) {
      priorityCounts[r.priorityLevel] += 1;
    }

    if (r.status === 'Resolved') {
      resolvedReports += 1;
    } else if (r.status !== 'Rejected') {
      pendingReports += 1;
    }

    if (r.isDemo) {
      demoReportCount += 1;
    } else {
      citizenReportCount += 1;
    }
  }

  return {
    totalReports: reports.length,
    pendingReports,
    criticalReports: priorityCounts.Critical,
    highPriorityReports: priorityCounts.High,
    resolvedReports,
    duplicateReports: Number(distinctDupReportsRow?.cnt ?? 0),
    confirmedDuplicates,
    suggestedDuplicates,
    hotspotCount: Number(hotspotCountRow?.cnt ?? 0),
    demoReportCount,
    citizenReportCount,
    categoryCounts,
    statusCounts,
    priorityCounts,
  };
}
