import type {
  CivicCategory,
  PriorityEvaluation,
  PriorityFactorContribution,
  PriorityLevel,
} from '../../src/types/civic.ts';
import { MUNICIPAL_ZONES } from '../config.ts';
import { haversineDistanceMeters } from '../utils/validation.ts';

const CATEGORY_BASE_SEVERITY: Record<CivicCategory, number> = {
  'Electrical Hazard': 88,
  'Road Damage': 66,
  Waterlogging: 64,
  Drainage: 60,
  'Water Supply': 62,
  Streetlight: 48,
  'Garbage Management': 46,
  'Public Infrastructure': 44,
  Other: 35,
};

const CATEGORY_BASE_URGENCY: Record<CivicCategory, number> = {
  'Electrical Hazard': 90,
  Waterlogging: 68,
  'Road Damage': 64,
  'Water Supply': 65,
  Drainage: 58,
  Streetlight: 50,
  'Garbage Management': 48,
  'Public Infrastructure': 42,
  Other: 32,
};

const CRITICAL_SAFETY_OVERRIDES: Array<{ pattern: RegExp; reason: string; minScore: number }> = [
  {
    pattern: /\b(exposed\s+(live\s+)?(wires?|cables?|conductors?)|live\s+(wires?|cables?|current)|electrocut(e|ion)|sparking\s+(transformer|wire|cable|pole))\b/i,
    reason: 'Safety Override: Exposed or sparking live electrical conductor poses immediate danger to life.',
    minScore: 93,
  },
  {
    pattern: /\b(open\s+manhole|uncovered\s+manhole|road\s+(collapse|cave-?in)|sinkhole)\b/i,
    reason: 'Safety Override: Open manhole or structural road collapse poses severe fall/crash danger.',
    minScore: 90,
  },
  {
    pattern: /\b(blocking\s+ambulance|emergency\s+ward\s+blocked)\b/i,
    reason: 'Safety Override: Obstruction directly affecting emergency medical access.',
    minScore: 91,
  },
];

function clamp100(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function scoreToPriorityLevel(score: number): PriorityLevel {
  if (score >= 80) return 'Critical';
  if (score >= 60) return 'High';
  if (score >= 35) return 'Medium';
  return 'Low';
}

export interface PriorityEngineInput {
  title: string;
  description: string;
  category: CivicCategory;
  secondaryCategory: CivicCategory | null;
  latitude: number | null;
  longitude: number | null;
  locationName?: string;
  safetyConcern: boolean;
  safetyReasons?: string[];
  /**
   * IMPORTANT: Only verified/confirmed duplicate or related reports count toward recurrence.
   * Unconfirmed duplicate suggestions must NOT inflate verified recurrence.
   */
  confirmedRelatedCount: number;
}

export function calculateExplainablePriority(input: PriorityEngineInput): PriorityEvaluation {
  const combined = `${input.title || ''}. ${input.description || ''} ${input.locationName || ''}`;
  const explanations: string[] = [];

  // 1. Severity (weight 0.35)
  let severity = CATEGORY_BASE_SEVERITY[input.category] ?? 40;
  let severityReason = `Baseline severity for ${input.category}`;

  if (/\b(huge|massive|deep|severe|major|collapsed|dangerous|critical|submerged|waist-deep|knee-deep)\b/i.test(combined)) {
    severity += 14;
    severityReason = `Elevated physical severity described in report (${input.category})`;
    explanations.push('High physical severity indicators present in description.');
  }
  if (input.secondaryCategory) {
    severity += 6;
    explanations.push(`Compound issue involving both ${input.category} and ${input.secondaryCategory}.`);
  }
  if (input.safetyConcern) {
    severity += 10;
  }
  if (/\b(minor|small|hairline|slight|cosmetic|routine|dry\s+leaf|skipped|daytime)\b/i.test(combined)) {
    severity -= 24;
    severityReason = 'Routine / localized defect with minor physical severity';
  }
  severity = clamp100(severity);

  // 2. Urgency (weight 0.30)
  let urgency = CATEGORY_BASE_URGENCY[input.category] ?? 38;
  let urgencyReason = `Standard operational response window for ${input.category}`;

  if (input.safetyConcern) {
    urgency += 18;
    urgencyReason = input.safetyReasons?.[0] || 'Active public safety risk requires rapid response';
    explanations.push(urgencyReason);
  }
  if (/\b(immediately|urgent|right\s+now|almost\s+falling|skidding|blocking\s+traffic|overflowing\s+onto|night)\b/i.test(combined)) {
    urgency += 10;
  }
  if (/\b(minor|occasional|cosmetic|faded\s+paint|routine|intermittently|daytime|hairline|dry\s+leaf)\b/i.test(combined)) {
    urgency -= 22;
  }
  urgency = clamp100(urgency);

  // 3. Recurrence (weight 0.20) — strictly from confirmed related reports + explicit chronic recurrence history
  let recurrence = 18;
  let recurrenceReason = 'Single report; no confirmed duplicate cluster yet';
  const confirmed = Math.max(0, Math.floor(input.confirmedRelatedCount));

  if (confirmed >= 4) {
    recurrence = 96;
    recurrenceReason = `${confirmed} confirmed related citizen reports linked to this issue`;
    explanations.push(`Multiple confirmed reports (${confirmed} verified links).`);
  } else if (confirmed === 3) {
    recurrence = 84;
    recurrenceReason = '3 confirmed related citizen reports linked';
    explanations.push('3 confirmed citizen reports verify recurring issue.');
  } else if (confirmed === 2) {
    recurrence = 68;
    recurrenceReason = '2 confirmed related citizen reports linked';
    explanations.push('2 confirmed related reports at this location.');
  } else if (confirmed === 1) {
    recurrence = 48;
    recurrenceReason = '1 confirmed duplicate report linked';
    explanations.push('Confirmed duplicate report corroborates this complaint.');
  } else if (/\b(repeatedly|every\s+rain|for\s+weeks|for\s+months|recurring|again\s+and\s+again)\b/i.test(combined)) {
    recurrence = 34;
    recurrenceReason = 'Citizen describes chronic problem (awaiting multi-report verification)';
  }
  recurrence = clamp100(recurrence);

  // 4. Community Impact (weight 0.15)
  let impact = 45;
  let impactReason = 'Neighborhood-level public service impact';

  if (/\b(hospital|clinic|ambulance|school|college|university|campus|station|metro|bus\s+stand|market|main\s+road|highway|junction|crossing)\b/i.test(combined)) {
    impact += 32;
    impactReason = 'Located near high-footfall public institution, transit hub, or arterial corridor';
    explanations.push('Important high-traffic public location (institution, market, or transit corridor).');
  } else if (input.latitude !== null && input.longitude !== null) {
    for (const zone of MUNICIPAL_ZONES) {
      const dist = haversineDistanceMeters(input.latitude, input.longitude, zone.latitude, zone.longitude);
      if (dist <= 220 && ['education', 'healthcare', 'transit', 'commercial'].includes(zone.publicFacilityType)) {
        impact += 24;
        impactReason = `Within ${Math.round(dist)}m of ${zone.name}`;
        explanations.push(`Proximity to key civic zone: ${zone.name}.`);
        break;
      }
    }
  }
  if (/\b(hundreds|students|commuters|pedestrians|entire\s+street|both\s+lanes)\b/i.test(combined)) {
    impact += 12;
  }
  if (/\b(dead[- ]end|cul[- ]de[- ]sac|side\s+alley|back\s+lane)\b/i.test(combined)) {
    impact -= 15;
  }
  impact = clamp100(impact);

  // Exact Weighted Formula: 0.35*Severity + 0.30*Urgency + 0.20*Recurrence + 0.15*Impact
  const weightedSeverity = Number((0.35 * severity).toFixed(2));
  const weightedUrgency = Number((0.3 * urgency).toFixed(2));
  const weightedRecurrence = Number((0.2 * recurrence).toFixed(2));
  const weightedImpact = Number((0.15 * impact).toFixed(2));

  const baseFormulaScore = clamp100(
    weightedSeverity + weightedUrgency + weightedRecurrence + weightedImpact
  );

  let priorityScore = baseFormulaScore;
  let safetyOverride = false;
  let safetyOverrideReason: string | null = null;

  for (const overrideRule of CRITICAL_SAFETY_OVERRIDES) {
    if (overrideRule.pattern.test(combined)) {
      safetyOverride = true;
      safetyOverrideReason = overrideRule.reason;
      priorityScore = Math.max(priorityScore, overrideRule.minScore);
      explanations.unshift(overrideRule.reason);
      break;
    }
  }

  const priorityLevel = scoreToPriorityLevel(priorityScore);

  if (explanations.length === 0) {
    explanations.push(`Standard ${input.category.toLowerCase()} complaint prioritized by weighted impact formula.`);
  }

  const contributions: PriorityFactorContribution[] = [
    {
      factor: 'Severity',
      weight: 0.35,
      rawScore: severity,
      weightedContribution: weightedSeverity,
      rationale: severityReason,
    },
    {
      factor: 'Urgency',
      weight: 0.3,
      rawScore: urgency,
      weightedContribution: weightedUrgency,
      rationale: urgencyReason,
    },
    {
      factor: 'Recurrence',
      weight: 0.2,
      rawScore: recurrence,
      weightedContribution: weightedRecurrence,
      rationale: recurrenceReason,
    },
    {
      factor: 'Community Impact',
      weight: 0.15,
      rawScore: impact,
      weightedContribution: weightedImpact,
      rationale: impactReason,
    },
  ];

  return {
    severityScore: severity,
    urgencyScore: urgency,
    recurrenceScore: recurrence,
    impactScore: impact,
    baseFormulaScore,
    priorityScore,
    priorityLevel,
    safetyConcern: input.safetyConcern || safetyOverride,
    safetyOverride,
    safetyOverrideReason,
    explanations: Array.from(new Set(explanations)).slice(0, 5),
    contributions,
    advisoryNotice:
      'Advisory AI score for municipal triage support only — not an official government determination. Authorities may override manually with a recorded reason.',
  };
}
