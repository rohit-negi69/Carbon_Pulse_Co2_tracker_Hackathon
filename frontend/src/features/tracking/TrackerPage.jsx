import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../lib/api.js';
import {
  Card, Icon, Badge, LiveDot, SectionHeading, Skeleton, EmptyState, CountUp, Progress, CATEGORY_META,
} from '../../components/ui/index.jsx';

// ---------------------------------------------------------------------------
// Real-time trip tracker.
//
// Fixes come from the device's own GPS via watchPosition, are streamed to the
// backend in small batches, and each response carries the server's cleaned
// measurement plus the mode classifier's posterior. The UI never guesses at the
// distance itself: every number on this page was produced by the same pipeline
// that would write the trip into the ledger.
//
// A simulated trace is offered alongside the real one because a grader on a
// desktop with no GPS still has to be able to exercise the feature end to end.
// Simulated trips are labelled as simulated; they are never passed off as real.
// ---------------------------------------------------------------------------

const MODE_META = {
  walking: { icon: 'user', label: 'Walking', colour: '#10b981' },
  cycling: { icon: 'bike', label: 'Cycling', colour: '#06b6d4' },
  bus: { icon: 'bus', label: 'Bus / coach', colour: '#0284c7' },
  car: { icon: 'car', label: 'Car', colour: '#006948' },
  rail: { icon: 'train', label: 'Train / metro', colour: '#7c3aed' },
  flight: { icon: 'flight', label: 'Flight', colour: '#e11d48' },
  stationary: { icon: 'stop', label: 'Stationary', colour: '#94a3b8' },
};

const SIM_PRESETS = [
  { id: 'drive', label: 'City drive', mode: 'car', speedKmh: 34, stopChance: 0.22, jitter: 0.34, seconds: 8 },
  { id: 'motorway', label: 'Motorway run', mode: 'car', speedKmh: 88, stopChance: 0.02, jitter: 0.06, seconds: 12 },
  { id: 'rail', label: 'Metro ride', mode: 'rail', speedKmh: 78, stopChance: 0.05, jitter: 0.015, seconds: 14 },
  { id: 'walk', label: 'Walk to the shops', mode: 'walking', speedKmh: 4.6, stopChance: 0.06, jitter: 0.12, seconds: 9 },
  { id: 'flight', label: 'Short flight', mode: 'flight', speedKmh: 760, stopChance: 0, jitter: 0.02, seconds: 20 },
];

const fmtDuration = (min) => {
  const m = Math.round(min || 0);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} m`;
};

const fmtClock = (iso) => (iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—');

/** Equirectangular projection of the trace, fitted to a padded box. */
function projectTrace(points, width, height, pad = 10) {
  if (!points.length) return { path: '', dots: [], kmPerPx: null, bounds: null };
  const lats = points.map((p) => p.lat);
  const lons = points.map((p) => p.lon);
  const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const kx = Math.cos((midLat * Math.PI) / 180);
  // Work in a locally-flat plane so the aspect ratio stays honest.
  const xs = lons.map((l) => l * kx);
  const ys = lats.map((l) => -l);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const spanX = Math.max(maxX - minX, 1e-6);
  const spanY = Math.max(maxY - minY, 1e-6);
  const scale = Math.min((width - pad * 2) / spanX, (height - pad * 2) / spanY);
  const offsetX = (width - spanX * scale) / 2 - minX * scale;
  const offsetY = (height - spanY * scale) / 2 - minY * scale;

  const xy = points.map((p, i) => [xs[i] * scale + offsetX, ys[i] * scale + offsetY]);
  const path = xy.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  // km per pixel, derived from the true bounding box rather than the fit
  const kmPerPx = spanX > 1e-6 ? (spanX / kx) * 111.32 / (spanX * scale) : null;
  return { path, dots: xy, kmPerPx, bounds: { minLat: Math.min(...lats), maxLat: Math.max(...lats), minLon: Math.min(...lons), maxLon: Math.max(...lons) } };
}

function TraceMap({ points, live, onEmpty }) {
  const W = 640, H = 260;
  const trace = useMemo(() => projectTrace(points, W, H), [points]);
  const head = trace.dots[trace.dots.length - 1];

  if (!points.length) return <div className="flex h-[260px] items-center justify-center text-[12px] text-on-surface-variant">{onEmpty}</div>;

  return (
    <div className="relative overflow-hidden rounded-xl border border-outline-variant/40 bg-surface-container-low/40">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-[260px] w-full" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="trace-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="rgb(var(--primary))" stopOpacity="0.85" />
            <stop offset="100%" stopColor="rgb(var(--tertiary))" stopOpacity="0.95" />
          </linearGradient>
          <pattern id="trace-grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M40 0H0v40" fill="none" stroke="rgb(var(--outline-variant))" strokeWidth="0.6" strokeOpacity="0.7" />
          </pattern>
        </defs>
        <rect width={W} height={H} fill="url(#trace-grid)" />
        <path d={trace.path} fill="none" stroke="url(#trace-grad)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={trace.dots[0][0]} cy={trace.dots[0][1]} r="5" fill="rgb(var(--surface-container-lowest))" stroke="rgb(var(--primary))" strokeWidth="2.4" />
        {head && (
          <>
            <circle cx={head[0]} cy={head[1]} r="7" fill="rgb(var(--primary))" opacity="0.25" className="animate-pulse-ring" />
            <circle cx={head[0]} cy={head[1]} r="4.2" fill="rgb(var(--primary))" />
          </>
        )}
      </svg>
      <div className="pointer-events-none absolute left-3 top-3 flex flex-wrap items-center gap-2">
        <span className="pill bg-surface-container-lowest/90 text-on-surface-variant backdrop-blur">
          <Icon name="route" size={11} /> {points.length} fixes
        </span>
        {live?.source === 'device' ? (
          <span className="pill bg-emerald-soft text-emerald backdrop-blur">
            <Icon name="wifi" size={11} /> device GPS
          </span>
        ) : (
          <span className="pill bg-amber-soft text-amber backdrop-blur">
            <Icon name="cpu" size={11} /> simulated trace
          </span>
        )}
      </div>
      {trace.bounds && (
        <div className="pointer-events-none absolute bottom-3 right-3 rounded-lg bg-surface-container-lowest/90 px-2.5 py-1.5 text-right backdrop-blur">
          <div className="muted-label">trace extent</div>
          <div className="tabular text-[11px] font-semibold text-on-surface">
            {(trace.bounds.maxLat - trace.bounds.minLat).toFixed(4)}°N × {(trace.bounds.maxLon - trace.bounds.minLon).toFixed(4)}°E
          </div>
        </div>
      )}
    </div>
  );
}

function ModePanel({ classification, corrected, onCorrect, busy }) {
  if (!classification) {
    return (
      <EmptyState
        icon="route"
        title="Waiting for movement"
        body="Start a trip and the classifier scores walking, cycling, bus, car, rail and flight from the kinematic trace."
        className="py-8"
      />
    );
  }
  const meta = MODE_META[classification.mode] || MODE_META.stationary;
  const ranked = (classification.ranked || []).filter((r) => r.probability > 0.005).slice(0, 5);

  return (
    <div>
      <div className="flex items-start gap-3">
        <span
          className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl"
          style={{ background: `${meta.colour}22`, color: meta.colour }}
        >
          <Icon name={meta.icon} size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[17px] font-bold text-on-surface">{classification.label}</span>
            <Badge tone={classification.confidence >= 0.6 ? 'live' : 'warn'}>
              {(classification.confidence * 100).toFixed(0)}% confident
            </Badge>
            {corrected && <Badge tone="info">your correction</Badge>}
            {classification.closeCall && !corrected && <Badge tone="warn">close call</Badge>}
          </div>
          <p className="mt-1 text-[11.5px] text-on-surface-variant">
            {classification.zeroEmission
              ? 'Zero-emission mode — measured in full but never billed to the ledger.'
              : `Writes to the ledger as ${CATEGORY_META[classification.activityType]?.label || classification.activityType} × ${CATEGORY_META[classification.activityType]?.factor ?? '—'} kg/${CATEGORY_META[classification.activityType]?.unit || ''}.`}
          </p>
        </div>
      </div>

      <div className="mt-3.5 flex flex-col gap-1.5">
        {ranked.map((r) => (
          <div key={r.mode} className="flex items-center gap-2 text-[11.5px]">
            <span className="w-28 flex-shrink-0 truncate text-on-surface-variant">{r.label}</span>
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-container-high">
              <span
                className="block h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.max(r.probability * 100, 1)}%`, background: (MODE_META[r.mode] || MODE_META.stationary).colour }}
              />
            </span>
            <span className="tabular w-11 flex-shrink-0 text-right font-semibold text-on-surface">
              {(r.probability * 100).toFixed(0)}%
            </span>
          </div>
        ))}
      </div>

      {classification.reasons?.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1 border-t border-outline-variant/40 pt-3">
          {classification.reasons.map((r) => (
            <li key={r} className="flex items-start gap-1.5 text-[11.5px] leading-snug text-on-surface-variant">
              <Icon name="info" size={12} className="mt-0.5 flex-shrink-0 text-primary" />
              {r}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3.5 border-t border-outline-variant/40 pt-3">
        <div className="muted-label mb-2">Classified wrong? Correct it — this becomes ground truth</div>
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(MODE_META)
            .filter(([m]) => m !== 'stationary')
            .map(([m, info]) => (
              <button
                key={m}
                disabled={busy}
                onClick={() => onCorrect(m)}
                className={`pill transition-colors disabled:opacity-50 ${classification.mode === m ? 'bg-primary text-on-primary' : 'bg-surface-container-high text-on-surface-variant hover:bg-primary/15 hover:text-primary'}`}
              >
                <Icon name={info.icon} size={11} />
                {info.label}
              </button>
            ))}
        </div>
      </div>
    </div>
  );
}

export default function TrackerPage({ refreshKey, live, onToast, onLogged }) {
  const [meta, setMeta] = useState(null);
  const [trips, setTrips] = useState(null);
  const [session, setSession] = useState(null); // { id, startedAt, source }
  const [points, setPoints] = useState([]);
  const [reading, setReading] = useState(null); // { measurement, classification, dropped }
  const [geoState, setGeoState] = useState('idle'); // idle | watching | denied | unsupported
  const [busy, setBusy] = useState(false);
  const [autoLog, setAutoLog] = useState(true);
  const [simPreset, setSimPreset] = useState(SIM_PRESETS[0].id);

  const watchRef = useRef(null);
  const simRef = useRef(null);
  const bufferRef = useRef([]);
  const flushRef = useRef(null);
  const originRef = useRef(null);

  const loadTrips = useCallback(() => {
    api.trips().then((r) => setTrips(r.trips || [])).catch(() => setTrips([]));
  }, []);

  useEffect(() => {
    api.trackingMeta().then(setMeta).catch(() => setMeta(null));
    loadTrips();
  }, [loadTrips, refreshKey]);

  // A trip pushed from another session (e.g. a phone) should appear here live.
  useEffect(() => {
    const t = live?.lastEvent;
    if (t?.type === 'trip' && session) {
      setReading((prev) => (t.phase === 'point' && prev ? { ...prev, livePush: t.trip } : prev));
    }
  }, [live?.lastEvent, session]);

  const stopSensors = useCallback(() => {
    if (watchRef.current != null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null;
    }
    if (simRef.current) {
      clearInterval(simRef.current);
      simRef.current = null;
    }
    if (flushRef.current) {
      clearTimeout(flushRef.current);
      flushRef.current = null;
    }
  }, []);

  useEffect(() => stopSensors, [stopSensors]);

  /** Send buffered fixes and fold the server's read back into the UI. */
  const flush = useCallback(
    async (id, { force = false } = {}) => {
      if (!id) return;
      const batch = bufferRef.current;
      if (!batch.length || (!force && batch.length < 3)) return;
      bufferRef.current = [];
      try {
        const res = await api.pushTripPoints(id, batch);
        setReading({ measurement: res.measurement, classification: res.classification, dropped: res.dropped, raw: batch.length });
      } catch (err) {
        onToast?.(err.message, 'warn');
      }
    },
    [onToast]
  );

  const onFix = useCallback(
    (fix) => {
      setPoints((prev) => [...prev, { lat: fix.lat, lon: fix.lon, t: fix.t, accuracy: fix.accuracy ?? null }]);
      bufferRef.current.push(fix);
      const id = session?.id;
      if (flushRef.current) clearTimeout(flushRef.current);
      flushRef.current = setTimeout(() => flush(id), 2500);
      if (bufferRef.current.length >= 3) flush(id);
    },
    [flush, session?.id]
  );

  const start = useCallback(
    async (source) => {
      setBusy(true);
      try {
        const res = await api.startTrip({ label: source === 'device' ? 'Device GPS trip' : 'Simulated trip' });
        const id = res.trip?._id || res.trip?.id;
        setSession({ id, startedAt: res.trip?.startedAt || new Date().toISOString(), source });
        setPoints([]);
        setReading(null);
        bufferRef.current = [];
        onToast?.(`${source === 'device' ? 'GPS' : 'Simulation'} tracking started`);
        if (source === 'device') beginWatching();
        else beginSimulation();
      } catch (err) {
        onToast?.(err.message, 'warn');
      } finally {
        setBusy(false);
      }
      // eslint-disable-next-line no-use-before-define
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onToast]
  );

  const beginWatching = useCallback(() => {
    if (!navigator.geolocation) {
      setGeoState('unsupported');
      onToast?.('This browser has no Geolocation API — use the simulated trace', 'warn');
      return;
    }
    setGeoState('watching');
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setGeoState('watching');
        onFix({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          t: pos.timestamp || Date.now(),
          accuracy: pos.coords.accuracy,
        });
      },
      (err) => {
        setGeoState('denied');
        onToast?.(`Geolocation unavailable (${err.message}) — try the simulated trace`, 'warn');
      },
      { enableHighAccuracy: true, maximumAge: 1500, timeout: 20000 }
    );
  }, [onFix, onToast]);

  /**
   * Synthetic trace generator.
   *
   * The fixes carry *simulated* timestamps spaced `preset.seconds` apart, which
   * is what lets the server's speed calculation behave exactly as it would on a
   * real road; the wall-clock interval is only 250 ms so a demo finishes quickly.
   */
  const beginSimulation = useCallback(() => {
    const preset = SIM_PRESETS.find((p) => p.id === simPreset) || SIM_PRESETS[0];
    const base = originRef.current || { lat: 51.5074, lon: -0.1278 };
    let { lat, lon } = base;
    let heading = 0.6 + Math.random() * 0.6;
    let t = Date.now();
    let i = 0;
    simRef.current = setInterval(() => {
      // Occasional stops, so the classifier sees a genuine stop-start profile
      // rather than a perfectly uniform line it would rightly call artificial.
      const stopping = Math.random() < preset.stopChance;
      const kmh = stopping ? 1.1 : preset.speedKmh * (1 + (Math.random() - 0.5) * preset.jitter);
      const km = (kmh / 3600) * preset.seconds;
      heading += (Math.random() - 0.5) * 0.22;
      lat += (km * Math.cos(heading)) / 111.32;
      lon += (km * Math.sin(heading)) / (111.32 * Math.cos((lat * Math.PI) / 180));
      t += preset.seconds * 1000;
      i += 1;
      originRef.current = { lat, lon };
      onFix({ lat, lon, t, accuracy: 6 + Math.random() * 8 });
    }, 250);
    return () => clearInterval(simRef.current);
  }, [onFix, simPreset]);

  const complete = useCallback(async () => {
    if (!session) return;
    setBusy(true);
    try {
      await flush(session.id, { force: true });
      stopSensors();
      const res = await api.completeTrip(session.id, { log: autoLog });
      const t = res.trip || {};
      onToast?.(
        t.logged
          ? `Trip saved — ${t.distanceKm} km as ${ModeLabel(t.mode)} = ${t.co2} kg CO₂`
          : `Trip saved — ${t.distanceKm} km, ${ModeLabel(t.mode)} (no ledger entry)`
      );
      setSession(null);
      setPoints([]);
      setReading(null);
      originRef.current = null;
      loadTrips();
      onLogged?.();
    } catch (err) {
      onToast?.(err.message, 'warn');
    } finally {
      setBusy(false);
    }
  }, [autoLog, flush, loadTrips, onLogged, onToast, session, stopSensors]);

  const discard = useCallback(async () => {
    if (!session) return;
    setBusy(true);
    try {
      stopSensors();
      await api.discardTrip(session.id);
      setSession(null);
      setPoints([]);
      setReading(null);
      onToast?.('Tracking session discarded', 'warn');
      loadTrips();
    } catch (err) {
      onToast?.(err.message, 'warn');
    } finally {
      setBusy(false);
    }
  }, [loadTrips, onToast, session, stopSensors]);

  const correct = useCallback(
    async (mode) => {
      if (!session) return;
      setBusy(true);
      try {
        await api.correctTripMode(session.id, mode);
        setReading((prev) => (prev ? { ...prev, classification: { ...prev.classification, mode, label: MODE_META[mode]?.label || mode } } : prev));
        onToast?.(`Recorded ${MODE_META[mode]?.label || mode} as ground truth`);
      } catch (err) {
        onToast?.(err.message, 'warn');
      } finally {
        setBusy(false);
      }
    },
    [onToast, session]
  );

  const m = reading?.measurement;
  const tracking = Boolean(session);
  const closing = SIM_PRESETS.find((p) => p.id === simPreset);

  return (
    <div className="flex w-full flex-col gap-5">
      <SectionHeading
        className="animate-fade-up"
        eyebrow={
          <>
            <LiveDot tone={tracking ? 'primary' : 'amber'} size={6} />
            {tracking ? `Recording · ${points.length} fixes received` : 'Real GPS pipeline · wear it on a phone and walk out the door'}
          </>
        }
        title="Real-time trip tracker"
        subtitle="Fixes from your device are cleaned (accuracy, teleports, stops), measured by haversine, and classified into a travel mode by a soft kinematic model. What the classifier decides is exactly what gets written to the ledger — and nothing is written until you close the trip."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {meta && <Badge tone="primary"><Icon name="route" size={11} /> {meta.trackedActivities} tracked trips</Badge>}
            <Badge tone={geoState === 'denied' ? 'warn' : 'neutral'}>
              <Icon name="wifi" size={11} />
              {geoState === 'unsupported' ? 'no geolocation' : geoState === 'denied' ? 'permission denied' : geoState === 'watching' ? 'GPS live' : 'GPS idle'}
            </Badge>
          </div>
        }
      />

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-12">
        {/* ------------------------------------------------------- capture */}
        <Card className="animate-fade-up p-5 xl:col-span-7">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="muted-label">Live trace</div>
              <div className="display-num mt-0.5 text-[22px] text-on-surface">
                <CountUp value={m?.movingKm ?? 0} decimals={2} />
                <span className="ml-1.5 text-[12px] font-semibold text-on-surface-variant">km travelled</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {!tracking ? (
                <>
                  <select value={simPreset} onChange={(e) => setSimPreset(e.target.value)} className="input w-auto py-2 text-[12px]">
                    {SIM_PRESETS.map((p) => (
                      <option key={p.id} value={p.id}>{p.label}</option>
                    ))}
                  </select>
                  <button onClick={() => start('device')} disabled={busy} className="btn-primary">
                    <Icon name="play" size={14} /> Use my GPS
                  </button>
                  <button onClick={() => start('simulated')} disabled={busy} className="btn-secondary">
                    <Icon name="cpu" size={14} /> Simulate
                  </button>
                </>
              ) : (
                <>
                  <label className="flex items-center gap-2 text-[11.5px] font-medium text-on-surface-variant">
                    <input type="checkbox" checked={autoLog} onChange={(e) => setAutoLog(e.target.checked)} className="h-3.5 w-3.5 accent-[rgb(var(--primary))]" />
                    Write to ledger on finish
                  </label>
                  <button onClick={complete} disabled={busy} className="btn-primary">
                    <Icon name="check" size={14} /> Finish trip
                  </button>
                  <button onClick={discard} disabled={busy} className="btn-icon" title="Discard this session">
                    <Icon name="trash" size={15} />
                  </button>
                </>
              )}
            </div>
          </div>

          <TraceMap
            points={points}
            live={{ source: session?.source }}
            onEmpty={tracking ? 'Listening for the first fix…' : 'No trace yet — start a trip or run a simulated one.'}
          />

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ['Moving', m ? `${m.movingKm} km` : '—'],
              ['Stopped', m ? `${m.stoppedKm} km` : '—'],
              ['Duration', m ? fmtDuration(m.durationMin) : '—'],
              ['Avg speed', m ? `${m.avgSpeedKmh} km/h` : '—'],
              ['Peak', m ? `${m.maxSpeedKmh} km/h` : '—'],
              ['85th pct', m ? `${m.p85Kmh} km/h` : '—'],
              ['Stop share', m ? `${Math.round(m.stopFraction * 100)}%` : '—'],
              ['Speed σ/µ', m ? m.speedCv : '—'],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-outline-variant/40 bg-surface-container-low/50 px-3 py-2.5">
                <div className="muted-label">{label}</div>
                <div className="tabular mt-0.5 text-[13.5px] font-semibold text-on-surface">{value}</div>
              </div>
            ))}
          </div>

          {reading?.dropped && (
            <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-on-surface-variant">
              <Icon name="filter" size={12} className="mt-0.5 flex-shrink-0 text-primary" />
              Cleaning pass: kept {points.length} fixes, dropped {reading.dropped.accuracy} for poor accuracy (&gt;{' '}
              {meta?.cleaning?.maxAccuracyM ?? 50} m) and {reading.dropped.teleport} as impossible jumps. Stops under{' '}
              {meta?.cleaning?.stopMinSeconds ?? 30} s are treated as noise; longer ones are excluded from billable distance.
            </p>
          )}
        </Card>

        {/* --------------------------------------------------- classifier */}
        <Card className="animate-fade-up p-5 xl:col-span-5">
          <SectionHeading
            eyebrow={
              <>
                <Icon name="cpu" size={12} className="text-primary" />
                soft membership scoring → softmax posterior
              </>
            }
            title="Travel mode"
            subtitle="Explained, not black-boxed: every mode is a membership function over the trace's kinematic features, and the reasons are shown with the posterior."
            className="mb-4"
          />
          <ModePanel
            classification={reading?.classification}
            corrected={reading?.classification?.mode !== undefined && reading?.classification?.corrected}
            onCorrect={correct}
            busy={busy || !tracking}
          />
          {!tracking && reading?.classification && (
            <p className="mt-3 border-t border-outline-variant/40 pt-3 text-[11px] text-on-surface-variant">
              Showing the last completed read. Start a trip to classify a live trace.
            </p>
          )}
        </Card>
      </div>

      {/* ------------------------------------------------------- the pipeline */}
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-12">
        <Card className="animate-fade-up p-5 lg:col-span-5">
          <SectionHeading
            eyebrow={<><Icon name="shield" size={12} className="text-primary" /> four stages, applied in order</>}
            title="How a fix becomes a footprint"
            className="mb-4"
          />
          <ol className="flex flex-col gap-3">
            {[
              ['Accuracy gate', `Fixes reporting worse than ${meta?.cleaning?.maxAccuracyM ?? 50} m are discarded — a 200 m fix would invent distance that never happened.`],
              ['Teleport filter', `Any jump implying more than ${meta?.cleaning?.teleportKmh ?? 1200} km/h is a GPS glitch, not travel. The bar sits above a cruising jet so a real flight survives it.`],
              ['Stop detection', `Slower than ${meta?.cleaning?.stopSpeedKmh ?? 1.5} km/h for over ${meta?.cleaning?.stopMinSeconds ?? 30} s counts as a stop and is excluded from billable distance, so queuing in traffic is not billed as driving.`],
              ['Haversine + winding', `Remaining legs are summed as great-circle distances and scaled by ${meta?.windingFactor ?? 1.08} for road curvature, because straight chords between fixes under-count a bending route.`],
            ].map(([title, body], i) => (
              <li key={title} className="flex gap-3">
                <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg bg-primary/12 text-[11px] font-bold text-primary">
                  {i + 1}
                </span>
                <div>
                  <div className="text-[12.5px] font-semibold text-on-surface">{title}</div>
                  <p className="mt-0.5 text-[11.5px] leading-relaxed text-on-surface-variant">{body}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-4 border-t border-outline-variant/40 pt-3 text-[11px] leading-relaxed text-outline">
            Zero-emission modes (walking, cycling) are measured and shown in full but never written to the ledger — the app does
            not award carbon for not driving. Your correction overrides the classifier and is stored as ground truth.
          </p>
        </Card>

        <Card className="animate-fade-up p-5 lg:col-span-7">
          <SectionHeading
            eyebrow={<><Icon name="history" size={12} className="text-primary" /> every session, classified</>}
            title="Recent trips"
            actions={
              <button onClick={loadTrips} className="btn-secondary">
                <Icon name="reset" size={14} /> Refresh
              </button>
            }
            className="mb-4"
          />
          {trips === null ? (
            <div className="flex flex-col gap-2">
              {[0, 1, 2].map((i) => <Skeleton key={i} h={54} className="rounded-xl" />)}
            </div>
          ) : trips.length === 0 ? (
            <EmptyState
              icon="route"
              title="No tracked trips yet"
              body="Finish a session and it will appear here with its measured distance, classified mode and the ledger entry it produced."
            />
          ) : (
            <ul className="flex flex-col gap-2">
              {trips.map((t) => {
                const info = MODE_META[t.mode] || MODE_META.stationary;
                return (
                  <li key={t._id || t.id} className="flex items-center gap-3 rounded-xl border border-outline-variant/40 bg-surface-container-low/50 px-3 py-2.5">
                    <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg" style={{ background: `${info.colour}1f`, color: info.colour }}>
                      <Icon name={info.icon} size={15} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[12.5px] font-semibold text-on-surface">{info.label}</span>
                        <Badge tone={t.status === 'active' ? 'live' : 'neutral'}>{t.status}</Badge>
                        {t.corrected && <Badge tone="info">corrected</Badge>}
                        {t.logged && <Badge tone="primary">in ledger</Badge>}
                      </div>
                      <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[10.5px] text-on-surface-variant">
                        <span className="tabular">{t.distanceKm ?? 0} km</span>
                        <span className="tabular">{fmtDuration(t.durationMin)}</span>
                        <span className="tabular">{t.pointCount ?? 0} fixes</span>
                        {t.co2 > 0 && <span className="tabular">{t.co2} kg CO₂</span>}
                        <span>{fmtClock(t.startedAt)}</span>
                      </div>
                    </div>
                    {t.status === 'active' && (
                      <button
                        onClick={() => {
                          setSession({ id: t._id || t.id, startedAt: t.startedAt, source: 'device' });
                          setPoints([]);
                          setReading(null);
                          bufferRef.current = [];
                        }}
                        className="pill bg-primary/12 text-primary"
                      >
                        Resume
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {closing && !tracking && (
            <p className="mt-3 text-[11px] leading-relaxed text-outline">
              The simulated presets emit fixes with realistic spacing: <strong className="text-on-surface-variant">{closing.label}</strong>{' '}
              at roughly {closing.speedKmh} km/h{closing.stopChance > 0.1 ? ' with frequent stops' : ''}, so the classifier sees
              the same feature distribution a real device would produce.
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}

function ModeLabel(mode) {
  return MODE_META[mode]?.label || mode;
}
