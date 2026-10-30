import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import express, { type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { classifyComplaint } from './server/ai_engine/classifier.ts';
import { generateActionBrief } from './server/ai_engine/action_brief.ts';
import { detectDuplicates } from './server/ai_engine/duplicate_detector.ts';
import { calculateExplainablePriority } from './server/ai_engine/priority_engine.ts';
import { summarizeComplaint } from './server/ai_engine/summarizer.ts';
import {
  ALLOWED_IMAGE_MIME_TYPES,
  DEFAULT_DUPLICATE_CONFIG,
  DEFAULT_HOTSPOT_CONFIG,
  MAX_UPLOAD_FILES,
  MAX_UPLOAD_SIZE_BYTES,
  MUNICIPAL_ZONES,
} from './server/config.ts';
import { getDb } from './server/database.ts';
import {
  listAllDuplicateLinks,
  listDepartments,
  overrideReportPriority,
  reviewDuplicateLink,
  updateReportWorkflow,
} from './server/services/assignment_service.ts';
import {
  getDashboardKpis,
  getReportDetail,
  listReports,
  listStoredHotspots,
  loadDemoDataset,
  refreshHotspots,
  submitCitizenReport,
} from './server/services/report_service.ts';
import { getPublicTrackingReport } from './server/services/tracking_service.ts';
import { resolveNearestLandmark } from './server/utils/validation.ts';

dotenv.config();

const PORT = Number(process.env.PORT) || 3000;
const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
};

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, UPLOADS_DIR);
    },
    filename: (_req, file, cb) => {
      const ext = MIME_TO_EXT[file.mimetype] || '.jpg';
      cb(null, `citizen_${Date.now()}_${crypto.randomUUID().slice(0, 8)}${ext}`);
    },
  }),
  limits: {
    fileSize: MAX_UPLOAD_SIZE_BYTES,
    files: MAX_UPLOAD_FILES,
  },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_IMAGE_MIME_TYPES.has(file.mimetype)) {
      cb(
        new Error(
          `Unsupported image format "${file.mimetype}". Allowed formats: JPEG, PNG, WebP, SVG.`
        )
      );
      return;
    }
    cb(null, true);
  },
});

export function createApiRouter() {
  const router = express.Router();

  router.get('/overview', (_req: Request, res: Response) => {
    try {
      const db = getDb();
      const kpis = getDashboardKpis(db);
      const departments = listDepartments(db);
      const hotspots = listStoredHotspots(db);
      res.json({
        kpis,
        departments,
        zones: MUNICIPAL_ZONES,
        hotspots,
        defaultThresholds: {
          duplicate: DEFAULT_DUPLICATE_CONFIG,
          hotspot: DEFAULT_HOTSPOT_CONFIG,
        },
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message || 'Failed to load dashboard overview.' });
    }
  });

  router.get('/reports', (req: Request, res: Response) => {
    try {
      const db = getDb();
      const reports = listReports(db, {
        search: typeof req.query.search === 'string' ? req.query.search : undefined,
        category: typeof req.query.category === 'string' ? req.query.category : undefined,
        priority: typeof req.query.priority === 'string' ? req.query.priority : undefined,
        status: typeof req.query.status === 'string' ? req.query.status : undefined,
        sortBy:
          req.query.sortBy === 'priority_asc' ||
          req.query.sortBy === 'newest' ||
          req.query.sortBy === 'oldest'
            ? req.query.sortBy
            : 'priority_desc',
      });
      res.json({ reports });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message || 'Failed to fetch reports.' });
    }
  });

  router.get('/reports/:id', (req: Request, res: Response) => {
    try {
      const db = getDb();
      const detail = getReportDetail(db, String(req.params.id));
      if (!detail) {
        res.status(404).json({ error: `Complaint "${req.params.id}" was not found.` });
        return;
      }
      res.json({ report: detail });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message || 'Failed to fetch complaint detail.' });
    }
  });

  router.post(
    '/reports',
    (req: Request, res: Response, next: NextFunction) => {
      const contentType = req.headers['content-type'] || '';
      if (contentType.includes('multipart/form-data')) {
        upload.array('photos', MAX_UPLOAD_FILES)(req, res, (err: unknown) => {
          if (err) {
            if (err instanceof multer.MulterError) {
              if (err.code === 'LIMIT_FILE_SIZE') {
                res.status(400).json({
                  error: 'Uploaded image exceeds the 5 MB per-file size limit.',
                });
                return;
              }
              if (err.code === 'LIMIT_FILE_COUNT') {
                res.status(400).json({
                  error: `You may upload at most ${MAX_UPLOAD_FILES} photographs per complaint.`,
                });
                return;
              }
              res.status(400).json({ error: `Upload error: ${err.message}` });
              return;
            }
            res.status(400).json({ error: (err as Error).message || 'Invalid file upload.' });
            return;
          }
          next();
        });
      } else {
        next();
      }
    },
    async (req: Request, res: Response) => {
      try {
        const db = getDb();
        const uploadedFiles = Array.isArray(req.files) ? req.files : [];
        const imagePaths = uploadedFiles.map((f) => `/uploads/${path.basename(f.path)}`);
        const result = await submitCitizenReport(db, req.body ?? {}, imagePaths);
        res.status(201).json(result);
      } catch (err) {
        res.status(400).json({ error: (err as Error).message || 'Complaint submission failed.' });
      }
    }
  );

  router.patch('/reports/:id/workflow', (req: Request, res: Response) => {
    try {
      const db = getDb();
      const updated = updateReportWorkflow(db, String(req.params.id), req.body ?? {});
      const kpis = getDashboardKpis(db);
      res.json({ report: updated, kpis });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message || 'Failed to update complaint workflow.' });
    }
  });

  router.patch('/reports/:id/priority-override', (req: Request, res: Response) => {
    try {
      const db = getDb();
      const updated = overrideReportPriority(db, String(req.params.id), {
        manualLevel: req.body?.manualLevel ?? null,
        reason: String(req.body?.reason ?? ''),
        changedBy: req.body?.changedBy,
      });
      const kpis = getDashboardKpis(db);
      res.json({ report: updated, kpis });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message || 'Failed to apply priority override.' });
    }
  });

  router.get('/duplicates', (req: Request, res: Response) => {
    try {
      const db = getDb();
      const status = typeof req.query.status === 'string' ? req.query.status : 'All';
      const links = listAllDuplicateLinks(db, status);
      res.json({ duplicates: links });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message || 'Failed to list duplicate links.' });
    }
  });

  router.post('/duplicates/scan', (req: Request, res: Response) => {
    try {
      const db = getDb();
      const minSimilarity = Math.max(
        0.2,
        Math.min(0.98, Number(req.body?.minSimilarity ?? DEFAULT_DUPLICATE_CONFIG.minSimilarity))
      );
      const maxDistanceMeters = Math.max(
        20,
        Math.min(1000, Number(req.body?.maxDistanceMeters ?? DEFAULT_DUPLICATE_CONFIG.maxDistanceMeters))
      );
      const requireRelatedCategory = Boolean(req.body?.requireRelatedCategory ?? true);

      const allReports = listReports(db);
      const seenPairs = new Set<string>();
      const scannedPairs: Array<{
        sourceReportId: string;
        sourceTitle: string;
        sourceCategory: string;
        relatedReportId: string;
        relatedTitle: string;
        relatedCategory: string;
        similarityScore: number;
        distanceMeters: number;
      }> = [];

      for (const r of allReports) {
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
          allReports,
          { minSimilarity, maxDistanceMeters, requireRelatedCategory }
        );

        for (const m of matches) {
          const key = [r.reportId, m.relatedReportId].sort().join('::');
          if (seenPairs.has(key)) continue;
          seenPairs.add(key);
          scannedPairs.push({
            sourceReportId: r.reportId,
            sourceTitle: r.title,
            sourceCategory: r.category,
            relatedReportId: m.relatedReportId,
            relatedTitle: m.relatedTitle || '',
            relatedCategory: m.relatedCategory || '',
            similarityScore: m.similarityScore,
            distanceMeters: m.distanceMeters,
          });
        }
      }

      scannedPairs.sort((a, b) => b.similarityScore - a.similarityScore);
      res.json({
        scannedCount: allReports.length,
        matches: scannedPairs.slice(0, 40),
        thresholds: { minSimilarity, maxDistanceMeters, requireRelatedCategory },
      });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message || 'Duplicate scan failed.' });
    }
  });

  router.patch('/duplicates/:id', (req: Request, res: Response) => {
    try {
      const db = getDb();
      const linkId = Number(req.params.id);
      if (!Number.isInteger(linkId) || linkId <= 0) {
        res.status(400).json({ error: 'Invalid duplicate link ID.' });
        return;
      }
      const updated = reviewDuplicateLink(
        db,
        linkId,
        req.body?.reviewStatus,
        req.body?.changedBy
      );
      const kpis = getDashboardKpis(db);
      res.json({ duplicate: updated, kpis });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message || 'Failed to update duplicate status.' });
    }
  });

  router.get('/hotspots', (req: Request, res: Response) => {
    try {
      const db = getDb();
      const hasCustomParams =
        req.query.epsMeters !== undefined || req.query.minSamples !== undefined;

      if (hasCustomParams) {
        const epsMeters = Math.max(
          50,
          Math.min(1000, Number(req.query.epsMeters ?? DEFAULT_HOTSPOT_CONFIG.epsMeters))
        );
        const minSamples = Math.max(
          2,
          Math.min(15, Math.round(Number(req.query.minSamples ?? DEFAULT_HOTSPOT_CONFIG.minSamples)))
        );
        const hotspots = refreshHotspots(db, { epsMeters, minSamples });
        res.json({ hotspots, parameters: { epsMeters, minSamples } });
        return;
      }

      const stored = listStoredHotspots(db);
      res.json({
        hotspots: stored.length > 0 ? stored : refreshHotspots(db),
        parameters: DEFAULT_HOTSPOT_CONFIG,
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message || 'Failed to detect geographic hotspots.' });
    }
  });

  router.post('/ai/analyze-preview', async (req: Request, res: Response) => {
    try {
      const db = getDb();
      const title = String(req.body?.title ?? '').trim();
      const description = String(req.body?.description ?? '').trim();
      if (description.length < 8) {
        res.status(400).json({ error: 'Provide at least 8 characters of complaint text to run AI analysis.' });
        return;
      }

      const latRaw = req.body?.latitude;
      const lngRaw = req.body?.longitude;
      const latitude =
        latRaw !== undefined && latRaw !== null && String(latRaw).trim() !== ''
          ? Number(latRaw)
          : null;
      const longitude =
        lngRaw !== undefined && lngRaw !== null && String(lngRaw).trim() !== ''
          ? Number(lngRaw)
          : null;

      const locationName = resolveNearestLandmark(latitude, longitude, req.body?.locationName);
      const classification = await classifyComplaint(title, description, req.body?.category);
      const summary = await summarizeComplaint(title, description, locationName, classification);

      const existingReports = listReports(db);
      const potentialDuplicates =
        latitude !== null && longitude !== null && Number.isFinite(latitude) && Number.isFinite(longitude)
          ? detectDuplicates(
              {
                reportId: 'PREVIEW-TEMP',
                title,
                description,
                category: classification.primaryCategory,
                secondaryCategory: classification.secondaryCategory,
                latitude,
                longitude,
                locationName,
              },
              existingReports
            )
          : [];

      const priority = calculateExplainablePriority({
        title,
        description,
        category: classification.primaryCategory,
        secondaryCategory: classification.secondaryCategory,
        latitude: Number.isFinite(latitude) ? latitude : null,
        longitude: Number.isFinite(longitude) ? longitude : null,
        locationName,
        safetyConcern: classification.safetyConcern,
        safetyReasons: classification.safetyReasons,
        confirmedRelatedCount: Number(req.body?.confirmedRelatedCount ?? 0),
      });

      res.json({
        classification,
        summary,
        priority,
        potentialDuplicates: potentialDuplicates.slice(0, 5),
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message || 'AI preview analysis failed.' });
    }
  });

  router.post('/ai/action-brief', async (req: Request, res: Response) => {
    try {
      const db = getDb();
      const targetType = req.body?.targetType === 'report' ? 'report' : 'hotspot';
      const targetId = String(req.body?.targetId ?? '').trim();

      if (!targetId) {
        res.status(400).json({ error: 'Please select a hotspot or complaint ID to generate an Action Brief.' });
        return;
      }

      const allReports = listReports(db);

      if (targetType === 'hotspot') {
        const hotspots = listStoredHotspots(db);
        const hotspot = hotspots.find((h) => h.hotspotId === targetId) ?? null;
        if (!hotspot) {
          res.status(404).json({ error: `Hotspot "${targetId}" was not found.` });
          return;
        }
        const memberSet = new Set(hotspot.reportIds);
        const clusterReports = allReports.filter((r) => memberSet.has(r.reportId));
        const brief = await generateActionBrief({
          targetType: 'hotspot',
          targetId,
          reports: clusterReports,
          hotspot,
        });
        res.json({ brief });
        return;
      }

      const detail = getReportDetail(db, targetId);
      if (!detail) {
        res.status(404).json({ error: `Complaint "${targetId}" was not found.` });
        return;
      }

      const linkedIds = new Set<string>([
        detail.reportId,
        ...detail.duplicateLinks
          .filter((d) => d.reviewStatus === 'Confirmed')
          .map((d) => d.relatedReportId),
      ]);
      const relatedReports = allReports.filter((r) => linkedIds.has(r.reportId));

      const brief = await generateActionBrief({
        targetType: 'report',
        targetId,
        reports: relatedReports,
      });
      res.json({ brief });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message || 'Failed to generate Municipal Action Brief.' });
    }
  });

  router.get('/track/:id', (req: Request, res: Response) => {
    try {
      const db = getDb();
      const result = getPublicTrackingReport(db, String(req.params.id));
      if (result.error || !result.report) {
        res.status(404).json({ error: result.error || 'Complaint tracking ID not found.' });
        return;
      }
      res.json({ report: result.report });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message || 'Tracking lookup failed.' });
    }
  });

  router.post('/demo/load', (_req: Request, res: Response) => {
    try {
      const db = getDb();
      const result = loadDemoDataset(db);
      const kpis = getDashboardKpis(db);
      res.json({
        message:
          result.insertedCount > 0
            ? `Loaded ${result.insertedCount} demonstration reports safely without overwriting existing records.`
            : 'All 52 synthetic demonstration reports are already present in the database; existing reports preserved.',
        ...result,
        kpis,
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message || 'Failed to load synthetic demo dataset.' });
    }
  });

  return router;
}

async function startServer() {
  const db = getDb();
  const countRow = db.prepare('SELECT COUNT(*) AS cnt FROM reports').get() as { cnt: number };
  if (Number(countRow.cnt) === 0) {
    loadDemoDataset(db);
  } else {
    const hotspotCount = db.prepare('SELECT COUNT(*) AS cnt FROM hotspots').get() as { cnt: number };
    if (Number(hotspotCount.cnt) === 0) {
      refreshHotspots(db);
    }
  }

  const app = express();
  app.use(express.json({ limit: '2mb' }));

  app.use(
    '/uploads',
    (_req, res, next) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      next();
    },
    express.static(UPLOADS_DIR)
  );

  app.use('/api', createApiRouter());

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`CivicPulse AI running on http://0.0.0.0:${PORT}`);
  });
}

// Start server when executed directly
const isDirectExecution =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(import.meta.filename || 'server.ts');

if (isDirectExecution) {
  startServer().catch((err) => {
    console.error('Failed to start CivicPulse AI server:', err);
    process.exit(1);
  });
}
