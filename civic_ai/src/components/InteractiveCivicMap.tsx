import React, { useMemo, useState } from 'react';
import { Crosshair, Layers, LocateFixed, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import type {
  CivicReport,
  GeographicHotspot,
  PriorityLevel,
} from '../types/civic';
import type { MunicipalZoneInfo } from '../api/client';
import { PriorityIndicator, StatusIndicator } from './PriorityIndicator';

// Geographic bounding box covering the municipal network (12.955°N - 12.987°N, 77.581°E - 77.608°E)
const DEFAULT_BOUNDS = {
  minLat: 12.955,
  maxLat: 12.987,
  minLng: 77.581,
  maxLng: 77.608,
};

const SVG_WIDTH = 900;
const SVG_HEIGHT = 540;

interface InteractiveCivicMapProps {
  reports: CivicReport[];
  hotspots?: GeographicHotspot[];
  zones?: MunicipalZoneInfo[];
  showHotspots?: boolean;
  selectedReportId?: string | null;
  onSelectReport?: (reportId: string) => void;
  selectedHotspotId?: string | null;
  onSelectHotspot?: (hotspotId: string) => void;
  pickerMode?: boolean;
  pickedCoords?: { latitude: number; longitude: number } | null;
  onPickCoords?: (coords: { latitude: number; longitude: number }) => void;
  heightClass?: string;
}

const PRIORITY_COLORS: Record<PriorityLevel, { fill: string; stroke: string }> = {
  Critical: { fill: '#dc2626', stroke: '#7f1d1d' },
  High: { fill: '#ea580c', stroke: '#7c2d12' },
  Medium: { fill: '#d97706', stroke: '#78350f' },
  Low: { fill: '#16a34a', stroke: '#14532d' },
};

export function InteractiveCivicMap({
  reports,
  hotspots = [],
  zones = [],
  showHotspots = true,
  selectedReportId,
  onSelectReport,
  selectedHotspotId,
  onSelectHotspot,
  pickerMode = false,
  pickedCoords = null,
  onPickCoords,
  heightClass = 'h-[460px]',
}: InteractiveCivicMapProps) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [hoveredReport, setHoveredReport] = useState<
    (CivicReport & { latitude: number; longitude: number }) | null
  >(null);

  const validReports = useMemo(
    () =>
      reports.filter(
        (r): r is CivicReport & { latitude: number; longitude: number } =>
          r.latitude !== null &&
          r.longitude !== null &&
          Number.isFinite(r.latitude) &&
          Number.isFinite(r.longitude)
      ),
    [reports]
  );

  // Project lat/lng to SVG canvas coordinates
  const project = (lat: number, lng: number) => {
    const normX = (lng - DEFAULT_BOUNDS.minLng) / (DEFAULT_BOUNDS.maxLng - DEFAULT_BOUNDS.minLng);
    const normY = 1 - (lat - DEFAULT_BOUNDS.minLat) / (DEFAULT_BOUNDS.maxLat - DEFAULT_BOUNDS.minLat);

    const baseX = normX * SVG_WIDTH;
    const baseY = normY * SVG_HEIGHT;

    const cx = SVG_WIDTH / 2;
    const cy = SVG_HEIGHT / 2;

    return {
      x: cx + (baseX - cx) * zoom + pan.x,
      y: cy + (baseY - cy) * zoom + pan.y,
    };
  };

  // Inverse project SVG click to real geographical lat/lng
  const unproject = (svgX: number, svgY: number) => {
    const cx = SVG_WIDTH / 2;
    const cy = SVG_HEIGHT / 2;

    const baseX = (svgX - pan.x - cx) / zoom + cx;
    const baseY = (svgY - pan.y - cy) / zoom + cy;

    const normX = baseX / SVG_WIDTH;
    const normY = 1 - baseY / SVG_HEIGHT;

    const lng = DEFAULT_BOUNDS.minLng + normX * (DEFAULT_BOUNDS.maxLng - DEFAULT_BOUNDS.minLng);
    const lat = DEFAULT_BOUNDS.minLat + normY * (DEFAULT_BOUNDS.maxLat - DEFAULT_BOUNDS.minLat);

    return {
      latitude: Number(Math.max(-90, Math.min(90, lat)).toFixed(6)),
      longitude: Number(Math.max(-180, Math.min(180, lng)).toFixed(6)),
    };
  };

  // Convert meters to SVG pixels using Haversine longitudinal span (~2,930m across SVG_WIDTH)
  const metersToPixels = (meters: number) => {
    const totalSpanMeters = 2930;
    return (meters / totalSpanMeters) * SVG_WIDTH * zoom;
  };

  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!pickerMode || !onPickCoords) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const scaleX = SVG_WIDTH / rect.width;
    const scaleY = SVG_HEIGHT / rect.height;
    const svgX = (e.clientX - rect.left) * scaleX;
    const svgY = (e.clientY - rect.top) * scaleY;
    onPickCoords(unproject(svgX, svgY));
  };

  const focusOnLatLng = (lat: number, lng: number, targetZoom = 1.8) => {
    const normX = (lng - DEFAULT_BOUNDS.minLng) / (DEFAULT_BOUNDS.maxLng - DEFAULT_BOUNDS.minLng);
    const normY = 1 - (lat - DEFAULT_BOUNDS.minLat) / (DEFAULT_BOUNDS.maxLat - DEFAULT_BOUNDS.minLat);
    const baseX = normX * SVG_WIDTH;
    const baseY = normY * SVG_HEIGHT;
    const cx = SVG_WIDTH / 2;
    const cy = SVG_HEIGHT / 2;
    setZoom(targetZoom);
    setPan({
      x: (cx - baseX) * targetZoom,
      y: (cy - baseY) * targetZoom,
    });
  };

  const activeReport =
    hoveredReport ??
    validReports.find((r) => r.reportId === selectedReportId) ??
    null;

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      {/* Map Header Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 border-b border-slate-200 bg-slate-50/70">
        <div className="flex items-center gap-2 text-xs text-slate-600">
          <LocateFixed className="w-4 h-4 text-blue-700 shrink-0" aria-hidden="true" />
          <span className="font-medium text-slate-900">
            {pickerMode
              ? 'Click anywhere on the municipal map to set exact report coordinates'
              : 'Municipal Geospatial View'}
          </span>
          <span aria-hidden="true">·</span>
          <span className="font-mono tabular-nums">
            {validReports.length} mapped report{validReports.length === 1 ? '' : 's'}
          </span>
          {showHotspots && hotspots.length > 0 && (
            <>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums text-teal-800 font-medium">
                {hotspots.length} DBSCAN hotspot{hotspots.length === 1 ? '' : 's'}
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {zones.length > 0 && (
            <select
              aria-label="Jump to municipal landmark"
              className="text-xs bg-white border border-slate-300 rounded-md px-2 py-1 text-slate-700"
              defaultValue=""
              onChange={(e) => {
                const z = zones.find((item) => item.id === e.target.value);
                if (z) {
                  focusOnLatLng(z.latitude, z.longitude, 1.85);
                  if (pickerMode && onPickCoords) {
                    onPickCoords({ latitude: z.latitude, longitude: z.longitude });
                  }
                }
              }}
            >
              <option value="">Jump to Ward / Landmark...</option>
              {zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(3.2, Number((z + 0.35).toFixed(2))))}
            aria-label="Zoom in map"
            className="p-1.5 bg-white border border-slate-300 rounded-md text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.85, Number((z - 0.35).toFixed(2))))}
            aria-label="Zoom out map"
            className="p-1.5 bg-white border border-slate-300 rounded-md text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              setZoom(1);
              setPan({ x: 0, y: 0 });
            }}
            aria-label="Reset map view"
            className="p-1.5 bg-white border border-slate-300 rounded-md text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Empty Geospatial State if not in picker mode and zero valid coordinates */}
      {!pickerMode && validReports.length === 0 ? (
        <div className={`${heightClass} flex flex-col items-center justify-center p-8 text-center bg-slate-50`}>
          <Layers className="w-8 h-8 text-slate-400 mb-2" aria-hidden="true" />
          <p className="text-sm font-semibold text-slate-800">
            No valid geographical coordinates match current filters
          </p>
          <p className="text-xs text-slate-500 max-w-md mt-1">
            CivicPulse AI never fabricates missing coordinates. Adjust the priority, category, or status filters above to display mapped complaints.
          </p>
        </div>
      ) : (
        <div className={`relative w-full ${heightClass} bg-[#eef2f6] select-none overflow-hidden`}>
          <svg
            data-testid="civic-geospatial-map"
            viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
            className={`w-full h-full block ${pickerMode ? 'cursor-crosshair' : 'cursor-grab'}`}
            onClick={handleSvgClick}
            role="img"
            aria-label="Interactive municipal geospatial complaint and hotspot map"
          >
            {/* Base Municipal Grid & Waterbody Cartography */}
            <defs>
              <pattern id="wardGrid" width="60" height="60" patternUnits="userSpaceOnUse">
                <path
                  d="M 60 0 L 0 0 0 60"
                  fill="none"
                  stroke="#dde4ed"
                  strokeWidth="1"
                />
              </pattern>
            </defs>
            <rect width={SVG_WIDTH} height={SVG_HEIGHT} fill="url(#wardGrid)" />

            {/* Lakeview Reservoir & North Canal */}
            {(() => {
              const lakeCenter = project(12.9615, 77.6005);
              const canalStart = project(12.9855, 77.582);
              const canalMid = project(12.9838, 77.596);
              const canalEnd = project(12.9815, 77.607);
              return (
                <g>
                  <ellipse
                    cx={lakeCenter.x}
                    cy={lakeCenter.y}
                    rx={82 * zoom}
                    ry={48 * zoom}
                    fill="#cbe4f9"
                    stroke="#93c5fd"
                    strokeWidth="1.5"
                  />
                  <path
                    d={`M ${canalStart.x} ${canalStart.y} Q ${canalMid.x} ${canalMid.y} ${canalEnd.x} ${canalEnd.y}`}
                    fill="none"
                    stroke="#bae6fd"
                    strokeWidth={10 * zoom}
                    strokeLinecap="round"
                  />
                </g>
              );
            })()}

            {/* Arterial Municipal Road Corridors */}
            {(() => {
              const pStation = project(12.9758, 77.5872);
              const pCollege = project(12.9721, 77.5948);
              const pHospital = project(12.969, 77.5995);
              const pMarket = project(12.9655, 77.589);
              const pTech = project(12.9802, 77.5935);
              const pInd = project(12.9785, 77.602);
              const pLake = project(12.9632, 77.5982);

              return (
                <g stroke="#cbd5e1" strokeLinecap="round" fill="none">
                  {/* Outer Ring & Arterial Links */}
                  <line x1={pStation.x} y1={pStation.y} x2={pCollege.x} y2={pCollege.y} strokeWidth={8 * zoom} />
                  <line x1={pCollege.x} y1={pCollege.y} x2={pHospital.x} y2={pHospital.y} strokeWidth={8 * zoom} />
                  <line x1={pCollege.x} y1={pCollege.y} x2={pMarket.x} y2={pMarket.y} strokeWidth={7 * zoom} />
                  <line x1={pCollege.x} y1={pCollege.y} x2={pTech.x} y2={pTech.y} strokeWidth={7 * zoom} />
                  <line x1={pTech.x} y1={pTech.y} x2={pInd.x} y2={pInd.y} strokeWidth={7 * zoom} />
                  <line x1={pInd.x} y1={pInd.y} x2={pHospital.x} y2={pHospital.y} strokeWidth={6 * zoom} />
                  <line x1={pMarket.x} y1={pMarket.y} x2={pLake.x} y2={pLake.y} strokeWidth={6 * zoom} />
                  <line x1={pHospital.x} y1={pHospital.y} x2={pLake.x} y2={pLake.y} strokeWidth={6 * zoom} />
                  <line x1={pStation.x} y1={pStation.y} x2={pMarket.x} y2={pMarket.y} strokeWidth={6 * zoom} />

                  {/* Inner White Roadway Centerlines */}
                  <line x1={pStation.x} y1={pStation.y} x2={pCollege.x} y2={pCollege.y} stroke="#ffffff" strokeWidth={3.5 * zoom} />
                  <line x1={pCollege.x} y1={pCollege.y} x2={pHospital.x} y2={pHospital.y} stroke="#ffffff" strokeWidth={3.5 * zoom} />
                  <line x1={pCollege.x} y1={pCollege.y} x2={pMarket.x} y2={pMarket.y} stroke="#ffffff" strokeWidth={3 * zoom} />
                  <line x1={pCollege.x} y1={pCollege.y} x2={pTech.x} y2={pTech.y} stroke="#ffffff" strokeWidth={3 * zoom} />
                  <line x1={pTech.x} y1={pTech.y} x2={pInd.x} y2={pInd.y} stroke="#ffffff" strokeWidth={3 * zoom} />
                </g>
              );
            })()}

            {/* Municipal Zone Labels */}
            {zones.map((zone) => {
              const pos = project(zone.latitude, zone.longitude);
              return (
                <g key={zone.id} transform={`translate(${pos.x}, ${pos.y})`} pointerEvents="none">
                  <text
                    y={-18}
                    textAnchor="middle"
                    className="fill-slate-600 font-semibold"
                    fontSize={10.5}
                  >
                    {zone.name.split('&')[0].trim()}
                  </text>
                </g>
              );
            })}

            {/* DBSCAN Geographic Hotspot Overlays (true Haversine radius projection) */}
            {showHotspots &&
              hotspots.map((hs) => {
                const center = project(hs.latitude, hs.longitude);
                const rPx = Math.max(24, metersToPixels(hs.radiusMeters));
                const isSelected = selectedHotspotId === hs.hotspotId;

                return (
                  <g
                    key={hs.hotspotId}
                    onClick={(ev) => {
                      if (pickerMode) return;
                      ev.stopPropagation();
                      onSelectHotspot?.(hs.hotspotId);
                    }}
                    className={pickerMode ? '' : 'cursor-pointer'}
                  >
                    <circle
                      cx={center.x}
                      cy={center.y}
                      r={rPx}
                      fill={hs.priorityLevel === 'Critical' ? 'rgba(220, 38, 38, 0.14)' : 'rgba(13, 148, 136, 0.14)'}
                      stroke={hs.priorityLevel === 'Critical' ? '#dc2626' : '#0f766e'}
                      strokeWidth={isSelected ? 2.5 : 1.75}
                      strokeDasharray={isSelected ? undefined : '6 4'}
                    />
                    <rect
                      x={center.x - 46}
                      y={center.y - rPx - 20}
                      width={92}
                      height={18}
                      rx={4}
                      fill="#0f172a"
                    />
                    <text
                      x={center.x}
                      y={center.y - rPx - 8}
                      textAnchor="middle"
                      fill="#f8fafc"
                      fontSize={9.5}
                      fontFamily="IBM Plex Mono, monospace"
                      fontWeight="600"
                    >
                      {hs.hotspotId} · {hs.reportCount} rpts
                    </text>
                  </g>
                );
              })}

            {/* Individual Complaint Markers (distinct geometric shapes per priority for accessibility!) */}
            {validReports.map((rep) => {
              const pos = project(rep.latitude, rep.longitude);
              const style = PRIORITY_COLORS[rep.priorityLevel] ?? PRIORITY_COLORS.Low;
              const isSelected = selectedReportId === rep.reportId;
              const scale = isSelected ? 1.35 : 1;

              return (
                <g
                  key={rep.reportId}
                  transform={`translate(${pos.x}, ${pos.y}) scale(${scale})`}
                  onMouseEnter={() => setHoveredReport(rep)}
                  onMouseLeave={() => setHoveredReport((prev) => (prev?.reportId === rep.reportId ? null : prev))}
                  onClick={(ev) => {
                    if (pickerMode) return;
                    ev.stopPropagation();
                    onSelectReport?.(rep.reportId);
                  }}
                  className={pickerMode ? '' : 'cursor-pointer'}
                >
                  {isSelected && (
                    <circle r={13} fill="none" stroke="#1d4ed8" strokeWidth={2.2} />
                  )}

                  {/* Distinct marker shapes: Diamond=Critical, Triangle=High, Square=Medium, Circle=Low */}
                  {rep.priorityLevel === 'Critical' ? (
                    <polygon
                      points="0,-8 8,0 0,8 -8,0"
                      fill={style.fill}
                      stroke="#ffffff"
                      strokeWidth={1.6}
                    />
                  ) : rep.priorityLevel === 'High' ? (
                    <polygon
                      points="0,-8 7.5,6.5 -7.5,6.5"
                      fill={style.fill}
                      stroke="#ffffff"
                      strokeWidth={1.6}
                    />
                  ) : rep.priorityLevel === 'Medium' ? (
                    <rect
                      x={-5.5}
                      y={-5.5}
                      width={11}
                      height={11}
                      rx={1.5}
                      fill={style.fill}
                      stroke="#ffffff"
                      strokeWidth={1.5}
                    />
                  ) : (
                    <circle
                      r={5.5}
                      fill={style.fill}
                      stroke="#ffffff"
                      strokeWidth={1.5}
                    />
                  )}
                </g>
              );
            })}

            {/* Citizen Picker Pin */}
            {pickerMode && pickedCoords && (() => {
              const pin = project(pickedCoords.latitude, pickedCoords.longitude);
              return (
                <g transform={`translate(${pin.x}, ${pin.y})`} pointerEvents="none">
                  <circle r={16} fill="rgba(29, 78, 216, 0.18)" stroke="#1d4ed8" strokeWidth={1.5} />
                  <circle r={5.5} fill="#1d4ed8" stroke="#ffffff" strokeWidth={2} />
                </g>
              );
            })()}

            {/* Haversine Scale Bar (200m reference) */}
            {(() => {
              const barPx = metersToPixels(200);
              return (
                <g transform={`translate(18, ${SVG_HEIGHT - 22})`} pointerEvents="none">
                  <rect x={-6} y={-16} width={Math.max(88, barPx + 20)} height={24} rx={4} fill="rgba(255,255,255,0.9)" stroke="#cbd5e1" />
                  <line x1={4} y1={0} x2={4 + barPx} y2={0} stroke="#0f172a" strokeWidth={2} />
                  <line x1={4} y1={-4} x2={4} y2={4} stroke="#0f172a" strokeWidth={2} />
                  <line x1={4 + barPx} y1={-4} x2={4 + barPx} y2={4} stroke="#0f172a" strokeWidth={2} />
                  <text x={8} y={-5} fontSize={9.5} fill="#0f172a" fontFamily="IBM Plex Mono, monospace">
                    200m Haversine
                  </text>
                </g>
              );
            })()}
          </svg>

          {/* Active Marker Callout Card */}
          {!pickerMode && activeReport && (
            <div className="absolute bottom-3 right-3 max-w-xs bg-white/95 backdrop-blur-xs border border-slate-300 rounded-lg p-3 shadow-sm">
              <div className="flex items-center justify-between gap-2 text-xs font-mono tabular-nums text-slate-500">
                <span className="font-semibold text-slate-900">{activeReport.reportId}</span>
                <span>
                  {activeReport.latitude.toFixed(4)}, {activeReport.longitude.toFixed(4)}
                </span>
              </div>
              <p className="text-xs font-semibold text-slate-900 mt-1 line-clamp-2">
                {activeReport.title}
              </p>
              <div className="text-[11px] text-slate-600 mt-1">
                <span>{activeReport.category}</span>
                <span aria-hidden="true"> · </span>
                <span>{activeReport.locationName}</span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 mt-2 pt-2 border-t border-slate-100">
                <PriorityIndicator level={activeReport.priorityLevel} score={activeReport.priorityScore} />
                <StatusIndicator status={activeReport.status} />
              </div>
            </div>
          )}

          {/* Picker Coordinates Readout */}
          {pickerMode && pickedCoords && (
            <div className="absolute bottom-3 right-3 bg-slate-900 text-white rounded-lg px-3 py-2 text-xs font-mono tabular-nums flex items-center gap-2">
              <Crosshair className="w-3.5 h-3.5 text-teal-400" aria-hidden="true" />
              <span>
                Pin: {pickedCoords.latitude.toFixed(5)}, {pickedCoords.longitude.toFixed(5)}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Accessible Shape + Priority Legend */}
      <div className="px-4 py-2 border-t border-slate-200 bg-white flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
        <div className="flex flex-wrap items-center gap-4">
          <span className="font-medium text-slate-800">Marker Legend (Shape + Color):</span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 bg-red-600 rotate-45" aria-hidden="true" />
            <span>Diamond: Critical (80–100)</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="inline-block w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-b-[9px] border-b-orange-600"
              aria-hidden="true"
            />
            <span>Triangle: High (60–79)</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 bg-amber-600" aria-hidden="true" />
            <span>Square: Medium (35–59)</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-600" aria-hidden="true" />
            <span>Circle: Low (0–34)</span>
          </span>
        </div>
        {showHotspots && (
          <span className="text-teal-800 font-medium">
            Dashed Circle: DBSCAN 200m Hotspot
          </span>
        )}
      </div>
    </div>
  );
}
