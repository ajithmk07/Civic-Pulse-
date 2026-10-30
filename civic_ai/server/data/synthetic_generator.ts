import fs from 'node:fs';
import path from 'node:path';
import type { CivicCategory, WorkflowStatus } from '../../src/types/civic.ts';

export interface SyntheticSeedRecord {
  reportId: string;
  title: string;
  description: string;
  category: CivicCategory;
  latitude: number;
  longitude: number;
  locationName: string;
  status: WorkflowStatus;
  department: string;
  assignedStaff: string;
  publicUpdate: string;
  internalNote: string;
  createdAt: string;
  imagePath?: string;
}

/**
 * Deterministic PRNG (Mulberry32) with fixed seed = 20261030 so synthetic data is 100% reproducible.
 */
function createSeededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function jitter(base: number, maxMeters: number, rng: () => number): number {
  // 1 degree lat/lng near 13N is ~111,000m (lat) / ~108,000m (lng)
  const deltaDeg = ((rng() * 2 - 1) * maxMeters) / 110_000;
  return Number((base + deltaDeg).toFixed(6));
}

export function ensureDemoEvidenceAssets(uploadsDir: string): Record<string, string> {
  fs.mkdirSync(uploadsDir, { recursive: true });

  const assets: Array<{ key: string; filename: string; title: string; subtitle: string; accent: string }> = [
    {
      key: 'pothole',
      filename: 'demo_college_road_pothole.svg',
      title: 'Site Evidence — College Road Main Gate',
      subtitle: 'Submerged asphalt crater (~1.4m width) in active two-wheeler lane',
      accent: '#dc2626',
    },
    {
      key: 'waterlogging',
      filename: 'demo_college_road_waterlogging.svg',
      title: 'Site Evidence — College Road Curbside',
      subtitle: 'Stagnant rainwater ponding across pedestrian crossing and bus bay',
      accent: '#0284c7',
    },
    {
      key: 'electrical',
      filename: 'demo_industrial_live_wire.svg',
      title: 'Site Evidence — Industrial Ring Bus Shelter',
      subtitle: 'Low-hanging exposed feeder conductor near commuter waiting area',
      accent: '#ea580c',
    },
    {
      key: 'garbage',
      filename: 'demo_market_garbage_overflow.svg',
      title: 'Site Evidence — Old Market Crossroad',
      subtitle: 'Uncollected municipal bin overflow obstructing storm gutter inlet',
      accent: '#d97706',
    },
  ];

  const paths: Record<string, string> = {};
  for (const item of assets) {
    const filePath = path.join(uploadsDir, item.filename);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500" viewBox="0 0 800 500">
  <rect width="800" height="500" fill="#0f172a"/>
  <rect x="24" y="24" width="752" height="452" rx="12" fill="#1e293b" stroke="#334155" stroke-width="2"/>
  <g stroke="#334155" stroke-width="1" opacity="0.55">
    <line x1="24" y1="140" x2="776" y2="140"/>
    <line x1="24" y1="260" x2="776" y2="260"/>
    <line x1="24" y1="380" x2="776" y2="380"/>
    <line x1="200" y1="24" x2="200" y2="476"/>
    <line x1="400" y1="24" x2="400" y2="476"/>
    <line x1="600" y1="24" x2="600" y2="476"/>
  </g>
  <polygon points="120,440 310,190 490,190 680,440" fill="#334155"/>
  <line x1="400" y1="205" x2="400" y2="430" stroke="#f8fafc" stroke-width="5" stroke-dasharray="22 18" opacity="0.7"/>
  <ellipse cx="425" cy="340" rx="105" ry="42" fill="${item.accent}" fill-opacity="0.32" stroke="${item.accent}" stroke-width="3"/>
  <ellipse cx="425" cy="340" rx="68" ry="24" fill="#020617" fill-opacity="0.75"/>
  <rect x="48" y="48" width="290" height="34" rx="6" fill="#0f172a" stroke="${item.accent}" stroke-width="1.5"/>
  <text x="64" y="70" fill="#f8fafc" font-family="monospace" font-size="13" font-weight="bold">SYNTHETIC DEMO FIELD INSPECTION</text>
  <text x="48" y="426" fill="#f8fafc" font-family="sans-serif" font-size="21" font-weight="bold">${item.title}</text>
  <text x="48" y="454" fill="#cbd5e1" font-family="sans-serif" font-size="15">${item.subtitle}</text>
</svg>`;
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, svg, 'utf8');
    }
    paths[item.key] = `/uploads/${item.filename}`;
  }
  return paths;
}

/**
 * Generates 52 reproducible synthetic civic complaints (>= 50 required):
 * - 15 Road Damage
 * - 10 Waterlogging
 * - 8 Garbage Management
 * - 7 Streetlight
 * - 5 Drainage
 * - 5 Electrical Hazard
 * - 1 Water Supply
 * - 1 Public Infrastructure
 * Includes deliberate duplicates (with varied wording), 3 distinct DBSCAN hotspots (led by 14-report College Road hotspot),
 * critical safety overrides, routine low-priority issues, and mixed workflow states.
 */
export function buildSyntheticDataset(evidenceUrls: Record<string, string> = {}): SyntheticSeedRecord[] {
  const rng = createSeededRng(20261030);

  // Hotspot 1: College Road & Main Gate Corridor (12.9721, 77.5948) -> 14 reports (8 Road Damage + 6 Waterlogging)
  const collegeLat = 12.9721;
  const collegeLng = 77.5948;

  // Hotspot 2: Old Market Crossroad (12.9655, 77.5890) -> 7 reports (4 Garbage + 3 Drainage)
  const marketLat = 12.9655;
  const marketLng = 77.589;

  // Hotspot 3: Industrial Ring Sub-Station (12.9785, 77.6020) -> 6 reports (3 Electrical Hazard + 3 Streetlight)
  const indLat = 12.9785;
  const indLng = 77.602;

  const rawItems: Array<{
    title: string;
    description: string;
    category: CivicCategory;
    lat: number;
    lng: number;
    locationName: string;
    status: WorkflowStatus;
    department: string;
    staff: string;
    publicUpdate: string;
    internalNote: string;
    hoursAgo: number;
    imageKey?: string;
  }> = [
    // === ROAD DAMAGE (15 total: 8 in College Road Hotspot + 7 across other wards) ===
    {
      title: 'Huge pothole near College Road entrance filled with rainwater',
      description:
        'There is a huge pothole near the college entrance on College Road. Rainwater is collecting inside the deep crater and vehicles and two-wheelers are almost falling every morning.',
      category: 'Road Damage',
      lat: 12.97212,
      lng: 77.59484,
      locationName: 'College Road & Main Gate Corridor',
      status: 'Under Review',
      department: 'Public Works Department',
      staff: 'Eng. R. Kulkarni',
      publicUpdate: 'Complaint verified during ward review; queued for field inspection.',
      internalNote: 'DEMO DATA: Canonical pothole report at College Main Gate.',
      hoursAgo: 68,
      imageKey: 'pothole',
    },
    {
      title: 'Deep waterlogged road crater outside college gate causing bikes to skid',
      description:
        'A massive damaged road pothole at the college gate on College Road has accumulated stagnant rainwater. Two-wheelers and cars are skidding and almost crashing into the pit.',
      category: 'Road Damage',
      lat: 12.97218,
      lng: 77.59491,
      locationName: 'College Road & Main Gate Corridor',
      status: 'Submitted',
      department: 'Public Works Department',
      staff: 'Unassigned',
      publicUpdate: 'Report logged via Citizen Portal.',
      internalNote: 'DEMO DATA: Deliberate duplicate #1 of DEMO-2026-0001 with rephrased wording.',
      hoursAgo: 52,
      imageKey: 'pothole',
    },
    {
      title: 'Dangerous sunken pothole with standing water at College entrance lane',
      description:
        'Large broken asphalt crater right near the university college entrance on College Road is full of rainwater, creating an accident risk as scooters swerve and fall.',
      category: 'Road Damage',
      lat: 12.97205,
      lng: 77.59479,
      locationName: 'College Road & Main Gate Corridor',
      status: 'Submitted',
      department: 'Public Works Department',
      staff: 'Unassigned',
      publicUpdate: 'Report logged via Citizen Portal.',
      internalNote: 'DEMO DATA: Deliberate duplicate #2 of DEMO-2026-0001.',
      hoursAgo: 31,
    },
    {
      title: 'Broken tarmac and twin potholes opposite College Library bus stop',
      description:
        'Two wide potholes have eroded the left carriageway opposite the College Library on College Road, slowing student buses and morning commuter traffic.',
      category: 'Road Damage',
      lat: jitter(collegeLat, 75, rng),
      lng: jitter(collegeLng, 75, rng),
      locationName: 'College Road — Library Bus Bay',
      status: 'Assigned',
      department: 'Public Works Department',
      staff: 'Eng. R. Kulkarni',
      publicUpdate: 'Assigned to Ward 14 road maintenance crew.',
      internalNote: 'DEMO DATA: Include in College Road resurfacing batch.',
      hoursAgo: 96,
    },
    {
      title: 'Severely cracked asphalt surface at College Road pedestrian crossing',
      description:
        'The road surface across the student zebra crossing on College Road has broken apart after heavy rain, causing cyclists and pedestrians to trip.',
      category: 'Road Damage',
      lat: jitter(collegeLat, 95, rng),
      lng: jitter(collegeLng, 95, rng),
      locationName: 'College Road Crossing',
      status: 'In Progress',
      department: 'Public Works Department',
      staff: 'Eng. S. Nair',
      publicUpdate: 'Barricades placed on outer lane; wet-mix patching scheduled.',
      internalNote: 'DEMO DATA: Coordinate with stormwater team before laying hot mix.',
      hoursAgo: 110,
    },
    {
      title: 'Eroded road shoulder along College Hostel junction',
      description:
        'Asphalt edge near the College Road hostel turn has caved in by nearly six inches, forcing autos and buses into oncoming traffic.',
      category: 'Road Damage',
      lat: jitter(collegeLat, 120, rng),
      lng: jitter(collegeLng, 120, rng),
      locationName: 'College Road — Hostel Junction',
      status: 'Submitted',
      department: 'Public Works Department',
      staff: 'Unassigned',
      publicUpdate: 'Submitted for municipal review.',
      internalNote: 'DEMO DATA: Part of College Road spatial cluster.',
      hoursAgo: 44,
    },
    {
      title: 'Repeated pothole formation after patchwork on College Road',
      description:
        'Temporary gravel filling washed away near College Road pharmacy corner, exposing sharp aggregate stones and deep ruts across the main lane.',
      category: 'Road Damage',
      lat: jitter(collegeLat, 110, rng),
      lng: jitter(collegeLng, 110, rng),
      locationName: 'College Road — Pharmacy Corner',
      status: 'Under Review',
      department: 'Public Works Department',
      staff: 'Eng. R. Kulkarni',
      publicUpdate: 'Under engineering review for permanent concrete apron.',
      internalNote: 'DEMO DATA: Recurring failure due to poor roadside drainage.',
      hoursAgo: 80,
    },
    {
      title: 'Damaged speed breaker and pothole cluster on College Road approach',
      description:
        'Unmarked broken speed hump and adjacent pothole on College Road approach are jolting ambulances and two-wheelers at night.',
      category: 'Road Damage',
      lat: jitter(collegeLat, 135, rng),
      lng: jitter(collegeLng, 135, rng),
      locationName: 'College Road South Approach',
      status: 'Assigned',
      department: 'Public Works Department',
      staff: 'Eng. S. Nair',
      publicUpdate: 'Reflective paint and asphalt repair work order issued.',
      internalNote: 'DEMO DATA: College Road hotspot member #8.',
      hoursAgo: 120,
    },
    {
      title: 'Deep road cave-in near Civic General Hospital ambulance gate',
      description:
        'Portion of road pavement has sunken into a dangerous sinkhole outside Civic General Hospital emergency entrance, delaying ambulance movement.',
      category: 'Road Damage',
      lat: 12.9691,
      lng: 77.5996,
      locationName: 'Civic General Hospital Approach',
      status: 'In Progress',
      department: 'Public Works Department',
      staff: 'Eng. M. Deshmukh',
      publicUpdate: 'Steel plates and warning cones deployed; excavation crew on site.',
      internalNote: 'DEMO DATA: Critical safety override road collapse case.',
      hoursAgo: 19,
    },
    {
      title: 'Potholes along Station Square taxi pickup lane',
      description:
        'Multiple medium potholes in the Station Square prepaid auto and taxi lane are causing heavy congestion during evening train arrivals.',
      category: 'Road Damage',
      lat: 12.9759,
      lng: 77.5874,
      locationName: 'Metro & Railway Station Square',
      status: 'Assigned',
      department: 'Public Works Department',
      staff: 'Eng. R. Kulkarni',
      publicUpdate: 'Scheduled for night-shift patching to avoid commuter disruption.',
      internalNote: 'DEMO DATA: Transit hub road maintenance.',
      hoursAgo: 90,
    },
    {
      title: 'Minor surface crack along Lakeview Sector 4 internal lane',
      description:
        'Small hairline asphalt crack along residential side alley in Lakeview Sector 4. Routine maintenance requested before monsoon.',
      category: 'Road Damage',
      lat: 12.9628,
      lng: 77.5988,
      locationName: 'Lakeview Residential Sector 4',
      status: 'Resolved',
      department: 'Public Works Department',
      staff: 'Eng. P. Rao',
      publicUpdate: 'Crack sealed during routine ward maintenance round.',
      internalNote: 'DEMO DATA: Low-priority routine resolved report.',
      hoursAgo: 210,
    },
    {
      title: 'Uneven road trench left unsealed on Tech Park Link Avenue',
      description:
        'Utility trench cut across Tech Park Link Avenue was backfilled loosely with mud and stones, causing severe dust and commuter bottlenecks.',
      category: 'Road Damage',
      lat: 12.9804,
      lng: 77.5937,
      locationName: 'Tech Park Link Avenue',
      status: 'In Progress',
      department: 'Public Works Department',
      staff: 'Eng. S. Nair',
      publicUpdate: 'Contractor directed to compact sub-base and restore bitumen layer.',
      internalNote: 'DEMO DATA: Check road-cutting permit #RC-882.',
      hoursAgo: 64,
    },
    {
      title: 'Sunken carriageway near West End Colony Park',
      description:
        'A two-metre stretch of asphalt has settled unevenly near West End Colony Park corner, creating a bumpy ride for neighborhood cars.',
      category: 'Road Damage',
      lat: 12.9672,
      lng: 77.5835,
      locationName: 'West End Colony Corner',
      status: 'Submitted',
      department: 'Public Works Department',
      staff: 'Unassigned',
      publicUpdate: 'Complaint received.',
      internalNote: 'DEMO DATA: Standalone residential road report.',
      hoursAgo: 40,
    },
    {
      title: 'Damaged concrete road joint at South Flyover ramp',
      description:
        'Expansion joint strip on the South Flyover service road has loosened, making loud metallic noise and damaging tyres.',
      category: 'Road Damage',
      lat: 12.9605,
      lng: 77.5922,
      locationName: 'South Flyover Service Ramp',
      status: 'Under Review',
      department: 'Public Works Department',
      staff: 'Eng. M. Deshmukh',
      publicUpdate: 'Bridge maintenance cell inspecting expansion joint.',
      internalNote: 'DEMO DATA: Bridges & Flyovers unit notified.',
      hoursAgo: 74,
    },
    {
      title: 'Routine curb stone chip in Cedar Grove Cul-de-sac',
      description:
        'Minor cosmetic chip on roadside concrete curb in quiet residential cul-de-sac at Cedar Grove.',
      category: 'Road Damage',
      lat: 12.9831,
      lng: 77.5865,
      locationName: 'Cedar Grove Cul-de-sac',
      status: 'Resolved',
      department: 'Public Works Department',
      staff: 'Eng. P. Rao',
      publicUpdate: 'Curb dressed and painted during monthly ward upkeep.',
      internalNote: 'DEMO DATA: Low priority resolved baseline.',
      hoursAgo: 260,
    },

    // === WATERLOGGING (10 total: 6 in College Road Hotspot + 4 across other wards) ===
    {
      title: 'Severe waterlogging submerging College Road main gate crossing',
      description:
        'Knee-deep rainwater waterlogging has flooded both lanes outside the College Road main gate, submerging potholes and stranding hundreds of students.',
      category: 'Waterlogging',
      lat: 12.97222,
      lng: 77.59472,
      locationName: 'College Road & Main Gate Corridor',
      status: 'In Progress',
      department: 'Stormwater & Drainage Authority',
      staff: 'Insp. K. Verma',
      publicUpdate: 'Mobile suction pump deployed at College Road low point.',
      internalNote: 'DEMO DATA: College Road hotspot waterlogging #1.',
      hoursAgo: 49,
      imageKey: 'waterlogging',
    },
    {
      title: 'Stagnant rainwater flooding College Road bus stop and footpath',
      description:
        'Heavy waterlogging with stagnant rainwater pooling along College Road main gate bus stop forces students and vehicles into flooded middle lanes.',
      category: 'Waterlogging',
      lat: 12.97228,
      lng: 77.59466,
      locationName: 'College Road & Main Gate Corridor',
      status: 'Submitted',
      department: 'Stormwater & Drainage Authority',
      staff: 'Unassigned',
      publicUpdate: 'Complaint registered.',
      internalNote: 'DEMO DATA: Deliberate duplicate of College Road waterlogging.',
      hoursAgo: 36,
      imageKey: 'waterlogging',
    },
    {
      title: 'Persistent rainwater accumulation near College Auditorium gate',
      description:
        'Water remains stagnant for three days after every shower outside the College Auditorium on College Road, breeding mosquitoes and hiding road craters.',
      category: 'Waterlogging',
      lat: jitter(collegeLat, 90, rng),
      lng: jitter(collegeLng, 90, rng),
      locationName: 'College Road — Auditorium Gate',
      status: 'Under Review',
      department: 'Stormwater & Drainage Authority',
      staff: 'Insp. K. Verma',
      publicUpdate: 'Gradient survey scheduled along College Road eastern curb.',
      internalNote: 'DEMO DATA: College Road hotspot waterlogging #3.',
      hoursAgo: 72,
    },
    {
      title: 'Flooded stretch near College Canteen turn after evening rain',
      description:
        'Rainwater runoff from adjacent slope pools across College Road canteen junction with nowhere to drain, stalling scooters and autos.',
      category: 'Waterlogging',
      lat: jitter(collegeLat, 115, rng),
      lng: jitter(collegeLng, 115, rng),
      locationName: 'College Road — Canteen Turn',
      status: 'Assigned',
      department: 'Stormwater & Drainage Authority',
      staff: 'Insp. A. Shetty',
      publicUpdate: 'Assigned to Ward 14 drainage clearance squad.',
      internalNote: 'DEMO DATA: College Road hotspot waterlogging #4.',
      hoursAgo: 85,
    },
    {
      title: 'Standing water blocking pedestrian access on College Road bookshop row',
      description:
        'Ankle-deep muddy waterlogging along the bookshop row on College Road prevents pedestrians from reaching the footpath.',
      category: 'Waterlogging',
      lat: jitter(collegeLat, 105, rng),
      lng: jitter(collegeLng, 105, rng),
      locationName: 'College Road — Bookshop Row',
      status: 'Submitted',
      department: 'Stormwater & Drainage Authority',
      staff: 'Unassigned',
      publicUpdate: 'Report captured.',
      internalNote: 'DEMO DATA: College Road hotspot waterlogging #5.',
      hoursAgo: 28,
    },
    {
      title: 'Recurring monsoon ponding at College Road north signal',
      description:
        'Every rainfall leaves a 30-metre sheet of standing water across the College Road north traffic signal, causing severe morning gridlock.',
      category: 'Waterlogging',
      lat: jitter(collegeLat, 140, rng),
      lng: jitter(collegeLng, 140, rng),
      locationName: 'College Road North Signal',
      status: 'Under Review',
      department: 'Stormwater & Drainage Authority',
      staff: 'Insp. K. Verma',
      publicUpdate: 'Cross-culvert capacity check initiated.',
      internalNote: 'DEMO DATA: College Road hotspot waterlogging #6 (completes 14-report cluster).',
      hoursAgo: 94,
    },
    {
      title: 'Underpass waterlogging at Station Square railway subway',
      description:
        'Rainwater accumulation of nearly one foot inside Station Square pedestrian and two-wheeler underpass is disrupting commuter transit.',
      category: 'Waterlogging',
      lat: 12.9755,
      lng: 77.5869,
      locationName: 'Metro & Railway Station Square',
      status: 'Resolved',
      department: 'Stormwater & Drainage Authority',
      staff: 'Insp. A. Shetty',
      publicUpdate: 'Sump pump cleared and standing water pumped out completely.',
      internalNote: 'DEMO DATA: Resolved transit waterlogging.',
      hoursAgo: 150,
    },
    {
      title: 'Localized puddle near Lakeview Sector 4jogging gate',
      description:
        'Small rainwater puddle collecting beside the park entrance slab in Lakeview Sector 4 after light showers.',
      category: 'Waterlogging',
      lat: 12.9636,
      lng: 77.5979,
      locationName: 'Lakeview Residential Sector 4',
      status: 'Submitted',
      department: 'Stormwater & Drainage Authority',
      staff: 'Unassigned',
      publicUpdate: 'Logged for routine ward inspection.',
      internalNote: 'DEMO DATA: Low/Medium priority waterlogging.',
      hoursAgo: 60,
    },
    {
      title: 'Waterlogged service lane outside Tech Park Tower B',
      description:
        'Clogged kerb inlets have caused waterlogging across the Tech Park Link Avenue service lane during peak office hours.',
      category: 'Waterlogging',
      lat: 12.9799,
      lng: 77.5931,
      locationName: 'Tech Park Link Avenue',
      status: 'Assigned',
      department: 'Stormwater & Drainage Authority',
      staff: 'Insp. K. Verma',
      publicUpdate: 'Jetting crew scheduled for kerb inlet clearance.',
      internalNote: 'DEMO DATA: Tech Park corridor waterlogging.',
      hoursAgo: 55,
    },
    {
      title: 'Rainwater pooling at Civic General Hospital outpatient drop-off',
      description:
        'Standing rainwater near the Civic General Hospital outpatient ramp makes wheelchair and elderly patient boarding difficult.',
      category: 'Waterlogging',
      lat: 12.9687,
      lng: 77.5992,
      locationName: 'Civic General Hospital Approach',
      status: 'In Progress',
      department: 'Stormwater & Drainage Authority',
      staff: 'Insp. A. Shetty',
      publicUpdate: 'Channel grate cleaning underway at hospital porch.',
      internalNote: 'DEMO DATA: Healthcare zone waterlogging.',
      hoursAgo: 25,
    },

    // === GARBAGE MANAGEMENT (8 total: 4 in Old Market Hotspot + 4 across wards) ===
    {
      title: 'Overflowing garbage bins spilling rotting waste onto Old Market Crossroad',
      description:
        'Three municipal garbage bins at Old Market Crossroad are overflowing with rotting vegetable waste, creating a foul stench, stray dog menace, and blocking half the road.',
      category: 'Garbage Management',
      lat: 12.96552,
      lng: 77.58904,
      locationName: 'Old Market Crossroad & Wholesale Yard',
      status: 'Assigned',
      department: 'Solid Waste Management',
      staff: 'Sup. D. Gowda',
      publicUpdate: 'Compactor truck #SWM-09 dispatched for clearance.',
      internalNote: 'DEMO DATA: Canonical Old Market garbage hotspot report.',
      hoursAgo: 38,
      imageKey: 'garbage',
    },
    {
      title: 'Uncollected trash dumpsters overflowing with waste at Old Market junction',
      description:
        'Heaps of uncollected garbage and overflowing dustbins at Old Market Crossroad are spilling foul-smelling refuse onto the street and attracting flies.',
      category: 'Garbage Management',
      lat: 12.96559,
      lng: 77.58911,
      locationName: 'Old Market Crossroad & Wholesale Yard',
      status: 'Submitted',
      department: 'Solid Waste Management',
      staff: 'Unassigned',
      publicUpdate: 'Submitted via Citizen Portal.',
      internalNote: 'DEMO DATA: Deliberate duplicate of Old Market garbage overflow.',
      hoursAgo: 22,
      imageKey: 'garbage',
    },
    {
      title: 'Illegal night dumping of packaging waste behind Old Market clocktower',
      description:
        'Piles of plastic crates, rotting produce, and wet waste dumped behind Old Market clocktower have not been lifted for four days.',
      category: 'Garbage Management',
      lat: jitter(marketLat, 85, rng),
      lng: jitter(marketLng, 85, rng),
      locationName: 'Old Market — Clocktower Lane',
      status: 'Under Review',
      department: 'Solid Waste Management',
      staff: 'Sup. D. Gowda',
      publicUpdate: 'Sanitation inspector reviewing secondary pickup schedule.',
      internalNote: 'DEMO DATA: Old Market hotspot member.',
      hoursAgo: 62,
    },
    {
      title: 'Broken community waste vat spilling refuse into Old Market gutter',
      description:
        'Damaged metal waste container at Old Market wholesale gate is spilling plastic and wet garbage directly into the roadside storm gutter.',
      category: 'Garbage Management',
      lat: jitter(marketLat, 105, rng),
      lng: jitter(marketLng, 105, rng),
      locationName: 'Old Market Wholesale Gate',
      status: 'In Progress',
      department: 'Solid Waste Management',
      staff: 'Sup. L. Fernandes',
      publicUpdate: 'Replacement twin-bin container requisitioned; manual lifting in progress.',
      internalNote: 'DEMO DATA: Links solid waste spill with Old Market drainage blockage.',
      hoursAgo: 47,
    },
    {
      title: 'Uncollected garden litter pile in Lakeview Sector 4 Block C',
      description:
        'Dry leaf bags and routine household litter left beside the corner collection point in Lakeview Sector 4.',
      category: 'Garbage Management',
      lat: 12.963,
      lng: 77.5985,
      locationName: 'Lakeview Residential Sector 4',
      status: 'Resolved',
      department: 'Solid Waste Management',
      staff: 'Sup. L. Fernandes',
      publicUpdate: 'Dry waste collection van cleared the corner point.',
      internalNote: 'DEMO DATA: Resolved routine garbage complaint.',
      hoursAgo: 180,
    },
    {
      title: 'Overflowing litter bins outside Station Square east exit',
      description:
        'Commuter trash bins at Station Square east exit are overflowing with food wrappers and cups by evening peak hours.',
      category: 'Garbage Management',
      lat: 12.9761,
      lng: 77.5876,
      locationName: 'Metro & Railway Station Square',
      status: 'Assigned',
      department: 'Solid Waste Management',
      staff: 'Sup. D. Gowda',
      publicUpdate: 'Evening shift sweepers assigned to east exit plaza.',
      internalNote: 'DEMO DATA: Increase bin emptying frequency to twice daily.',
      hoursAgo: 33,
    },
    {
      title: 'Construction debris and trash dumped along North Canal Road',
      description:
        'Mixed rubble sacks and household garbage bags dumped illegally on the North Canal footpath, narrowing pedestrian space.',
      category: 'Garbage Management',
      lat: 12.9845,
      lng: 77.5965,
      locationName: 'North Canal Footpath',
      status: 'Under Review',
      department: 'Solid Waste Management',
      staff: 'Unassigned',
      publicUpdate: 'Enforcement squad verifying debris removal need.',
      internalNote: 'DEMO DATA: Standalone waste report.',
      hoursAgo: 78,
    },
    {
      title: 'Missed doorstep waste pickup in Sunrise Enclave Lane 2',
      description:
        'Routine morning municipal waste auto-tipper skipped Sunrise Enclave Lane 2 for two consecutive days.',
      category: 'Garbage Management',
      lat: 12.9592,
      lng: 77.6032,
      locationName: 'Sunrise Enclave Lane 2',
      status: 'Resolved',
      department: 'Solid Waste Management',
      staff: 'Sup. L. Fernandes',
      publicUpdate: 'Backup auto-tipper completed collection; route supervisor notified.',
      internalNote: 'DEMO DATA: Resolved low-priority service complaint.',
      hoursAgo: 140,
    },

    // === STREETLIGHT (7 total: 3 in Industrial Ring Hotspot + 4 across wards) ===
    {
      title: 'Entire row of streetlights dark near Industrial Ring Bus Bay',
      description:
        'Six consecutive LED streetlights along Industrial Ring Sub-Station and Bus Bay are completely unlit at night, leaving shift workers and commuters in pitch darkness.',
      category: 'Streetlight',
      lat: jitter(indLat, 65, rng),
      lng: jitter(indLng, 65, rng),
      locationName: 'Industrial Ring Sub-Station & Bus Bay',
      status: 'Assigned',
      department: 'Electrical & Streetlight Division',
      staff: 'Tech. V. Prasad',
      publicUpdate: 'Feeder pillar timer and cable fault check assigned.',
      internalNote: 'DEMO DATA: Industrial Ring hotspot streetlight #1.',
      hoursAgo: 58,
    },
    {
      title: 'Broken lamppost fixture hanging loose at Industrial Ring crossing',
      description:
        'Metal streetlight bracket on pole #IR-44 near Industrial Ring crossing is broken and dark after a heavy windstorm.',
      category: 'Streetlight',
      lat: jitter(indLat, 95, rng),
      lng: jitter(indLng, 95, rng),
      locationName: 'Industrial Ring Crossing',
      status: 'In Progress',
      department: 'Electrical & Streetlight Division',
      staff: 'Tech. V. Prasad',
      publicUpdate: 'Bucket crane scheduled to replace damaged luminaire bracket.',
      internalNote: 'DEMO DATA: Industrial Ring hotspot streetlight #2.',
      hoursAgo: 42,
    },
    {
      title: 'Flickering high-mast lamp at Industrial Ring truck terminal',
      description:
        'High-mast floodlight at the Industrial Ring bus and truck bay flickers continuously and shuts off after 8 PM, reducing visibility at the junction.',
      category: 'Streetlight',
      lat: jitter(indLat, 120, rng),
      lng: jitter(indLng, 120, rng),
      locationName: 'Industrial Ring Bus Bay',
      status: 'Submitted',
      department: 'Electrical & Streetlight Division',
      staff: 'Unassigned',
      publicUpdate: 'Complaint logged.',
      internalNote: 'DEMO DATA: Industrial Ring hotspot streetlight #3.',
      hoursAgo: 29,
    },
    {
      title: 'Single flickering LED streetlight in Lakeview Sector 4',
      description:
        'One residential streetlight pole outside House 18 in Lakeview Sector 4 is flickering intermittently at night.',
      category: 'Streetlight',
      lat: 12.9634,
      lng: 77.598,
      locationName: 'Lakeview Residential Sector 4',
      status: 'Resolved',
      department: 'Electrical & Streetlight Division',
      staff: 'Tech. H. Siddiqui',
      publicUpdate: 'LED driver module replaced and tested.',
      internalNote: 'DEMO DATA: Resolved low-priority streetlight ticket.',
      hoursAgo: 195,
    },
    {
      title: 'Unlit pedestrian pathway behind Station Square west parking',
      description:
        'Three streetlights along the commuter walkway behind Station Square west parking lot are non-functional, making evening travel unsafe.',
      category: 'Streetlight',
      lat: 12.9754,
      lng: 77.5866,
      locationName: 'Metro & Railway Station Square',
      status: 'Under Review',
      department: 'Electrical & Streetlight Division',
      staff: 'Tech. H. Siddiqui',
      publicUpdate: 'Under inspection by Ward 11 electrical maintenance team.',
      internalNote: 'DEMO DATA: Transit walkway lighting.',
      hoursAgo: 50,
    },
    {
      title: 'Streetlights burning during daytime on Tech Park Link Avenue',
      description:
        'Photocell sensor fault is keeping ten streetlights switched on all afternoon along Tech Park Link Avenue, wasting electricity.',
      category: 'Streetlight',
      lat: 12.9806,
      lng: 77.594,
      locationName: 'Tech Park Link Avenue',
      status: 'Resolved',
      department: 'Electrical & Streetlight Division',
      staff: 'Tech. V. Prasad',
      publicUpdate: 'Faulty twilight switch replaced in control kiosk.',
      internalNote: 'DEMO DATA: Routine resolved energy-waste report.',
      hoursAgo: 165,
    },
    {
      title: 'Dark alley crossing near Heritage Library Road',
      description:
        'Two corner lamps near Heritage Library Road intersection have burnt out, reducing night visibility for cyclists.',
      category: 'Streetlight',
      lat: 12.9708,
      lng: 77.5848,
      locationName: 'Heritage Library Road',
      status: 'Submitted',
      department: 'Electrical & Streetlight Division',
      staff: 'Unassigned',
      publicUpdate: 'Logged for ward bulb replacement round.',
      internalNote: 'DEMO DATA: Standalone medium streetlight report.',
      hoursAgo: 27,
    },

    // === DRAINAGE (5 total: 3 in Old Market Hotspot + 2 across wards) ===
    {
      title: 'Choked stormwater drain overflowing sewage onto Old Market Crossroad',
      description:
        'Main roadside stormwater drain at Old Market Crossroad is completely blocked with plastic waste and silt, causing foul sewage water to overflow across shopfronts.',
      category: 'Drainage',
      lat: jitter(marketLat, 55, rng),
      lng: jitter(marketLng, 55, rng),
      locationName: 'Old Market Crossroad & Wholesale Yard',
      status: 'In Progress',
      department: 'Stormwater & Drainage Authority',
      staff: 'Insp. K. Verma',
      publicUpdate: 'Suction-cum-jetting machine desilting blocked market culvert.',
      internalNote: 'DEMO DATA: Old Market hotspot drainage #1.',
      hoursAgo: 41,
    },
    {
      title: 'Open uncovered manhole in middle of Old Market loading lane',
      description:
        'Concrete manhole cover is missing on an open deep sewer chamber in Old Market Crossroad loading lane; pedestrians and handcart workers could fall inside.',
      category: 'Drainage',
      lat: jitter(marketLat, 70, rng),
      lng: jitter(marketLng, 70, rng),
      locationName: 'Old Market Crossroad & Wholesale Yard',
      status: 'Assigned',
      department: 'Stormwater & Drainage Authority',
      staff: 'Insp. A. Shetty',
      publicUpdate: 'Emergency barricade placed; heavy-duty ductile iron cover dispatched.',
      internalNote: 'DEMO DATA: Critical safety override open manhole in Old Market hotspot.',
      hoursAgo: 14,
    },
    {
      title: 'Silted roadside gutter backing up dirty water near Old Market flower bazaar',
      description:
        'Blocked drainage channel near Old Market flower bazaar has not been desilted, causing dirty stagnant drain water to back up onto the walkway.',
      category: 'Drainage',
      lat: jitter(marketLat, 115, rng),
      lng: jitter(marketLng, 115, rng),
      locationName: 'Old Market — Flower Bazaar',
      status: 'Under Review',
      department: 'Stormwater & Drainage Authority',
      staff: 'Insp. K. Verma',
      publicUpdate: 'Inspection queued with Ward 08 sanitation team.',
      internalNote: 'DEMO DATA: Old Market hotspot drainage #3 (completes 7-report cluster).',
      hoursAgo: 67,
    },
    {
      title: 'Broken storm drain grate rattling on Civic Hospital Link Road',
      description:
        'Cracked cast-iron stormwater grate on Civic Hospital Link Road is sinking under vehicle wheels and needs replacement before collapsing.',
      category: 'Drainage',
      lat: 12.9694,
      lng: 77.6001,
      locationName: 'Civic General Hospital Approach',
      status: 'Assigned',
      department: 'Stormwater & Drainage Authority',
      staff: 'Insp. A. Shetty',
      publicUpdate: 'Fabrication order issued for replacement steel grate.',
      internalNote: 'DEMO DATA: Hospital ward drainage grate.',
      hoursAgo: 53,
    },
    {
      title: 'Slow gutter outflow in Palm Meadows Lane 5',
      description:
        'Minor leaf buildup slowing water flow in residential roadside gutter at Palm Meadows Lane 5.',
      category: 'Drainage',
      lat: 12.9578,
      lng: 77.5955,
      locationName: 'Palm Meadows Lane 5',
      status: 'Resolved',
      department: 'Stormwater & Drainage Authority',
      staff: 'Insp. K. Verma',
      publicUpdate: 'Gutter cleared manually by ward maintenance worker.',
      internalNote: 'DEMO DATA: Low priority resolved drainage report.',
      hoursAgo: 220,
    },

    // === ELECTRICAL HAZARD (5 total: 3 in Industrial Ring Hotspot + 2 across wards) ===
    {
      title: 'Exposed live electrical wires dangling at Industrial Ring Bus Bay shelter',
      description:
        'Storm wind snapped an overhead cable leaving exposed live electrical wires hanging dangerously low right beside the Industrial Ring commuter bus shelter. Sparking observed when wet.',
      category: 'Electrical Hazard',
      lat: 12.97852,
      lng: 77.60205,
      locationName: 'Industrial Ring Sub-Station & Bus Bay',
      status: 'In Progress',
      department: 'Electrical & Streetlight Division',
      staff: 'Chief Lineman B. Murthy',
      publicUpdate: 'Feeder line isolated; emergency line crew cordoning bus shelter.',
      internalNote: 'DEMO DATA: Critical Safety Override live wire report #1.',
      hoursAgo: 9,
      imageKey: 'electrical',
    },
    {
      title: 'Sparking low-hanging live power cable near Industrial Ring bus stop',
      description:
        'Live exposed electric conductor wire is dangling and sparking near commuters waiting at the Industrial Ring Sub-Station bus stop, creating immediate electrocution danger.',
      category: 'Electrical Hazard',
      lat: 12.97858,
      lng: 77.60211,
      locationName: 'Industrial Ring Sub-Station & Bus Bay',
      status: 'Submitted',
      department: 'Electrical & Streetlight Division',
      staff: 'Unassigned',
      publicUpdate: 'Urgent hazard complaint logged.',
      internalNote: 'DEMO DATA: Deliberate duplicate of Industrial Ring live wire hazard.',
      hoursAgo: 6,
      imageKey: 'electrical',
    },
    {
      title: 'Open junction box door with exposed feeder terminals at Industrial Ring gate',
      description:
        'Rusted roadside electrical feeder pillar box near Industrial Ring Sub-Station has no door lock, leaving live copper busbars exposed at child height.',
      category: 'Electrical Hazard',
      lat: jitter(indLat, 85, rng),
      lng: jitter(indLng, 85, rng),
      locationName: 'Industrial Ring Sub-Station Gate',
      status: 'Assigned',
      department: 'Electrical & Streetlight Division',
      staff: 'Chief Lineman B. Murthy',
      publicUpdate: 'Emergency enclosure replacement crew dispatched.',
      internalNote: 'DEMO DATA: Industrial Ring hotspot electrical #3 (completes 6-report cluster).',
      hoursAgo: 18,
    },
    {
      title: 'Sparking pole-mounted transformer near Greenwood High School',
      description:
        'Distribution transformer outside Greenwood High School perimeter wall is emitting loud arcs, smoke, and sparks during peak afternoon dismissal.',
      category: 'Electrical Hazard',
      lat: 12.9742,
      lng: 77.6048,
      locationName: 'Greenwood School Road',
      status: 'Assigned',
      department: 'Electrical & Streetlight Division',
      staff: 'Chief Lineman B. Murthy',
      publicUpdate: 'Substation load transferred; safety team dispatched to school zone.',
      internalNote: 'DEMO DATA: Critical safety override electrical hazard near school.',
      hoursAgo: 12,
    },
    {
      title: 'Leaning utility pole with taut cables on Canal Bund Road',
      description:
        'Concrete utility pole along Canal Bund Road has tilted after soil erosion, pulling overhead service cables dangerously low across the footpath.',
      category: 'Electrical Hazard',
      lat: 12.9822,
      lng: 77.6004,
      locationName: 'Canal Bund Road',
      status: 'Under Review',
      department: 'Electrical & Streetlight Division',
      staff: 'Tech. V. Prasad',
      publicUpdate: 'Pole foundation stability assessment scheduled.',
      internalNote: 'DEMO DATA: Standalone electrical infrastructure risk.',
      hoursAgo: 46,
    },

    // === ADDITIONAL CIVIC CATEGORIES (2 reports to cover Water Supply & Public Infrastructure = 52 total) ===
    {
      title: 'Burst drinking water pipeline flooding Orchard Street junction',
      description:
        'Clean potable water is gushing continuously from a burst underground municipal water supply main on Orchard Street, reducing tap pressure across the block.',
      category: 'Water Supply',
      lat: 12.9668,
      lng: 77.5952,
      locationName: 'Orchard Street Junction',
      status: 'In Progress',
      department: 'Municipal Water Board',
      staff: 'Eng. N. Shetty',
      publicUpdate: 'Sluice valve throttled; pipe collar repair crew excavating joint.',
      internalNote: 'DEMO DATA: Water Supply category coverage.',
      hoursAgo: 21,
    },
    {
      title: 'Collapsed pedestrian footpath slabs and broken guardrail near Central Park',
      description:
        'Precast concrete sidewalk slabs and pedestrian safety railing outside Central Park East Gate are broken, forcing senior citizens onto the main carriageway.',
      category: 'Public Infrastructure',
      lat: 12.9712,
      lng: 77.5905,
      locationName: 'Central Park East Gate',
      status: 'Under Review',
      department: 'Civic Infrastructure & Parks',
      staff: 'Eng. P. Rao',
      publicUpdate: 'Civil repair estimate prepared for footpath slab replacement.',
      internalNote: 'DEMO DATA: Public Infrastructure category coverage.',
      hoursAgo: 70,
    },
  ];

  const baseTimeMs = Date.parse('2026-10-30T06:00:00.000Z');

  return rawItems.map((item, idx) => {
    const reportId = `DEMO-2026-${String(idx + 1).padStart(4, '0')}`;
    const createdAt = new Date(baseTimeMs - item.hoursAgo * 3600_000).toISOString();
    return {
      reportId,
      title: item.title,
      description: item.description,
      category: item.category,
      latitude: item.lat,
      longitude: item.lng,
      locationName: item.locationName,
      status: item.status,
      department: item.department,
      assignedStaff: item.staff,
      publicUpdate: item.publicUpdate,
      internalNote: item.internalNote,
      createdAt,
      imagePath: item.imageKey ? evidenceUrls[item.imageKey] : undefined,
    };
  });
}

function escapeCsvCell(value: unknown): string {
  const str = value === null || value === undefined ? '' : String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function writeSampleReportsCsv(csvPath: string, records: SyntheticSeedRecord[]): void {
  fs.mkdirSync(path.dirname(csvPath), { recursive: true });
  const headers = [
    'report_id',
    'title',
    'description',
    'category',
    'latitude',
    'longitude',
    'location_name',
    'status',
    'department',
    'assigned_staff',
    'is_demo',
    'created_at',
  ];
  const lines = [headers.join(',')];
  for (const r of records) {
    lines.push(
      [
        r.reportId,
        r.title,
        r.description,
        r.category,
        r.latitude,
        r.longitude,
        r.locationName,
        r.status,
        r.department,
        r.assignedStaff,
        'true',
        r.createdAt,
      ]
        .map(escapeCsvCell)
        .join(',')
    );
  }
  fs.writeFileSync(csvPath, lines.join('\n') + '\n', 'utf8');
}
