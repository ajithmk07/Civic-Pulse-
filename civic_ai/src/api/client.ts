import type {
  ActionBrief,
  CivicReport,
  CivicReportDetail,
  ClassificationResult,
  DashboardKPIs,
  DuplicateMatch,
  DuplicateReviewStatus,
  GeographicHotspot,
  PriorityEvaluation,
  PriorityLevel,
  PublicTrackedReport,
  SummaryResult,
  WorkflowStatus,
} from '../types/civic';

export interface MunicipalZoneInfo {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  ward: string;
  publicFacilityType: string;
}

export interface OverviewResponse {
  kpis: DashboardKPIs;
  departments: string[];
  zones: MunicipalZoneInfo[];
  hotspots: GeographicHotspot[];
  defaultThresholds: {
    duplicate: {
      minSimilarity: number;
      maxDistanceMeters: number;
      requireRelatedCategory: boolean;
    };
    hotspot: {
      epsMeters: number;
      minSamples: number;
    };
  };
}

async function handleJson<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `Request failed with status ${res.status}`);
  }
  return data as T;
}

export const civicApi = {
  getOverview(): Promise<OverviewResponse> {
    return fetch('/api/overview').then((r) => handleJson<OverviewResponse>(r));
  },

  getReports(params: {
    search?: string;
    category?: string;
    priority?: string;
    status?: string;
    sortBy?: string;
  } = {}): Promise<{ reports: CivicReport[] }> {
    const qs = new URLSearchParams();
    if (params.search) qs.set('search', params.search);
    if (params.category && params.category !== 'All') qs.set('category', params.category);
    if (params.priority && params.priority !== 'All') qs.set('priority', params.priority);
    if (params.status && params.status !== 'All') qs.set('status', params.status);
    if (params.sortBy) qs.set('sortBy', params.sortBy);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return fetch(`/api/reports${suffix}`).then((r) => handleJson<{ reports: CivicReport[] }>(r));
  },

  getReportDetail(reportId: string): Promise<{ report: CivicReportDetail }> {
    return fetch(`/api/reports/${encodeURIComponent(reportId)}`).then((r) =>
      handleJson<{ report: CivicReportDetail }>(r)
    );
  },

  submitComplaint(formData: FormData): Promise<{
    report: CivicReportDetail;
    classificationSource: string;
    summarySource: string;
  }> {
    return fetch('/api/reports', {
      method: 'POST',
      body: formData,
    }).then((r) =>
      handleJson<{
        report: CivicReportDetail;
        classificationSource: string;
        summarySource: string;
      }>(r)
    );
  },

  updateWorkflow(
    reportId: string,
    payload: {
      status?: WorkflowStatus;
      department?: string;
      assignedStaff?: string;
      publicUpdate?: string;
      internalNote?: string;
      changedBy?: string;
    }
  ): Promise<{ report: CivicReportDetail; kpis: DashboardKPIs }> {
    return fetch(`/api/reports/${encodeURIComponent(reportId)}/workflow`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then((r) => handleJson<{ report: CivicReportDetail; kpis: DashboardKPIs }>(r));
  },

  overridePriority(
    reportId: string,
    payload: {
      manualLevel: PriorityLevel | null;
      reason: string;
      changedBy?: string;
    }
  ): Promise<{ report: CivicReportDetail; kpis: DashboardKPIs }> {
    return fetch(`/api/reports/${encodeURIComponent(reportId)}/priority-override`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then((r) => handleJson<{ report: CivicReportDetail; kpis: DashboardKPIs }>(r));
  },

  getDuplicates(status = 'All'): Promise<{
    duplicates: Array<
      DuplicateMatch & {
        sourceTitle: string;
        sourceCategory: string;
        sourceLocationName: string;
      }
    >;
  }> {
    return fetch(`/api/duplicates?status=${encodeURIComponent(status)}`).then((r) =>
      handleJson(r)
    );
  },

  scanDuplicates(params: {
    minSimilarity: number;
    maxDistanceMeters: number;
    requireRelatedCategory: boolean;
  }): Promise<{
    scannedCount: number;
    matches: Array<{
      sourceReportId: string;
      sourceTitle: string;
      sourceCategory: string;
      relatedReportId: string;
      relatedTitle: string;
      relatedCategory: string;
      similarityScore: number;
      distanceMeters: number;
    }>;
  }> {
    return fetch('/api/duplicates/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    }).then((r) => handleJson(r));
  },

  reviewDuplicate(
    linkId: number,
    reviewStatus: DuplicateReviewStatus
  ): Promise<{ duplicate: DuplicateMatch; kpis: DashboardKPIs }> {
    return fetch(`/api/duplicates/${linkId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reviewStatus }),
    }).then((r) => handleJson(r));
  },

  getHotspots(params?: { epsMeters: number; minSamples: number }): Promise<{
    hotspots: GeographicHotspot[];
    parameters: { epsMeters: number; minSamples: number };
  }> {
    const suffix = params
      ? `?epsMeters=${encodeURIComponent(params.epsMeters)}&minSamples=${encodeURIComponent(
          params.minSamples
        )}`
      : '';
    return fetch(`/api/hotspots${suffix}`).then((r) => handleJson(r));
  },

  analyzePreview(payload: {
    title: string;
    description: string;
    category?: string;
    latitude?: number | null;
    longitude?: number | null;
    locationName?: string;
    confirmedRelatedCount?: number;
  }): Promise<{
    classification: ClassificationResult;
    summary: SummaryResult;
    priority: PriorityEvaluation;
    potentialDuplicates: DuplicateMatch[];
  }> {
    return fetch('/api/ai/analyze-preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then((r) => handleJson(r));
  },

  generateActionBrief(params: {
    targetType: 'hotspot' | 'report';
    targetId: string;
  }): Promise<{ brief: ActionBrief }> {
    return fetch('/api/ai/action-brief', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    }).then((r) => handleJson<{ brief: ActionBrief }>(r));
  },

  trackComplaint(trackingId: string): Promise<{ report: PublicTrackedReport }> {
    return fetch(`/api/track/${encodeURIComponent(trackingId)}`).then((r) =>
      handleJson<{ report: PublicTrackedReport }>(r)
    );
  },

  loadDemoData(): Promise<{
    message: string;
    insertedCount: number;
    totalReports: number;
    hotspotsCount: number;
    kpis: DashboardKPIs;
  }> {
    return fetch('/api/demo/load', { method: 'POST' }).then((r) => handleJson(r));
  },
};
