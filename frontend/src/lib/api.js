const API = import.meta.env.VITE_API_URL || '/api';

async function handle(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || data.message || `Request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

const post = (path, body) =>
  fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  }).then(handle);

export const api = {
  // calculation engine
  factors: () => fetch(`${API}/factors`).then(handle),
  calculate: (body) => post('/calculate', body),
  simulate: (body) => post('/simulate', body),

  // activity management
  activities: (params = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v != null)).toString();
    return fetch(`${API}/activities${qs ? `?${qs}` : ''}`).then(handle);
  },
  addActivity: (body) => post('/activities', body),
  deleteActivity: (id) => fetch(`${API}/activities/${id}`, { method: 'DELETE' }).then(handle),
  history: (limit = 25) => fetch(`${API}/history?limit=${limit}`).then(handle),

  // analytics & aggregation
  dashboard: () => fetch(`${API}/dashboard`).then(handle),
  week: () => fetch(`${API}/week`).then(handle),
  insights: () => fetch(`${API}/insights`).then(handle),
  exportUrl: (format = 'csv', params = {}) => {
    const qs = new URLSearchParams({ format, ...params }).toString();
    return `${API}/export?${qs}`;
  },

  // weekly target
  getTarget: () => fetch(`${API}/target`).then(handle),
  setTarget: (weeklyTarget) =>
    fetch(`${API}/target`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weeklyTarget }),
    }).then(handle),

  // alerts & nudges
  nudges: (evaluate = false) => fetch(`${API}/nudges${evaluate ? '?evaluate=1' : ''}`).then(handle),
  markNudgesRead: (id) => post('/nudges/read', id ? { id } : {}),

  // copilot (hybrid chat + AI audit)
  chat: (message, history) => post('/chat', { message, history }),

  /**
   * Streaming chat over SSE. Calls onChunk(text) as tokens arrive, and
   * resolves with { text, logged, engine } once the reply completes.
   */
  chatStream: async (message, history, { onChunk, signal } = {}) => {
    const res = await fetch(`${API}/chat/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, history }),
      signal,
    });
    if (!res.ok || !res.body) throw new Error(`Chat stream failed (${res.status})`);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let text = '';
    let logged = null;
    let engine = 'rules';

    const handleFrame = (event, data) => {
      if (event === 'chunk') {
        text += data.text || '';
        onChunk?.(data.text || '');
      } else if (event === 'action') {
        logged = data.logged || null;
      } else if (event === 'done') {
        engine = data.engine || engine;
      } else if (event === 'error') {
        throw new Error(data.message || 'stream error');
      }
    };

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split('\n\n');
      buffer = frames.pop() || '';
      for (const frame of frames) {
        const eventLine = frame.split('\n').find((l) => l.startsWith('event:'));
        const dataLine = frame.split('\n').find((l) => l.startsWith('data:'));
        if (!dataLine) continue;
        const event = eventLine ? eventLine.slice(6).trim() : 'message';
        try {
          handleFrame(event, JSON.parse(dataLine.slice(5).trim()));
        } catch (err) {
          if (event === 'error') throw err;
        }
      }
    }

    return { text, logged, engine };
  },

  // ------------------------------------------------------------------ ML layer
  mlReport: (horizon = 7) => fetch(`${API}/ml/report?horizon=${horizon}`).then(handle),
  mlModels: () => fetch(`${API}/ml/models`).then(handle),
  mlForecast: (horizon = 7) => fetch(`${API}/ml/forecast?horizon=${horizon}`).then(handle),
  mlAnomalies: () => fetch(`${API}/ml/anomalies`).then(handle),
  mlClusters: () => fetch(`${API}/ml/clusters`).then(handle),
  mlRecommendations: () => fetch(`${API}/ml/recommendations`).then(handle),
  mlClassify: (text) => post('/ml/classify', { text }),
  mlTrain: () => post('/ml/train', {}),
  mlFeedback: (text, label) => post('/ml/feedback', { text, label }),

  // ------------------------------------------------- real-world GPS tracking
  trackingMeta: () => fetch(`${API}/tracking/meta`).then(handle),
  trips: (status) => fetch(`${API}/tracking/trips${status ? `?status=${status}` : ''}`).then(handle),
  startTrip: (body) => post('/tracking/trips', body),
  pushTripPoints: (id, points) => post(`/tracking/trips/${id}/points`, { points }),
  correctTripMode: (id, mode) =>
    fetch(`${API}/tracking/trips/${id}/mode`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode }),
    }).then(handle),
  completeTrip: (id, body) => post(`/tracking/trips/${id}/complete`, body || {}),
  discardTrip: (id) => fetch(`${API}/tracking/trips/${id}`, { method: 'DELETE' }).then(handle),
  classifyTrace: (points) => post('/tracking/classify', { points }),

  // real-time telemetry
  telemetry: () => fetch(`${API}/telemetry`).then(handle),
  streamState: () => fetch(`${API}/stream/state`).then(handle),
  audit: (useLLM = false) => fetch(`${API}/ai/audit${useLLM ? '?llm=1' : ''}`).then(handle),

  // platform
  health: () => fetch(`${API}/health`).then(handle),
  services: () => fetch(`${API}/services`).then(handle),
  docs: () => fetch(`${API}/docs`).then(handle),
};
