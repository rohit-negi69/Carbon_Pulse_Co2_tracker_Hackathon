// ---------------------------------------------------------------------------
// One place that decides how the live channel describes itself.
//
// Every transport that is actually delivering state counts as healthy: a
// polled channel is not a degraded one, and only a channel that is genuinely
// reconnecting should say so. Copies of `status === 'live'` scattered across
// the UI got that backwards, announcing "Reconnecting" for a healthy polling
// channel — and, on a serverless host, blinking it once a minute.
// ---------------------------------------------------------------------------

const HEALTHY = new Set(['live', 'polling']);

export function isChannelHealthy(live) {
  return HEALTHY.has(live?.status);
}

export function transportLabel(live) {
  if (live?.transport === 'websocket') return 'WebSocket';
  if (live?.transport === 'sse') return 'SSE stream';
  if (live?.transport === 'polling') return 'Polling';
  return 'Connecting';
}

/** Ribbon text, e.g. "WebSocket live" / "SSE stream live" / "Polling live". */
export function channelLabel(live) {
  if (!isChannelHealthy(live)) return 'Reconnecting';
  return `${transportLabel(live)} live`;
}

/** Headline badge: names the mechanism without overclaiming real-time. */
export function channelHeadline(live) {
  if (!isChannelHealthy(live)) return 'Reconnecting';
  return live?.transport === 'polling' ? 'Live sync' : 'Real-time stream';
}

/** Compact description for inline use, e.g. "webSocket stream". */
export function channelShort(live) {
  if (!isChannelHealthy(live)) return 'reconnecting';
  if (live?.transport === 'websocket') return 'webSocket stream';
  if (live?.transport === 'sse') return 'SSE stream';
  if (live?.transport === 'polling') return 'polling sync';
  return 'connected';
}
