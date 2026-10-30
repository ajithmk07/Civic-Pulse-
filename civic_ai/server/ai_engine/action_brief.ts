import { Type } from '@google/genai';
import type {
  ActionBrief,
  CivicCategory,
  CivicReport,
  GeographicHotspot,
  PriorityLevel,
} from '../../src/types/civic.ts';
import { CATEGORY_TO_DEPARTMENT } from '../config.ts';
import { getGeminiClient } from './gemini_client.ts';

const PRIORITY_RANK: Record<PriorityLevel, number> = {
  Critical: 4,
  High: 3,
  Medium: 2,
  Low: 1,
};

function getRecommendedActionsForCategories(
  categories: CivicCategory[],
  hasSafetyRisk: boolean,
  unresolvedCount: number
): string[] {
  const actions: string[] = [];

  if (hasSafetyRisk) {
    actions.push(
      'Deploy temporary hazard barriers, reflective cones, or safety isolation cordons at the site immediately.'
    );
  }

  if (categories.includes('Electrical Hazard')) {
    actions.push(
      'Dispatch certified electrical linemen to isolate live conductors, inspect feeder pillar insulation, and verify earthing before re-energizing.'
    );
  }
  if (categories.includes('Road Damage')) {
    actions.push(
      'Conduct structural roadbed inspection, measure crater depth, and schedule cold-mix emergency patching followed by hot-asphalt resurfacing.'
    );
  }
  if (categories.includes('Waterlogging') || categories.includes('Drainage')) {
    actions.push(
      'Inspect adjacent stormwater culverts and roadside catch-pits for silt or solid-waste blockage; deploy dewatering pumps if standing water persists.'
    );
  }
  if (categories.includes('Garbage Management')) {
    actions.push(
      'Dispatch compactor clearance vehicle, sanitize the collection point, and audit daily pickup route adherence for this ward.'
    );
  }
  if (categories.includes('Streetlight')) {
    actions.push(
      'Test luminaire drivers, photocell timers, and underground feeder continuity along the dark stretch during evening inspection.'
    );
  }
  if (categories.includes('Water Supply')) {
    actions.push(
      'Test line pressure and chlorine residual, isolate any leaking valve joint, and notify affected households of repair window.'
    );
  }
  if (categories.includes('Public Infrastructure')) {
    actions.push(
      'Assess structural stability of damaged public fixture and schedule civil maintenance repair.'
    );
  }

  if (unresolvedCount > 1) {
    actions.push(
      `Consolidate field updates across all ${unresolvedCount} open citizen tracking IDs so residents receive synchronized progress notifications.`
    );
  } else {
    actions.push('Log photographic completion evidence and post public status update upon verification.');
  }

  return actions.slice(0, 5);
}

export function generateActionBriefDeterministic(params: {
  targetType: 'hotspot' | 'report';
  targetId: string;
  reports: CivicReport[];
  hotspot?: GeographicHotspot | null;
}): ActionBrief {
  const { targetType, targetId, reports, hotspot } = params;
  const nowIso = new Date().toISOString();

  if (reports.length === 0) {
    return {
      briefTitle: `Municipal Action Brief — ${targetId}`,
      generatedAt: nowIso,
      engineSource: 'deterministic-template',
      targetType,
      targetId,
      verifiedFacts: {
        affectedLocation: hotspot?.areaName ?? 'Unknown Location',
        coordinates: hotspot ? `${hotspot.latitude.toFixed(4)}, ${hotspot.longitude.toFixed(4)}` : 'N/A',
        relatedReportCount: 0,
        confirmedDuplicatesCount: 0,
        reportIds: [],
        categoryBreakdown: {},
        highestPriorityLevel: 'Low',
        highestPriorityScore: 0,
        unresolvedCount: 0,
      },
      advisoryRecommendations: {
        problemSummary: 'No stored reports matched the requested identifier.',
        potentialImpact: 'No verified impact data available.',
        supportingEvidence: ['0 matching database records found.'],
        suggestedDepartment: 'Public Works Department',
        recommendedNextActions: ['Verify the report or hotspot ID before dispatching field staff.'],
        safetyConsiderations: ['None recorded.'],
        disclaimer:
          'Advisory brief generated from stored database records. Recommendations require municipal officer verification.',
      },
    };
  }

  const categoryBreakdown: Record<string, number> = {};
  let highestPriorityLevel: PriorityLevel = 'Low';
  let highestPriorityScore = 0;
  let unresolvedCount = 0;
  let confirmedDuplicatesCount = 0;
  let hasSafetyRisk = false;
  const safetyReasons = new Set<string>();

  for (const r of reports) {
    categoryBreakdown[r.category] = (categoryBreakdown[r.category] ?? 0) + 1;
    if (PRIORITY_RANK[r.priorityLevel] > PRIORITY_RANK[highestPriorityLevel]) {
      highestPriorityLevel = r.priorityLevel;
    }
    if (r.priorityScore > highestPriorityScore) {
      highestPriorityScore = r.priorityScore;
    }
    if (r.status !== 'Resolved' && r.status !== 'Rejected') {
      unresolvedCount += 1;
    }
    confirmedDuplicatesCount += r.confirmedDuplicateCount;
    if (r.safetyConcern || r.safetyOverride) {
      hasSafetyRisk = true;
      if (r.safetyOverrideReason) safetyReasons.add(r.safetyOverrideReason);
      for (const exp of r.priorityExplanation?.explanations ?? []) {
        if (/risk|hazard|safety|override|danger|accident/i.test(exp)) {
          safetyReasons.add(exp);
        }
      }
    }
  }

  const sortedCategories = Object.entries(categoryBreakdown).sort((a, b) => b[1] - a[1]);
  const topCategories = sortedCategories.map(([c]) => c as CivicCategory);
  const dominantCategory = topCategories[0] ?? 'Other';

  const affectedLocation =
    hotspot?.areaName ||
    reports[0].locationName ||
    'Municipal Jurisdiction';

  const validCoordReport = reports.find((r) => r.latitude !== null && r.longitude !== null);
  const coordinates = hotspot
    ? `${hotspot.latitude.toFixed(5)}, ${hotspot.longitude.toFixed(5)} (radius ~${hotspot.radiusMeters}m)`
    : validCoordReport
    ? `${validCoordReport.latitude!.toFixed(5)}, ${validCoordReport.longitude!.toFixed(5)}`
    : 'Coordinates not provided';

  const departments = Array.from(
    new Set(topCategories.slice(0, 2).map((c) => CATEGORY_TO_DEPARTMENT[c]))
  );
  const suggestedDepartment = departments.join(' & ');

  const catSummary = sortedCategories.map(([c, count]) => `${count} ${c}`).join(', ');
  const problemSummary =
    targetType === 'hotspot'
      ? `Spatial concentration of ${reports.length} citizen reports near ${affectedLocation} (${catSummary}), with ${unresolvedCount} currently unresolved.`
      : `${reports[0].title} at ${affectedLocation} (${reports[0].category}${
          reports[0].secondaryCategory ? ` / ${reports[0].secondaryCategory}` : ''
        }). ${reports[0].aiSummary}`;

  const potentialImpact =
    topCategories.length >= 2
      ? `Overlapping ${topCategories.slice(0, 2).join(' and ').toLowerCase()} complaints suggest a possible compounding infrastructure disruption affecting commuters and local residents near ${affectedLocation}.`
      : `Continued ${dominantCategory.toLowerCase()} disruption at ${affectedLocation} may degrade commuter safety, service reliability, and neighborhood sanitation if unaddressed.`;

  const supportingEvidence: string[] = [
    `${reports.length} stored citizen report(s) analyzed (${reports
      .slice(0, 6)
      .map((r) => r.reportId)
      .join(', ')}${reports.length > 6 ? `, +${reports.length - 6} more` : ''}).`,
    `Category distribution in stored data: ${catSummary}.`,
    `Peak priority score: ${highestPriorityScore}/100 (${highestPriorityLevel}); ${unresolvedCount} report(s) pending resolution.`,
  ];

  if (hotspot) {
    supportingEvidence.push(
      `DBSCAN Haversine cluster (${hotspot.hotspotId}) identified within ~${hotspot.radiusMeters}m radius.`
    );
  }
  if (confirmedDuplicatesCount > 0) {
    supportingEvidence.push(
      `${confirmedDuplicatesCount} verified duplicate relationship(s) confirm repeated citizen observations.`
    );
  }

  const safetyConsiderations =
    safetyReasons.size > 0
      ? Array.from(safetyReasons).slice(0, 4)
      : hasSafetyRisk
      ? ['Field safety precautions and traffic warning signage advised before repair work begins.']
      : ['No immediate life-safety override triggered; follow standard municipal field PPE protocols.'];

  return {
    briefTitle:
      targetType === 'hotspot'
        ? `Municipal Action Brief — ${hotspot?.hotspotId ?? targetId} (${affectedLocation})`
        : `Municipal Action Brief — ${reports[0].reportId} (${affectedLocation})`,
    generatedAt: nowIso,
    engineSource: 'deterministic-template',
    targetType,
    targetId,
    verifiedFacts: {
      affectedLocation,
      coordinates,
      relatedReportCount: reports.length,
      confirmedDuplicatesCount,
      reportIds: reports.map((r) => r.reportId),
      categoryBreakdown,
      highestPriorityLevel,
      highestPriorityScore,
      unresolvedCount,
    },
    advisoryRecommendations: {
      problemSummary,
      potentialImpact,
      supportingEvidence,
      suggestedDepartment,
      recommendedNextActions: getRecommendedActionsForCategories(
        topCategories,
        hasSafetyRisk,
        unresolvedCount
      ),
      safetyConsiderations,
      disclaimer:
        'Distinction Notice: Metrics above are verified database facts from citizen submissions. Action steps and causal hypotheses are AI-generated advisory recommendations requiring municipal field inspection.',
    },
  };
}

export async function generateActionBrief(params: {
  targetType: 'hotspot' | 'report';
  targetId: string;
  reports: CivicReport[];
  hotspot?: GeographicHotspot | null;
}): Promise<ActionBrief> {
  const baseBrief = generateActionBriefDeterministic(params);
  const ai = getGeminiClient();
  if (!ai || params.reports.length === 0) {
    return baseBrief;
  }

  try {
    const sampleReportText = params.reports
      .slice(0, 8)
      .map(
        (r) =>
          `- [${r.reportId}] (${r.category}, Priority ${r.priorityLevel} ${r.priorityScore}/100, Status: ${r.status}): ${r.title} — ${r.description}`
      )
      .join('\n');

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: `Generate an actionable municipal brief strictly grounded in these stored citizen reports.\nLocation: ${baseBrief.verifiedFacts.affectedLocation}\nTotal Reports: ${baseBrief.verifiedFacts.relatedReportCount}\nCategory Breakdown: ${JSON.stringify(
        baseBrief.verifiedFacts.categoryBreakdown
      )}\nStored Reports:\n${sampleReportText}`,
      config: {
        systemInstruction:
          'You are a municipal operations advisor. Based ONLY on the stored reports provided, produce a concise problemSummary, potentialImpact, suggestedDepartment, 4 concrete recommendedNextActions, and 2-3 safetyConsiderations. Use cautious language ("possible contributing issue", "requires inspection") rather than claiming unverified root causes.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            problemSummary: { type: Type.STRING },
            potentialImpact: { type: Type.STRING },
            suggestedDepartment: { type: Type.STRING },
            recommendedNextActions: { type: Type.ARRAY, items: { type: Type.STRING } },
            safetyConsiderations: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
          required: [
            'problemSummary',
            'potentialImpact',
            'suggestedDepartment',
            'recommendedNextActions',
            'safetyConsiderations',
          ],
        },
      },
    });

    const parsed = JSON.parse((response.text ?? '{}').trim());
    if (
      typeof parsed.problemSummary === 'string' &&
      Array.isArray(parsed.recommendedNextActions) &&
      parsed.recommendedNextActions.length > 0
    ) {
      return {
        ...baseBrief,
        engineSource: 'gemini-3.8-flash',
        advisoryRecommendations: {
          ...baseBrief.advisoryRecommendations,
          problemSummary: parsed.problemSummary.trim(),
          potentialImpact: (
            parsed.potentialImpact || baseBrief.advisoryRecommendations.potentialImpact
          ).trim(),
          suggestedDepartment: (
            parsed.suggestedDepartment || baseBrief.advisoryRecommendations.suggestedDepartment
          ).trim(),
          recommendedNextActions: parsed.recommendedNextActions
            .map((s: string) => s.trim())
            .filter(Boolean)
            .slice(0, 5),
          safetyConsiderations:
            Array.isArray(parsed.safetyConsiderations) && parsed.safetyConsiderations.length > 0
              ? parsed.safetyConsiderations.map((s: string) => s.trim()).filter(Boolean).slice(0, 4)
              : baseBrief.advisoryRecommendations.safetyConsiderations,
        },
      };
    }
    return baseBrief;
  } catch {
    return baseBrief;
  }
}
