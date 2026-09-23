import { Card, Icon, Badge, LiveDot, SectionHeading } from '../../components/ui/index.jsx';
import LiveMap from './LiveMap.jsx';
import { useLivePosition } from './useLivePosition.js';
import { INDIA, formatLat, formatLon, formatDMS, inIndia } from './positioning.js';

// ---------------------------------------------------------------------------
// Live position card — your real device position on a real map, in real time.
//
// The map is centred on India by default and follows you the moment a fix
// arrives. Everything numeric comes from the on-device positioning algorithm
// (see positioning.js): the coordinates are Kalman-filtered rather than raw, so
// the marker sits still when you do and moves smoothly when you don't.
//
// When the browser refuses a GPS fix, the card degrades honestly: it shows a
// coarse IP-based location, says so, and never pretends it is a measurement.
// ---------------------------------------------------------------------------

const STATUS_META = {
  idle: { tone: 'neutral', label: 'not started' },
  locating: { tone: 'warn', label: 'acquiring satellites' },
  live: { tone: 'live', label: 'GPS live' },
  stale: { tone: 'warn', label: 'signal lost' },
  denied: { tone: 'warn', label: 'permission denied' },
  unsupported: { tone: 'warn', label: 'no geolocation API' },
  error: { tone: 'warn', label: 'positioning error' },
};

const QUALITY_TONE = { excellent: 'live', good: 'primary', fair: 'warn', poor: 'warn', unknown: 'neutral' };

export default function LivePositionCard({ height = 340 }) {
  const live = useLivePosition({ autoStart: true });
  const { position, trail, coarse, status, message, permission } = live;

  const focus = live.focus;
  const usingIp = !position && Boolean(coarse);
  const mapPosition = position || (coarse ? { lat: coarse.lat, lon: coarse.lon, heading: null } : null);
  const mapAccuracy = position?.accuracy ?? (coarse ? 15000 : null);
  const meta = STATUS_META[status] || STATUS_META.idle;

  const inIndiaNow = position ? inIndia(position.lat, position.lon) : null;

  return (
    <Card className="animate-fade-up p-5">
      <SectionHeading
        eyebrow={
          <>
            <LiveDot tone={status === 'live' ? 'primary' : 'amber'} size={6} />
            {status === 'live'
              ? 'real device fix · Kalman-filtered · streaming'
              : usingIp
                ? 'approximate location (IP) · enable GPS for a real fix'
                : 'waiting for a device fix'}
          </>
        }
        title="Your live position · India"
        subtitle="Your browser's own GPS feeds a positioning algorithm — accuracy and innovation gates, then a 2D constant-velocity Kalman filter with a zero-velocity update — so this marker shows a filtered real position, not raw GPS scatter."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={meta.tone}>
              <Icon name="wifi" size={11} /> {meta.label}
            </Badge>
            {position && (
              <Badge tone={QUALITY_TONE[position.quality] || 'neutral'}>
                <Icon name="target" size={11} /> ±{position.accuracy.toFixed(0)} m · {position.quality}
              </Badge>
            )}
            {usingIp && <Badge tone="warn"><Icon name="globe" size={11} /> IP estimate</Badge>}
            {inIndiaNow === false && <Badge tone="neutral">outside India</Badge>}
          </div>
        }
        className="mb-4"
      />

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-12">
        {/* ------------------------------------------------------------- map */}
        <div className="xl:col-span-7">
          <LiveMap
            points={trail}
            position={mapPosition}
            positionAccuracy={mapAccuracy}
            center={INDIA.center}
            zoom={INDIA.zoom}
            height={height}
            badge={position ? 'device GPS' : usingIp ? 'IP estimate' : null}
            locating={status === 'locating'}
            onLocate={() => {
              if (status === 'idle' || status === 'denied' || status === 'error') live.start();
            }}
          />

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button onClick={live.start} className="btn-primary">
              <Icon name="target" size={14} /> Locate me
            </button>
            <button onClick={live.stop} className="btn-secondary">
              <Icon name="close" size={14} /> Stop
            </button>
            <button onClick={live.clear} className="btn-ghost" title="Clear the filtered trail">
              <Icon name="reset" size={14} /> Reset trail
            </button>
            <span className="text-[11px] text-on-surface-variant">
              {trail.length} filtered {trail.length === 1 ? 'point' : 'points'} plotted
            </span>
          </div>

          {message && (
            <p className="mt-3 flex items-start gap-1.5 rounded-xl border border-outline-variant/40 bg-surface-container-low/60 px-3 py-2 text-[11.5px] leading-relaxed text-on-surface-variant">
              <Icon name="info" size={13} className="mt-0.5 flex-shrink-0 text-primary" />
              {message}
            </p>
          )}
        </div>

        {/* --------------------------------------------------------- readout */}
        <div className="flex flex-col gap-3 xl:col-span-5">
          <div className="grid grid-cols-2 gap-2.5">
            {[
              ['Latitude', position ? formatDMS(position.lat, 'lat') : usingIp ? formatLat(coarse.lat) : '—'],
              ['Longitude', position ? formatDMS(position.lon, 'lon') : usingIp ? formatLon(coarse.lon) : '—'],
              ['Accuracy', position ? `±${position.accuracy.toFixed(1)} m` : usingIp ? 'city-level' : '—'],
              ['Speed', position ? `${position.speedKmh.toFixed(1)} km/h` : '—'],
              [
                'Heading',
                position?.heading != null ? `${position.heading.toFixed(0)}° ${position.compass}` : '—',
              ],
              ['Altitude', position?.altitude != null ? `${position.altitude.toFixed(0)} m` : '—'],
              ['Distance', position ? `${position.distanceKm.toFixed(3)} km` : '—'],
              ['Motion', position ? (position.moving ? 'moving' : 'stationary') : '—'],
              ['Moving time', position ? `${position.movingMinutes.toFixed(1)} min` : '—'],
              ['Still time', position ? `${position.stoppedMinutes.toFixed(1)} min` : '—'],
              ['Fix correction', position ? `${position.correctionM.toFixed(1)} m` : '—'],
              ['Fixes kept', position ? `${position.fixes}` : '—'],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-outline-variant/40 bg-surface-container-low/50 px-3 py-2">
                <div className="muted-label">{label}</div>
                <div className="tabular mt-0.5 text-[12.5px] font-semibold text-on-surface">{value}</div>
              </div>
            ))}
          </div>

          {usingIp && coarse && (
            <p className="flex items-start gap-1.5 rounded-xl border border-amber-soft bg-amber-soft/40 px-3 py-2 text-[11.5px] leading-relaxed text-on-surface-variant">
              <Icon name="alert" size={13} className="mt-0.5 flex-shrink-0 text-amber" />
              Approximate location{coarse.city ? `: ${coarse.city}` : ''}{coarse.region ? `, ${coarse.region}` : ''}
              {coarse.country ? `, ${coarse.country}` : ''} — derived from your IP address (accurate to a city, not a
              street). Allow location access to switch to a real GPS fix.
            </p>
          )}

          {!position && !usingIp && permission === 'denied' && (
            <p className="text-[11.5px] text-on-surface-variant">
              Location is blocked for this site. Re-enable it in your browser's site settings, then press “Locate me”.
            </p>
          )}

          <div className="rounded-xl border border-outline-variant/40 bg-surface-container-low/50 px-3 py-3">
            <div className="muted-label mb-2">positioning algorithm</div>
            <ol className="flex flex-col gap-1.5 text-[11.5px] leading-relaxed text-on-surface-variant">
              {[
                'Accuracy gate — fixes reporting worse than 120 m are discarded.',
                'Teleport gate — implied speed above 300 km/h is receiver noise, not travel.',
                'Innovation gate — a fix that disagrees with the prediction by more than 3.2σ (Mahalanobis) is rejected.',
                'Kalman filter — 2D constant-velocity model in an east/north plane; measurement noise = the reported accuracy.',
                'Zero-velocity update — sustained stillness pins velocity to zero, so a parked phone stops “walking”.',
                'Derived state — speed and heading come from filtered velocity; distance accumulates along the filtered path.',
              ].map((step, i) => (
                <li key={step} className="flex gap-2">
                  <span className="mt-[1px] flex h-4 w-4 flex-shrink-0 items-center justify-center rounded bg-primary/12 text-[9.5px] font-bold text-primary">
                    {i + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
            {position && (
              <p className="mt-2.5 border-t border-outline-variant/40 pt-2.5 text-[11px] text-outline">
                Raw fix was ±{position.rawAccuracy?.toFixed(0)} m; the filter estimates ±{position.accuracy.toFixed(1)} m
                and moved the marker {position.correctionM.toFixed(1)} m from the raw reading. Rejections so far —{' '}
                {position.rejected.accuracy} accuracy, {position.rejected.teleport} teleport, {position.rejected.innovation} outlier.
              </p>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
