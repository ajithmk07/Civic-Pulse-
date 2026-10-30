import type { DashboardKPIs, PriorityLevel } from '../types/civic';

interface CivicChartsProps {
  kpis: DashboardKPIs;
  selectedCategory?: string;
  onSelectCategory?: (category: string) => void;
  selectedPriority?: string;
  onSelectPriority?: (priority: string) => void;
}

export function CivicCharts({
  kpis,
  selectedCategory = 'All',
  onSelectCategory,
  selectedPriority = 'All',
  onSelectPriority,
}: CivicChartsProps) {
  const sortedCategories = Object.entries(kpis.categoryCounts).sort((a, b) => b[1] - a[1]);
  const maxCat = Math.max(1, sortedCategories[0]?.[1] ?? 1);

  const priorityRows: Array<{
    level: PriorityLevel;
    range: string;
    count: number;
    barClass: string;
  }> = [
    { level: 'Critical', range: '80–100', count: kpis.priorityCounts.Critical, barClass: 'bg-red-600' },
    { level: 'High', range: '60–79', count: kpis.priorityCounts.High, barClass: 'bg-orange-500' },
    { level: 'Medium', range: '35–59', count: kpis.priorityCounts.Medium, barClass: 'bg-amber-500' },
    { level: 'Low', range: '0–34', count: kpis.priorityCounts.Low, barClass: 'bg-emerald-600' },
  ];
  const maxPrio = Math.max(1, ...priorityRows.map((p) => p.count));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      {/* Category Distribution */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex items-center justify-between gap-2 mb-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Reports by Civic Category</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Click any category bar to filter the complaint table
            </p>
          </div>
          {selectedCategory !== 'All' && onSelectCategory && (
            <button
              type="button"
              onClick={() => onSelectCategory('All')}
              className="text-xs font-medium text-blue-700 hover:underline whitespace-nowrap"
            >
              Reset filter
            </button>
          )}
        </div>

        <div className="space-y-2.5">
          {sortedCategories.map(([cat, count]) => {
            const pct = Math.round((count / Math.max(1, kpis.totalReports)) * 100);
            const widthPct = Math.max(4, Math.round((count / maxCat) * 100));
            const isSelected = selectedCategory === cat;

            return (
              <button
                key={cat}
                type="button"
                onClick={() => onSelectCategory?.(isSelected ? 'All' : cat)}
                className={`w-full text-left group rounded-lg px-2 py-1.5 transition-colors ${
                  isSelected ? 'bg-blue-50/80' : 'hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className={`font-medium ${isSelected ? 'text-blue-900' : 'text-slate-800'}`}>
                    {cat}
                  </span>
                  <span className="font-mono tabular-nums text-slate-600">
                    {count} ({pct}%)
                  </span>
                </div>
                <div className="w-full h-2 bg-slate-100 rounded-sm overflow-hidden">
                  <div
                    className={`h-full transition-transform origin-left ${
                      isSelected ? 'bg-blue-700' : 'bg-slate-800 group-hover:bg-blue-700'
                    }`}
                    style={{ width: `${widthPct}%` }}
                  />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Priority & Workflow Distribution */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between gap-2 mb-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Explainable Priority Distribution
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Weighted score tiers across {kpis.totalReports} stored complaints
              </p>
            </div>
            {selectedPriority !== 'All' && onSelectPriority && (
              <button
                type="button"
                onClick={() => onSelectPriority('All')}
                className="text-xs font-medium text-blue-700 hover:underline whitespace-nowrap"
              >
                Reset tier
              </button>
            )}
          </div>

          <div className="space-y-3">
            {priorityRows.map((row) => {
              const widthPct = row.count === 0 ? 0 : Math.max(4, Math.round((row.count / maxPrio) * 100));
              const isSelected = selectedPriority === row.level;
              return (
                <button
                  key={row.level}
                  type="button"
                  onClick={() => onSelectPriority?.(isSelected ? 'All' : row.level)}
                  className={`w-full text-left rounded-lg px-2 py-1.5 transition-colors ${
                    isSelected ? 'bg-slate-100' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-semibold text-slate-800">
                      {row.level}{' '}
                      <span className="font-mono font-normal text-slate-500">({row.range})</span>
                    </span>
                    <span className="font-mono tabular-nums font-medium text-slate-800">
                      {row.count} reports
                    </span>
                  </div>
                  <div className="w-full h-2.5 bg-slate-100 rounded-sm overflow-hidden">
                    <div className={`h-full ${row.barClass}`} style={{ width: `${widthPct}%` }} />
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Workflow Pipeline Breakdown */}
        <div className="pt-4 mt-5 border-t border-slate-100">
          <div className="text-xs font-semibold text-slate-800 mb-2">
            Resolution Lifecycle Breakdown
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center">
            {(['Submitted', 'Under Review', 'Assigned', 'In Progress', 'Resolved', 'Rejected'] as const).map(
              (st) => (
                <div key={st} className="bg-slate-50 rounded-lg py-2 px-1.5">
                  <div className="font-mono tabular-nums text-sm font-semibold text-slate-900">
                    {kpis.statusCounts[st] ?? 0}
                  </div>
                  <div className="text-[11px] text-slate-600 truncate mt-0.5" title={st}>
                    {st}
                  </div>
                </div>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
