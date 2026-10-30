import type { DatabaseSync } from 'node:sqlite';
import type {
  CivicCategory,
  CivicReportDetail,
  DuplicateMatch,
  DuplicateReviewStatus,
  PriorityLevel,
  WorkflowStatus,
} from '../../src/types/civic.ts';
import {
  isValidPriorityLevel,
  isValidWorkflowStatus,
  sanitizePlainText,
} from '../utils/validation.ts';
import {
  getReportDetail,
  recalculateReportPriorityFromLinks,
  refreshHotspots,
} from './report_service.ts';

export interface WorkflowUpdatePayload {
  status?: WorkflowStatus;
  department?: string;
  assignedStaff?: string;
  publicUpdate?: string;
  internalNote?: string;
  changedBy?: string;
}

export function updateReportWorkflow(
  db: DatabaseSync,
  reportId: string,
  payload: WorkflowUpdatePayload
): CivicReportDetail {
  const existing = db
    .prepare('SELECT * FROM reports WHERE report_id = ?')
    .get(reportId) as Record<string, unknown> | undefined;

  if (!existing) {
    throw new Error(`Report ${reportId} not found.`);
  }

  const previousStatus = String(existing.status);
  const nextStatus: WorkflowStatus = payload.status
    ? isValidWorkflowStatus(payload.status)
      ? payload.status
      : (() => {
          throw new Error(`Invalid workflow status "${payload.status}".`);
        })()
    : (previousStatus as WorkflowStatus);

  const nextDepartment =
    payload.department !== undefined
      ? sanitizePlainText(payload.department, 100) || 'Unassigned'
      : String(existing.department);

  const nextStaff =
    payload.assignedStaff !== undefined
      ? sanitizePlainText(payload.assignedStaff, 100) || 'Unassigned'
      : String(existing.assigned_staff);

  const publicUpdate = sanitizePlainText(payload.publicUpdate, 600);
  const internalNote = sanitizePlainText(payload.internalNote, 800);
  const changedBy = sanitizePlainText(payload.changedBy, 80) || 'Municipal Duty Officer';
  const nowIso = new Date().toISOString();

  if (nextDepartment !== 'Unassigned') {
    db.prepare('INSERT OR IGNORE INTO departments (department_name) VALUES (?)').run(
      nextDepartment
    );
  }

  const defaultPublicMessage =
    publicUpdate ||
    (nextStatus !== previousStatus
      ? `Status updated from ${previousStatus} to ${nextStatus}${
          nextDepartment !== 'Unassigned' ? ` (${nextDepartment})` : ''
        }.`
      : nextDepartment !== String(existing.department)
      ? `Assigned to ${nextDepartment}.`
      : 'Administrative review updated.');

  db.exec('BEGIN TRANSACTION;');
  try {
    db.prepare(
      `
      UPDATE reports
      SET status = ?,
          department = ?,
          assigned_staff = ?,
          updated_at = ?
      WHERE report_id = ?
    `
    ).run(nextStatus, nextDepartment, nextStaff, nowIso, reportId);

    db.prepare(
      `
      INSERT INTO activity_log (
        report_id, previous_status, new_status, public_update, internal_note, changed_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      reportId,
      previousStatus,
      nextStatus,
      defaultPublicMessage,
      internalNote,
      changedBy,
      nowIso
    );

    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }

  const updated = getReportDetail(db, reportId);
  if (!updated) {
    throw new Error('Failed to load updated complaint.');
  }
  return updated;
}

export function overrideReportPriority(
  db: DatabaseSync,
  reportId: string,
  params: {
    manualLevel: PriorityLevel | null;
    reason: string;
    changedBy?: string;
  }
): CivicReportDetail {
  const existing = db
    .prepare('SELECT * FROM reports WHERE report_id = ?')
    .get(reportId) as Record<string, unknown> | undefined;

  if (!existing) {
    throw new Error(`Report ${reportId} not found.`);
  }

  const reason = sanitizePlainText(params.reason, 400);
  if (params.manualLevel !== null) {
    if (!isValidPriorityLevel(params.manualLevel)) {
      throw new Error(`Invalid priority level "${params.manualLevel}".`);
    }
    if (reason.length < 5) {
      throw new Error('A clear justification (at least 5 characters) is required when manually overriding AI priority.');
    }
  }

  const changedBy = sanitizePlainText(params.changedBy, 80) || 'Municipal Duty Officer';
  const nowIso = new Date().toISOString();

  db.exec('BEGIN TRANSACTION;');
  try {
    db.prepare(
      `
      UPDATE reports
      SET manual_override_level = ?,
          manual_override_reason = ?,
          updated_at = ?
      WHERE report_id = ?
    `
    ).run(params.manualLevel, params.manualLevel ? reason : null, nowIso, reportId);

    db.prepare(
      `
      INSERT INTO activity_log (
        report_id, previous_status, new_status, public_update, internal_note, changed_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      reportId,
      String(existing.status),
      String(existing.status),
      params.manualLevel
        ? `Municipal officer set operational priority to ${params.manualLevel}.`
        : 'Restored standard AI priority assessment.',
      params.manualLevel
        ? `Manual Priority Override -> ${params.manualLevel}. Reason: ${reason}`
        : 'Cleared manual priority override.',
      changedBy,
      nowIso
    );

    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }

  refreshHotspots(db);
  const updated = getReportDetail(db, reportId);
  if (!updated) {
    throw new Error('Failed to load updated complaint.');
  }
  return updated;
}

export function reviewDuplicateLink(
  db: DatabaseSync,
  linkId: number,
  reviewStatus: DuplicateReviewStatus,
  changedBy = 'Municipal Duty Officer'
): DuplicateMatch {
  if (!['Confirmed', 'Rejected', 'Suggested'].includes(reviewStatus)) {
    throw new Error(`Invalid duplicate review status "${reviewStatus}".`);
  }

  const linkRow = db
    .prepare('SELECT * FROM duplicate_links WHERE id = ?')
    .get(linkId) as Record<string, unknown> | undefined;

  if (!linkRow) {
    throw new Error(`Duplicate suggestion #${linkId} not found.`);
  }

  const sourceId = String(linkRow.source_report_id);
  const relatedId = String(linkRow.related_report_id);
  const nowIso = new Date().toISOString();

  db.exec('BEGIN TRANSACTION;');
  try {
    db.prepare(
      `
      UPDATE duplicate_links
      SET review_status = ?,
          confirmed_at = ?
      WHERE id = ?
    `
    ).run(reviewStatus, reviewStatus === 'Confirmed' ? nowIso : null, linkId);

    const sourceRep = db
      .prepare('SELECT status FROM reports WHERE report_id = ?')
      .get(sourceId) as { status: string } | undefined;

    if (sourceRep) {
      db.prepare(
        `
        INSERT INTO activity_log (
          report_id, previous_status, new_status, public_update, internal_note, changed_by, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `
      ).run(
        sourceId,
        sourceRep.status,
        sourceRep.status,
        reviewStatus === 'Confirmed'
          ? `Linked with related citizen complaint ${relatedId} for coordinated resolution.`
          : 'Reviewed potential duplicate link.',
        `Duplicate link #${linkId} with ${relatedId} marked as ${reviewStatus}. Original citizen submission preserved.`,
        sanitizePlainText(changedBy, 80) || 'Municipal Duty Officer',
        nowIso
      );
    }

    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }

  recalculateReportPriorityFromLinks(db, sourceId);
  recalculateReportPriorityFromLinks(db, relatedId);
  refreshHotspots(db);

  const updated = db
    .prepare(
      `
      SELECT dl.*, r.title AS related_title, r.category AS related_category, r.status AS related_status, r.location_name AS related_location
      FROM duplicate_links dl
      JOIN reports r ON r.report_id = dl.related_report_id
      WHERE dl.id = ?
    `
    )
    .get(linkId) as Record<string, unknown>;

  return {
    id: Number(updated.id),
    sourceReportId: String(updated.source_report_id),
    relatedReportId: String(updated.related_report_id),
    relatedTitle: String(updated.related_title),
    relatedCategory: updated.related_category as CivicCategory,
    relatedStatus: updated.related_status as WorkflowStatus,
    relatedLocationName: String(updated.related_location),
    similarityScore: Number(updated.similarity_score),
    distanceMeters: Number(updated.distance_meters),
    reviewStatus: updated.review_status as DuplicateReviewStatus,
    confirmedAt: (updated.confirmed_at as string | null) || null,
  };
}

export function listAllDuplicateLinks(
  db: DatabaseSync,
  statusFilter?: string
): Array<
  DuplicateMatch & {
    sourceTitle: string;
    sourceCategory: CivicCategory;
    sourceLocationName: string;
  }
> {
  const whereClause =
    statusFilter && statusFilter !== 'All' ? 'WHERE dl.review_status = ?' : '';
  const params = statusFilter && statusFilter !== 'All' ? [statusFilter] : [];

  const rows = db
    .prepare(
      `
      SELECT
        dl.*,
        src.title AS source_title,
        src.category AS source_category,
        src.location_name AS source_location,
        rel.title AS related_title,
        rel.category AS related_category,
        rel.status AS related_status,
        rel.location_name AS related_location
      FROM duplicate_links dl
      JOIN reports src ON src.report_id = dl.source_report_id
      JOIN reports rel ON rel.report_id = dl.related_report_id
      ${whereClause}
      ORDER BY
        CASE dl.review_status WHEN 'Suggested' THEN 0 WHEN 'Confirmed' THEN 1 ELSE 2 END,
        dl.similarity_score DESC
    `
    )
    .all(...params) as Array<Record<string, unknown>>;

  return rows.map((r) => ({
    id: Number(r.id),
    sourceReportId: String(r.source_report_id),
    sourceTitle: String(r.source_title),
    sourceCategory: r.source_category as CivicCategory,
    sourceLocationName: String(r.source_location),
    relatedReportId: String(r.related_report_id),
    relatedTitle: String(r.related_title),
    relatedCategory: r.related_category as CivicCategory,
    relatedStatus: r.related_status as WorkflowStatus,
    relatedLocationName: String(r.related_location),
    similarityScore: Number(r.similarity_score),
    distanceMeters: Number(r.distance_meters),
    reviewStatus: r.review_status as DuplicateReviewStatus,
    confirmedAt: (r.confirmed_at as string | null) || null,
  }));
}

export function listDepartments(db: DatabaseSync): string[] {
  const rows = db
    .prepare('SELECT department_name FROM departments ORDER BY department_name ASC')
    .all() as Array<{ department_name: string }>;
  return rows.map((r) => r.department_name);
}
