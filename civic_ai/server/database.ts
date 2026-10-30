import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { DEFAULT_DEPARTMENTS } from './config.ts';

let defaultDb: DatabaseSync | null = null;
let defaultDbPath = path.resolve(process.cwd(), 'data', 'civicpulse.db');

export function initializeSchema(db: DatabaseSync): void {
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA journal_mode = WAL;');

  db.exec(`
    CREATE TABLE IF NOT EXISTS departments (
      department_id INTEGER PRIMARY KEY AUTOINCREMENT,
      department_name TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS reports (
      report_id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      image_path TEXT NOT NULL DEFAULT '[]',
      location_name TEXT NOT NULL DEFAULT 'Unspecified Location',
      category TEXT NOT NULL,
      secondary_category TEXT,
      latitude REAL,
      longitude REAL,
      ai_summary TEXT NOT NULL DEFAULT '',
      severity_score INTEGER NOT NULL DEFAULT 0,
      urgency_score INTEGER NOT NULL DEFAULT 0,
      recurrence_score INTEGER NOT NULL DEFAULT 0,
      impact_score INTEGER NOT NULL DEFAULT 0,
      priority_score INTEGER NOT NULL DEFAULT 0,
      priority_level TEXT NOT NULL DEFAULT 'Low',
      priority_explanation TEXT NOT NULL DEFAULT '{}',
      safety_concern INTEGER NOT NULL DEFAULT 0,
      safety_override INTEGER NOT NULL DEFAULT 0,
      safety_override_reason TEXT,
      manual_override_level TEXT,
      manual_override_reason TEXT,
      department TEXT NOT NULL DEFAULT 'Unassigned',
      assigned_staff TEXT NOT NULL DEFAULT 'Unassigned',
      status TEXT NOT NULL DEFAULT 'Submitted',
      is_demo INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS duplicate_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_report_id TEXT NOT NULL,
      related_report_id TEXT NOT NULL,
      similarity_score REAL NOT NULL,
      distance_meters REAL NOT NULL,
      review_status TEXT NOT NULL DEFAULT 'Suggested',
      confirmed_at TEXT,
      UNIQUE(source_report_id, related_report_id),
      FOREIGN KEY (source_report_id) REFERENCES reports(report_id) ON DELETE CASCADE,
      FOREIGN KEY (related_report_id) REFERENCES reports(report_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      report_id TEXT NOT NULL,
      previous_status TEXT,
      new_status TEXT NOT NULL,
      public_update TEXT NOT NULL DEFAULT '',
      internal_note TEXT NOT NULL DEFAULT '',
      changed_by TEXT NOT NULL DEFAULT 'System',
      created_at TEXT NOT NULL,
      FOREIGN KEY (report_id) REFERENCES reports(report_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS hotspots (
      hotspot_id TEXT PRIMARY KEY,
      area_name TEXT NOT NULL DEFAULT '',
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      radius_meters REAL NOT NULL DEFAULT 200,
      report_count INTEGER NOT NULL,
      dominant_category TEXT NOT NULL,
      category_breakdown TEXT NOT NULL DEFAULT '{}',
      priority_level TEXT NOT NULL,
      highest_score INTEGER NOT NULL DEFAULT 0,
      report_ids TEXT NOT NULL DEFAULT '[]',
      description TEXT NOT NULL,
      generated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
    CREATE INDEX IF NOT EXISTS idx_reports_category ON reports(category);
    CREATE INDEX IF NOT EXISTS idx_reports_priority_score ON reports(priority_score DESC);
    CREATE INDEX IF NOT EXISTS idx_duplicate_source ON duplicate_links(source_report_id);
    CREATE INDEX IF NOT EXISTS idx_duplicate_related ON duplicate_links(related_report_id);
    CREATE INDEX IF NOT EXISTS idx_activity_report ON activity_log(report_id);
  `);

  const insertDept = db.prepare(
    'INSERT OR IGNORE INTO departments (department_name) VALUES (?)'
  );
  for (const dept of DEFAULT_DEPARTMENTS) {
    insertDept.run(dept);
  }
}

export function createDatabaseConnection(customPath?: string): DatabaseSync {
  const targetPath = customPath ?? defaultDbPath;
  if (targetPath !== ':memory:') {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  }
  const db = new DatabaseSync(targetPath);
  initializeSchema(db);
  return db;
}

export function getDb(): DatabaseSync {
  if (!defaultDb) {
    defaultDb = createDatabaseConnection(defaultDbPath);
  }
  return defaultDb;
}

export function setDbForRuntime(db: DatabaseSync): void {
  defaultDb = db;
}
