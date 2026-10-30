import React, { useCallback, useEffect, useState } from 'react';
import {
  BrainCircuit,
  Building2,
  Compass,
  FilePlus2,
  LayoutDashboard,
  Menu,
  X,
} from 'lucide-react';
import { civicApi, type MunicipalZoneInfo } from './api/client';
import { ComplaintDetailDrawer } from './components/ComplaintDetailDrawer';
import { AdminDashboard } from './pages/AdminDashboard';
import { AIIntelligenceCenter } from './pages/AIIntelligenceCenter';
import { CitizenPortal } from './pages/CitizenPortal';
import { CitizenTracking } from './pages/CitizenTracking';
import type {
  CivicReport,
  CivicReportDetail,
  DashboardKPIs,
  GeographicHotspot,
} from './types/civic';

type ModuleRoute = 'dashboard' | 'citizen' | 'intelligence' | 'tracking';

const EMPTY_KPIS: DashboardKPIs = {
  totalReports: 0,
  pendingReports: 0,
  criticalReports: 0,
  highPriorityReports: 0,
  resolvedReports: 0,
  duplicateReports: 0,
  confirmedDuplicates: 0,
  suggestedDuplicates: 0,
  hotspotCount: 0,
  demoReportCount: 0,
  citizenReportCount: 0,
  categoryCounts: {},
  statusCounts: {},
  priorityCounts: { Critical: 0, High: 0, Medium: 0, Low: 0 },
};

export default function App() {
  const [activeModule, setActiveModule] = useState<ModuleRoute>(() => {
    const params = new URLSearchParams(window.location.search);
    const view = params.get('view');
    if (view === 'citizen' || view === 'intelligence' || view === 'tracking' || view === 'dashboard') {
      return view;
    }
    return 'dashboard';
  });

  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [kpis, setKpis] = useState<DashboardKPIs>(EMPTY_KPIS);
  const [departments, setDepartments] = useState<string[]>([]);
  const [zones, setZones] = useState<MunicipalZoneInfo[]>([]);
  const [hotspots, setHotspots] = useState<GeographicHotspot[]>([]);
  const [allReports, setAllReports] = useState<CivicReport[]>([]);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [trackingLookupId, setTrackingLookupId] = useState<string | null>(null);
  const [recentCitizenIds, setRecentCitizenIds] = useState<string[]>([]);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [bootError, setBootError] = useState<string | null>(null);

  const loadWorkspaceData = useCallback(async () => {
    try {
      setBootError(null);
      const [overview, reportList] = await Promise.all([
        civicApi.getOverview(),
        civicApi.getReports({ sortBy: 'priority_desc' }),
      ]);
      setKpis(overview.kpis);
      setDepartments(overview.departments);
      setZones(overview.zones);
      setHotspots(overview.hotspots);
      setAllReports(reportList.reports);
      setRefreshTrigger((n) => n + 1);
    } catch (err) {
      setBootError((err as Error).message || 'Unable to connect to CivicPulse AI backend.');
    }
  }, []);

  useEffect(() => {
    loadWorkspaceData();
  }, [loadWorkspaceData]);

  const handleCitizenSubmitted = (newReport: CivicReportDetail) => {
    setRecentCitizenIds((prev) => [newReport.reportId, ...prev]);
    loadWorkspaceData();
  };

  const navItems: Array<{
    id: ModuleRoute;
    label: string;
    stage: string;
    Icon: React.ComponentType<{ className?: string }>;
  }> = [
    {
      id: 'dashboard',
      label: 'Authority Dashboard',
      stage: 'Act & Triage',
      Icon: LayoutDashboard,
    },
    {
      id: 'citizen',
      label: 'Citizen Portal',
      stage: 'Capture',
      Icon: FilePlus2,
    },
    {
      id: 'intelligence',
      label: 'AI Intelligence',
      stage: 'Understand & Reveal',
      Icon: BrainCircuit,
    },
    {
      id: 'tracking',
      label: 'Track Complaint',
      stage: 'Public Progress',
      Icon: Compass,
    },
  ];

  const currentNav = navItems.find((n) => n.id === activeModule) ?? navItems[0];

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900">
      {/* Desktop Sidebar Navigation (256px SaaS Workspace Canvas) */}
      <aside
        aria-label="Primary module navigation"
        className="hidden lg:flex lg:flex-col lg:w-64 lg:shrink-0 bg-slate-950 text-slate-200 border-r border-slate-800"
      >
        <div className="px-6 py-5 border-b border-slate-800/80">
          <div className="flex items-center gap-2.5">
            <Building2 className="w-5 h-5 text-teal-400 shrink-0" aria-hidden="true" />
            <span className="font-display text-lg font-bold tracking-tight text-white whitespace-nowrap">
              CivicPulse AI
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1.5 leading-snug">
            Turning Civic Complaints into Intelligent Public Action
          </p>
        </div>

        <nav className="flex-1 px-3 py-5 space-y-1">
          {navItems.map(({ id, label, stage, Icon }) => {
            const active = activeModule === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActiveModule(id)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-left transition-colors ${
                  active
                    ? 'bg-blue-700 text-white'
                    : 'text-slate-300 hover:bg-slate-900 hover:text-white'
                }`}
              >
                <span className="flex items-center gap-3 min-w-0">
                  <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span className="text-sm font-medium truncate">{label}</span>
                </span>
                <span
                  className={`text-[11px] shrink-0 ml-2 ${
                    active ? 'text-blue-100' : 'text-slate-500'
                  }`}
                >
                  {stage.split(' ')[0]}
                </span>
              </button>
            );
          })}
        </nav>

        {/* Live Database Summary in Sidebar Footer */}
        <div className="p-4 m-3 rounded-lg bg-slate-900 border border-slate-800 text-xs space-y-1.5">
          <div className="text-slate-400 font-medium">Municipal Queue Snapshot</div>
          <div className="flex items-center justify-between font-mono tabular-nums">
            <span className="text-slate-300">Stored Reports</span>
            <span className="text-white font-semibold">{kpis.totalReports}</span>
          </div>
          <div className="flex items-center justify-between font-mono tabular-nums">
            <span className="text-slate-300">Critical Queue</span>
            <span className="text-red-400 font-semibold">{kpis.criticalReports}</span>
          </div>
          <div className="flex items-center justify-between font-mono tabular-nums">
            <span className="text-slate-300">Active Hotspots</span>
            <span className="text-teal-400 font-semibold">{kpis.hotspotCount}</span>
          </div>
        </div>
      </aside>

      {/* Mobile Navigation Drawer */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/50"
            onClick={() => setMobileNavOpen(false)}
          />
          <div className="relative w-64 max-w-[80vw] bg-slate-950 text-white h-full p-4 flex flex-col z-10">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <span className="font-display text-base font-bold">CivicPulse AI</span>
              <button
                type="button"
                aria-label="Close navigation menu"
                onClick={() => setMobileNavOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="mt-4 space-y-1">
              {navItems.map(({ id, label, Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setActiveModule(id);
                    setMobileNavOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium ${
                    activeModule === id
                      ? 'bg-blue-700 text-white'
                      : 'text-slate-300 hover:bg-slate-900'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>{label}</span>
                </button>
              ))}
            </nav>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Strict 3-Zone Top Bar Contract */}
        <header className="sticky top-0 z-30 bg-white border-b border-slate-200 px-4 sm:px-6 py-3.5 flex items-center justify-between gap-8">
          {/* Zone 1: Brand / Breadcrumb */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              aria-label="Open navigation menu"
              onClick={() => setMobileNavOpen(true)}
              className="lg:hidden p-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div className="text-sm font-medium text-slate-500 truncate">
              <span className="text-slate-900 font-semibold">CivicPulse AI</span>
              <span className="mx-2 text-slate-300" aria-hidden="true">
                /
              </span>
              <span className="text-slate-800">{currentNav.label}</span>
            </div>
          </div>

          {/* Zone 2: Concise Single-Line Module Links (Visible on md-lg when sidebar hidden or quick switching) */}
          <nav
            aria-label="Quick lifecycle stage navigation"
            className="hidden md:flex lg:hidden items-center gap-5 text-xs font-medium text-slate-600"
          >
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveModule(item.id)}
                className={`whitespace-nowrap shrink-0 transition-colors ${
                  activeModule === item.id
                    ? 'text-blue-700 font-semibold underline underline-offset-4'
                    : 'hover:text-slate-900'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>

          {/* Zone 3: 1 Primary Action */}
          <div className="shrink-0">
            {activeModule !== 'citizen' ? (
              <button
                type="button"
                onClick={() => setActiveModule('citizen')}
                className="px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
              >
                Report Civic Issue
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setActiveModule('tracking')}
                className="px-4 py-2 rounded-lg border border-slate-300 bg-white text-slate-800 text-xs font-semibold hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
              >
                Track Existing ID
              </button>
            )}
          </div>
        </header>

        {/* Main Viewport */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1440px] w-full mx-auto">
          {bootError && (
            <div className="mb-6 p-4 rounded-xl border border-red-200 bg-red-50 text-xs text-red-800">
              {bootError}
            </div>
          )}

          {activeModule === 'dashboard' && (
            <AdminDashboard
              kpis={kpis}
              onSelectReport={(id) => setSelectedReportId(id)}
              onReloadOverview={loadWorkspaceData}
              refreshTrigger={refreshTrigger}
            />
          )}

          {activeModule === 'citizen' && (
            <CitizenPortal
              existingReports={allReports}
              zones={zones}
              onSubmitted={handleCitizenSubmitted}
              onTrackId={(tid) => {
                setTrackingLookupId(tid);
                setActiveModule('tracking');
              }}
              onInspectInAdmin={(rid) => {
                setActiveModule('dashboard');
                setSelectedReportId(rid);
              }}
            />
          )}

          {activeModule === 'intelligence' && (
            <AIIntelligenceCenter
              reports={allReports}
              initialHotspots={hotspots}
              zones={zones}
              onSelectReport={(id) => setSelectedReportId(id)}
              onKpisUpdated={() => loadWorkspaceData()}
            />
          )}

          {activeModule === 'tracking' && (
            <CitizenTracking
              initialTrackingId={trackingLookupId}
              recentIds={recentCitizenIds}
            />
          )}
        </main>

        <footer className="px-6 py-4 border-t border-slate-200 bg-white text-xs text-slate-500 flex flex-wrap items-center justify-between gap-2">
          <span>CivicPulse AI — Municipal Complaint Triage, Geospatial Intelligence & Public Tracking</span>
          <span>PromptWars x ASTRA — From Complaints to Action</span>
        </footer>
      </div>

      {/* Slide-over Complaint Detail & Assignment Inspector */}
      <ComplaintDetailDrawer
        reportId={selectedReportId}
        departments={departments}
        onClose={() => setSelectedReportId(null)}
        onUpdated={() => loadWorkspaceData()}
      />
    </div>
  );
}
