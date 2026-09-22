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

export const api = {
  factors: () => fetch(`${API}/factors`).then(handle),

  activities: (params = {}) => {
    const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v != null)).toString();
    return fetch(`${API}/activities${q ? `?${q}` : ''}`).then(handle);
  },

  addActivity: (body) =>
    fetch(`${API}/activities`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(handle),

  deleteActivity: (id) => fetch(`${API}/activities/${id}`, { method: 'DELETE' }).then(handle),

  dashboard: () => fetch(`${API}/dashboard`).then(handle),
  week: () => fetch(`${API}/week`).then(handle),
  getTarget: () => fetch(`${API}/target`).then(handle),
  setTarget: (weeklyTarget) =>
    fetch(`${API}/target`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weeklyTarget }),
    }).then(handle),

  chat: (message, history) =>
    fetch(`${API}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, history }),
    }).then(handle),

  audit: (useLLM = false) => fetch(`${API}/ai/audit${useLLM ? '?llm=1' : ''}`).then(handle),
  health: () => fetch(`${API}/health`).then(handle),
};
