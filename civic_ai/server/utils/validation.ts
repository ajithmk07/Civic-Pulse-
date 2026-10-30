import {
  CIVIC_CATEGORIES,
  PRIORITY_LEVELS,
  WORKFLOW_STATUSES,
  type CivicCategory,
  type PriorityLevel,
  type WorkflowStatus,
} from '../../src/types/civic.ts';
import { MUNICIPAL_ZONES } from '../config.ts';

const EARTH_RADIUS_METERS = 6_371_000;

export function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Calculates great-circle distance between two geographical points in meters using Haversine formula.
 */
export function haversineDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const radLat1 = toRadians(lat1);
  const radLat2 = toRadians(lat2);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(radLat1) * Math.cos(radLat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(Math.min(1, a)), Math.sqrt(Math.max(0, 1 - a)));
  return EARTH_RADIUS_METERS * c;
}

export function resolveNearestLandmark(lat: number | null, lng: number | null, providedName?: string): string {
  const cleaned = (providedName ?? '').trim();
  if (cleaned.length >= 3) {
    return cleaned.slice(0, 140);
  }
  if (lat === null || lng === null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return 'Unspecified Location';
  }
  let bestZone = MUNICIPAL_ZONES[0];
  let bestDist = Infinity;
  for (const zone of MUNICIPAL_ZONES) {
    const dist = haversineDistanceMeters(lat, lng, zone.latitude, zone.longitude);
    if (dist < bestDist) {
      bestDist = dist;
      bestZone = zone;
    }
  }
  if (bestDist <= 350) {
    return bestZone.name;
  }
  if (bestDist <= 1200) {
    return `Near ${bestZone.name} (${Math.round(bestDist)}m)`;
  }
  return `Coordinates ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}

export interface ValidatedComplaintSubmission {
  title: string;
  description: string;
  category: CivicCategory | 'Auto-Detect';
  latitude: number;
  longitude: number;
  locationName: string;
}

export interface ValidationResult<T> {
  valid: boolean;
  data?: T;
  errors: string[];
}

export function sanitizePlainText(input: unknown, maxLength = 2500): string {
  if (typeof input !== 'string') return '';
  return input
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, maxLength);
}

export function validateComplaintSubmission(payload: Record<string, unknown>): ValidationResult<ValidatedComplaintSubmission> {
  const errors: string[] = [];

  const title = sanitizePlainText(payload.title, 160);
  const description = sanitizePlainText(payload.description, 2500);
  const rawCategory = sanitizePlainText(payload.category, 60);
  const rawLocationName = sanitizePlainText(payload.locationName, 140);

  if (title.length < 5) {
    errors.push('Complaint title must be at least 5 characters long.');
  }

  if (description.length < 12) {
    errors.push('Problem description cannot be empty and must contain at least 12 characters of detail.');
  }

  let category: CivicCategory | 'Auto-Detect' = 'Auto-Detect';
  if (rawCategory && rawCategory !== 'Auto-Detect') {
    if ((CIVIC_CATEGORIES as readonly string[]).includes(rawCategory)) {
      category = rawCategory as CivicCategory;
    } else {
      errors.push(`Invalid complaint category "${rawCategory}".`);
    }
  }

  const rawLat = payload.latitude;
  const rawLng = payload.longitude;

  if (rawLat === undefined || rawLat === null || String(rawLat).trim() === '') {
    errors.push('Latitude is required. Select a pin on the map or enter coordinates manually.');
  }
  if (rawLng === undefined || rawLng === null || String(rawLng).trim() === '') {
    errors.push('Longitude is required. Select a pin on the map or enter coordinates manually.');
  }

  const latitude = Number(rawLat);
  const longitude = Number(rawLng);

  if (errors.length === 0) {
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      errors.push('Latitude must be a valid decimal coordinate between -90 and 90.');
    }
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      errors.push('Longitude must be a valid decimal coordinate between -180 and 180.');
    }
    if (latitude === 0 && longitude === 0) {
      errors.push('Coordinates (0, 0) are invalid. Please place a pin on the municipal map or enter real coordinates.');
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  const locationName = resolveNearestLandmark(latitude, longitude, rawLocationName);

  return {
    valid: true,
    errors: [],
    data: {
      title,
      description,
      category,
      latitude: Number(latitude.toFixed(6)),
      longitude: Number(longitude.toFixed(6)),
      locationName,
    },
  };
}

export function isValidWorkflowStatus(status: unknown): status is WorkflowStatus {
  return typeof status === 'string' && (WORKFLOW_STATUSES as readonly string[]).includes(status);
}

export function isValidPriorityLevel(level: unknown): level is PriorityLevel {
  return typeof level === 'string' && (PRIORITY_LEVELS as readonly string[]).includes(level);
}

export function validateTrackingId(rawId: unknown): ValidationResult<string> {
  const cleaned = sanitizePlainText(rawId, 40).toUpperCase();
  if (!cleaned) {
    return { valid: false, errors: ['Please enter a complaint tracking ID (e.g., CP-2026-1042 or DEMO-2026-0001).'] };
  }
  if (!/^(CP|DEMO)-\d{4}-[A-Z0-9]{4,8}$/.test(cleaned)) {
    return {
      valid: false,
      errors: ['Invalid tracking ID format. Expected format like CP-2026-XXXX or DEMO-2026-XXXX.'],
    };
  }
  return { valid: true, data: cleaned, errors: [] };
}
