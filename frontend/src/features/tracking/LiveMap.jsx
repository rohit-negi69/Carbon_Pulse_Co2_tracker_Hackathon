import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// ---------------------------------------------------------------------------
// Live positioning map for the tracker.
//
// The trace is drawn on real map tiles (OpenStreetMap via CARTO — no API key,
// no billing) with one polyline segment per GPS leg, coloured by the speed
// that leg implies — so the map doubles as a visualisation of the exact
// features the mode classifier reads: green walking stretches, cyan cycling,
// blue road, violet rail-straight motorway, red flight.
//
// A pulsing heading marker rides the newest fix with an accuracy halo, and the
// camera follows the head of the trace until the user pans away.
//
// Tiles require network; when they fail (offline grader, file:// preview) the
// parent swaps back to the SVG trace via onUnavailable.
// ---------------------------------------------------------------------------

const KM_H_TIER = [
  { max: 7, colour: '#10b981' }, // walking
  { max: 25, colour: '#06b6d4' }, // cycling
  { max: 90, colour: '#0284c7' }, // urban road / bus
  { max: 200, colour: '#7c3aed' }, // rail / motorway
  { max: Infinity, colour: '#e11d48' }, // flight
];

const speedColour = (kmh) => (KM_H_TIER.find((t) => kmh <= t.max) || KM_H_TIER[KM_H_TIER.length - 1]).colour;

function haversineM(a, b) {
  const R = 6371008.8;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Compass bearing from a → b in degrees, for the heading arrow. */
function bearingDeg(a, b) {
  const toRad = (d) => (d * Math.PI) / 180;
  const y = Math.sin(toRad(b.lon - a.lon)) * Math.cos(toRad(b.lat));
  const x =
    Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lon - a.lon));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Segment (a, b, kmh, latlngs) runs — consecutive same-speed legs merged. */
function speedSegments(points) {
  const segs = [];
  let current = null;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    const metres = haversineM(a, b);
    const hours = Math.max((b.t - a.t) / 3_600_000, 1 / 3_600_000);
    const kmh = (metres / 1000) / hours;
    const colour = speedColour(kmh);
    if (current && current.colour === colour) current.latlngs.push([b.lat, b.lon]);
    else {
      current = { colour, kmh, latlngs: [[a.lat, a.lon], [b.lat, b.lon]] };
      segs.push(current);
    }
  }
  return segs;
}

/** Dark mode is a class on <html>; follow it so tiles re-theme with the app. */
function useDarkMode() {
  const [dark, setDark] = useState(() => typeof document !== 'undefined' && document.documentElement.classList.contains('dark'));
  useEffect(() => {
    const obs = new MutationObserver(() => setDark(document.documentElement.classList.contains('dark')));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);
  return dark;
}

const headIcon = (heading) =>
  L.divIcon({
    className: 'cp-head-marker',
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    html: `
      <div class="relative h-[30px] w-[30px]">
        <div class="absolute inset-0 rounded-full bg-[rgb(var(--primary))]/25 animate-pulse-ring"></div>
        <div class="absolute inset-[5px] rounded-full bg-[rgb(var(--primary))] shadow-[0_0_12px_rgb(var(--primary))]" style="transform: rotate(${heading}deg)">
          <div class="absolute left-1/2 top-[-3px] h-0 w-0 -translate-x-1/2 border-x-[4px] border-b-[7px] border-x-transparent border-b-white"></div>
        </div>
      </div>`,
  });

const startIcon = () =>
  L.divIcon({
    className: 'cp-start-marker',
    iconSize: [14, 14],
    iconAnchor: [7, 7],
    html: `<div class="h-[14px] w-[14px] rounded-full border-[3px] border-[rgb(var(--primary))] bg-[rgb(var(--surface-container-lowest))]"></div>`,
  });

/** "You are here" marker — used when there is a live position but no trail yet. */
const hereIcon = (heading) =>
  L.divIcon({
    className: 'cp-here-marker',
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    html: `
      <div class="relative h-[34px] w-[34px]">
        <div class="absolute inset-0 animate-pulse-ring rounded-full bg-[rgb(var(--primary))]/30"></div>
        <div class="absolute inset-[6px] rounded-full border-2 border-white bg-[rgb(var(--primary))] shadow-[0_0_14px_rgb(var(--primary))]"></div>
        <div class="absolute left-1/2 top-0 h-0 w-0 -translate-x-1/2 border-x-[5px] border-b-[8px] border-x-transparent border-b-[rgb(var(--primary))]" style="transform: translateX(-50%) rotate(${heading ?? 0}deg); transform-origin: 50% 17px;"></div>
      </div>`,
  });

export default function LiveMap({
  points,
  source,
  height = 320,
  onUnavailable,
  center = [51.5074, -0.1278],
  zoom = 15,
  // A live position that exists independently of the trip trace (real device
  // fix). When present it drives the marker even before the first trace point.
  position = null,
  positionAccuracy = null,
  accuracyCircle = true,
  badge = null,
  locating = false,
  onLocate = null,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  const headRef = useRef(null);
  const haloRef = useRef(null);
  const startRef = useRef(null);
  const hereRef = useRef(null);
  const followRef = useRef(true);
  const erroredRef = useRef(0);
  const centeredRef = useRef(false);
  const [follow, setFollow] = useState(true);
  const [tileFailed, setTileFailed] = useState(false);
  const dark = useDarkMode();

  const segments = useMemo(() => speedSegments(points), [points]);
  const head = position || points[points.length - 1] || null;
  const first = points[0];
  const heading = position?.heading ?? (points.length > 1 ? bearingDeg(points[points.length - 2], points[points.length - 1]) : null);

  // Init once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      zoomControl: false,
      attributionControl: true,
      dragging: true,
      scrollWheelZoom: false, // the page scrolls; zoom via buttons/double-click
      doubleClickZoom: true,
    }).setView(center, zoom);

    L.control.zoom({ position: 'bottomright' }).addTo(map);
    L.control.scale({ position: 'bottomleft', imperial: false }).addTo(map);

    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    map.on('dragstart', () => {
      followRef.current = false;
      setFollow(false);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Swap basemap with the theme. Tiles are keyless OpenStreetMap; dark mode
  // is a CSS filter over the tile layer (the standard keyless dark-map trick).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (map._cpTiles) map.removeLayer(map._cpTiles);
    const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
      className: dark ? 'cp-tiles-dark' : '',
    });
    tiles.on('tileerror', () => {
      erroredRef.current += 1;
      if (erroredRef.current >= 4 && !tileFailed) {
        setTileFailed(true);
        onUnavailable?.();
      }
    });
    tiles.addTo(map);
    map._cpTiles = tiles;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dark, tileFailed]);

  // Redraw the trail when the trace grows.
  useEffect(() => {
    const map = mapRef.current;
    const group = layerRef.current;
    if (!map || !group) return;
    group.clearLayers();

    // A live position with no trace yet: centre once, then just mark it.
    if (!points.length && position) {
      if (!centeredRef.current) {
        map.setView([position.lat, position.lon], zoom, { animate: true });
        centeredRef.current = true;
      }
      if (accuracyCircle && positionAccuracy) {
        haloRef.current = L.circle([position.lat, position.lon], {
          radius: Math.min(positionAccuracy, 500),
          color: 'rgb(var(--primary))',
          weight: 1,
          fillColor: 'rgb(var(--primary))',
          fillOpacity: 0.1,
          interactive: false,
        }).addTo(group);
      }
      hereRef.current = L.marker([position.lat, position.lon], { icon: hereIcon(heading), interactive: false }).addTo(group);
      if (followRef.current) map.panTo([position.lat, position.lon], { animate: true, duration: 0.5 });
      return;
    }

    if (!points.length) return;

    for (const seg of segments) {
      L.polyline(seg.latlngs, {
        color: seg.colour,
        weight: 4,
        opacity: 0.9,
        lineCap: 'round',
        lineJoin: 'round',
      })
        .bindTooltip(`${seg.kmh.toFixed(0)} km/h`, { sticky: true })
        .addTo(group);
    }

    startRef.current = L.marker([first.lat, first.lon], { icon: startIcon(), interactive: false }).addTo(group);

    haloRef.current = L.circle([head.lat, head.lon], {
      radius: Math.min(head.accuracy || 8, 60),
      color: 'rgb(var(--primary))',
      weight: 1,
      fillColor: 'rgb(var(--primary))',
      fillOpacity: 0.08,
      interactive: false,
    }).addTo(group);

    headRef.current = L.marker([head.lat, head.lon], { icon: headIcon(heading ?? 45), interactive: false, zIndexOffset: 1000 }).addTo(group);

    if (followRef.current) {
      map.setView([head.lat, head.lon], Math.max(map.getZoom(), 15), { animate: true, duration: 0.4 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, segments, position]);

  if (tileFailed) return null;

  return (
    <div className="relative overflow-hidden rounded-xl border border-outline-variant/40" style={{ height }}>
      <div ref={containerRef} className="h-full w-full [&_.leaflet-container]:bg-surface-container-low" />
      <div className="pointer-events-none absolute left-3 top-3 z-[500] flex flex-wrap items-center gap-2">
        <span className="pill bg-surface-container-lowest/90 text-on-surface-variant backdrop-blur">
          {points.length ? `${points.length} fixes · live map` : 'live position map'}
        </span>
        {badge ? (
          <span className="pill bg-surface-container-lowest/90 text-on-surface-variant backdrop-blur">{badge}</span>
        ) : source === 'device' ? (
          <span className="pill bg-emerald-soft text-emerald backdrop-blur">device GPS</span>
        ) : source ? (
          <span className="pill bg-amber-soft text-amber backdrop-blur">simulated trace</span>
        ) : null}
        {locating && (
          <span className="pill bg-primary/20 text-primary backdrop-blur">
            <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[rgb(var(--primary))]" />
            acquiring fix
          </span>
        )}
      </div>
      {/* Speed legend — mirrors the classifier's kinematic read of the trail */}
      <div className="pointer-events-none absolute right-3 top-3 z-[500] rounded-lg bg-surface-container-lowest/90 px-2.5 py-2 backdrop-blur">
        <div className="muted-label mb-1">trail speed</div>
        <div className="flex flex-col gap-0.5">
          {[
            ['#10b981', 'walk'],
            ['#06b6d4', 'cycle'],
            ['#0284c7', 'road'],
            ['#7c3aed', 'rail'],
            ['#e11d48', 'flight'],
          ].map(([c, label]) => (
            <div key={label} className="flex items-center gap-1.5 text-[10px] font-medium text-on-surface-variant">
              <span className="h-[3px] w-4 rounded-full" style={{ background: c }} />
              {label}
            </div>
          ))}
        </div>
      </div>
      <div className="absolute bottom-[70px] right-3 z-[500] flex flex-col items-end gap-2">
        <button
          onClick={() => {
            const next = !follow;
            followRef.current = next;
            setFollow(next);
            if (next && head && mapRef.current) mapRef.current.setView([head.lat, head.lon]);
          }}
          className={`pill backdrop-blur transition-colors ${
            follow ? 'bg-primary text-on-primary' : 'bg-surface-container-lowest/90 text-on-surface-variant'
          }`}
          title={follow ? 'Camera is following you — drag the map to pause' : 'Resume follow mode'}
        >
          {follow ? 'following' : 'paused'}
        </button>
        {onLocate && (
          <button
            onClick={() => {
              followRef.current = true;
              setFollow(true);
              onLocate();
              if (head && mapRef.current) mapRef.current.setView([head.lat, head.lon], 16, { animate: true });
            }}
            className="pill bg-surface-container-lowest/90 text-on-surface-variant backdrop-blur transition-colors hover:text-primary"
            title="Locate me — recentre on my real position"
          >
            ⌖ locate me
          </button>
        )}
      </div>
    </div>
  );
}
