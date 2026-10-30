import type { DatabaseSync } from 'node:sqlite';
import type { PublicTrackedReport } from '../../src/types/civic.ts';
import { validateTrackingId } from '../utils/validation.ts';
import { mapRowToCivicReport } from './report_service.ts';

/**
 * Retrieves public tracking information for a citizen complaint ID.
 * Strictly strips internal authority notes and staff-only administrative details.
 */
export function getPublicTrackingReport(
  db: DatabaseSync,
  rawTrackingId: string
): { report?: PublicTrackedReport; error?: string } {
  const validation = validateTrackingId(rawTrackingId);
  if (!validation.valid || !validation.data) {
    return { error: validation.errors[0] };
  }

  const reportId = validation.data;
  const row = db
    .prepare('SELECT * FROM reports WHERE UPPER(report_id) = ?')
    .get(reportId) as Record<string, unknown> | undefined;

  if (!row) {
    return {
      error: `No civic complaint found for tracking ID "${reportId}". Please verify the code from your submission receipt.`,
    };
  }

  const mapped = mapRowToCivicReport(row);

  // Select ONLY public columns from activity_log (internal_note is intentionally excluded from SQL projection)
  const logRows = db
    .prepare(
      `
      SELECT id, previous_status, new_status, public_update, created_at
      FROM activity_log
      WHERE report_id = ?
      ORDER BY id DESC
    `
    )
    .all(mapped.reportId) as Array<Record<string, unknown>>;

  const timeline = logRows
    .filter((l) => String(l.public_update || '').trim().length > 0)
    .map((l) => ({
      id: Number(l.id),
      previousStatus: (l.previous_status as string | null) || null,
      newStatus: String(l.new_status),
      publicUpdate: String(l.public_update),
      createdAt: String(l.created_at),
    }));

  const latestPublicUpdate =
    timeline[0]?.publicUpdate ||
    `Complaint is currently ${mapped.status} with ${mapped.department}.`;

  return {
    report: {
      reportId: mapped.reportId,
      title: mapped.title,
      category: mapped.category,
      secondaryCategory: mapped.secondaryCategory,
      locationName: mapped.locationName,
      latitude: mapped.latitude,
      longitude: mapped.longitude,
      createdAt: mapped.createdAt,
      updatedAt: mapped.updatedAt,
      priorityLevel: mapped.priorityLevel,
      priorityScore: mapped.priorityScore,
      status: mapped.status,
      department: mapped.department,
      latestPublicUpdate,
      timeline,
    },
  };
}
