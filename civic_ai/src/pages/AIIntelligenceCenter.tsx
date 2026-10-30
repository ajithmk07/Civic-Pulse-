import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  FileText,
  GitCompare,
  MapPin,
  Radar,
  ShieldAlert,
  Sliders,
  Sparkles,
} from 'lucide-react';
import { civicApi, type MunicipalZoneInfo } from '../api/client';
import { InteractiveCivicMap } from '../components/InteractiveCivicMap';
import { PriorityIndicator, StatusIndicator } from '../components/PriorityIndicator';
import {
  CIVIC_CATEGORIES,
  PRIORITY_LEVELS,
  WORKFLOW_STATUSES,
  type ActionBrief,
  type CivicReport,
  type ClassificationResult,
  type DashboardKPIs,
  type DuplicateMatch,
  type GeographicHotspot,
  type PriorityEvaluation,
  type SummaryResult,
} from '../types/civic';

interface AIIntelligenceCenterProps {
  reports: CivicReport[];
  initialHotspots: GeographicHotspot[];
  zones: MunicipalZoneInfo[];
  onSelectReport: (reportId: string) => void;
  onKpisUpdated: (kpis?: DashboardKPIs) => void;
}

type SubTab = 'hotspots' | 'duplicates' | 'sandbox';

export function AIIntelligenceCenter({
  reports,
  initialHotspots,
  zones,
  onSelectReport,
  onKpisUpdated,
}: AIIntelligenceCenterProps) {
  const [activeTab, setActiveTab] = useState<SubTab>('hotspots');

  // Map & Hotspot state
  const [mapPriority, setMapPriority] = useState('All');
  const [mapCategory, setMapCategory] = useState('All');
  const [mapStatus, setMapStatus] = useState('All');
  const [showHotspots, setShowHotspots] = useState(true);
  const [epsMeters, setEpsMeters] = useState(200);
  const [minSamples, setMinSamples] = useState(3);
  const [hotspots, setHotspots] = useState<GeographicHotspot[]>(initialHotspots);
  const [selectedHotspotId, setSelectedHotspotId] = useState<string | null>(
    initialHotspots[0]?.hotspotId ?? null
  );
  const [clusteringLoading, setClusteringLoading] = useState(false);

  // Action Brief state
  const [briefTargetType, setBriefTargetType] = useState<'hotspot' | 'report'>('hotspot');
  const [briefTargetId, setBriefTargetId] = useState<string>(
    initialHotspots[0]?.hotspotId ?? reports[0]?.reportId ?? ''
  );
  const [brief, setBrief] = useState<ActionBrief | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);
  const [briefError, setBriefError] = useState<string | null>(null);

  // Duplicate Detection state
  const [storedDuplicates, setStoredDuplicates] = useState<
    Array<
      DuplicateMatch & {
        sourceTitle: string;
        sourceCategory: string;
        sourceLocationName: string;
      }
    >
  >([]);
  const [dupStatusFilter, setDupStatusFilter] = useState('All');
  const [minSimilarity, setMinSimilarity] = useState(0.65);
  const [maxDistanceMeters, setMaxDistanceMeters] = useState(150);
  const [requireRelatedCategory, setRequireRelatedCategory] = useState(true);
  const [scanResults, setScanResults] = useState<
    Array<{
      sourceReportId: string;
      sourceTitle: string;
      sourceCategory: string;
      relatedReportId: string;
      relatedTitle: string;
      relatedCategory: string;
      similarityScore: number;
      distanceMeters: number;
    }> | null
  >(null);
  const [scanningDups, setScanningDups] = useState(false);
  const [dupNotice, setDupNotice] = useState<string | null>(null);

  // Live AI Sandbox state
  const [sandboxTitle, setSandboxTitle] = useState(
    'Huge pothole near college entrance collecting rainwater'
  );
  const [sandboxDesc, setSandboxDesc] = useState(
    'There is a huge pothole near the college entrance. Rainwater is collecting inside it and vehicles are almost falling.'
  );
  const [sandboxLat, setSandboxLat] = useState('12.97214');
  const [sandboxLng, setSandboxLng] = useState('77.59486');
  const [sandboxConfirmedCount, setSandboxConfirmedCount] = useState(2);
  const [sandboxLoading, setSandboxLoading] = useState(false);
  const [sandboxResult, setSandboxResult] = useState<{
    classification: ClassificationResult;
    summary: SummaryResult;
    priority: PriorityEvaluation;
    potentialDuplicates: DuplicateMatch[];
  } | null>(null);

  useEffect(() => {
    setHotspots(initialHotspots);
    if (!selectedHotspotId && initialHotspots[0]) {
      setSelectedHotspotId(initialHotspots[0].hotspotId);
      setBriefTargetId(initialHotspots[0].hotspotId);
    }
  }, [initialHotspots, selectedHotspotId]);

  useEffect(() => {
    civicApi.getDuplicates(dupStatusFilter).then((res) => {
      setStoredDuplicates(res.duplicates);
    });
  }, [dupStatusFilter, reports.length]);

  const filteredMapReports = useMemo(() => {
    return reports.filter((r) => {
      if (mapPriority !== 'All' && r.priorityLevel !== mapPriority) return false;
      if (mapCategory !== 'All' && r.category !== mapCategory && r.secondaryCategory !== mapCategory) {
        return false;
      }
      if (mapStatus !== 'All' && r.status !== mapStatus) return false;
      return true;
    });
  }, [reports, mapPriority, mapCategory, mapStatus]);

  const handleRecomputeHotspots = async (e: React.FormEvent) => {
    e.preventDefault();
    setClusteringLoading(true);
    try {
      const res = await civicApi.getHotspots({ epsMeters, minSamples });
      setHotspots(res.hotspots);
      if (res.hotspots[0]) {
        setSelectedHotspotId(res.hotspots[0].hotspotId);
        if (briefTargetType === 'hotspot') {
          setBriefTargetId(res.hotspots[0].hotspotId);
        }
      }
    } finally {
      setClusteringLoading(false);
    }
  };

  const handleGenerateBrief = async (
    overrideType?: 'hotspot' | 'report',
    overrideId?: string
  ) => {
    const tType = overrideType ?? briefTargetType;
    const tId = overrideId ?? briefTargetId;
    if (!tId) return;

    setBriefTargetType(tType);
    setBriefTargetId(tId);
    setBriefLoading(true);
    setBriefError(null);
    try {
      const res = await civicApi.generateActionBrief({
        targetType: tType,
        targetId: tId,
      });
      setBrief(res.brief);
    } catch (err) {
      setBriefError((err as Error).message);
    } finally {
      setBriefLoading(false);
    }
  };

  const handleReviewDuplicate = async (
    linkId: number | undefined,
    decision: 'Confirmed' | 'Rejected'
  ) => {
    if (!linkId) return;
    setDupNotice(null);
    const res = await civicApi.reviewDuplicate(linkId, decision);
    const updatedList = await civicApi.getDuplicates(dupStatusFilter);
    setStoredDuplicates(updatedList.duplicates);
    setDupNotice(
      decision === 'Confirmed'
        ? 'Duplicate relationship confirmed. Recurrence and priority scores updated without deleting citizen reports.'
        : 'Duplicate suggestion marked as Rejected.'
    );
    onKpisUpdated(res.kpis);
  };

  const handleRunDuplicateScan = async (e: React.FormEvent) => {
    e.preventDefault();
    setScanningDups(true);
    try {
      const res = await civicApi.scanDuplicates({
        minSimilarity,
        maxDistanceMeters,
        requireRelatedCategory,
      });
      setScanResults(res.matches);
    } finally {
      setScanningDups(false);
    }
  };

  const handleRunSandbox = async (e: React.FormEvent) => {
    e.preventDefault();
    setSandboxLoading(true);
    try {
      const res = await civicApi.analyzePreview({
        title: sandboxTitle,
        description: sandboxDesc,
        latitude: sandboxLat ? Number(sandboxLat) : null,
        longitude: sandboxLng ? Number(sandboxLng) : null,
        confirmedRelatedCount: sandboxConfirmedCount,
      });
      setSandboxResult(res);
    } finally {
      setSandboxLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header + Segmented Interactive Sub-Navigation */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">AI Intelligence Center</h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Geospatial Haversine DBSCAN hotspots, Municipal Action Brief generation, TF-IDF duplicate detection, and explainable priority scoring.
          </p>
        </div>

        <div
          role="tablist"
          aria-label="AI Intelligence capabilities"
          className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'hotspots'}
            onClick={() => setActiveTab('hotspots')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
              activeTab === 'hotspots'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Geospatial Hotspots & Briefs
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'duplicates'}
            onClick={() => setActiveTab('duplicates')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
              activeTab === 'duplicates'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Duplicate Detection ({storedDuplicates.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'sandbox'}
            onClick={() => setActiveTab('sandbox')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
              activeTab === 'sandbox'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Classifier & Priority Inspector
          </button>
        </div>
      </div>

      {/* SUBTAB 1: GEOSPATIAL HOTSPOTS & MUNICIPAL ACTION BRIEF */}
      {activeTab === 'hotspots' && (
        <div className="space-y-6">
          {/* Map Filter Bar + DBSCAN Parameters */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 grid grid-cols-1 lg:grid-cols-12 gap-4 items-end">
            <div className="lg:col-span-7 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label htmlFor="map-filter-prio" className="block text-[11px] font-medium text-slate-600 mb-1">
                  Map Priority
                </label>
                <select
                  id="map-filter-prio"
                  value={mapPriority}
                  onChange={(e) => setMapPriority(e.target.value)}
                  className="w-full text-xs border border-slate-300 rounded-lg px-2.5 py-2 bg-white"
                >
                  <option value="All">All Priorities</option>
                  {PRIORITY_LEVELS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="map-filter-cat" className="block text-[11px] font-medium text-slate-600 mb-1">
                  Map Category
                </label>
                <select
                  id="map-filter-cat"
                  value={mapCategory}
                  onChange={(e) => setMapCategory(e.target.value)}
                  className="w-full text-xs border border-slate-300 rounded-lg px-2.5 py-2 bg-white"
                >
                  <option value="All">All Categories</option>
                  {CIVIC_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="map-filter-status" className="block text-[11px] font-medium text-slate-600 mb-1">
                  Map Status
                </label>
                <select
                  id="map-filter-status"
                  value={mapStatus}
                  onChange={(e) => setMapStatus(e.target.value)}
                  className="w-full text-xs border border-slate-300 rounded-lg px-2.5 py-2 bg-white"
                >
                  <option value="All">All Statuses</option>
                  {WORKFLOW_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center pt-5">
                <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showHotspots}
                    onChange={(e) => setShowHotspots(e.target.checked)}
                    className="rounded border-slate-300 text-blue-700"
                  />
                  <span>Show Hotspots</span>
                </label>
              </div>
            </div>

            {/* DBSCAN Clustering Parameters */}
            <form
              onSubmit={handleRecomputeHotspots}
              className="lg:col-span-5 grid grid-cols-3 gap-2.5 items-end border-t lg:border-t-0 lg:border-l border-slate-200 pt-3 lg:pt-0 lg:pl-4"
            >
              <div>
                <label htmlFor="dbscan-eps" className="block text-[11px] font-medium text-slate-600 mb-1">
                  DBSCAN Radius (m)
                </label>
                <input
                  id="dbscan-eps"
                  type="number"
                  min={50}
                  max={800}
                  step={25}
                  value={epsMeters}
                  onChange={(e) => setEpsMeters(Number(e.target.value))}
                  className="w-full font-mono tabular-nums text-xs border border-slate-300 rounded-lg px-2.5 py-2 bg-white"
                />
              </div>
              <div>
                <label htmlFor="dbscan-minpts" className="block text-[11px] font-medium text-slate-600 mb-1">
                  Min Reports
                </label>
                <input
                  id="dbscan-minpts"
                  type="number"
                  min={2}
                  max={12}
                  value={minSamples}
                  onChange={(e) => setMinSamples(Number(e.target.value))}
                  className="w-full font-mono tabular-nums text-xs border border-slate-300 rounded-lg px-2.5 py-2 bg-white"
                />
              </div>
              <button
                type="submit"
                disabled={clusteringLoading}
                className="py-2 px-3 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 transition-colors whitespace-nowrap"
              >
                {clusteringLoading ? 'Clustering...' : 'Run DBSCAN'}
              </button>
            </form>
          </div>

          {/* Interactive Geospatial Map */}
          <InteractiveCivicMap
            reports={filteredMapReports}
            hotspots={hotspots}
            zones={zones}
            showHotspots={showHotspots}
            selectedHotspotId={selectedHotspotId}
            onSelectHotspot={(hid) => {
              setSelectedHotspotId(hid);
              setBriefTargetType('hotspot');
              setBriefTargetId(hid);
            }}
            onSelectReport={(rid) => onSelectReport(rid)}
            heightClass="h-[460px]"
          />

          {/* Detected Hotspots + Municipal Action Brief Generator */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Detected Hotspot Clusters List */}
            <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <Radar className="w-4 h-4 text-teal-700" aria-hidden="true" />
                    Detected Geographic Hotspots ({hotspots.length})
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Clustered using spherical Haversine distance ({epsMeters}m radius, min {minSamples} reports)
                  </p>
                </div>
              </div>

              {hotspots.length === 0 ? (
                <div className="p-6 text-center bg-slate-50 rounded-lg text-xs text-slate-600">
                  Insufficient dense reports within {epsMeters}m to form a cluster of {minSamples}+ reports. Try increasing the DBSCAN radius or lowering Min Reports.
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {hotspots.map((hs) => {
                    const isSelected = selectedHotspotId === hs.hotspotId;
                    return (
                      <div
                        key={hs.hotspotId}
                        className={`py-4 first:pt-0 last:pb-0 space-y-2 ${
                          isSelected ? 'bg-slate-50/80 -mx-3 px-3 rounded-lg' : ''
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2 text-xs">
                            <span className="font-mono font-bold text-slate-900">
                              {hs.hotspotId}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="font-semibold text-slate-900">{hs.areaName}</span>
                          </div>
                          <PriorityIndicator
                            level={hs.priorityLevel}
                            score={hs.highestScore}
                          />
                        </div>

                        <div className="text-xs text-slate-600 font-mono tabular-nums">
                          {hs.reportCount} reports · Dominant: {hs.dominantCategory} · Center:{' '}
                          {hs.latitude.toFixed(4)}, {hs.longitude.toFixed(4)}
                        </div>

                        <p className="text-xs text-slate-700 leading-relaxed">{hs.description}</p>

                        <div className="flex items-center gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => handleGenerateBrief('hotspot', hs.hotspotId)}
                            className="px-3 py-1.5 rounded-md bg-blue-700 text-white text-xs font-semibold hover:bg-blue-800 transition-colors"
                          >
                            GENERATE ACTION BRIEF
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (hs.reportIds[0]) onSelectReport(hs.reportIds[0]);
                            }}
                            className="px-3 py-1.5 rounded-md border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-100"
                          >
                            Inspect Reports ({hs.reportCount})
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Municipal Action Brief Generator Studio */}
            <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <div>
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-blue-700" aria-hidden="true" />
                  Municipal Action Brief Generator
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Synthesizes stored report evidence into an actionable municipal dispatch brief
                </p>
              </div>

              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="brief-type" className="block text-[11px] font-medium text-slate-600 mb-1">
                      Brief Scope
                    </label>
                    <select
                      id="brief-type"
                      value={briefTargetType}
                      onChange={(e) => {
                        const nextType = e.target.value as 'hotspot' | 'report';
                        setBriefTargetType(nextType);
                        setBriefTargetId(
                          nextType === 'hotspot'
                            ? hotspots[0]?.hotspotId ?? ''
                            : reports[0]?.reportId ?? ''
                        );
                      }}
                      className="w-full text-xs border border-slate-300 rounded-lg px-2.5 py-2 bg-white"
                    >
                      <option value="hotspot">Geographic Hotspot</option>
                      <option value="report">Individual Complaint</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="brief-target" className="block text-[11px] font-medium text-slate-600 mb-1">
                      Target Record
                    </label>
                    <select
                      id="brief-target"
                      value={briefTargetId}
                      onChange={(e) => setBriefTargetId(e.target.value)}
                      className="w-full text-xs border border-slate-300 rounded-lg px-2.5 py-2 bg-white"
                    >
                      {briefTargetType === 'hotspot'
                        ? hotspots.map((h) => (
                            <option key={h.hotspotId} value={h.hotspotId}>
                              {h.hotspotId} — {h.areaName} ({h.reportCount} rpts)
                            </option>
                          ))
                        : reports.slice(0, 30).map((r) => (
                            <option key={r.reportId} value={r.reportId}>
                              {r.reportId} — {r.title.slice(0, 38)}
                            </option>
                          ))}
                    </select>
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => handleGenerateBrief()}
                    disabled={briefLoading || !briefTargetId}
                    className="w-full sm:w-auto py-2 px-4 rounded-lg bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 transition-colors disabled:opacity-60 whitespace-nowrap shrink-0"
                  >
                    {briefLoading ? 'Generating Brief...' : 'GENERATE ACTION BRIEF'}
                  </button>
                </div>
              </div>

              {briefError && (
                <div className="p-3 rounded-lg bg-red-50 text-xs text-red-800">
                  {briefError}
                </div>
              )}

              {!brief ? (
                <div className="p-8 text-center bg-slate-50 rounded-lg">
                  <p className="text-xs font-semibold text-slate-800">
                    Ready to Generate Municipal Action Brief
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Select a detected hotspot (such as College Road) and click GENERATE ACTION BRIEF to compile verified facts and recommended field actions.
                  </p>
                </div>
              ) : (
                <div
                  data-testid="municipal-action-brief"
                  className="pt-4 border-t border-slate-200 space-y-4 text-xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
                    <div>
                      <div className="text-[11px] font-mono text-slate-500">
                        MUNICIPAL ACTION BRIEF · {brief.engineSource}
                      </div>
                      <h3 className="text-sm font-bold text-slate-900 mt-0.5">
                        {brief.briefTitle}
                      </h3>
                    </div>
                    <PriorityIndicator
                      level={brief.verifiedFacts.highestPriorityLevel}
                      score={brief.verifiedFacts.highestPriorityScore}
                    />
                  </div>

                  {/* Verified Facts vs Advisory Recommendations */}
                  <div className="space-y-1.5">
                    <div className="font-bold text-slate-900">
                      1. Verified Stored Report Facts
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-700 bg-slate-50 p-3.5 rounded-lg">
                      <div>
                        <span className="text-slate-500">Location:</span>{' '}
                        <strong>{brief.verifiedFacts.affectedLocation}</strong>
                      </div>
                      <div>
                        <span className="text-slate-500">Coordinates:</span>{' '}
                        <span className="font-mono tabular-nums">{brief.verifiedFacts.coordinates}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Related Reports:</span>{' '}
                        <strong className="font-mono tabular-nums">
                          {brief.verifiedFacts.relatedReportCount}
                        </strong>{' '}
                        ({brief.verifiedFacts.unresolvedCount} open)
                      </div>
                      <div>
                        <span className="text-slate-500">Suggested Dept:</span>{' '}
                        <strong>{brief.advisoryRecommendations.suggestedDepartment}</strong>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="font-bold text-slate-900">
                      2. AI-Generated Advisory Analysis & Next Actions
                    </div>
                    <p className="text-slate-800 leading-relaxed">
                      <strong>Problem Summary:</strong>{' '}
                      {brief.advisoryRecommendations.problemSummary}
                    </p>
                    <p className="text-slate-700 leading-relaxed">
                      <strong>Potential Impact:</strong>{' '}
                      {brief.advisoryRecommendations.potentialImpact}
                    </p>

                    <div>
                      <div className="font-semibold text-slate-900 mb-1">
                        Supporting Evidence:
                      </div>
                      <ul className="list-disc list-inside space-y-0.5 text-slate-700">
                        {brief.advisoryRecommendations.supportingEvidence.map((ev, i) => (
                          <li key={i}>{ev}</li>
                        ))}
                      </ul>
                    </div>

                    <div>
                      <div className="font-semibold text-slate-900 mb-1">
                        Recommended Next Actions:
                      </div>
                      <ol className="list-decimal list-inside space-y-1 text-slate-800 font-medium">
                        {brief.advisoryRecommendations.recommendedNextActions.map((act, i) => (
                          <li key={i}>{act}</li>
                        ))}
                      </ol>
                    </div>

                    <div>
                      <div className="font-semibold text-slate-900 mb-1">
                        Safety Considerations:
                      </div>
                      <ul className="list-disc list-inside space-y-0.5 text-red-800">
                        {brief.advisoryRecommendations.safetyConsiderations.map((sc, i) => (
                          <li key={i}>{sc}</li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <p className="text-[11px] text-slate-500 pt-2 border-t border-slate-200">
                    {brief.advisoryRecommendations.disclaimer}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Accessible Fallback Complaint List for Filtered Map */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-slate-600" aria-hidden="true" />
                Mapped Complaint List Fallback ({filteredMapReports.length})
              </h3>
              <span className="text-xs text-slate-500">
                Accessible tabular view of currently filtered map locations
              </span>
            </div>
            <div className="overflow-x-auto max-h-60 overflow-y-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2 pr-3">ID</th>
                    <th className="py-2 px-3">Title</th>
                    <th className="py-2 px-3">Category</th>
                    <th className="py-2 px-3">Coordinates</th>
                    <th className="py-2 px-3">Priority</th>
                    <th className="py-2 pl-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredMapReports.slice(0, 20).map((r) => (
                    <tr
                      key={r.reportId}
                      onClick={() => onSelectReport(r.reportId)}
                      className="hover:bg-slate-50 cursor-pointer"
                    >
                      <td className="py-2 pr-3 font-mono font-semibold text-blue-800">
                        {r.reportId}
                      </td>
                      <td className="py-2 px-3 text-slate-900 truncate max-w-xs">{r.title}</td>
                      <td className="py-2 px-3 text-slate-600">{r.category}</td>
                      <td className="py-2 px-3 font-mono tabular-nums text-slate-500">
                        {r.latitude !== null && r.longitude !== null
                          ? `${r.latitude.toFixed(4)}, ${r.longitude.toFixed(4)}`
                          : 'Missing'}
                      </td>
                      <td className="py-2 px-3">
                        <PriorityIndicator level={r.priorityLevel} score={r.priorityScore} />
                      </td>
                      <td className="py-2 pl-3">
                        <StatusIndicator status={r.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SUBTAB 2: DUPLICATE DETECTION & AUTHORITY VERIFICATION */}
      {activeTab === 'duplicates' && (
        <div className="space-y-6">
          {/* Threshold Tuning Scanner */}
          <form
            onSubmit={handleRunDuplicateScan}
            className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-blue-700" aria-hidden="true" />
                  TF-IDF Cosine Similarity & Haversine Threshold Scanner
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Tune similarity and geographical distance heuristics across stored citizen reports. Original reports are never deleted.
                </p>
              </div>
              <button
                type="submit"
                disabled={scanningDups}
                className="px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 transition-colors"
              >
                {scanningDups ? 'Scanning Corpus...' : 'Run Live Similarity Scan'}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div>
                <label htmlFor="dup-sim" className="block font-medium text-slate-700 mb-1">
                  Minimum TF-IDF Cosine Similarity:{' '}
                  <span className="font-mono font-bold text-blue-800">
                    {Math.round(minSimilarity * 100)}% ({minSimilarity.toFixed(2)})
                  </span>
                </label>
                <input
                  id="dup-sim"
                  type="range"
                  min={0.35}
                  max={0.9}
                  step={0.05}
                  value={minSimilarity}
                  onChange={(e) => setMinSimilarity(Number(e.target.value))}
                  className="w-full"
                />
              </div>

              <div>
                <label htmlFor="dup-dist" className="block font-medium text-slate-700 mb-1">
                  Maximum Haversine Distance:{' '}
                  <span className="font-mono font-bold text-blue-800">{maxDistanceMeters}m</span>
                </label>
                <input
                  id="dup-dist"
                  type="range"
                  min={50}
                  max={500}
                  step={25}
                  value={maxDistanceMeters}
                  onChange={(e) => setMaxDistanceMeters(Number(e.target.value))}
                  className="w-full"
                />
              </div>

              <div className="flex items-center pt-4">
                <label className="inline-flex items-center gap-2 font-medium text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={requireRelatedCategory}
                    onChange={(e) => setRequireRelatedCategory(e.target.checked)}
                    className="rounded border-slate-300"
                  />
                  <span>Require Same or Related Category</span>
                </label>
              </div>
            </div>

            {scanResults && (
              <div className="pt-3 border-t border-slate-100">
                <div className="text-xs font-semibold text-slate-800 mb-2">
                  Live Scan Result: {scanResults.length} matching complaint pair(s) found
                </div>
                {scanResults.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    {scanResults.slice(0, 6).map((pair, idx) => (
                      <div
                        key={idx}
                        className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between font-mono tabular-nums">
                          <span className="font-semibold text-slate-900">
                            {pair.sourceReportId} ↔ {pair.relatedReportId}
                          </span>
                          <span className="text-blue-800 font-bold">
                            {Math.round(pair.similarityScore * 100)}% · {Math.round(pair.distanceMeters)}m
                          </span>
                        </div>
                        <p className="text-slate-700 truncate">1: {pair.sourceTitle}</p>
                        <p className="text-slate-600 truncate">2: {pair.relatedTitle}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </form>

          {dupNotice && (
            <div className="p-3.5 rounded-lg border border-emerald-200 bg-emerald-50 text-xs text-emerald-800 flex items-center gap-2">
              <Check className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{dupNotice}</span>
            </div>
          )}

          {/* Stored Duplicate Suggestions Review Queue */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <GitCompare className="w-4 h-4 text-teal-700" aria-hidden="true" />
                  Stored Duplicate Relationship Queue
                </h2>
                <p className="text-xs text-slate-500">
                  Confirming a duplicate links both reports to one underlying civic issue and updates Recurrence priority
                </p>
              </div>

              <select
                aria-label="Filter duplicate queue by review status"
                value={dupStatusFilter}
                onChange={(e) => setDupStatusFilter(e.target.value)}
                className="text-xs border border-slate-300 rounded-lg px-3 py-1.5 bg-white"
              >
                <option value="All">All Links</option>
                <option value="Suggested">Suggested (Needs Review)</option>
                <option value="Confirmed">Confirmed Links</option>
                <option value="Rejected">Rejected</option>
              </select>
            </div>

            {storedDuplicates.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No duplicate links match the selected status filter.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {storedDuplicates.map((item) => (
                  <div
                    key={item.id}
                    className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 text-xs"
                  >
                    <div className="space-y-1.5 flex-1">
                      <div className="flex flex-wrap items-center gap-2 font-mono tabular-nums">
                        <button
                          type="button"
                          onClick={() => onSelectReport(item.sourceReportId)}
                          className="font-bold text-blue-800 hover:underline"
                        >
                          {item.sourceReportId}
                        </button>
                        <span className="text-slate-400">↔</span>
                        <button
                          type="button"
                          onClick={() => onSelectReport(item.relatedReportId)}
                          className="font-bold text-blue-800 hover:underline"
                        >
                          {item.relatedReportId}
                        </button>
                        <span aria-hidden="true">·</span>
                        <span className="font-semibold text-slate-900">
                          {Math.round(item.similarityScore * 100)}% text similarity
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="text-slate-600">
                          {Math.round(item.distanceMeters)}m apart
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-sans font-semibold text-slate-800">
                          Status: {item.reviewStatus}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-slate-700">
                        <div>
                          <span className="text-slate-500">Source ({item.sourceCategory}):</span>{' '}
                          {item.sourceTitle}
                        </div>
                        <div>
                          <span className="text-slate-500">Matched ({item.relatedCategory}):</span>{' '}
                          {item.relatedTitle}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {item.reviewStatus !== 'Confirmed' && (
                        <button
                          type="button"
                          onClick={() => handleReviewDuplicate(item.id, 'Confirmed')}
                          className="px-3 py-1.5 rounded-lg bg-emerald-700 text-white font-semibold hover:bg-emerald-800 transition-colors"
                        >
                          Confirm Duplicate
                        </button>
                      )}
                      {item.reviewStatus !== 'Rejected' && (
                        <button
                          type="button"
                          onClick={() => handleReviewDuplicate(item.id, 'Rejected')}
                          className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 font-medium hover:bg-slate-100 transition-colors"
                        >
                          Reject
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUBTAB 3: LIVE AI CLASSIFIER, SUMMARIZER & PRIORITY SANDBOX */}
      {activeTab === 'sandbox' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <form
            onSubmit={handleRunSandbox}
            className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 space-y-4"
          >
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-blue-700" aria-hidden="true" />
                Live AI Triage & Priority Sandbox
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Test classification, summarization, safety overrides, and priority formula calculations on any sample input
              </p>
            </div>

            <div>
              <label htmlFor="sb-title" className="block text-xs font-semibold text-slate-800 mb-1">
                Sample Title
              </label>
              <input
                id="sb-title"
                type="text"
                value={sandboxTitle}
                onChange={(e) => setSandboxTitle(e.target.value)}
                className="w-full text-xs border border-slate-300 rounded-lg px-3 py-2"
              />
            </div>

            <div>
              <label htmlFor="sb-desc" className="block text-xs font-semibold text-slate-800 mb-1">
                Sample Complaint Description
              </label>
              <textarea
                id="sb-desc"
                rows={4}
                value={sandboxDesc}
                onChange={(e) => setSandboxDesc(e.target.value)}
                className="w-full text-xs border border-slate-300 rounded-lg px-3 py-2"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label htmlFor="sb-lat" className="block text-xs font-medium text-slate-700 mb-1">
                  Latitude
                </label>
                <input
                  id="sb-lat"
                  type="number"
                  step="0.0001"
                  value={sandboxLat}
                  onChange={(e) => setSandboxLat(e.target.value)}
                  className="w-full font-mono text-xs border border-slate-300 rounded-lg px-2.5 py-2"
                />
              </div>
              <div>
                <label htmlFor="sb-lng" className="block text-xs font-medium text-slate-700 mb-1">
                  Longitude
                </label>
                <input
                  id="sb-lng"
                  type="number"
                  step="0.0001"
                  value={sandboxLng}
                  onChange={(e) => setSandboxLng(e.target.value)}
                  className="w-full font-mono text-xs border border-slate-300 rounded-lg px-2.5 py-2"
                />
              </div>
              <div>
                <label htmlFor="sb-rec" className="block text-xs font-medium text-slate-700 mb-1">
                  Confirmed Links
                </label>
                <input
                  id="sb-rec"
                  type="number"
                  min={0}
                  max={10}
                  value={sandboxConfirmedCount}
                  onChange={(e) => setSandboxConfirmedCount(Number(e.target.value))}
                  className="w-full font-mono text-xs border border-slate-300 rounded-lg px-2.5 py-2"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={sandboxLoading}
                className="px-4 py-2 rounded-lg bg-blue-700 text-white text-xs font-semibold hover:bg-blue-800 transition-colors"
              >
                {sandboxLoading ? 'Evaluating...' : 'Run Explainable AI Analysis'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setSandboxTitle('Exposed live wire hanging near bus stop');
                  setSandboxDesc(
                    'A snapped overhead power cable has left exposed live electrical wires sparking right beside pedestrians at Industrial Ring bus shelter.'
                  );
                  setSandboxLat('12.97852');
                  setSandboxLng('77.60205');
                  setSandboxConfirmedCount(0);
                }}
                className="px-3 py-2 rounded-lg border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Load Safety Override Example
              </button>
            </div>
          </form>

          {/* Sandbox Results */}
          <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h3 className="text-sm font-bold text-slate-900">AI Output & Explainability Breakdown</h3>

            {!sandboxResult ? (
              <div className="p-8 text-center bg-slate-50 rounded-lg text-xs text-slate-500">
                Click "Run Explainable AI Analysis" to inspect automatic category classification, concise factual summary, duplicate checks, and the weighted priority formula.
              </div>
            ) : (
              <div className="space-y-4 text-xs">
                <div className="grid grid-cols-2 gap-3 p-3.5 bg-slate-50 rounded-lg">
                  <div>
                    <div className="text-slate-500">Primary Category</div>
                    <div className="font-bold text-slate-900 text-sm mt-0.5">
                      {sandboxResult.classification.primaryCategory}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">Secondary Category</div>
                    <div className="font-bold text-slate-900 text-sm mt-0.5">
                      {sandboxResult.classification.secondaryCategory ?? 'None'}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">Suggested Department</div>
                    <div className="font-semibold text-slate-800 mt-0.5">
                      {sandboxResult.classification.suggestedDepartment}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">Safety Concern</div>
                    <div
                      className={`font-semibold mt-0.5 ${
                        sandboxResult.classification.safetyConcern
                          ? 'text-red-700'
                          : 'text-emerald-700'
                      }`}
                    >
                      {sandboxResult.classification.safetyConcern ? 'Yes' : 'No'}
                    </div>
                  </div>
                </div>

                <div>
                  <div className="font-semibold text-slate-900 mb-1">Concise Factual Summary</div>
                  <p className="text-slate-700 bg-slate-50 p-3 rounded-lg leading-relaxed">
                    {sandboxResult.summary.summary}
                  </p>
                </div>

                {sandboxResult.priority.safetyOverride && (
                  <div className="p-3 rounded-lg border border-red-200 bg-red-50 text-red-900 flex items-start gap-2">
                    <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                    <span>{sandboxResult.priority.safetyOverrideReason}</span>
                  </div>
                )}

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-900">
                      Priority Formula: (0.35×S) + (0.30×U) + (0.20×R) + (0.15×I)
                    </span>
                    <PriorityIndicator
                      level={sandboxResult.priority.priorityLevel}
                      score={sandboxResult.priority.priorityScore}
                      safetyOverride={sandboxResult.priority.safetyOverride}
                    />
                  </div>

                  <div className="space-y-1.5">
                    {sandboxResult.priority.contributions.map((c) => (
                      <div key={c.factor} className="p-2.5 rounded-lg bg-slate-50 flex items-center justify-between gap-3">
                        <div>
                          <div className="font-semibold text-slate-800">
                            {c.factor} (weight {c.weight.toFixed(2)})
                          </div>
                          <div className="text-[11px] text-slate-500">{c.rationale}</div>
                        </div>
                        <div className="text-right font-mono tabular-nums shrink-0">
                          <div className="font-bold text-slate-900">{c.rawScore}/100</div>
                          <div className="text-blue-700">+{c.weightedContribution}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="font-semibold text-slate-900 mb-1">
                    Matching Existing Reports ({sandboxResult.potentialDuplicates.length})
                  </div>
                  {sandboxResult.potentialDuplicates.length === 0 ? (
                    <p className="text-slate-500">No duplicate matches within 150m.</p>
                  ) : (
                    <ul className="space-y-1 text-slate-700">
                      {sandboxResult.potentialDuplicates.map((d) => (
                        <li key={d.relatedReportId} className="font-mono">
                          {d.relatedReportId} — {Math.round(d.similarityScore * 100)}% similarity ·{' '}
                          {Math.round(d.distanceMeters)}m
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
