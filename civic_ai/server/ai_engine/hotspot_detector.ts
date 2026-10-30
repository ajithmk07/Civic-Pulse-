import type {
  CivicCategory,
  GeographicHotspot,
  PriorityLevel,
} from '../../src/types/civic.ts';
import { DEFAULT_HOTSPOT_CONFIG } from '../config.ts';
import { haversineDistanceMeters, resolveNearestLandmark } from '../utils/validation.ts';

export interface SpatialReportPoint {
  reportId: string;
  latitude: number | null;
  longitude: number | null;
  category: CivicCategory;
  priorityLevel: PriorityLevel;
  priorityScore: number;
  locationName?: string;
}

const PRIORITY_RANK: Record<PriorityLevel, number> = {
  Critical: 4,
  High: 3,
  Medium: 2,
  Low: 1,
};

const UNVISITED = 0;
const NOISE = -1;

/**
 * Genuine DBSCAN spatial clustering using Haversine distance on spherical coordinates.
 * Never uses Euclidean distance on raw latitude/longitude degrees.
 */
export function detectGeographicHotspots(
  reports: SpatialReportPoint[],
  options: { epsMeters?: number; minSamples?: number } = {}
): GeographicHotspot[] {
  const epsMeters = options.epsMeters ?? DEFAULT_HOTSPOT_CONFIG.epsMeters;
  const minSamples = options.minSamples ?? DEFAULT_HOTSPOT_CONFIG.minSamples;

  const validPoints = reports.filter(
    (r): r is SpatialReportPoint & { latitude: number; longitude: number } =>
      r.latitude !== null &&
      r.longitude !== null &&
      Number.isFinite(r.latitude) &&
      Number.isFinite(r.longitude)
  );

  if (validPoints.length < minSamples) {
    return [];
  }

  const n = validPoints.length;
  const labels = new Array<number>(n).fill(UNVISITED);
  let clusterId = 0;

  // Precompute pairwise Haversine distances in meters
  const distMatrix: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = haversineDistanceMeters(
        validPoints[i].latitude,
        validPoints[i].longitude,
        validPoints[j].latitude,
        validPoints[j].longitude
      );
      distMatrix[i][j] = d;
      distMatrix[j][i] = d;
    }
  }

  function regionQuery(pointIdx: number): number[] {
    const neighbors: number[] = [];
    for (let j = 0; j < n; j++) {
      if (distMatrix[pointIdx][j] <= epsMeters) {
        neighbors.push(j);
      }
    }
    return neighbors;
  }

  for (let i = 0; i < n; i++) {
    if (labels[i] !== UNVISITED) continue;

    const neighbors = regionQuery(i);
    if (neighbors.length < minSamples) {
      labels[i] = NOISE;
      continue;
    }

    clusterId += 1;
    labels[i] = clusterId;

    const seedQueue = [...neighbors];
    const inQueue = new Set<number>(neighbors);

    for (let q = 0; q < seedQueue.length; q++) {
      const currentIdx = seedQueue[q];
      if (labels[currentIdx] === NOISE) {
        labels[currentIdx] = clusterId;
      }
      if (labels[currentIdx] !== UNVISITED) {
        continue;
      }
      labels[currentIdx] = clusterId;

      const currentNeighbors = regionQuery(currentIdx);
      if (currentNeighbors.length >= minSamples) {
        for (const nb of currentNeighbors) {
          if (!inQueue.has(nb)) {
            inQueue.add(nb);
            seedQueue.push(nb);
          }
        }
      }
    }
  }

  const clusters = new Map<number, Array<SpatialReportPoint & { latitude: number; longitude: number }>>();
  for (let i = 0; i < n; i++) {
    const cid = labels[i];
    if (cid > 0) {
      const arr = clusters.get(cid) ?? [];
      arr.push(validPoints[i]);
      clusters.set(cid, arr);
    }
  }

  const nowIso = new Date().toISOString();
  const hotspots: GeographicHotspot[] = [];

  const sortedClusters = Array.from(clusters.entries()).sort(
    (a, b) => b[1].length - a[1].length
  );

  sortedClusters.forEach(([, members], idx) => {
    const meanLat = members.reduce((acc, m) => acc + m.latitude, 0) / members.length;
    const meanLng = members.reduce((acc, m) => acc + m.longitude, 0) / members.length;

    let maxDistFromCenter = 80;
    for (const m of members) {
      const d = haversineDistanceMeters(meanLat, meanLng, m.latitude, m.longitude);
      if (d > maxDistFromCenter) {
        maxDistFromCenter = d;
      }
    }

    const categoryBreakdown: Record<string, number> = {};
    let highestPriority: PriorityLevel = 'Low';
    let highestScore = 0;

    for (const m of members) {
      categoryBreakdown[m.category] = (categoryBreakdown[m.category] ?? 0) + 1;
      if (PRIORITY_RANK[m.priorityLevel] > PRIORITY_RANK[highestPriority]) {
        highestPriority = m.priorityLevel;
      }
      if (m.priorityScore > highestScore) {
        highestScore = m.priorityScore;
      }
    }

    const sortedCats = Object.entries(categoryBreakdown).sort((a, b) => b[1] - a[1]);
    const dominantCategory = (sortedCats[0]?.[0] as CivicCategory) ?? 'Other';

    const areaName = resolveNearestLandmark(meanLat, meanLng);
    const catSummaryParts = sortedCats.map(([cat, count]) => `${count} ${cat.toLowerCase()}`);
    const catPhrase =
      catSummaryParts.length === 1
        ? catSummaryParts[0]
        : `${catSummaryParts.slice(0, -1).join(', ')} and ${catSummaryParts[catSummaryParts.length - 1]}`;

    const multiCategoryHypothesis =
      sortedCats.length >= 2
        ? `Co-located categories (${sortedCats
            .slice(0, 2)
            .map(([c]) => c)
            .join(' + ')}) may indicate a possible contributing infrastructure issue that requires joint field inspection.`
        : `Repeated ${dominantCategory.toLowerCase()} reports indicate a localized recurring issue requiring targeted municipal inspection.`;

    const description = `Hotspot detected near ${areaName}. ${members.length} reports were submitted within approximately ${Math.round(
      epsMeters
    )} metres (${catPhrase}). Highest priority: ${highestPriority}. ${multiCategoryHypothesis}`;

    hotspots.push({
      hotspotId: `HS-2026-${String(idx + 1).padStart(2, '0')}`,
      areaName,
      latitude: Number(meanLat.toFixed(6)),
      longitude: Number(meanLng.toFixed(6)),
      radiusMeters: Math.max(110, Math.min(epsMeters + 40, Math.round(maxDistFromCenter + 45))),
      reportCount: members.length,
      dominantCategory,
      categoryBreakdown,
      priorityLevel: highestPriority,
      highestScore,
      reportIds: members.map((m) => m.reportId),
      description,
      generatedAt: nowIso,
    });
  });

  return hotspots;
}
