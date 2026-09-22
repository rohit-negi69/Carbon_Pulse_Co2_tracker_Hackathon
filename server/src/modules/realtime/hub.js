// ---------------------------------------------------------------------------
// Real-time hub — keeps every connected browser in sync.
// Mutations (create, delete, target change, nudge) are broadcast over SSE so
// the dashboard, charts and copilot update without a refresh or poll.
// ---------------------------------------------------------------------------

const clients = new Set();

export function addClient(res) {
  clients.add(res);
}

export function removeClient(res) {
  clients.delete(res);
}

export function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify({ ...data, at: new Date().toISOString() })}\n\n`;
  for (const res of clients) {
    try {
      res.write(payload);
    } catch {
      clients.delete(res);
    }
  }
}

export function connectedClients() {
  return clients.size;
}
