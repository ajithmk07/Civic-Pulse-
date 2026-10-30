# LIMITATIONS & TRANSPARENCY DISCLOSURE

This document transparently details which components of **CivicPulse AI** use statistical/machine-learning algorithms, deterministic heuristics, or optional external LLMs, along with current prototype boundaries and requirements for real-world municipal deployment.

---

## 1. AI & Algorithmic Component Breakdown

| Capability | Primary / Offline Implementation | Optional External LLM Enhancement (`GEMINI_API_KEY`) |
| :--- | :--- | :--- |
| **Automatic Classification** | Weighted domain lexicon, phrase regexes, and multi-category co-occurrence scoring (`server/ai_engine/classifier.ts`). | `gemini-3.8-flash` structured JSON classification merged with deterministic safety checks. |
| **Automatic Summarization** | Deterministic extractive sentence, location, impact, and safety-concern synthesizer (`server/ai_engine/summarizer.ts`). | `gemini-3.8-flash` non-hallucinating structured summary with automatic fallback on timeout/error. |
| **Duplicate Detection** | Genuine sublinear **TF-IDF Vectorizer** + civic stem/synonym normalization + **Cosine Similarity** + **Haversine Distance** + category compatibility (`server/ai_engine/duplicate_detector.ts`). | Purely statistical/geospatial (deterministic and reproducible; does not rely on external LLM calls). |
| **Explainable Priority Engine** | Weighted linear model (`0.35×Severity + 0.30×Urgency + 0.20×Recurrence + 0.15×Impact`), confirmed-only duplicate recurrence, and explicit life-safety override rules (`server/ai_engine/priority_engine.ts`). | Deterministic and auditable by design so priority math is 100% reproducible and explainable. |
| **Geographic Hotspot Detection** | Genuine **DBSCAN** spatial clustering over pairwise **Haversine** spherical distances in meters (`server/ai_engine/hotspot_detector.ts`). | Deterministic spatial clustering; requires zero external API calls. |
| **Municipal Action Briefs** | Grounded template engine aggregating real SQLite counts, coordinates, categories, and category-specific engineering SOPs (`server/ai_engine/action_brief.ts`). | `gemini-3.8-flash` synthesizes problem summary, impact, and recommended actions strictly from stored report rows. |

---

## 2. Potential AI Classification Errors

- **Ambiguous or Multi-Symptom Descriptions**: When a complaint mentions caused effects (e.g., *"Garbage bags clogged the gutter and caused waterlogging that damaged the road"*), lexical weights or LLM inference may rank one valid category ahead of another. Providing `secondary_category` and allowing manual officer reassignment mitigates operational misrouting.
- **Sarcasm, Local Slang, or Non-English Code-Switching**: The offline lexical classifier targets English civic terminology. Regional transliterations (e.g., Hinglish or Kannada/Tamil Romanized terms) require either a configured multilingual LLM (`gemini-3.8-flash`) or localized dictionaries.
- **No Computer Vision Verification**: Uploaded photographs are validated for file format and size and stored for human officer inspection, but image pixels are not automatically verified for authenticity or hazard severity in the offline pipeline.

---

## 3. Duplicate Detection Limitations

- **Similarity Does Not Prove Identity**: Two distinct potholes 60 metres apart on the same road can share high TF-IDF cosine similarity and pass the 150-metre geographic filter. For this reason, CivicPulse AI **never deletes reports automatically**; it creates `Suggested` links in `duplicate_links` for human officer confirmation.
- **Bag-of-Words / N-Gram Boundaries**: While `TfIdfVectorizer` canonicalizes common civic synonyms (`pothole`/`crater`, `rainwater`/`waterlogged`, `wire`/`cable`), highly unusual phrasing without shared vocabulary may score below the `0.65` default threshold unless dense semantic embeddings are added.
- **Missing Coordinates**: If legacy imported records lack valid latitude/longitude, geospatial duplicate matching safely skips them rather than guessing locations.

---

## 4. Geographic Clustering (DBSCAN) Limitations

- **Parameter Sensitivity (`eps` & `minSamples`)**: A fixed 200-metre radius works well for urban neighborhood blocks (such as College Road or Old Market), but long linear corridor failures (e.g., 2 km of unlit highway streetlights spaced 350m apart) will not merge unless `epsMeters` is increased in the AI Intelligence controls.
- **Correlation vs. Root Cause**: Overlapping categories inside one spatial cluster (such as 8 Road Damage + 6 Waterlogging reports on College Road) suggest a *possible contributing drainage or pavement issue requiring inspection*, not a confirmed engineering root cause. All generated hotspot descriptions enforce cautious analytical wording.

---

## 5. Synthetic Data & Cartography Limitations

- **Fictional Demonstration Dataset**: The 52 pre-loaded `DEMO-2026-XXXX` complaints, officer names, and SVG inspection diagrams are fictional synthetic records generated with a fixed seed (`20261030`) around municipal reference coordinates (`12.955°N–12.987°N, 77.581°E–77.608°E`). Every synthetic record is flagged with `is_demo = 1` in SQLite and labeled `Demo` in the UI.
- **Offline Vector Map Base Layer**: To guarantee zero broken external map tiles in offline or firewalled hackathon environments, the interactive map renders a schematic municipal vector road/ward cartography projected accurately over the coordinate bounding box rather than streaming third-party satellite imagery. Coordinates outside the local municipal bounding box are stored accurately in SQLite and clamped/centered via pan/zoom controls.

---

## 6. Security Posture & Production Deployment Requirements

- **Demonstration Authority Console**: Authentication and RBAC are intentionally omitted in this hackathon prototype so judges can move seamlessly between the Citizen Portal and Authority Dashboard. The Authority Dashboard explicitly displays a **Demonstration Environment** banner.
- **Requirements for Live Municipal Deployment**:
  1. **Authentication & RBAC**: Integrate municipal SSO / OIDC with role-based permissions separating Ward Junior Engineers, Department Heads, and Control Room Administrators.
  2. **Abuse & Spam Protection**: Add rate limiting, CAPTCHA / OTP verification (optional or anonymized), and EXIF/GPS plausibility checks on citizen submissions.
  3. **Managed Database & Object Storage**: Migrate local SQLite (`data/civicpulse.db`) and local disk `/uploads` to managed PostgreSQL + PostGIS and encrypted cloud object storage with automated backups.
  4. **Legacy 311 / ERP Integration**: Connect department assignments and work-order statuses via webhooks to existing municipal ERP, GIS street-asset registries, and SMS/WhatsApp citizen notification gateways.
