import { Type } from '@google/genai';
import {
  CIVIC_CATEGORIES,
  type CivicCategory,
  type ClassificationResult,
} from '../../src/types/civic.ts';
import { CATEGORY_TO_DEPARTMENT } from '../config.ts';
import { getGeminiClient } from './gemini_client.ts';

interface CategoryLexicon {
  category: CivicCategory;
  terms: Array<{ pattern: RegExp; weight: number }>;
}

const CATEGORY_LEXICONS: CategoryLexicon[] = [
  {
    category: 'Road Damage',
    terms: [
      { pattern: /\bpotholes?\b/i, weight: 6 },
      { pattern: /\bcraters?\b/i, weight: 5 },
      { pattern: /\basphalt\b/i, weight: 4 },
      { pattern: /\btarmac\b/i, weight: 4 },
      { pattern: /\broad\s+(damage|surface|cave-?in|collapse|crack|broken|erosion)\b/i, weight: 6 },
      { pattern: /\b(damaged|broken|cracked|sunken|uneven)\s+(road|pavement|carriageway|stretch|lane)\b/i, weight: 5 },
      { pattern: /\bsinkhole\b/i, weight: 6 },
      { pattern: /\bspeed\s*breaker\b/i, weight: 3 },
      { pattern: /\bresurfac(e|ing)\b/i, weight: 4 },
    ],
  },
  {
    category: 'Waterlogging',
    terms: [
      { pattern: /\bwaterlog(ged|ging)?\b/i, weight: 6 },
      { pattern: /\brainwater\b/i, weight: 4.5 },
      { pattern: /\bstagnant\s+water\b/i, weight: 5 },
      { pattern: /\bflood(ed|ing)\b/i, weight: 5 },
      { pattern: /\binundat(ed|ion)\b/i, weight: 5 },
      { pattern: /\bwater\s+(collect(ing|ed)|accumulat(ing|ed)|pooling|standing|submerged)\b/i, weight: 4.5 },
      { pattern: /\bknee[- ]deep\s+water\b/i, weight: 6 },
      { pattern: /\bpuddle|ponding\b/i, weight: 3.5 },
    ],
  },
  {
    category: 'Garbage Management',
    terms: [
      { pattern: /\bgarbage\b/i, weight: 6 },
      { pattern: /\btrash|rubbish|refuse\b/i, weight: 5 },
      { pattern: /\bdustbins?|waste\s+bins?|garbage\s+bins?|dumpsters?\b/i, weight: 6 },
      { pattern: /\bsolid\s+waste\b/i, weight: 5 },
      { pattern: /\boverflowing\s+(bin|waste|garbage|trash)\b/i, weight: 6 },
      { pattern: /\buncollected\s+waste|illegal\s+dumping|rott(ing|en)\s+waste\b/i, weight: 5.5 },
      { pattern: /\bfoul\s+(smell|odour|odor)|stench\b/i, weight: 3 },
    ],
  },
  {
    category: 'Drainage',
    terms: [
      { pattern: /\bdrain(age|s)?\b/i, weight: 5.5 },
      { pattern: /\bsewer(age)?|sewage\b/i, weight: 6 },
      { pattern: /\bmanholes?\b/i, weight: 6 },
      { pattern: /\bculverts?|gutters?|stormwater\b/i, weight: 5.5 },
      { pattern: /\b(clogged|blocked|choked|overflowing)\s+(drain|gutter|culvert|sewer)\b/i, weight: 6.5 },
      { pattern: /\bsilt|desilt(ing)?\b/i, weight: 4 },
    ],
  },
  {
    category: 'Streetlight',
    terms: [
      { pattern: /\bstreet\s*lights?\b/i, weight: 6.5 },
      { pattern: /\blamp\s*posts?|light\s*poles?\b/i, weight: 6 },
      { pattern: /\bflickering\s+(light|lamp|bulb)\b/i, weight: 5 },
      { pattern: /\b(dark|unlit|pitch\s+dark)\s+(street|road|stretch|lane|alley|crossing)\b/i, weight: 5.5 },
      { pattern: /\bbroken\s+(streetlight|lamp|luminaire|led\s+fixture)\b/i, weight: 6 },
      { pattern: /\bstreet\s+lighting\b/i, weight: 5.5 },
    ],
  },
  {
    category: 'Electrical Hazard',
    terms: [
      { pattern: /\bexposed\s+(wires?|cables?|conductors?)\b/i, weight: 7.5 },
      { pattern: /\blive\s+(wires?|cables?|current|conductor)\b/i, weight: 8 },
      { pattern: /\bsparking\b/i, weight: 7 },
      { pattern: /\btransformer\b/i, weight: 6.5 },
      { pattern: /\belectrical\s+(hazard|pole|box|shock|short\s+circuit|feeder)\b/i, weight: 7 },
      { pattern: /\belectrocut(e|ion)\b/i, weight: 8 },
      { pattern: /\bdangling\s+(wire|cable)|low[- ]hanging\s+(power|electric|wire|cable)\b/i, weight: 7 },
      { pattern: /\bhigh[- ]tension\b/i, weight: 7 },
    ],
  },
  {
    category: 'Water Supply',
    terms: [
      { pattern: /\bwater\s+supply\b/i, weight: 6.5 },
      { pattern: /\bdrinking\s+water|potable\s+water\b/i, weight: 6 },
      { pattern: /\bburst\s+(water\s+)?(pipe|pipeline|main)\b/i, weight: 6.5 },
      { pattern: /\bcontaminated\s+water|dirty\s+tap\s+water\b/i, weight: 6.5 },
      { pattern: /\bno\s+water\s+in\s+taps?|low\s+water\s+pressure|leaking\s+pipeline\b/i, weight: 6 },
    ],
  },
  {
    category: 'Public Infrastructure',
    terms: [
      { pattern: /\bfootpath|sidewalk|pedestrian\s+walkway\b/i, weight: 5.5 },
      { pattern: /\bbus\s+(shelter|stop)\s+(roof|bench|collapsed|damaged|broken)\b/i, weight: 6 },
      { pattern: /\bguardrail|railing|divider|median|footbridge\b/i, weight: 5 },
      { pattern: /\bpublic\s+(park|bench|toilet|restroom|wall)\b/i, weight: 5.5 },
    ],
  },
];

const SAFETY_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\bexposed\s+(live\s+)?(wires?|cables?|conductors?)\b/i, reason: 'Exposed electrical wiring posing electrocution risk' },
  { pattern: /\blive\s+(wires?|cables?|current)\b/i, reason: 'Live electrical current hazard in public area' },
  { pattern: /\bsparking|short\s*circuit|transformer\s+fire\b/i, reason: 'Active electrical sparking or fire hazard' },
  { pattern: /\belectrocut(e|ion)|electric\s+shock\b/i, reason: 'Immediate danger of electric shock' },
  { pattern: /\bopen\s+manhole|uncovered\s+(manhole|drain|pit)\b/i, reason: 'Uncovered manhole or pit creating severe fall hazard' },
  { pattern: /\bsinkhole|road\s+(collapse|cave-?in)\b/i, reason: 'Structural road collapse hazard' },
  { pattern: /\b(vehicles?|bikes?|two[- ]wheelers?|cyclists?|pedestrians?|riders?|cars?)\s+(are\s+)?(almost\s+)?(falling|skidding|crashing|swerving|toppling|tripping)\b/i, reason: 'Potential vehicle or pedestrian accident risk' },
  { pattern: /\baccident(s)?|collision|crash|injury|injured\b/i, reason: 'Reported traffic accident or injury hazard' },
  { pattern: /\bblocking\s+ambulance|hospital\s+entrance|school\s+gate|college\s+entrance\b/i, reason: 'Safety risk near high-footfall institution or emergency access' },
];

export function classifyComplaintDeterministic(
  title: string,
  description: string,
  userSelectedCategory?: CivicCategory | 'Auto-Detect'
): ClassificationResult {
  const combined = `${title || ''}. ${description || ''}`.trim();
  const scores = new Map<CivicCategory, number>();
  for (const cat of CIVIC_CATEGORIES) {
    scores.set(cat, 0);
  }

  for (const entry of CATEGORY_LEXICONS) {
    let score = 0;
    for (const rule of entry.terms) {
      if (rule.pattern.test(combined)) {
        score += rule.weight;
      }
    }
    scores.set(entry.category, score);
  }

  // Slight tie-breaker boost if user explicitly selected a non-Other category and text doesn't contradict strongly
  if (
    userSelectedCategory &&
    userSelectedCategory !== 'Auto-Detect' &&
    userSelectedCategory !== 'Other'
  ) {
    scores.set(userSelectedCategory, (scores.get(userSelectedCategory) ?? 0) + 2.5);
  }

  const ranked = Array.from(scores.entries())
    .filter(([cat]) => cat !== 'Other')
    .sort((a, b) => b[1] - a[1]);

  let primaryCategory: CivicCategory = 'Other';
  let secondaryCategory: CivicCategory | null = null;
  let confidence = 0.55;

  if (ranked[0] && ranked[0][1] > 0) {
    primaryCategory = ranked[0][0];
    const topScore = ranked[0][1];
    const secondScore = ranked[1]?.[1] ?? 0;

    if (ranked[1] && secondScore >= 3.5 && secondScore >= topScore * 0.4) {
      secondaryCategory = ranked[1][0];
    }

    confidence = Math.min(0.96, Number((0.62 + Math.min(topScore, 14) * 0.024).toFixed(2)));
  } else if (userSelectedCategory && userSelectedCategory !== 'Auto-Detect') {
    primaryCategory = userSelectedCategory;
    confidence = 0.6;
  }

  const safetyReasons: string[] = [];
  for (const check of SAFETY_PATTERNS) {
    if (check.pattern.test(combined)) {
      safetyReasons.push(check.reason);
    }
  }
  if (primaryCategory === 'Electrical Hazard' && safetyReasons.length === 0) {
    safetyReasons.push('Electrical infrastructure hazard requires immediate safety clearance');
  }

  const safetyConcern = safetyReasons.length > 0;
  const suggestedDepartment =
    primaryCategory === 'Electrical Hazard' && safetyConcern
      ? 'Electrical & Streetlight Division'
      : CATEGORY_TO_DEPARTMENT[primaryCategory] ?? 'Public Works Department';

  return {
    primaryCategory,
    secondaryCategory,
    suggestedDepartment,
    safetyConcern,
    safetyReasons,
    confidence,
    engineSource: 'deterministic-nlp',
  };
}

export async function classifyComplaint(
  title: string,
  description: string,
  userSelectedCategory?: CivicCategory | 'Auto-Detect'
): Promise<ClassificationResult> {
  const fallback = classifyComplaintDeterministic(title, description, userSelectedCategory);
  const ai = getGeminiClient();
  if (!ai || !description || description.trim().length < 8) {
    return fallback;
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: `Classify this municipal civic complaint accurately based only on the text provided.\nTitle: ${title}\nDescription: ${description}`,
      config: {
        systemInstruction:
          'You are a municipal civic complaint classifier. Choose primaryCategory and optional secondaryCategory strictly from: Road Damage, Waterlogging, Garbage Management, Drainage, Streetlight, Electrical Hazard, Water Supply, Public Infrastructure, Other. Set safetyConcern=true if there is accident, fall, flooding, electrocution, or injury risk.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            primaryCategory: { type: Type.STRING },
            secondaryCategory: { type: Type.STRING },
            safetyConcern: { type: Type.BOOLEAN },
            safetyReasons: { type: Type.ARRAY, items: { type: Type.STRING } },
            confidence: { type: Type.NUMBER },
          },
          required: ['primaryCategory', 'safetyConcern', 'safetyReasons', 'confidence'],
        },
      },
    });

    const parsed = JSON.parse((response.text ?? '{}').trim());
    const validPrimary = (CIVIC_CATEGORIES as readonly string[]).includes(parsed.primaryCategory)
      ? (parsed.primaryCategory as CivicCategory)
      : fallback.primaryCategory;
    const validSecondary =
      parsed.secondaryCategory &&
      parsed.secondaryCategory !== validPrimary &&
      (CIVIC_CATEGORIES as readonly string[]).includes(parsed.secondaryCategory)
        ? (parsed.secondaryCategory as CivicCategory)
        : fallback.secondaryCategory;

    const mergedReasons = Array.from(
      new Set([
        ...(Array.isArray(parsed.safetyReasons) ? parsed.safetyReasons.filter(Boolean) : []),
        ...fallback.safetyReasons,
      ])
    );
    const safetyConcern = Boolean(parsed.safetyConcern) || fallback.safetyConcern;

    return {
      primaryCategory: validPrimary,
      secondaryCategory: validSecondary,
      suggestedDepartment: CATEGORY_TO_DEPARTMENT[validPrimary] ?? fallback.suggestedDepartment,
      safetyConcern,
      safetyReasons: mergedReasons,
      confidence:
        typeof parsed.confidence === 'number' && parsed.confidence > 0 && parsed.confidence <= 1
          ? Number(parsed.confidence.toFixed(2))
          : fallback.confidence,
      engineSource: 'gemini-3.8-flash',
    };
  } catch {
    return fallback;
  }
}
