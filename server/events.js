// Real-time event hub: keeps every connected browser in sync via Server-Sent
// Events. When any client logs, deletes, or changes the target, all other
// sessions update live — no refresh.
const clients = new Set();

export function addClient(res) {
  clients.add(res);
}

export function removeClient(res) {
  clients.delete(res);
}

export function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
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
