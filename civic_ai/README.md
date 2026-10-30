# CivicPulse AI

**Turning Civic Complaints into Intelligent Public Action**

Built for **PromptWars x ASTRA — AI for Civic Impact** (*Problem Statement: From Complaints to Action*).

---

## 1. Project Introduction

**CivicPulse AI** is an end-to-end civic issue intelligence and municipal triage platform that bridges citizens and local government authorities. It transforms scattered, repetitive citizen reports into deduplicated, explainably prioritized, geospatially clustered, and publicly trackable municipal action.

## 2. Problem Statement

Communities routinely experience waterlogging, road damage and potholes, overflowing garbage bins, broken streetlights, drainage blockages, and exposed electrical hazards. Because residents report problems without seeing prior tickets:

- Identical hazards are reported repeatedly with varied phrasing.
- Life-safety emergencies are buried inside routine maintenance queues.
- Municipal officers lack spatial visibility into compound infrastructure failures (such as road craters co-located with chronic stormwater ponding).
- Citizens have no privacy-safe way to track whether their complaint has been reviewed, assigned, or resolved.

## 3. Key Features Across the Four Mandatory Stages

### Stage 1: CAPTURE — Citizen Portal
- Guided under-1-minute complaint submission form requiring zero account creation or personal data.
- Interactive municipal geospatial map pin selector, browser geolocation option, and manual latitude/longitude fallback.
- Multi-photograph evidence upload (`JPEG`, `PNG`, `WebP`, `SVG`; up to 4 files, max 5 MB each) with strict MIME and size validation.
- Unique tracking ID generation (`CP-2026-XXXX`) and immediate AI triage receipt upon submission.

### Stage 2: UNDERSTAND — AI Triage Pipeline
- **Automatic Classification**: Identifies primary and secondary categories (9 civic categories), flags active safety concerns, and suggests the responsible municipal department.
- **Automatic Summarization**: Produces concise summaries preserving what happened, where it happened, potential impact, and safety concerns without inventing unstated facts.
- **TF-IDF + Haversine Duplicate Detection**: Computes sublinear TF-IDF cosine similarity with civic morphological normalization alongside exact Haversine distance (default `>= 0.65` similarity, `<= 150m` distance, compatible category). Preserves all citizen submissions and links related tickets via `duplicate_links`.
- **Explainable Priority Engine**: Calculates transparent scores (`0–100`) via:
  $$\text{Priority Score} = (0.35 \times \text{Severity}) + (0.30 \times \text{Urgency}) + (0.20 \times \text{Recurrence}) + (0.15 \times \text{Community Impact})$$
  Only **confirmed** duplicate links increase verified Recurrence. Serious hazards (such as exposed live electrical wires or open manholes) trigger visible **Safety Overrides** (`Critical`, `>= 90/100`). Authorities can also record manual priority overrides with mandatory justification.

### Stage 3: REVEAL — Geospatial Intelligence & Hotspots
- **Haversine DBSCAN Hotspot Detection**: Spatial density clustering using great-circle Haversine distance in meters (`eps = 200m`, `minSamples = 3`) rather than raw Euclidean degree math.
- **Interactive Municipal Map**: Displays individual priority-coded complaints using accessible distinct geometric shapes (Diamond = Critical, Triangle = High, Square = Medium, Circle = Low) plus dashed 200m DBSCAN hotspot overlays, filters, and a tabular fallback list.
- **AI Municipal Action Briefs (`GENERATE ACTION BRIEF`)**: Compiles stored cluster or complaint records into structured field briefs that explicitly separate **Verified Stored Report Facts** from **AI-Generated Advisory Recommendations**.

### Stage 4: ACT — Authority Dashboard & Citizen Tracking
- **Authority Dashboard**: Real-time SQLite KPI cards (`Total`, `Pending`, `Critical`, `High Priority`, `Resolved`, `Duplicate Reports`), interactive category/priority charts, searchable/sortable queue, slide-over inspector drawer, department & staff assignment, persistent workflow status transitions (`Submitted`, `Under Review`, `Assigned`, `In Progress`, `Resolved`, `Rejected`), and audit history.
- **Citizen Tracking**: Dedicated public lookup by tracking ID showing status progress, assigned department, priority, and public updates while strictly hiding private internal authority notes.

---

## 4. Technology Stack & Documented Runtime Adaptation

> **Documented Stack Note**: Section 4 of the specification allows a documented alternative where a genuine technical incompatibility exists. Because the execution container runs **Python 3.10.12** (below the 3.11 requirement) and hosts live interactive previews exclusively through a **Node.js 22 + Vite Full-Stack Web Server on Port 3000**, CivicPulse AI is implemented on **Node.js 22 + Express + Native SQLite (`node:sqlite`) + TypeScript + React 19 + Tailwind CSS** while preserving every required database table, mathematical formula, ML/NLP algorithm (TF-IDF + Cosine Similarity + Spherical Haversine DBSCAN), server-side `@google/genai` (`gemini-3.8-flash`) integration, deterministic offline fallback, CSV export, and automated test suite.

- **Frontend**: React 19, TypeScript, Tailwind CSS v4, Lucide Icons, custom accessible SVG Geospatial Cartography & Analytics Charts.
- **Backend**: Node.js 22, Express 4, Multer (safe image uploads).
- **Database**: Persistent local **SQLite** (`data/civicpulse.db`) via built-in `node:sqlite` (`WAL` mode, foreign keys, parameterized prepared statements).
- **AI & ML**:
  - Custom `TfIdfVectorizer` + Cosine Similarity (`server/ai_engine/duplicate_detector.ts`).
  - Spherical Haversine `DBSCAN` (`server/ai_engine/hotspot_detector.ts`).
  - Explainable Priority & Safety Override Engine (`server/ai_engine/priority_engine.ts`).
  - Optional Server-Side **Google Gemini API** (`@google/genai`, model `gemini-3.8-flash`) for classification, summarization, and Municipal Action Briefs, paired with full deterministic offline fallbacks.

---

## 5. Project Architecture

```text
/
├── server.ts                         # Full-stack Express + Multer + SQLite + Vite entry point
├── metadata.json                     # Application metadata & capabilities
├── package.json                      # Scripts & dependencies
├── README.md                         # Project documentation
├── LIMITATIONS.md                    # AI, security, and operational limitations
├── data/
│   ├── civicpulse.db                 # Persistent SQLite database (auto-initialized)
│   └── sample_reports.csv            # Exported 52-record synthetic dataset
├── uploads/                          # Stored citizen & demo site photographs
├── server/
│   ├── config.ts                     # Categories, departments, municipal zones, thresholds
│   ├── database.ts                   # SQLite schema & connection management
│   ├── ai_engine/
│   │   ├── gemini_client.ts          # Server-side @google/genai client wrapper
│   │   ├── classifier.ts             # Automatic primary/secondary classification + safety flags
│   │   ├── summarizer.ts             # Non-hallucinating complaint summarization
│   │   ├── duplicate_detector.ts     # TF-IDF vectorizer + cosine similarity + Haversine filter
│   │   ├── priority_engine.ts        # Weighted priority formula + safety overrides
│   │   ├── hotspot_detector.ts       # Spherical Haversine DBSCAN clustering
│   │   └── action_brief.ts           # Grounded Municipal Action Brief generator
│   ├── data/
│   │   └── synthetic_generator.ts    # Fixed-seed (20261030) 52-complaint dataset generator
│   ├── services/
│   │   ├── report_service.ts         # Submission pipeline, KPIs, hotspot refresh, safe seeding
│   │   ├── assignment_service.ts     # Workflow updates, manual overrides, duplicate reviews
│   │   └── tracking_service.ts       # Privacy-safe public complaint tracking
│   └── utils/
│       └── validation.ts             # Input sanitization, coordinate & Haversine utilities
├── src/
│   ├── App.tsx                       # SaaS workspace shell & navigation
│   ├── api/client.ts                 # Typed REST API client
│   ├── types/civic.ts                # Shared TypeScript interfaces
│   ├── components/
│   │   ├── InteractiveCivicMap.tsx   # Geospatial map, Haversine scale, DBSCAN overlays, pin picker
│   │   ├── CivicCharts.tsx           # Interactive category, priority, and lifecycle charts
│   │   ├── ComplaintDetailDrawer.tsx # Authority detail, assignment, duplicate & override drawer
│   │   └── PriorityIndicator.tsx     # Accessible shape + text + score indicators
│   └── pages/
│       ├── AdminDashboard.tsx        # Module B: Authority Dashboard
│       ├── CitizenPortal.tsx         # Module A: Citizen Portal
│       ├── AIIntelligenceCenter.tsx  # Module C: AI Intelligence Center
│       └── CitizenTracking.tsx       # Module D: Citizen Tracking
└── tests/
    ├── test_database.test.ts         # SQLite init, persistence, activity log, safe seeding tests
    ├── test_ai_engine.test.ts        # Classifier, summarizer, TF-IDF duplicate & brief tests
    ├── test_priority_and_hotspots.test.ts # Priority math, safety override & DBSCAN tests
    └── test_workflow.test.ts         # End-to-end 5-minute hackathon workflow test
```

---

## 6. Database Schema

SQLite database (`data/civicpulse.db`) enforces foreign keys and uses parameterized SQL statements throughout:

1. **`reports`**: `report_id` (PK), `title`, `description`, `image_path`, `location_name`, `category`, `secondary_category`, `latitude`, `longitude`, `ai_summary`, `severity_score`, `urgency_score`, `recurrence_score`, `impact_score`, `priority_score`, `priority_level`, `priority_explanation`, `safety_concern`, `safety_override`, `safety_override_reason`, `manual_override_level`, `manual_override_reason`, `department`, `assigned_staff`, `status`, `is_demo`, `created_at`, `updated_at`.
2. **`duplicate_links`**: `id` (PK), `source_report_id` (FK), `related_report_id` (FK), `similarity_score`, `distance_meters`, `review_status` (`Suggested` | `Confirmed` | `Rejected`), `confirmed_at`.
3. **`activity_log`**: `id` (PK), `report_id` (FK), `previous_status`, `new_status`, `public_update`, `internal_note`, `changed_by`, `created_at`.
4. **`hotspots`**: `hotspot_id` (PK), `area_name`, `latitude`, `longitude`, `radius_meters`, `report_count`, `dominant_category`, `category_breakdown`, `priority_level`, `highest_score`, `report_ids`, `description`, `generated_at`.
5. **`departments`**: `department_id` (PK), `department_name` (UNIQUE).

---

## 7. Installation, Environment Setup & Startup

### Prerequisites
- Node.js `>= 22.6.0` (uses built-in `node:sqlite`).

### Installation
```bash
npm install
```

### Optional Environment Setup
Copy `.env.example` to `.env` if you wish to enable live Gemini 3.8 Flash generation alongside the built-in deterministic AI engine:
```bash
cp .env.example .env
# Optional: set GEMINI_API_KEY in .env
```
*Note: All core classification, summarization, TF-IDF duplicate detection, priority scoring, Haversine DBSCAN clustering, and Action Brief features work 100% offline without an external API key.*

### Application Startup Command
```bash
npm run dev
```
Open `http://localhost:3000`.

For production build and start:
```bash
npm run build
npm start
```

### Synthetic Demo Data Loading
On first launch (when the database is empty), CivicPulse AI automatically seeds **52 reproducible fictional complaints** (fixed PRNG seed `20261030`) and exports `data/sample_reports.csv`. You can also click **Load Demo Dataset** in the Authority Dashboard at any time — it uses `INSERT OR IGNORE` so existing citizen submissions are never overwritten.

### Executing Automated Tests
```bash
npm test
# or directly:
npx --yes tsx --test tests/test_database.test.ts tests/test_ai_engine.test.ts tests/test_priority_and_hotspots.test.ts tests/test_workflow.test.ts
```

---

## 8. Five-Minute Hackathon Demonstration Workflow

1. **Open CivicPulse AI** (`http://localhost:3000`): Observe live SQLite KPIs across the 52 synthetic complaints (`DEMO-2026-0001` through `DEMO-2026-0052`).
2. **Submit a New Pothole Complaint**: Click **Report Civic Issue** (Citizen Portal) -> click **Prefill College Road Pothole Demo** (or enter a description & click on the map near College Road `12.97214, 77.59486`) -> click **Submit Civic Complaint**.
3. **Inspect AI Classification & Summary**: Observe the instant receipt showing Primary Category (`Road Damage`), Secondary Category (`Waterlogging`), Suggested Department (`Public Works Department`), Safety Concern (`Yes`), and concise AI summary.
4. **Verify Duplicate Detection**: Note the automatic TF-IDF + Haversine match against `DEMO-2026-0001` within 150m.
5. **Inspect Explainable Priority**: Review the `0–100` priority score and `0.35 / 0.30 / 0.20 / 0.15` factor breakdown.
6. **Open Geospatial Hotspot Dashboard**: Navigate to **AI Intelligence** -> inspect the interactive map and **HS-2026-01 (College Road & Main Gate Corridor)** showing the concentrated cluster of Road Damage and Waterlogging reports within ~200m.
7. **Generate Municipal Action Brief**: Click **`GENERATE ACTION BRIEF`** on the College Road hotspot to produce a structured brief separating Verified Stored Report Facts from AI Advisory Recommendations.
8. **Assign & Update Status**: Click **Open in Authority Dashboard** (or click the newly created `CP-2026-XXXX` row in **Authority Dashboard**) -> confirm the duplicate link, assign **Public Works Department** and an officer, set status to **In Progress**, add both a public update and an internal note, and save.
9. **Verify Citizen Tracking**: Open **Track Complaint**, enter `CP-2026-XXXX`, and verify the updated `In Progress` milestone and public message appear while the private internal note remains hidden.

---

## 9. Known Limitations

See [LIMITATIONS.md](./LIMITATIONS.md) for a complete technical and operational disclosure.
