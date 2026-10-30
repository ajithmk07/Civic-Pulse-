import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Crosshair,
  FileUp,
  Navigation,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { civicApi, type MunicipalZoneInfo } from '../api/client';
import { InteractiveCivicMap } from '../components/InteractiveCivicMap';
import { PriorityIndicator, StatusIndicator } from '../components/PriorityIndicator';
import {
  CIVIC_CATEGORIES,
  type CivicCategory,
  type CivicReport,
  type CivicReportDetail,
} from '../types/civic';

interface CitizenPortalProps {
  existingReports: CivicReport[];
  zones: MunicipalZoneInfo[];
  onSubmitted: (newReport: CivicReportDetail) => void;
  onTrackId: (trackingId: string) => void;
  onInspectInAdmin: (reportId: string) => void;
}

export function CitizenPortal({
  existingReports,
  zones,
  onSubmitted,
  onTrackId,
  onInspectInAdmin,
}: CitizenPortalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<CivicCategory | 'Auto-Detect'>('Auto-Detect');
  const [locationName, setLocationName] = useState('');
  const [latitude, setLatitude] = useState('12.97214');
  const [longitude, setLongitude] = useState('77.59486');
  const [photos, setPhotos] = useState<File[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [submittedResult, setSubmittedResult] = useState<{
    report: CivicReportDetail;
    classificationSource: string;
    summarySource: string;
  } | null>(null);
  const [copiedId, setCopiedId] = useState(false);

  const parsedCoords = (() => {
    const lat = Number(latitude);
    const lng = Number(longitude);
    if (
      latitude.trim() !== '' &&
      longitude.trim() !== '' &&
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      lat >= -90 &&
      lat <= 90 &&
      lng >= -180 &&
      lng <= 180
    ) {
      return { latitude: lat, longitude: lng };
    }
    return null;
  })();

  const handleLoadDemoScenario = () => {
    setErrors([]);
    setTitle('Deep rainwater-filled pothole outside College Main Gate');
    setDescription(
      'There is a huge pothole near the college entrance on College Road. Rainwater is collecting inside it and vehicles and two-wheelers are almost falling.'
    );
    setCategory('Auto-Detect');
    setLocationName('College Road & Main Gate Corridor');
    setLatitude('12.97214');
    setLongitude('77.59486');
  };

  const handleUseBrowserGps = () => {
    if (!navigator.geolocation) {
      setErrors(['Browser geolocation is not supported on this device. Please click on the map or enter coordinates manually.']);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(pos.coords.latitude.toFixed(6));
        setLongitude(pos.coords.longitude.toFixed(6));
        setErrors([]);
      },
      () => {
        setErrors(['Location permission declined or unavailable. Click anywhere on the map or enter coordinates manually.']);
      },
      { timeout: 6000 }
    );
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected: File[] = Array.from(e.target.files ?? []);
    if (selected.length === 0) return;

    const newErrors: string[] = [];
    const validFiles: File[] = [];
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];

    for (const file of selected) {
      if (!allowed.includes(file.type)) {
        newErrors.push(`"${file.name}" has an unsupported format. Use JPEG, PNG, WebP, or SVG.`);
        continue;
      }
      if (file.size > 5 * 1024 * 1024) {
        newErrors.push(`"${file.name}" exceeds the 5 MB file size limit.`);
        continue;
      }
      validFiles.push(file);
    }

    if (photos.length + validFiles.length > 4) {
      newErrors.push('Maximum 4 photographs can be attached per report.');
    }

    setErrors(newErrors);
    setPhotos((prev) => [...prev, ...validFiles].slice(0, 4));
    e.target.value = '';
  };

  const validateClientSide = (): string[] => {
    const errs: string[] = [];
    if (title.trim().length < 5) {
      errs.push('Please enter a complaint title of at least 5 characters.');
    }
    if (description.trim().length < 12) {
      errs.push('Please describe the civic problem in at least 12 characters.');
    }
    if (latitude.trim() === '' || longitude.trim() === '') {
      errs.push('Geographical coordinates are required. Click on the map or type latitude and longitude.');
    } else {
      const lat = Number(latitude);
      const lng = Number(longitude);
      if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
        errs.push('Latitude must be a valid number between -90 and 90.');
      }
      if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
        errs.push('Longitude must be a valid number between -180 and 180.');
      }
      if (lat === 0 && lng === 0) {
        errs.push('Coordinates (0, 0) are not a valid municipal location.');
      }
    }
    return errs;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clientErrors = validateClientSide();
    if (clientErrors.length > 0) {
      setErrors(clientErrors);
      return;
    }

    setSubmitting(true);
    setErrors([]);

    try {
      const fd = new FormData();
      fd.append('title', title.trim());
      fd.append('description', description.trim());
      fd.append('category', category);
      fd.append('locationName', locationName.trim());
      fd.append('latitude', latitude.trim());
      fd.append('longitude', longitude.trim());
      for (const file of photos) {
        fd.append('photos', file);
      }

      const result = await civicApi.submitComplaint(fd);
      setSubmittedResult(result);
      onSubmitted(result.report);
      setTitle('');
      setDescription('');
      setPhotos([]);
    } catch (err) {
      setErrors([(err as Error).message]);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Intro & Quick Demo Scenario Helper */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">
            Report a Civic Issue
          </h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Submit road hazards, waterlogging, sanitation issues, or electrical faults in under a minute. No account or personal details required.
          </p>
        </div>

        <button
          type="button"
          onClick={handleLoadDemoScenario}
          className="px-3.5 py-2 rounded-lg border border-slate-300 bg-slate-50 text-xs font-semibold text-slate-800 hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0"
        >
          Prefill College Road Pothole Demo
        </button>
      </div>

      {/* Submission Confirmation & AI Triage Receipt */}
      {submittedResult && (
        <section
          aria-live="polite"
          className="bg-white border border-emerald-300 rounded-xl p-6 space-y-4"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
            <div className="flex items-start gap-2.5">
              <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Complaint Registered — Tracking ID{' '}
                  <span className="font-mono text-blue-800">
                    {submittedResult.report.reportId}
                  </span>
                </h2>
                <p className="text-xs text-slate-600 mt-0.5">
                  Saved persistently in SQLite and processed by the CivicPulse AI triage pipeline.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(submittedResult.report.reportId);
                  setCopiedId(true);
                  setTimeout(() => setCopiedId(false), 2000);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{copiedId ? 'Copied ID' : 'Copy ID'}</span>
              </button>
              <button
                type="button"
                onClick={() => onTrackId(submittedResult.report.reportId)}
                className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800"
              >
                Track Status
              </button>
              <button
                type="button"
                onClick={() => onInspectInAdmin(submittedResult.report.reportId)}
                className="px-3 py-1.5 rounded-lg bg-blue-700 text-white text-xs font-semibold hover:bg-blue-800"
              >
                Open in Authority Dashboard
              </button>
            </div>
          </div>

          {/* AI Triage Results Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="p-3.5 rounded-lg bg-slate-50 space-y-1.5">
              <div className="text-slate-500 font-medium flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-blue-700" aria-hidden="true" />
                AI Classification & Routing
              </div>
              <div className="text-slate-900 font-semibold text-sm">
                {submittedResult.report.category}
                {submittedResult.report.secondaryCategory
                  ? ` · Secondary: ${submittedResult.report.secondaryCategory}`
                  : ''}
              </div>
              <div className="text-slate-600">
                Suggested Dept: <strong className="text-slate-800">{submittedResult.report.department}</strong>
              </div>
              <div className="text-slate-600">
                Safety Concern:{' '}
                <strong className={submittedResult.report.safetyConcern ? 'text-red-700' : 'text-slate-800'}>
                  {submittedResult.report.safetyConcern ? 'Yes (Flagged for urgent review)' : 'No immediate hazard'}
                </strong>
              </div>
            </div>

            <div className="p-3.5 rounded-lg bg-slate-50 space-y-1.5">
              <div className="text-slate-500 font-medium">Explainable Priority Assessment</div>
              <div>
                <PriorityIndicator
                  level={submittedResult.report.priorityLevel}
                  score={submittedResult.report.priorityScore}
                  safetyOverride={submittedResult.report.safetyOverride}
                />
              </div>
              <div className="font-mono tabular-nums text-[11px] text-slate-600">
                S:{submittedResult.report.severityScore} · U:{submittedResult.report.urgencyScore} · R:{submittedResult.report.recurrenceScore} · I:{submittedResult.report.impactScore}
              </div>
              <p className="text-slate-600">
                {submittedResult.report.priorityExplanation.explanations[0]}
              </p>
            </div>

            <div className="p-3.5 rounded-lg bg-slate-50 space-y-1.5">
              <div className="text-slate-500 font-medium">AI Summary & Duplicate Check</div>
              <p className="text-slate-800 leading-relaxed">{submittedResult.report.aiSummary}</p>
              <div className="pt-1 text-slate-700 font-medium">
                {submittedResult.report.duplicateLinks.length > 0 ? (
                  <span className="text-amber-800">
                    Matched {submittedResult.report.duplicateLinks.length} existing report(s) within 150m (top match:{' '}
                    <span className="font-mono">
                      {submittedResult.report.duplicateLinks[0].relatedReportId}
                    </span>{' '}
                    at {Math.round(submittedResult.report.duplicateLinks[0].similarityScore * 100)}% similarity).
                  </span>
                ) : (
                  <span>No existing duplicate reports detected within 150m.</span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
            <StatusIndicator status={submittedResult.report.status} />
            <span>Save your Tracking ID to monitor municipal progress anytime.</span>
          </div>
        </section>
      )}

      {/* Main Submission Form + Map Picker */}
      <form onSubmit={handleSubmit} noValidate className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <h2 className="text-sm font-bold text-slate-900">1. Issue Details</h2>

          {errors.length > 0 && (
            <div
              role="alert"
              className="p-3.5 rounded-lg border border-red-200 bg-red-50 text-xs text-red-800 space-y-1"
            >
              <div className="font-semibold flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>Please correct the following before submitting:</span>
              </div>
              <ul className="list-disc list-inside space-y-0.5">
                {errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <label htmlFor="citizen-title" className="block text-xs font-semibold text-slate-800 mb-1">
              Complaint Title *
            </label>
            <input
              id="citizen-title"
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Deep pothole filled with rainwater near College Gate"
              className="w-full text-sm border border-slate-300 rounded-lg px-3.5 py-2.5 bg-white text-slate-900 placeholder:text-slate-400"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="citizen-category" className="block text-xs font-semibold text-slate-800 mb-1">
                Category
              </label>
              <select
                id="citizen-category"
                value={category}
                onChange={(e) => setCategory(e.target.value as CivicCategory | 'Auto-Detect')}
                className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2.5 bg-white text-slate-900"
              >
                <option value="Auto-Detect">Auto-Detect from Description (AI)</option>
                {CIVIC_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="citizen-landmark" className="block text-xs font-semibold text-slate-800 mb-1">
                Street / Landmark (Optional)
              </label>
              <input
                id="citizen-landmark"
                type="text"
                value={locationName}
                onChange={(e) => setLocationName(e.target.value)}
                placeholder="e.g. College Road Main Gate"
                className="w-full text-sm border border-slate-300 rounded-lg px-3.5 py-2.5 bg-white text-slate-900 placeholder:text-slate-400"
              />
            </div>
          </div>

          <div>
            <label htmlFor="citizen-description" className="block text-xs font-semibold text-slate-800 mb-1">
              Problem Description *
            </label>
            <textarea
              id="citizen-description"
              rows={4}
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what happened, exact landmark cues, traffic or resident impact, and any safety hazard..."
              className="w-full text-sm border border-slate-300 rounded-lg px-3.5 py-2.5 bg-white text-slate-900 placeholder:text-slate-400"
            />
          </div>

          {/* Photo Upload */}
          <div>
            <label htmlFor="citizen-photos" className="block text-xs font-semibold text-slate-800 mb-1">
              Site Photographs (Optional — up to 4 images, max 5 MB each)
            </label>
            <div className="border border-dashed border-slate-300 rounded-lg p-3.5 bg-slate-50/60">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-slate-600 flex items-center gap-1.5">
                  <FileUp className="w-4 h-4 text-slate-500" aria-hidden="true" />
                  JPEG, PNG, WebP, or SVG accepted
                </span>
                <label
                  htmlFor="citizen-photos"
                  className="px-3 py-1.5 rounded-md bg-white border border-slate-300 text-xs font-medium text-slate-800 hover:bg-slate-100 cursor-pointer"
                >
                  Select Photos
                </label>
                <input
                  id="citizen-photos"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/svg+xml"
                  multiple
                  onChange={handlePhotoChange}
                  className="sr-only"
                />
              </div>

              {photos.length > 0 && (
                <ul className="mt-3 space-y-1.5 border-t border-slate-200 pt-2.5">
                  {photos.map((file, idx) => (
                    <li
                      key={`${file.name}-${idx}`}
                      className="flex items-center justify-between text-xs text-slate-700"
                    >
                      <span className="truncate max-w-xs">
                        {file.name} ({Math.round(file.size / 1024)} KB)
                      </span>
                      <button
                        type="button"
                        onClick={() => setPhotos((prev) => prev.filter((_, i) => i !== idx))}
                        aria-label={`Remove photo ${file.name}`}
                        className="p-1 text-slate-500 hover:text-red-700"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 px-4 rounded-lg bg-blue-700 text-white text-sm font-semibold hover:bg-blue-800 transition-colors disabled:opacity-60"
            >
              {submitting ? 'Analyzing & Submitting Complaint...' : 'Submit Civic Complaint'}
            </button>
          </div>
        </div>

        {/* Right Column: Interactive Map Coordinate Picker + Manual Lat/Lng Fallback */}
        <div className="lg:col-span-6 space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold text-slate-900">2. Pin Geographical Location *</h2>
                <p className="text-xs text-slate-500">
                  Click the interactive map to drop a pin or enter exact latitude/longitude below
                </p>
              </div>
              <button
                type="button"
                onClick={handleUseBrowserGps}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <Navigation className="w-3.5 h-3.5 text-blue-700" aria-hidden="true" />
                <span>Use My GPS</span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="citizen-lat" className="block text-xs font-medium text-slate-700 mb-1">
                  Latitude (-90 to 90) *
                </label>
                <input
                  id="citizen-lat"
                  type="number"
                  step="0.000001"
                  required
                  value={latitude}
                  onChange={(e) => setLatitude(e.target.value)}
                  className="w-full font-mono tabular-nums text-xs border border-slate-300 rounded-lg px-3 py-2 bg-white text-slate-900"
                />
              </div>
              <div>
                <label htmlFor="citizen-lng" className="block text-xs font-medium text-slate-700 mb-1">
                  Longitude (-180 to 180) *
                </label>
                <input
                  id="citizen-lng"
                  type="number"
                  step="0.000001"
                  required
                  value={longitude}
                  onChange={(e) => setLongitude(e.target.value)}
                  className="w-full font-mono tabular-nums text-xs border border-slate-300 rounded-lg px-3 py-2 bg-white text-slate-900"
                />
              </div>
            </div>

            <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
              <Crosshair className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
              <span>
                Existing complaint markers are shown on the map to help citizens see nearby reported issues.
              </span>
            </div>
          </div>

          <InteractiveCivicMap
            reports={existingReports}
            zones={zones}
            showHotspots={false}
            pickerMode={true}
            pickedCoords={parsedCoords}
            onPickCoords={(coords) => {
              setLatitude(coords.latitude.toFixed(6));
              setLongitude(coords.longitude.toFixed(6));
            }}
            heightClass="h-[360px]"
          />
        </div>
      </form>
    </div>
  );
}
