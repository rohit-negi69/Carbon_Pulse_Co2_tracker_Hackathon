import { useCallback, useEffect, useRef, useState } from 'react';
import { PositionSmoother, inIndia } from './positioning.js';

// ---------------------------------------------------------------------------
// useLivePosition — your actual position, in real time.
//
//   GPS      navigator.geolocation.watchPosition (high accuracy) → Kalman
//            filtered by PositionSmoother, which also exposes speed, heading,
//            distance travelled and a quality grade.
//   IP       when GPS is unavailable or denied, a coarse city-level lookup
//            centres the map so the view is still about *you* — clearly
//            labelled as approximate, never mixed with measured fixes.
//
// The hook never throws: every failure mode lands in `status` with a human
// message, because a tracker that dies silently is worse than one that says
// "location permission denied".
// ---------------------------------------------------------------------------

const IP_ENDPOINTS = [
  { url: 'https://ipwho.is/', pick: (d) => (d.success === false ? null : { lat: d.latitude, lon: d.longitude, city: d.city, region: d.region, country: d.country }) },
  { url: 'https://ipapi.co/json/', pick: (d) => (d.error ? null : { lat: d.latitude, lon: d.longitude, city: d.city, region: d.region, country: d.country_name }) },
];

async function lookupCoarseLocation() {
  for (const endpoint of IP_ENDPOINTS) {
    try {
      const res = await fetch(endpoint.url, { signal: AbortSignal.timeout(6000) });
      if (!res.ok) continue;
      const data = await res.json();
      const picked = endpoint.pick(data);
      if (picked && Number.isFinite(picked.lat) && Number.isFinite(picked.lon)) return picked;
    } catch {
      /* try the next provider */
    }
  }
  return null;
}

const MAX_TRAIL = 1500;

export function useLivePosition({ autoStart = true } = {}) {
  const [status, setStatus] = useState('idle'); // idle|locating|live|stale|denied|unsupported|error
  const [position, setPosition] = useState(null);
  const [trail, setTrail] = useState([]);
  const [coarse, setCoarse] = useState(null);
  const [message, setMessage] = useState('');
  const [permission, setPermission] = useState('unknown');

  const smootherRef = useRef(new PositionSmoother());
  const watchRef = useRef(null);
  const lastFixRef = useRef(0);
  const watchdogRef = useRef(null);
  const activeRef = useRef(false);
  const coarseRef = useRef(null);
  useEffect(() => { coarseRef.current = coarse; }, [coarse]);

  const stop = useCallback(() => {
    activeRef.current = false;
    if (watchRef.current != null && typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchRef.current);
    }
    watchRef.current = null;
    if (watchdogRef.current) clearInterval(watchdogRef.current);
    watchdogRef.current = null;
  }, []);

  const start = useCallback(async () => {
    stop();
    activeRef.current = true;
    setMessage('');

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setStatus('unsupported');
      setMessage('This browser exposes no Geolocation API — showing an approximate IP location instead.');
      setCoarse(await lookupCoarseLocation());
      return;
    }

    // Surface the permission state where the browser exposes it, so the UI can
    // say "blocked in your browser settings" rather than a generic error.
    try {
      const result = await navigator.permissions?.query({ name: 'geolocation' });
      if (result) {
        setPermission(result.state);
        result.onchange = () => setPermission(result.state);
      }
    } catch {
      /* Firefox & Safari: not supported, ignore */
    }

    setStatus('locating');

    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const fix = {
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          altitude: pos.coords.altitude,
          t: pos.timestamp || Date.now(),
        };
        lastFixRef.current = Date.now();
        const filtered = smootherRef.current.push(fix);
        if (filtered) {
          setPosition({ ...filtered, insideIndia: inIndia(filtered.lat, filtered.lon) });
          setTrail((prev) => {
            const next = [...prev, { lat: filtered.lat, lon: filtered.lon, t: filtered.t, accuracy: filtered.accuracy }];
            return next.length > MAX_TRAIL ? next.slice(next.length - MAX_TRAIL) : next;
          });
        }
        setStatus('live');
        setMessage('');
      },
      async (err) => {
        // 1 = PERMISSION_DENIED, 2 = POSITION_UNAVAILABLE, 3 = TIMEOUT
        if (err.code === 1) {
          setStatus('denied');
          setPermission('denied');
          setMessage('Location permission was denied. Enable it for this site to see your real position — meanwhile here is an approximate IP location.');
          setCoarse(await lookupCoarseLocation());
        } else if (err.code === 3) {
          setStatus('locating');
          setMessage('Waiting for a GPS fix (this can take a few seconds outdoors)…');
          // Centre the map on a coarse IP estimate while GPS keeps trying, so
          // the view is about *you* from second one instead of a blank country.
          if (!coarseRef.current) setCoarse(await lookupCoarseLocation());
        } else {
          setStatus('error');
          setMessage(`Positioning unavailable (${err.message || 'unknown error'}).`);
          setCoarse(await lookupCoarseLocation());
        }
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 25000 }
    );

    // Watchdog: a fix older than 15 s means the receiver went quiet (tunnel,
    // indoors, phone backgrounded) — say so instead of showing stale numbers.
    watchdogRef.current = setInterval(() => {
      if (!activeRef.current) return;
      if (lastFixRef.current && Date.now() - lastFixRef.current > 15000) setStatus('stale');
    }, 3000);
  }, [stop]);

  const clear = useCallback(() => {
    smootherRef.current.reset();
    setTrail([]);
    setPosition(null);
  }, []);

  useEffect(() => {
    if (autoStart) start();
    return () => stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    status,
    position,
    trail,
    coarse,
    message,
    permission,
    start,
    stop,
    clear,
    /** Best available centre for a map: real fix → IP guess → null. */
    focus: position ? { lat: position.lat, lon: position.lon, accuracy: position.accuracy, source: 'gps' }
      : coarse ? { lat: coarse.lat, lon: coarse.lon, accuracy: 15000, source: 'ip' }
      : null,
  };
}

export default useLivePosition;
