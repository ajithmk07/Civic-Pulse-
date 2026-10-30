import { Type } from '@google/genai';
import type { ClassificationResult, SummaryResult } from '../../src/types/civic.ts';
import { getGeminiClient } from './gemini_client.ts';

function extractLocationPhrase(text: string, fallbackLocation?: string): string {
  if (fallbackLocation && fallbackLocation.trim() && fallbackLocation !== 'Unspecified Location') {
    return fallbackLocation.trim();
  }
  const match = text.match(
    /\b(?:near|outside|at|along|beside|opposite|around|on)\s+([A-Z0-9][A-Za-z0-9\s,&'-]{3,55}?)(?:[.,;]|$|\s+(?:where|and|is|has|causing|blocking|since|for))/i
  );
  if (match?.[1]) {
    return match[1].trim();
  }
  return 'Reported coordinates';
}

function extractImpactPhrase(text: string, classification: ClassificationResult): string {
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const impactRegex =
    /\b(falling|skidding|blocking|blocked|accident|traffic|congestion|hazard|stagnant|mosquito|smell|stench|dark|unsafe|pedestrians|vehicles|two-wheelers|bikes|children|students|patients|sparking|shock|overflowing|flooding|submerged)\b/i;

  for (const s of sentences) {
    if (impactRegex.test(s)) {
      return s.replace(/\.$/, '');
    }
  }

  if (classification.safetyConcern && classification.safetyReasons[0]) {
    return classification.safetyReasons[0];
  }
  return `Disrupting normal ${classification.primaryCategory.toLowerCase()} conditions in the area`;
}

export function summarizeComplaintDeterministic(
  title: string,
  description: string,
  locationName: string,
  classification: ClassificationResult
): SummaryResult {
  const cleanTitle = (title ?? '').replace(/\s+/g, ' ').trim();
  const cleanDesc = (description ?? '').replace(/\s+/g, ' ').trim();

  if (!cleanTitle && !cleanDesc) {
    return {
      summary: 'No valid complaint text provided for summarization.',
      whatHappened: 'Unspecified issue',
      whereHappened: locationName || 'Unspecified location',
      potentialImpact: 'Requires citizen clarification',
      safetyConcernText: 'None stated in report',
      engineSource: 'deterministic-nlp',
    };
  }

  const combined = cleanDesc || cleanTitle;
  const firstSentence = combined.split(/(?<=[.!?])\s+/)[0]?.replace(/\.$/, '') || cleanTitle;
  const whereHappened = extractLocationPhrase(`${cleanTitle}. ${cleanDesc}`, locationName);
  const potentialImpact = extractImpactPhrase(combined, classification);
  const safetyConcernText = classification.safetyConcern
    ? `Yes — ${classification.safetyReasons[0] ?? 'Public safety risk indicated in report'}`
    : 'No immediate life-safety hazard explicitly stated';

  const secondaryNote = classification.secondaryCategory
    ? ` with associated ${classification.secondaryCategory.toLowerCase()}`
    : '';

  const safetyClause = classification.safetyConcern
    ? ' Creates an active public safety concern.'
    : '';

  const conciseWhat =
    cleanTitle.length >= 10
      ? cleanTitle.replace(/\.$/, '')
      : firstSentence.slice(0, 120).replace(/\.$/, '');

  const summary = `${conciseWhat} (${whereHappened})${secondaryNote}. Impact: ${potentialImpact.slice(0, 140)}.${safetyClause}`;

  return {
    summary: summary.slice(0, 320),
    whatHappened: conciseWhat,
    whereHappened,
    potentialImpact: potentialImpact.slice(0, 160),
    safetyConcernText,
    engineSource: 'deterministic-nlp',
  };
}

export async function summarizeComplaint(
  title: string,
  description: string,
  locationName: string,
  classification: ClassificationResult
): Promise<SummaryResult> {
  const fallback = summarizeComplaintDeterministic(title, description, locationName, classification);
  const ai = getGeminiClient();
  if (!ai || !description || description.trim().length < 12) {
    return fallback;
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: `Summarize this civic complaint faithfully without inventing any facts.\nTitle: ${title}\nLocation: ${locationName}\nDescription: ${description}`,
      config: {
        systemInstruction:
          'Generate a concise 1-2 sentence municipal complaint summary under 45 words preserving: what happened, where it happened, potential impact, and any safety concern. Never invent details not present in the input.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING },
            whatHappened: { type: Type.STRING },
            whereHappened: { type: Type.STRING },
            potentialImpact: { type: Type.STRING },
            safetyConcernText: { type: Type.STRING },
          },
          required: [
            'summary',
            'whatHappened',
            'whereHappened',
            'potentialImpact',
            'safetyConcernText',
          ],
        },
      },
    });

    const parsed = JSON.parse((response.text ?? '{}').trim());
    if (typeof parsed.summary === 'string' && parsed.summary.trim().length >= 15) {
      return {
        summary: parsed.summary.trim().slice(0, 320),
        whatHappened: (parsed.whatHappened || fallback.whatHappened).trim(),
        whereHappened: (parsed.whereHappened || fallback.whereHappened).trim(),
        potentialImpact: (parsed.potentialImpact || fallback.potentialImpact).trim(),
        safetyConcernText: (parsed.safetyConcernText || fallback.safetyConcernText).trim(),
        engineSource: 'gemini-3.8-flash',
      };
    }
    return fallback;
  } catch {
    return fallback;
  }
}
