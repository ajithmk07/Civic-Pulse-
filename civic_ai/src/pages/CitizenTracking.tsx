import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock, Search, Shield } from 'lucide-react';
import { civicApi } from '../api/client';
import { PriorityIndicator, StatusIndicator } from '../components/PriorityIndicator';
import type { PublicTrackedReport, WorkflowStatus } from '../types/civic';

interface CitizenTrackingProps {
  initialTrackingId?: string | null;
  recentIds: string[];
}

const PROGRESS_STEPS: WorkflowStatus[] = [
  'Submitted',
  'Under Review',
  'Assigned',
  'In Progress',
  'Resolved',
];

export function CitizenTracking({ initialTrackingId, recentIds }: CitizenTrackingProps) {
  const [trackingInput, setTrackingInput] = useState(initialTrackingId ?? '');
  const [tracked, setTracked] = useState<PublicTrackedReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const performLookup = async (idToFetch: string) => {
    const cleaned = idToFetch.trim();
    if (!cleaned) {
      setError('Please enter your complaint tracking ID (for example, CP-2026-1042 or DEMO-2026-0001).');
      setTracked(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await civicApi.trackComplaint(cleaned);
      setTracked(res.report);
    } catch (err) {
      setTracked(null);
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialTrackingId) {
      setTrackingInput(initialTrackingId);
      performLookup(initialTrackingId);
    }
  }, [initialTrackingId]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    performLookup(trackingInput);
  };

  const sampleIds = Array.from(
    new Set([...recentIds, 'DEMO-2026-0001', 'DEMO-2026-0016', 'DEMO-2026-0046'])
  ).slice(0, 5);

  const activeStepIndex = tracked
    ? PROGRESS_STEPS.indexOf(tracked.status)
    : -1;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Tracking Search Box */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Track Civic Complaint Status</h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Enter your unique tracking ID to view real-time department assignment, priority assessment, and public progress milestones.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search
              className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="text"
              aria-label="Complaint Tracking ID"
              value={trackingInput}
              onChange={(e) => setTrackingInput(e.target.value)}
              placeholder="Enter Tracking ID (e.g. CP-2026-XXXX or DEMO-2026-0001)"
              className="w-full pl-10 pr-4 py-2.5 font-mono text-sm border border-slate-300 rounded-lg bg-white text-slate-900"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="px-5 py-2.5 rounded-lg bg-blue-700 text-white text-sm font-semibold hover:bg-blue-800 transition-colors whitespace-nowrap"
          >
            {loading ? 'Looking up...' : 'Track Complaint'}
          </button>
        </form>

        {/* Quick Sample IDs */}
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span>Quick lookup IDs:</span>
          {sampleIds.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setTrackingInput(id);
                performLookup(id);
              }}
              className="font-mono text-blue-800 hover:underline font-medium"
            >
              {id}
            </button>
          ))}
        </div>
      </div>

      {/* Friendly Error State */}
      {error && (
        <div
          role="alert"
          className="bg-white border border-red-200 rounded-xl p-5 flex items-start gap-3 text-sm text-red-800"
        >
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <div className="font-semibold text-red-900">Tracking ID Lookup Issue</div>
            <p className="text-xs mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* Tracked Complaint Public Card */}
      {tracked && (
        <div
          data-testid="public-tracking-result"
          className="bg-white border border-slate-200 rounded-xl p-6 space-y-6"
        >
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-5 border-b border-slate-100">
            <div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="font-mono font-bold text-blue-800 text-sm">
                  {tracked.reportId}
                </span>
                <span aria-hidden="true">·</span>
                <span>Submitted {new Date(tracked.createdAt).toLocaleString()}</span>
              </div>
              <h2 className="text-lg font-bold text-slate-900 mt-1">{tracked.title}</h2>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <StatusIndicator status={tracked.status} />
            </div>
          </div>

          {/* Lifecycle Progress Bar */}
          {tracked.status !== 'Rejected' && (
            <div aria-label="Resolution progress steps" className="grid grid-cols-5 gap-2">
              {PROGRESS_STEPS.map((step, idx) => {
                const completed = idx <= activeStepIndex;
                return (
                  <div key={step} className="space-y-1.5">
                    <div
                      className={`h-2 rounded-sm ${
                        completed ? 'bg-blue-700' : 'bg-slate-200'
                      }`}
                    />
                    <div
                      className={`text-[11px] font-medium flex items-center gap-1 ${
                        completed ? 'text-slate-900' : 'text-slate-400'
                      }`}
                    >
                      {completed && (
                        <CheckCircle2 className="w-3 h-3 text-blue-700 shrink-0" aria-hidden="true" />
                      )}
                      <span className="truncate">{step}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Public Details Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 py-4 border-y border-slate-100 text-xs">
            <div>
              <div className="text-slate-500">Category</div>
              <div className="font-semibold text-slate-900 mt-0.5">
                {tracked.category}
                {tracked.secondaryCategory ? ` · ${tracked.secondaryCategory}` : ''}
              </div>
            </div>
            <div>
              <div className="text-slate-500">Location</div>
              <div className="font-semibold text-slate-900 mt-0.5">{tracked.locationName}</div>
              {tracked.latitude !== null && tracked.longitude !== null && (
                <div className="font-mono tabular-nums text-[11px] text-slate-500">
                  {tracked.latitude.toFixed(4)}, {tracked.longitude.toFixed(4)}
                </div>
              )}
            </div>
            <div>
              <div className="text-slate-500">Current Priority</div>
              <div className="mt-0.5">
                <PriorityIndicator level={tracked.priorityLevel} score={tracked.priorityScore} />
              </div>
            </div>
            <div>
              <div className="text-slate-500">Assigned Department</div>
              <div className="font-semibold text-slate-900 mt-0.5">{tracked.department}</div>
            </div>
          </div>

          {/* Latest Public Update */}
          <div className="p-4 rounded-lg bg-slate-50 space-y-1">
            <div className="text-xs font-semibold text-slate-900">Latest Public Update</div>
            <p className="text-sm text-slate-800">{tracked.latestPublicUpdate}</p>
          </div>

          {/* Public Activity Timeline */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-slate-600" aria-hidden="true" />
              Public Activity Timeline ({tracked.timeline.length})
            </h3>
            <div className="space-y-3 pl-2 border-l border-slate-200">
              {tracked.timeline.map((item) => (
                <div key={item.id} className="pl-3 text-xs space-y-0.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-slate-900">
                      {item.previousStatus ? `${item.previousStatus} → ` : ''}
                      {item.newStatus}
                    </span>
                    <span className="font-mono tabular-nums text-slate-500">
                      {new Date(item.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-slate-700">{item.publicUpdate}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-slate-500 pt-2 border-t border-slate-100">
            <Shield className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
            <span>
              Public Transparency View: Internal administrative notes and staff-only work details are protected and never exposed publicly.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
