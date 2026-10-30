import type { CivicCategory } from '../src/types/civic.ts';

export const DEFAULT_DEPARTMENTS: string[] = [
  'Public Works Department',
  'Stormwater & Drainage Authority',
  'Solid Waste Management',
  'Electrical & Streetlight Division',
  'Municipal Water Board',
  'Civic Infrastructure & Parks',
  'Emergency Hazard Response Unit',
];

export const CATEGORY_TO_DEPARTMENT: Record<CivicCategory, string> = {
  'Road Damage': 'Public Works Department',
  Waterlogging: 'Stormwater & Drainage Authority',
  'Garbage Management': 'Solid Waste Management',
  Drainage: 'Stormwater & Drainage Authority',
  Streetlight: 'Electrical & Streetlight Division',
  'Electrical Hazard': 'Electrical & Streetlight Division',
  'Water Supply': 'Municipal Water Board',
  'Public Infrastructure': 'Civic Infrastructure & Parks',
  Other: 'Public Works Department',
};

export const RELATED_CATEGORIES: Record<CivicCategory, CivicCategory[]> = {
  'Road Damage': ['Road Damage', 'Waterlogging', 'Drainage', 'Public Infrastructure'],
  Waterlogging: ['Waterlogging', 'Drainage', 'Road Damage'],
  'Garbage Management': ['Garbage Management', 'Drainage'],
  Drainage: ['Drainage', 'Waterlogging', 'Garbage Management', 'Water Supply'],
  Streetlight: ['Streetlight', 'Electrical Hazard', 'Public Infrastructure'],
  'Electrical Hazard': ['Electrical Hazard', 'Streetlight'],
  'Water Supply': ['Water Supply', 'Drainage', 'Road Damage'],
  'Public Infrastructure': ['Public Infrastructure', 'Road Damage', 'Streetlight'],
  Other: ['Other'],
};

export interface MunicipalZone {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  ward: string;
  publicFacilityType: 'education' | 'healthcare' | 'commercial' | 'transit' | 'industrial' | 'residential';
}

export const MUNICIPAL_ZONES: MunicipalZone[] = [
  {
    id: 'college-road',
    name: 'College Road & Main Gate Corridor',
    latitude: 12.9721,
    longitude: 77.5948,
    ward: 'Ward 14 — Central Education Zone',
    publicFacilityType: 'education',
  },
  {
    id: 'old-market',
    name: 'Old Market Crossroad & Wholesale Yard',
    latitude: 12.9655,
    longitude: 77.589,
    ward: 'Ward 08 — Market Precinct',
    publicFacilityType: 'commercial',
  },
  {
    id: 'industrial-ring',
    name: 'Industrial Ring Sub-Station & Bus Bay',
    latitude: 12.9785,
    longitude: 77.602,
    ward: 'Ward 22 — North Transit & Power Sector',
    publicFacilityType: 'industrial',
  },
  {
    id: 'hospital-ward',
    name: 'Civic General Hospital Approach',
    latitude: 12.969,
    longitude: 77.5995,
    ward: 'Ward 16 — Medical District',
    publicFacilityType: 'healthcare',
  },
  {
    id: 'station-square',
    name: 'Metro & Railway Station Square',
    latitude: 12.9758,
    longitude: 77.5872,
    ward: 'Ward 11 — West Transit Hub',
    publicFacilityType: 'transit',
  },
  {
    id: 'lakeview-sector',
    name: 'Lakeview Residential Sector 4',
    latitude: 12.9632,
    longitude: 77.5982,
    ward: 'Ward 19 — South Lakefront',
    publicFacilityType: 'residential',
  },
  {
    id: 'tech-park',
    name: 'Tech Park Link Avenue',
    latitude: 12.9802,
    longitude: 77.5935,
    ward: 'Ward 24 — North Corridor',
    publicFacilityType: 'commercial',
  },
];

export const DEFAULT_DUPLICATE_CONFIG = {
  minSimilarity: 0.65,
  maxDistanceMeters: 150,
  requireRelatedCategory: true,
};

export const DEFAULT_HOTSPOT_CONFIG = {
  epsMeters: 200,
  minSamples: 3,
};

export const MAX_UPLOAD_FILES = 4;
export const MAX_UPLOAD_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
export const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/svg+xml',
]);
