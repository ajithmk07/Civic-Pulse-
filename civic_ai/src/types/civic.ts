export const CIVIC_CATEGORIES = [
  'Road Damage',
  'Waterlogging',
  'Garbage Management',
  'Drainage',
  'Streetlight',
  'Electrical Hazard',
  'Water Supply',
  'Public Infrastructure',
  'Other',
] as const;

export type CivicCategory = (typeof CIVIC_CATEGORIES)[number];

export const WORKFLOW_STATUSES = [
  'Submitted',
  'Under Review',
  'Assigned',
  'In Progress',
  'Resolved',
  'Rejected',
] as const;

export type WorkflowStatus = (typeof WORKFLOW_STATUSES)[number];

export const PRIORITY_LEVELS = ['Critical', 'High', 'Medium', 'Low'] as const;

export type PriorityLevel = (typeof PRIORITY_LEVELS)[number];

export const DUPLICATE_REVIEW_STATUSES = ['Suggested', 'Confirmed', 'Rejected'] as const;

export type DuplicateReviewStatus = (typeof DUPLICATE_REVIEW_STATUSES)[number];

export interface PriorityFactorContribution {
  factor: 'Severity' | 'Urgency' | 'Recurrence' | 'Community Impact';
  weight: number;
  rawScore: number;
  weightedContribution: number;
  rationale: string;
}

export interface PriorityEvaluation {
  severityScore: number;
  urgencyScore: number;
  recurrenceScore: number;
  impactScore: number;
  baseFormulaScore: number;
  priorityScore: number;
  priorityLevel: PriorityLevel;
  safetyConcern: boolean;
  safetyOverride: boolean;
  safetyOverrideReason: string | null;
  explanations: string[];
  contributions: PriorityFactorContribution[];
  advisoryNotice: string;
}

export interface ClassificationResult {
  primaryCategory: CivicCategory;
  secondaryCategory: CivicCategory | null;
  suggestedDepartment: string;
  safetyConcern: boolean;
  safetyReasons: string[];
  confidence: number;
  engineSource: 'gemini-3.8-flash' | 'deterministic-nlp';
}

export interface SummaryResult {
  summary: string;
  whatHappened: string;
  whereHappened: string;
  potentialImpact: string;
  safetyConcernText: string;
  engineSource: 'gemini-3.8-flash' | 'deterministic-nlp';
}

export interface DuplicateMatch {
  id?: number;
  sourceReportId: string;
  relatedReportId: string;
  relatedTitle?: string;
  relatedCategory?: CivicCategory;
  relatedStatus?: WorkflowStatus;
  relatedLocationName?: string;
  similarityScore: number; // 0 to 1
  distanceMeters: number;
  reviewStatus: DuplicateReviewStatus;
  confirmedAt: string | null;
  reason?: string;
}

export interface ActivityLogEntry {
  id: number;
  reportId: string;
  previousStatus: string | null;
  newStatus: string;
  publicUpdate: string;
  internalNote?: string; // Omitted in public citizen tracking API
  changedBy: string;
  createdAt: string;
}

export interface CivicReport {
  reportId: string;
  title: string;
  description: string;
  imagePaths: string[];
  locationName: string;
  category: CivicCategory;
  secondaryCategory: CivicCategory | null;
  latitude: number | null;
  longitude: number | null;
  aiSummary: string;
  severityScore: number;
  urgencyScore: number;
  recurrenceScore: number;
  impactScore: number;
  priorityScore: number;
  priorityLevel: PriorityLevel;
  priorityExplanation: PriorityEvaluation;
  safetyConcern: boolean;
  safetyOverride: boolean;
  safetyOverrideReason: string | null;
  manualOverrideLevel: PriorityLevel | null;
  manualOverrideReason: string | null;
  department: string;
  assignedStaff: string;
  status: WorkflowStatus;
  isDemo: boolean;
  confirmedDuplicateCount: number;
  suggestedDuplicateCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CivicReportDetail extends CivicReport {
  duplicateLinks: DuplicateMatch[];
  activityLog: ActivityLogEntry[];
}

export interface PublicTrackedReport {
  reportId: string;
  title: string;
  category: CivicCategory;
  secondaryCategory: CivicCategory | null;
  locationName: string;
  latitude: number | null;
  longitude: number | null;
  createdAt: string;
  updatedAt: string;
  priorityLevel: PriorityLevel;
  priorityScore: number;
  status: WorkflowStatus;
  department: string;
  latestPublicUpdate: string;
  timeline: Array<{
    id: number;
    previousStatus: string | null;
    newStatus: string;
    publicUpdate: string;
    createdAt: string;
  }>;
}

export interface GeographicHotspot {
  hotspotId: string;
  areaName: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  reportCount: number;
  dominantCategory: CivicCategory;
  categoryBreakdown: Record<string, number>;
  priorityLevel: PriorityLevel;
  highestScore: number;
  reportIds: string[];
  description: string;
  generatedAt: string;
}

export interface ActionBrief {
  briefTitle: string;
  generatedAt: string;
  engineSource: 'gemini-3.8-flash' | 'deterministic-template';
  targetType: 'hotspot' | 'report';
  targetId: string;
  verifiedFacts: {
    affectedLocation: string;
    coordinates: string;
    relatedReportCount: number;
    confirmedDuplicatesCount: number;
    reportIds: string[];
    categoryBreakdown: Record<string, number>;
    highestPriorityLevel: PriorityLevel;
    highestPriorityScore: number;
    unresolvedCount: number;
  };
  advisoryRecommendations: {
    problemSummary: string;
    potentialImpact: string;
    supportingEvidence: string[];
    suggestedDepartment: string;
    recommendedNextActions: string[];
    safetyConsiderations: string[];
    disclaimer: string;
  };
}

export interface DashboardKPIs {
  totalReports: number;
  pendingReports: number;
  criticalReports: number;
  highPriorityReports: number;
  resolvedReports: number;
  duplicateReports: number;
  confirmedDuplicates: number;
  suggestedDuplicates: number;
  hotspotCount: number;
  demoReportCount: number;
  citizenReportCount: number;
  categoryCounts: Record<string, number>;
  statusCounts: Record<string, number>;
  priorityCounts: Record<PriorityLevel, number>;
}
