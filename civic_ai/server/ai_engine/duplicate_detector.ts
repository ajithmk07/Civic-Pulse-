import type { CivicCategory, DuplicateMatch } from '../../src/types/civic.ts';
import { DEFAULT_DUPLICATE_CONFIG, RELATED_CATEGORIES } from '../config.ts';
import { haversineDistanceMeters } from '../utils/validation.ts';

const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'been', 'being', 'by', 'for', 'from',
  'has', 'have', 'had', 'he', 'her', 'here', 'him', 'his', 'how', 'i', 'if', 'in',
  'into', 'is', 'it', 'its', 'just', 'many', 'more', 'most', 'my', 'no', 'not', 'of',
  'on', 'or', 'our', 'out', 'over', 'please', 'so', 'some', 'such', 'than', 'that',
  'the', 'their', 'them', 'then', 'there', 'these', 'they', 'this', 'to', 'too',
  'under', 'up', 'us', 'very', 'was', 'we', 'were', 'what', 'when', 'where', 'which',
  'while', 'who', 'will', 'with', 'would', 'you', 'your', 'near', 'around', 'outside',
  'also', 'almost', 'since', 'days', 'past', 'causing', 'creating', 'making', 'issue',
  'problem', 'complaint', 'report', 'reported', 'urgent', 'kindly', 'fix', 'repair',
]);

const CIVIC_CANONICAL_MAP: Array<[RegExp, string]> = [
  [/\b(potholes?|craters?|pit|depression|rut)\b/g, 'pothole'],
  [/\b(roads?|streets?|carriageway|asphalt|tarmac|lane|pavement)\b/g, 'road'],
  [/\b(damaged|broken|cracked|eroded|collapsed|sunken|huge|deep|large|massive|big|wide)\b/g, 'damaged'],
  [/\b(waterlog(ged|ging)?|rainwater|stagnant|flooded|flooding|pooling|ponding|accumulated|collecting|collected|standing|filled|submerged)\b/g, 'waterlog'],
  [/\b(vehicles?|cars?|bikes?|two-?wheelers?|motorcycles?|scooters?|cyclists?|commuters?|riders?|autos?|traffic)\b/g, 'vehicle'],
  [/\b(falling|fall|skidding|skid|swerving|swerve|crashing|crash|accident|accidents|toppling|losing)\b/g, 'accident_risk'],
  [/\b(college|university|campus)\b/g, 'college'],
  [/\b(entrance|gate|entry|front|approach)\b/g, 'entrance'],
  [/\b(garbage|trash|rubbish|waste|refuse|litter|dump|dumping)\b/g, 'garbage'],
  [/\b(bins?|dustbins?|dumpsters?|containers?|vat)\b/g, 'bin'],
  [/\b(overflow(ing|ed)?|spilling|piled|heaped|uncollected|scattered)\b/g, 'overflow'],
  [/\b(smell|odour|odor|stench|stink|rotting|flies|stray)\b/g, 'sanitation_hazard'],
  [/\b(street\s*lights?|streetlights?|lamps?|lampposts?|poles?|luminaires?|bulbs?|led)\b/g, 'streetlight'],
  [/\b(dark|unlit|flickering|dead|outage|off|non-?functional|blackout|night)\b/g, 'light_outage'],
  [/\b(drains?|drainage|sewers?|sewage|gutters?|culverts?|stormwater|manholes?)\b/g, 'drainage'],
  [/\b(blocked|clogged|choked|obstructed|backed|silted|uncovered|open)\b/g, 'blocked'],
  [/\b(wires?|wiring|cables?|conductors?|powerlines?|feeder|transformer)\b/g, 'electric_wire'],
  [/\b(exposed|live|sparking|dangling|hanging|shock|electrocution|short-?circuit|high-?tension)\b/g, 'electric_hazard'],
  [/\b(water\s+supply|pipeline|pipe|mainline|tap|potable|leak(ing|age)?|burst)\b/g, 'water_pipeline'],
];

function lightStem(word: string): string {
  if (word.length <= 4) return word;
  return word
    .replace(/ing$/, '')
    .replace(/ed$/, '')
    .replace(/es$/, '')
    .replace(/s$/, '');
}

export function tokenizeCivicText(rawText: string): string[] {
  let normalized = (rawText || '').toLowerCase();
  for (const [pattern, replacement] of CIVIC_CANONICAL_MAP) {
    normalized = normalized.replace(pattern, ` ${replacement} `);
  }

  const rawTokens = normalized
    .replace(/[^a-z0-9_\s]/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t))
    .map((t) => (t.includes('_') ? t : lightStem(t)));

  const canonicalConceptBoost: string[] = [];
  for (const token of rawTokens) {
    if (
      token.includes('_') ||
      [
        'pothole',
        'waterlog',
        'garbage',
        'bin',
        'overflow',
        'streetlight',
        'drainage',
        'blocked',
        'college',
        'entrance',
      ].includes(token)
    ) {
      canonicalConceptBoost.push(`concept__${token}`);
    }
  }

  return [...rawTokens, ...canonicalConceptBoost];
}

export class TfIdfVectorizer {
  private idf = new Map<string, number>();

  fit(documents: string[]): void {
    this.idf.clear();
    const docCount = documents.length;
    if (docCount === 0) return;

    const df = new Map<string, number>();
    for (const doc of documents) {
      const uniqueTerms = new Set(tokenizeCivicText(doc));
      for (const term of uniqueTerms) {
        df.set(term, (df.get(term) ?? 0) + 1);
      }
    }

    for (const [term, count] of df.entries()) {
      // Smooth IDF formula matching scikit-learn smooth_idf=True: log((1 + N) / (1 + df)) + 1
      const idfVal = Math.log((1 + docCount) / (1 + count)) + 1;
      this.idf.set(term, idfVal);
    }
  }

  transform(document: string): Map<string, number> {
    const tokens = tokenizeCivicText(document);
    const tf = new Map<string, number>();
    for (const token of tokens) {
      tf.set(token, (tf.get(token) ?? 0) + 1);
    }

    const weighted = new Map<string, number>();
    let normSq = 0;
    for (const [term, count] of tf.entries()) {
      // Sublinear TF scaling: 1 + log(tf)
      const sublinearTf = 1 + Math.log(count);
      const idfWeight = this.idf.get(term) ?? 1.0;
      const val = sublinearTf * idfWeight;
      weighted.set(term, val);
      normSq += val * val;
    }

    const norm = Math.sqrt(normSq);
    if (norm > 0) {
      for (const [term, val] of weighted.entries()) {
        weighted.set(term, val / norm);
      }
    }
    return weighted;
  }

  static cosineSimilarity(vecA: Map<string, number>, vecB: Map<string, number>): number {
    if (vecA.size === 0 || vecB.size === 0) return 0;
    const [smaller, larger] = vecA.size <= vecB.size ? [vecA, vecB] : [vecB, vecA];
    let dot = 0;
    for (const [term, valA] of smaller.entries()) {
      const valB = larger.get(term);
      if (valB !== undefined) {
        dot += valA * valB;
      }
    }
    return Math.max(0, Math.min(1, dot));
  }
}

export interface CandidateReportForDuplicate {
  reportId: string;
  title: string;
  description: string;
  category: CivicCategory;
  secondaryCategory: CivicCategory | null;
  latitude: number | null;
  longitude: number | null;
  locationName?: string;
  status?: string;
}

export interface DuplicateDetectorOptions {
  minSimilarity?: number;
  maxDistanceMeters?: number;
  requireRelatedCategory?: boolean;
}

export function areCategoriesCompatible(
  catA: CivicCategory,
  secA: CivicCategory | null,
  catB: CivicCategory,
  secB: CivicCategory | null
): boolean {
  if (catA === catB) return true;
  if (secA && (secA === catB || secA === secB)) return true;
  if (secB && secB === catA) return true;
  const relatedToA = RELATED_CATEGORIES[catA] ?? [catA];
  return relatedToA.includes(catB);
}

export function detectDuplicates(
  source: CandidateReportForDuplicate,
  existingReports: CandidateReportForDuplicate[],
  options: DuplicateDetectorOptions = {}
): DuplicateMatch[] {
  const minSimilarity = options.minSimilarity ?? DEFAULT_DUPLICATE_CONFIG.minSimilarity;
  const maxDistanceMeters = options.maxDistanceMeters ?? DEFAULT_DUPLICATE_CONFIG.maxDistanceMeters;
  const requireRelatedCategory =
    options.requireRelatedCategory ?? DEFAULT_DUPLICATE_CONFIG.requireRelatedCategory;

  const candidates = existingReports.filter((r) => r.reportId !== source.reportId);
  if (candidates.length === 0) return [];

  const sourceDoc = `${source.title} ${source.description}`;
  const allDocs = [sourceDoc, ...candidates.map((c) => `${c.title} ${c.description}`)];

  const vectorizer = new TfIdfVectorizer();
  vectorizer.fit(allDocs);
  const sourceVec = vectorizer.transform(sourceDoc);

  const matches: DuplicateMatch[] = [];

  for (const candidate of candidates) {
    if (
      source.latitude === null ||
      source.longitude === null ||
      candidate.latitude === null ||
      candidate.longitude === null
    ) {
      continue;
    }

    const distanceMeters = haversineDistanceMeters(
      source.latitude,
      source.longitude,
      candidate.latitude,
      candidate.longitude
    );

    if (distanceMeters > maxDistanceMeters) {
      continue;
    }

    if (
      requireRelatedCategory &&
      !areCategoriesCompatible(
        source.category,
        source.secondaryCategory,
        candidate.category,
        candidate.secondaryCategory
      )
    ) {
      continue;
    }

    const candVec = vectorizer.transform(`${candidate.title} ${candidate.description}`);
    const similarityScore = TfIdfVectorizer.cosineSimilarity(sourceVec, candVec);

    if (similarityScore >= minSimilarity) {
      matches.push({
        sourceReportId: source.reportId,
        relatedReportId: candidate.reportId,
        relatedTitle: candidate.title,
        relatedCategory: candidate.category,
        relatedLocationName: candidate.locationName,
        similarityScore: Number(similarityScore.toFixed(4)),
        distanceMeters: Number(distanceMeters.toFixed(1)),
        reviewStatus: 'Suggested',
        confirmedAt: null,
        reason: `${Math.round(similarityScore * 100)}% TF-IDF similarity within ${Math.round(
          distanceMeters
        )}m (${candidate.category})`,
      });
    }
  }

  return matches.sort((a, b) => b.similarityScore - a.similarityScore || a.distanceMeters - b.distanceMeters);
}
