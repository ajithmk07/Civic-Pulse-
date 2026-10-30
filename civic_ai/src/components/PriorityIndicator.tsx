import React from 'react';
import {
  AlertOctagon,
  ArrowUpCircle,
  CheckCircle2,
  Clock,
  FileSearch,
  MinusCircle,
  Square,
  UserCheck,
  Wrench,
  XCircle,
} from 'lucide-react';
import type { PriorityLevel, WorkflowStatus } from '../types/civic';

/**
 * Accessible priority indicator using distinct geometric icons + explicit text + tabular score.
 * Never relies on color alone and avoids static pill enclosures.
 */
export function PriorityIndicator({
  level,
  score,
  showScore = true,
  manualOverride = false,
  safetyOverride = false,
}: {
  level: PriorityLevel;
  score?: number;
  showScore?: boolean;
  manualOverride?: boolean;
  safetyOverride?: boolean;
}) {
  const config: Record<
    PriorityLevel,
    { textClass: string; Icon: React.ComponentType<{ className?: string }> }
  > = {
    Critical: { textClass: 'text-red-700', Icon: AlertOctagon },
    High: { textClass: 'text-orange-700', Icon: ArrowUpCircle },
    Medium: { textClass: 'text-amber-700', Icon: Square },
    Low: { textClass: 'text-emerald-700', Icon: MinusCircle },
  };

  const { textClass, Icon } = config[level] ?? config.Low;

  return (
    <span className={`inline-flex items-center gap-1.5 font-semibold text-xs ${textClass} whitespace-nowrap`}>
      <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>{level}</span>
      {showScore && score !== undefined && (
        <span className="font-mono tabular-nums text-slate-600 font-normal">
          · {score}/100
        </span>
      )}
      {safetyOverride && (
        <span className="text-[11px] font-medium text-red-700" title="Safety Hazard Override Active">
          · Safety Override
        </span>
      )}
      {manualOverride && (
        <span className="text-[11px] font-medium text-blue-700" title="Manual Officer Override Active">
          · Officer Override
        </span>
      )}
    </span>
  );
}

/**
 * Accessible workflow status label with distinct semantic icon + unboxed typography.
 */
export function StatusIndicator({ status }: { status: WorkflowStatus }) {
  const map: Record<
    WorkflowStatus,
    { textClass: string; Icon: React.ComponentType<{ className?: string }> }
  > = {
    Submitted: { textClass: 'text-slate-700', Icon: Clock },
    'Under Review': { textClass: 'text-blue-700', Icon: FileSearch },
    Assigned: { textClass: 'text-indigo-700', Icon: UserCheck },
    'In Progress': { textClass: 'text-amber-700', Icon: Wrench },
    Resolved: { textClass: 'text-emerald-700', Icon: CheckCircle2 },
    Rejected: { textClass: 'text-slate-500', Icon: XCircle },
  };

  const { textClass, Icon } = map[status] ?? map.Submitted;

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${textClass} whitespace-nowrap`}>
      <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>{status}</span>
    </span>
  );
}
