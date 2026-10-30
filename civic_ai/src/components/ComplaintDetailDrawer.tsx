import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Check,
  FileText,
  Image as ImageIcon,
  Link2,
  ShieldAlert,
  Sparkles,
  X,
} from 'lucide-react';
import { civicApi } from '../api/client';
import {
  PRIORITY_LEVELS,
  WORKFLOW_STATUSES,
  type ActionBrief,
  type CivicReportDetail,
  type DashboardKPIs,
  type PriorityLevel,
  type WorkflowStatus,
} from '../types/civic';
import { PriorityIndicator, StatusIndicator } from './PriorityIndicator';

interface ComplaintDetailDrawerProps {
  reportId: string | null;
  departments: string[];
  onClose: () => void;
  onUpdated: (kpis?: DashboardKPIs) => void;
}

export function ComplaintDetailDrawer({
  reportId,
  departments,
  onClose,
  onUpdated,
}: ComplaintDetailDrawerProps) {
  const [detail, setDetail] = useState<CivicReportDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Workflow form state
  const [status, setStatus] = useState<WorkflowStatus>('Submitted');
  const [department, setDepartment] = useState('Public Works Department');
  const [assignedStaff, setAssignedStaff] = useState('');
  const [publicUpdate, setPublicUpdate] = useState('');
  const [internalNote, setInternalNote] = useState('');
  const [savingWorkflow, setSavingWorkflow] = useState(false);

  // Manual priority override form state
  const [overrideLevel, setOverrideLevel] = useState<PriorityLevel | 'NONE'>('NONE');
  const [overrideReason, setOverrideReason] = useState('');
  const [savingOverride, setSavingOverride] = useState(false);

  // Action brief state
  const [brief, setBrief] = useState<ActionBrief | null>(null);
  const [generatingBrief, setGeneratingBrief] = useState(false);

  // Broken image fallback tracking
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!reportId) {
      setDetail(null);
      setBrief(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setFeedback(null);
    setBrief(null);

    civicApi
      .getReportDetail(reportId)
      .then((res) => {
        if (cancelled) return;
        setDetail(res.report);
        setStatus(res.report.status);
        setDepartment(res.report.department);
        setAssignedStaff(
          res.report.assignedStaff === 'Unassigned' ? '' : res.report.assignedStaff
        );
        setPublicUpdate('');
        setInternalNote('');
        setOverrideLevel(res.report.manualOverrideLevel ?? 'NONE');
        setOverrideReason(res.report.manualOverrideReason ?? '');
      })
      .catch((err) => {
        if (!cancelled) setError((err as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [reportId]);

  if (!reportId) return null;

  const handleSaveWorkflow = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail) return;
    setSavingWorkflow(true);
    setError(null);
    setFeedback(null);
    try {
      const res = await civicApi.updateWorkflow(detail.reportId, {
        status,
        department,
        assignedStaff: assignedStaff.trim() || 'Unassigned',
        publicUpdate: publicUpdate.trim(),
        internalNote: internalNote.trim(),
        changedBy: assignedStaff.trim() || 'Municipal Duty Officer',
      });
      setDetail(res.report);
      setPublicUpdate('');
      setInternalNote('');
      setFeedback('Workflow assignment and status saved persistently to SQLite.');
      onUpdated(res.kpis);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingWorkflow(false);
    }
  };

  const handleApplyOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail) return;
    setSavingOverride(true);
    setError(null);
    setFeedback(null);
    try {
      const res = await civicApi.overridePriority(detail.reportId, {
        manualLevel: overrideLevel === 'NONE' ? null : overrideLevel,
        reason: overrideReason,
        changedBy: 'Municipal Duty Officer',
      });
      setDetail(res.report);
      setFeedback(
        overrideLevel === 'NONE'
          ? 'Manual priority override cleared; restored AI formula priority.'
          : `Manual priority override (${overrideLevel}) recorded with justification.`
      );
      onUpdated(res.kpis);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingOverride(false);
    }
  };

  const handleDuplicateDecision = async (
    linkId: number | undefined,
    decision: 'Confirmed' | 'Rejected'
  ) => {
    if (!linkId || !detail) return;
    setError(null);
    setFeedback(null);
    try {
      const res = await civicApi.reviewDuplicate(linkId, decision);
      const refreshed = await civicApi.getReportDetail(detail.reportId);
      setDetail(refreshed.report);
      setFeedback(
        decision === 'Confirmed'
          ? 'Duplicate link confirmed. Recurrence score recalculated while preserving both citizen submissions.'
          : 'Duplicate suggestion rejected.'
      );
      onUpdated(res.kpis);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleGenerateBrief = async () => {
    if (!detail) return;
    setGeneratingBrief(true);
    setError(null);
    try {
      const res = await civicApi.generateActionBrief({
        targetType: 'report',
        targetId: detail.reportId,
      });
      setBrief(res.brief);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setGeneratingBrief(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-label={`Complaint inspector for ${reportId}`}
    >
      <div className="w-full max-w-2xl bg-white h-full overflow-y-auto border-l border-slate-200 flex flex-col">
        {/* Sticky Top Header */}
        <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="font-mono font-semibold text-slate-900">{reportId}</span>
              {detail?.isDemo && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-slate-500">Synthetic Demo Record</span>
                </>
              )}
              {detail && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{new Date(detail.createdAt).toLocaleString()}</span>
                </>
              )}
            </div>
            <h2 className="text-base font-bold text-slate-900 mt-0.5">
              {detail ? detail.title : 'Loading complaint record...'}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close complaint inspector"
            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6 flex-1">
          {loading && (
            <div className="py-12 text-center text-sm text-slate-500">
              Loading full complaint intelligence and audit history...
            </div>
          )}

          {error && (
            <div className="p-3.5 rounded-lg border border-red-200 bg-red-50 text-xs text-red-800 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          {feedback && (
            <div className="p-3.5 rounded-lg border border-emerald-200 bg-emerald-50 text-xs text-emerald-800 flex items-start gap-2">
              <Check className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
              <span>{feedback}</span>
            </div>
          )}

          {detail && (
            <>
              {/* Metadata Summary Strip */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pb-4 border-b border-slate-100 text-xs text-slate-600">
                <PriorityIndicator
                  level={detail.priorityLevel}
                  score={detail.priorityScore}
                  manualOverride={Boolean(detail.manualOverrideLevel)}
                  safetyOverride={detail.safetyOverride}
                />
                <span aria-hidden="true">·</span>
                <StatusIndicator status={detail.status} />
                <span aria-hidden="true">·</span>
                <span>
                  Category: <strong className="text-slate-900">{detail.category}</strong>
                  {detail.secondaryCategory ? ` + ${detail.secondaryCategory}` : ''}
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  Location: <strong className="text-slate-900">{detail.locationName}</strong>
                  {detail.latitude !== null && detail.longitude !== null && (
                    <span className="font-mono tabular-nums text-slate-500">
                      {' '}
                      ({detail.latitude.toFixed(4)}, {detail.longitude.toFixed(4)})
                    </span>
                  )}
                </span>
              </div>

              {/* Safety Override Alert (if active) */}
              {detail.safetyOverride && detail.safetyOverrideReason && (
                <div className="p-4 rounded-lg border border-red-200 bg-red-50/70">
                  <div className="flex items-center gap-2 text-xs font-bold text-red-900">
                    <ShieldAlert className="w-4 h-4 text-red-700 shrink-0" aria-hidden="true" />
                    <span>Active Life-Safety Priority Override</span>
                  </div>
                  <p className="text-xs text-red-800 mt-1">{detail.safetyOverrideReason}</p>
                </div>
              )}

              {/* Citizen Submission & AI Summary */}
              <section className="space-y-3">
                <div>
                  <h3 className="text-xs font-semibold text-slate-500">Citizen Description</h3>
                  <p className="text-sm text-slate-900 mt-1 leading-relaxed">
                    {detail.description}
                  </p>
                </div>

                <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-900 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-blue-700" aria-hidden="true" />
                      AI Concise Summary
                    </span>
                    <button
                      type="button"
                      onClick={handleGenerateBrief}
                      disabled={generatingBrief}
                      className="px-3 py-1.5 rounded-md bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 transition-colors disabled:opacity-60 whitespace-nowrap"
                    >
                      {generatingBrief ? 'Generating...' : 'GENERATE ACTION BRIEF'}
                    </button>
                  </div>
                  <p className="text-xs text-slate-700 mt-1.5 leading-relaxed">
                    {detail.aiSummary}
                  </p>
                </div>
              </section>

              {/* Generated Action Brief (if requested) */}
              {brief && (
                <section className="p-4 rounded-lg border border-blue-200 bg-blue-50/40 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <FileText className="w-4 h-4 text-blue-700" aria-hidden="true" />
                      {brief.briefTitle}
                    </h3>
                    <span className="text-[11px] font-mono text-slate-500">
                      {brief.engineSource}
                    </span>
                  </div>
                  <p className="text-xs text-slate-800">
                    <strong>Problem:</strong> {brief.advisoryRecommendations.problemSummary}
                  </p>
                  <p className="text-xs text-slate-700">
                    <strong>Suggested Department:</strong>{' '}
                    {brief.advisoryRecommendations.suggestedDepartment}
                  </p>
                  <div>
                    <div className="text-xs font-semibold text-slate-900 mb-1">
                      Recommended Next Actions (Advisory):
                    </div>
                    <ol className="list-decimal list-inside space-y-1 text-xs text-slate-700">
                      {brief.advisoryRecommendations.recommendedNextActions.map((act, idx) => (
                        <li key={idx}>{act}</li>
                      ))}
                    </ol>
                  </div>
                  <p className="text-[11px] text-slate-500 pt-2 border-t border-blue-100">
                    {brief.advisoryRecommendations.disclaimer}
                  </p>
                </section>
              )}

              {/* Uploaded Photographs */}
              {detail.imagePaths.length > 0 && (
                <section className="pt-4 border-t border-slate-100">
                  <h3 className="text-xs font-semibold text-slate-900 mb-2.5 flex items-center gap-1.5">
                    <ImageIcon className="w-3.5 h-3.5 text-slate-600" aria-hidden="true" />
                    Uploaded Evidence Photographs ({detail.imagePaths.length})
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {detail.imagePaths.map((imgUrl) =>
                      failedImages[imgUrl] ? (
                        <div
                          key={imgUrl}
                          className="h-36 rounded-lg border border-slate-200 bg-slate-100 flex flex-col items-center justify-center p-4 text-center"
                        >
                          <ImageIcon className="w-6 h-6 text-slate-400 mb-1" aria-hidden="true" />
                          <span className="text-xs font-medium text-slate-600">
                            Evidence image unavailable on disk
                          </span>
                        </div>
                      ) : (
                        <img
                          key={imgUrl}
                          src={imgUrl}
                          alt={`Photographic evidence for ${detail.reportId}`}
                          referrerPolicy="no-referrer"
                          onError={() =>
                            setFailedImages((prev) => ({ ...prev, [imgUrl]: true }))
                          }
                          className="w-full h-40 object-cover rounded-lg border border-slate-200 bg-slate-900"
                        />
                      )
                    )}
                  </div>
                </section>
              )}

              {/* Explainable Priority Formula Breakdown */}
              <section className="pt-4 border-t border-slate-100 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-slate-900">
                    Explainable Priority Calculation
                  </h3>
                  <span className="font-mono tabular-nums text-xs font-semibold text-slate-800">
                    AI Score: {detail.priorityScore}/100 ({detail.priorityExplanation.priorityLevel})
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {(
                    detail.priorityExplanation.contributions?.length
                      ? detail.priorityExplanation.contributions
                      : [
                          {
                            factor: 'Severity',
                            weight: 0.35,
                            rawScore: detail.severityScore,
                            weightedContribution: Number((0.35 * detail.severityScore).toFixed(1)),
                            rationale: '',
                          },
                          {
                            factor: 'Urgency',
                            weight: 0.3,
                            rawScore: detail.urgencyScore,
                            weightedContribution: Number((0.3 * detail.urgencyScore).toFixed(1)),
                            rationale: '',
                          },
                          {
                            factor: 'Recurrence',
                            weight: 0.2,
                            rawScore: detail.recurrenceScore,
                            weightedContribution: Number((0.2 * detail.recurrenceScore).toFixed(1)),
                            rationale: '',
                          },
                          {
                            factor: 'Community Impact',
                            weight: 0.15,
                            rawScore: detail.impactScore,
                            weightedContribution: Number((0.15 * detail.impactScore).toFixed(1)),
                            rationale: '',
                          },
                        ]
                  ).map((c) => (
                    <div key={c.factor} className="bg-slate-50 rounded-lg p-2.5">
                      <div className="text-[11px] text-slate-500">
                        {c.factor} ({Math.round(c.weight * 100)}%)
                      </div>
                      <div className="font-mono tabular-nums text-sm font-bold text-slate-900 mt-0.5">
                        {c.rawScore}/100
                      </div>
                      <div className="font-mono tabular-nums text-[11px] text-blue-700 mt-0.5">
                        +{c.weightedContribution} pts
                      </div>
                    </div>
                  ))}
                </div>

                {detail.priorityExplanation.explanations?.length > 0 && (
                  <ul className="space-y-1 text-xs text-slate-600 list-disc list-inside">
                    {detail.priorityExplanation.explanations.map((reason, idx) => (
                      <li key={idx}>{reason}</li>
                    ))}
                  </ul>
                )}
                <p className="text-[11px] text-slate-500">
                  {detail.priorityExplanation.advisoryNotice}
                </p>
              </section>

              {/* Duplicate Matches Section */}
              <section className="pt-4 border-t border-slate-100 space-y-2.5">
                <h3 className="text-xs font-semibold text-slate-900 flex items-center gap-1.5">
                  <Link2 className="w-3.5 h-3.5 text-slate-600" aria-hidden="true" />
                  Related & Potential Duplicate Reports ({detail.duplicateLinks.length})
                </h3>
                {detail.duplicateLinks.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    No potential duplicates met the TF-IDF cosine similarity and Haversine distance thresholds.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
                    {detail.duplicateLinks.map((dup) => (
                      <div
                        key={dup.id ?? `${dup.sourceReportId}-${dup.relatedReportId}`}
                        className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-semibold text-slate-900">
                              {dup.relatedReportId}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono tabular-nums text-blue-800 font-medium">
                              {Math.round(dup.similarityScore * 100)}% similarity
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono tabular-nums text-slate-600">
                              {Math.round(dup.distanceMeters)}m away
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="font-medium text-slate-700">{dup.reviewStatus}</span>
                          </div>
                          <p className="text-slate-700 mt-0.5">{dup.relatedTitle}</p>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {dup.reviewStatus !== 'Confirmed' && (
                            <button
                              type="button"
                              onClick={() => handleDuplicateDecision(dup.id, 'Confirmed')}
                              className="px-2.5 py-1 rounded-md bg-emerald-700 text-white font-medium hover:bg-emerald-800 transition-colors"
                            >
                              Confirm Link
                            </button>
                          )}
                          {dup.reviewStatus !== 'Rejected' && (
                            <button
                              type="button"
                              onClick={() => handleDuplicateDecision(dup.id, 'Rejected')}
                              className="px-2.5 py-1 rounded-md border border-slate-300 text-slate-700 hover:bg-slate-100 transition-colors"
                            >
                              Reject
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Authority Assignment & Workflow Update Form */}
              <form
                onSubmit={handleSaveWorkflow}
                className="pt-4 border-t border-slate-200 space-y-3"
              >
                <h3 className="text-xs font-bold text-slate-900">
                  Municipal Assignment & Resolution Workflow
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label
                      htmlFor="drawer-status"
                      className="block text-xs font-medium text-slate-700 mb-1"
                    >
                      Workflow Status
                    </label>
                    <select
                      id="drawer-status"
                      value={status}
                      onChange={(e) => setStatus(e.target.value as WorkflowStatus)}
                      className="w-full text-xs border border-slate-300 rounded-lg px-2.5 py-2 bg-white text-slate-900"
                    >
                      {WORKFLOW_STATUSES.map((st) => (
                        <option key={st} value={st}>
                          {st}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="drawer-department"
                      className="block text-xs font-medium text-slate-700 mb-1"
                    >
                      Assigned Department
                    </label>
                    <select
                      id="drawer-department"
                      value={department}
                      onChange={(e) => setDepartment(e.target.value)}
                      className="w-full text-xs border border-slate-300 rounded-lg px-2.5 py-2 bg-white text-slate-900"
                    >
                      <option value="Unassigned">Unassigned</option>
                      {departments.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="drawer-staff"
                      className="block text-xs font-medium text-slate-700 mb-1"
                    >
                      Responsible Officer / Staff
                    </label>
                    <input
                      id="drawer-staff"
                      type="text"
                      value={assignedStaff}
                      onChange={(e) => setAssignedStaff(e.target.value)}
                      placeholder="e.g. Eng. R. Kulkarni"
                      className="w-full text-xs border border-slate-300 rounded-lg px-2.5 py-2 bg-white text-slate-900"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="drawer-public-update"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Public Citizen Update (Visible in Citizen Tracking)
                  </label>
                  <input
                    id="drawer-public-update"
                    type="text"
                    value={publicUpdate}
                    onChange={(e) => setPublicUpdate(e.target.value)}
                    placeholder="e.g. Field crew dispatched; temporary barricades installed."
                    className="w-full text-xs border border-slate-300 rounded-lg px-3 py-2 bg-white text-slate-900"
                  />
                </div>

                <div>
                  <label
                    htmlFor="drawer-internal-note"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Internal Authority Note (Hidden from Citizens)
                  </label>
                  <textarea
                    id="drawer-internal-note"
                    rows={2}
                    value={internalNote}
                    onChange={(e) => setInternalNote(e.target.value)}
                    placeholder="Private operational notes, work-order codes, or contractor instructions..."
                    className="w-full text-xs border border-slate-300 rounded-lg px-3 py-2 bg-white text-slate-900"
                  />
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={savingWorkflow}
                    className="px-4 py-2 rounded-lg bg-blue-700 text-white text-xs font-semibold hover:bg-blue-800 transition-colors disabled:opacity-60"
                  >
                    {savingWorkflow ? 'Saving Update...' : 'Save Assignment & Status'}
                  </button>
                </div>
              </form>

              {/* Manual Priority Override Form */}
              <form
                onSubmit={handleApplyOverride}
                className="pt-4 border-t border-slate-100 space-y-2.5"
              >
                <h3 className="text-xs font-semibold text-slate-900">
                  Manual Officer Priority Override
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div>
                    <label
                      htmlFor="override-level"
                      className="block text-[11px] text-slate-600 mb-1"
                    >
                      Override Level
                    </label>
                    <select
                      id="override-level"
                      value={overrideLevel}
                      onChange={(e) => setOverrideLevel(e.target.value as PriorityLevel | 'NONE')}
                      className="w-full text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white"
                    >
                      <option value="NONE">Use AI Priority ({detail.priorityExplanation.priorityLevel})</option>
                      {PRIORITY_LEVELS.map((lvl) => (
                        <option key={lvl} value={lvl}>
                          Override: {lvl}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label
                      htmlFor="override-reason"
                      className="block text-[11px] text-slate-600 mb-1"
                    >
                      Recorded Justification (Required for Override)
                    </label>
                    <div className="flex gap-2">
                      <input
                        id="override-reason"
                        type="text"
                        value={overrideReason}
                        onChange={(e) => setOverrideReason(e.target.value)}
                        placeholder="State operational reason for priority override..."
                        className="flex-1 text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white"
                      />
                      <button
                        type="submit"
                        disabled={savingOverride}
                        className="px-3 py-1.5 rounded-lg border border-slate-300 bg-slate-50 text-xs font-medium text-slate-800 hover:bg-slate-100 whitespace-nowrap"
                      >
                        {savingOverride ? 'Applying...' : 'Apply'}
                      </button>
                    </div>
                  </div>
                </div>
              </form>

              {/* Complete Activity History Log */}
              <section className="pt-4 border-t border-slate-100 space-y-2.5">
                <h3 className="text-xs font-semibold text-slate-900">
                  Audit & Activity History ({detail.activityLog.length})
                </h3>
                <div className="space-y-3">
                  {detail.activityLog.map((entry) => (
                    <div
                      key={entry.id}
                      className="text-xs pb-3 border-b border-slate-100 last:border-b-0"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 text-slate-500">
                        <span className="font-semibold text-slate-800">
                          {entry.previousStatus ? `${entry.previousStatus} → ` : ''}
                          {entry.newStatus} · {entry.changedBy}
                        </span>
                        <span className="font-mono tabular-nums">
                          {new Date(entry.createdAt).toLocaleString()}
                        </span>
                      </div>
                      {entry.publicUpdate && (
                        <p className="text-slate-700 mt-1">
                          <span className="font-medium text-slate-900">Public:</span>{' '}
                          {entry.publicUpdate}
                        </p>
                      )}
                      {entry.internalNote && (
                        <p className="text-amber-900 bg-amber-50/70 rounded px-2 py-1 mt-1">
                          <span className="font-semibold">Internal Note:</span>{' '}
                          {entry.internalNote}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
