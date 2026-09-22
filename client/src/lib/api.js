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
  audit: (useLLM = false) => fetch(`${API}/ai/audit${useLLM ? '?llm=1' : ''}`).then(handle),

  // platform
  health: () => fetch(`${API}/health`).then(handle),
  services: () => fetch(`${API}/services`).then(handle),
  docs: () => fetch(`${API}/docs`).then(handle),
};
