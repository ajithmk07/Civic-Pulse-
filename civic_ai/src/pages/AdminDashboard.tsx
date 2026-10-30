import { useEffect, useState } from 'react';
import { Database, Filter, RotateCcw, Search, ShieldCheck } from 'lucide-react';
import { civicApi } from '../api/client';
import { CivicCharts } from '../components/CivicCharts';
import { PriorityIndicator, StatusIndicator } from '../components/PriorityIndicator';
import {
  CIVIC_CATEGORIES,
  PRIORITY_LEVELS,
  WORKFLOW_STATUSES,
  type CivicReport,
  type DashboardKPIs,
} from '../types/civic';

interface AdminDashboardProps {
  kpis: DashboardKPIs;
  onSelectReport: (reportId: string) => void;
  onReloadOverview: () => void;
  refreshTrigger: number;
}

export function AdminDashboard({
  kpis,
  onSelectReport,
  onReloadOverview,
  refreshTrigger,
}: AdminDashboardProps) {
  const [reports, setReports] = useState<CivicReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [priority, setPriority] = useState('All');
  const [status, setStatus] = useState('All');
  const [sortBy, setSortBy] = useState<'priority_desc' | 'priority_asc' | 'newest' | 'oldest'>(
    'priority_desc'
  );

  const [demoLoading, setDemoLoading] = useState(false);
  const [demoNotice, setDemoNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    civicApi
      .getReports({ search, category, priority, status, sortBy })
      .then((res) => {
        if (!cancelled) setReports(res.reports);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [search, category, priority, status, sortBy, refreshTrigger]);

  const handleLoadDemoData = async () => {
    setDemoLoading(true);
    setDemoNotice(null);
    try {
      const res = await civicApi.loadDemoData();
      setDemoNotice(res.message);
      onReloadOverview();
    } catch (err) {
      setDemoNotice((err as Error).message);
    } finally {
      setDemoLoading(false);
    }
  };

  const resetFilters = () => {
    setSearch('');
    setCategory('All');
    setPriority('All');
    setStatus('All');
    setSortBy('priority_desc');
  };

  const kpiCards = [
    {
      label: 'Total Reports',
      value: kpis.totalReports,
      sub: `${kpis.citizenReportCount} live · ${kpis.demoReportCount} demo`,
      onClick: resetFilters,
      accent: 'text-slate-900',
    },
    {
      label: 'Pending Reports',
      value: kpis.pendingReports,
      sub: 'Open across municipal queues',
      onClick: () => {
        setStatus('Submitted');
        setPriority('All');
      },
      accent: 'text-blue-800',
    },
    {
      label: 'Critical Reports',
      value: kpis.criticalReports,
      sub: 'Score 80–100 or Safety Override',
      onClick: () => setPriority(priority === 'Critical' ? 'All' : 'Critical'),
      accent: 'text-red-700',
    },
    {
      label: 'High Priority Reports',
      value: kpis.highPriorityReports,
      sub: 'Score 60–79 urgent queue',
      onClick: () => setPriority(priority === 'High' ? 'All' : 'High'),
      accent: 'text-orange-700',
    },
    {
      label: 'Resolved Reports',
      value: kpis.resolvedReports,
      sub: 'Verified closed actions',
      onClick: () => setStatus(status === 'Resolved' ? 'All' : 'Resolved'),
      accent: 'text-emerald-700',
    },
    {
      label: 'Duplicate Reports',
      value: kpis.duplicateReports,
      sub: `${kpis.confirmedDuplicates} confirmed · ${kpis.suggestedDuplicates} suggested`,
      onClick: resetFilters,
      accent: 'text-teal-800',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Transparent Security & Demo Environment Disclosure */}
      <div className="bg-white border border-slate-200 rounded-xl px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 text-xs text-slate-600">
          <ShieldCheck className="w-4 h-4 text-slate-700 shrink-0" aria-hidden="true" />
          <span>
            <strong className="text-slate-900">Municipal Authority Console (Demonstration Environment):</strong>{' '}
            Role-based officer login is open for hackathon evaluation. All status updates, assignments, and audit logs persist in SQLite.
          </span>
        </div>

        <button
          type="button"
          onClick={handleLoadDemoData}
          disabled={demoLoading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-slate-50 text-xs font-medium text-slate-800 hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0"
        >
          <Database className="w-3.5 h-3.5 text-slate-600" aria-hidden="true" />
          <span>{demoLoading ? 'Checking Demo Data...' : 'Load Demo Dataset'}</span>
        </button>
      </div>

      {demoNotice && (
        <div className="px-4 py-2.5 rounded-lg border border-blue-200 bg-blue-50 text-xs text-blue-900">
          {demoNotice}
        </div>
      )}

      {/* 6 Required KPI Cards */}
      <section aria-label="Municipal key performance indicators" className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        {kpiCards.map((card) => (
          <button
            key={card.label}
            type="button"
            onClick={card.onClick}
            className="text-left bg-white border border-slate-200 rounded-xl p-4 hover:border-slate-300 transition-colors"
          >
            <div className="text-xs font-medium text-slate-500">{card.label}</div>
            <div className={`font-mono tabular-nums text-2xl font-bold mt-1.5 ${card.accent}`}>
              {card.value}
            </div>
            <div className="text-[11px] text-slate-500 mt-1 truncate" title={card.sub}>
              {card.sub}
            </div>
          </button>
        ))}
      </section>

      {/* Interactive Analytics Charts */}
      <CivicCharts
        kpis={kpis}
        selectedCategory={category}
        onSelectCategory={setCategory}
        selectedPriority={priority}
        onSelectPriority={setPriority}
      />

      {/* Complaint Management Table */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-200 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Prioritized Complaint Queue
              </h2>
              <p className="text-xs text-slate-500">
                Click any complaint row to inspect AI summaries, uploaded photos, duplicate links, and update assignments
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-600">
              <Filter className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
              <span className="font-mono tabular-nums">
                Showing {reports.length} of {kpis.totalReports}
              </span>
              {(search || category !== 'All' || priority !== 'All' || status !== 'All') && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="inline-flex items-center gap-1 text-blue-700 font-medium hover:underline ml-1"
                >
                  <RotateCcw className="w-3 h-3" aria-hidden="true" />
                  Clear filters
                </button>
              )}
            </div>
          </div>

          {/* Search & Filter Controls */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="relative lg:col-span-2">
              <Search
                className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden="true"
              />
              <input
                type="search"
                aria-label="Search complaints by ID, title, location, or department"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search ID, title, street, or department..."
                className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg bg-white text-slate-900"
              />
            </div>

            <select
              aria-label="Filter by category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="text-xs border border-slate-300 rounded-lg px-2.5 py-2 bg-white text-slate-800"
            >
              <option value="All">All Categories</option>
              {CIVIC_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            <select
              aria-label="Filter by priority"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="text-xs border border-slate-300 rounded-lg px-2.5 py-2 bg-white text-slate-800"
            >
              <option value="All">All Priorities</option>
              {PRIORITY_LEVELS.map((p) => (
                <option key={p} value={p}>
                  {p} Priority
                </option>
              ))}
            </select>

            <div className="grid grid-cols-2 gap-2">
              <select
                aria-label="Filter by workflow status"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="text-xs border border-slate-300 rounded-lg px-2 py-2 bg-white text-slate-800"
              >
                <option value="All">All Statuses</option>
                {WORKFLOW_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>

              <select
                aria-label="Sort complaints"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="text-xs border border-slate-300 rounded-lg px-2 py-2 bg-white text-slate-800"
              >
                <option value="priority_desc">Score: High → Low</option>
                <option value="priority_asc">Score: Low → High</option>
                <option value="newest">Date: Newest</option>
                <option value="oldest">Date: Oldest</option>
              </select>
            </div>
          </div>
        </div>

        {/* High-Density Data Table */}
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-10 text-center text-xs text-slate-500">
              Loading prioritized complaints from SQLite...
            </div>
          ) : reports.length === 0 ? (
            <div className="p-10 text-center space-y-2">
              <p className="text-sm font-semibold text-slate-800">
                No civic complaints match your current search or filter criteria
              </p>
              <p className="text-xs text-slate-500">
                Reset the active filters to view all stored citizen and demonstration submissions.
              </p>
              <button
                type="button"
                onClick={resetFilters}
                className="mt-2 px-3.5 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-medium"
              >
                Reset Filters
              </button>
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-semibold text-slate-600">
                  <th className="py-2.5 px-4 whitespace-nowrap">Complaint ID</th>
                  <th className="py-2.5 px-4">Title</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Category</th>
                  <th className="py-2.5 px-3">Location</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Priority</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">Score</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Submitted</th>
                  <th className="py-2.5 px-3">Department</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">Assigned Staff</th>
                  <th className="py-2.5 px-4 whitespace-nowrap">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {reports.map((rep) => (
                  <tr
                    key={rep.reportId}
                    onClick={() => onSelectReport(rep.reportId)}
                    className="hover:bg-blue-50/50 cursor-pointer transition-colors"
                  >
                    <td className="py-2.5 px-4 font-mono tabular-nums font-semibold text-blue-800 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          onSelectReport(rep.reportId);
                        }}
                        className="hover:underline text-left"
                      >
                        {rep.reportId}
                      </button>
                      {rep.isDemo && (
                        <span className="text-[10px] font-sans font-normal text-slate-400 ml-1.5">
                          · Demo
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 max-w-xs">
                      <div className="font-medium text-slate-900 truncate" title={rep.title}>
                        {rep.title}
                      </div>
                      {(rep.confirmedDuplicateCount > 0 || rep.suggestedDuplicateCount > 0) && (
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {rep.confirmedDuplicateCount > 0 && (
                            <span className="text-teal-800 font-medium">
                              {rep.confirmedDuplicateCount} confirmed link{rep.confirmedDuplicateCount > 1 ? 's' : ''}
                            </span>
                          )}
                          {rep.confirmedDuplicateCount > 0 && rep.suggestedDuplicateCount > 0 && ' · '}
                          {rep.suggestedDuplicateCount > 0 && (
                            <span className="text-amber-700">
                              {rep.suggestedDuplicateCount} suggested match
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-slate-700 whitespace-nowrap">
                      {rep.category}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600 max-w-[180px] truncate" title={rep.locationName}>
                      {rep.locationName}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <PriorityIndicator
                        level={rep.priorityLevel}
                        showScore={false}
                        safetyOverride={rep.safetyOverride}
                        manualOverride={Boolean(rep.manualOverrideLevel)}
                      />
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                      {rep.priorityScore}
                    </td>
                    <td className="py-2.5 px-3 font-mono tabular-nums text-slate-500 whitespace-nowrap">
                      {new Date(rep.createdAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: '2-digit',
                      })}
                    </td>
                    <td className="py-2.5 px-3 text-slate-700 max-w-[170px] truncate" title={rep.department}>
                      {rep.department}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">
                      {rep.assignedStaff}
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      <StatusIndicator status={rep.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
