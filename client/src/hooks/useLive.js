import { useEffect, useRef, useState } from 'react';

// Live data hook.
// Primary transport: Server-Sent Events (/api/stream) — the backend pushes an
// event the moment any session logs, deletes, or changes the target.
// Fallback: if EventSource is unavailable or the stream drops, we poll every
// 6s so the dashboard still behaves "live" in every environment.
export function useLive(onEvent) {
  const [status, setStatus] = useState('connecting'); // connecting | live | polling
  const [clients, setClients] = useState(1);
  const [lastEvent, setLastEvent] = useState(null);
  const handler = useRef(onEvent);
  handler.current = onEvent;

  useEffect(() => {
    let es;
    let poll;

    const startPolling = () => {
      if (poll) return;
      setStatus('polling');
      poll = setInterval(() => handler.current?.({ type: 'poll', at: new Date().toISOString() }), 6000);
    };

    try {
      es = new EventSource('/api/stream');

      es.addEventListener('hello', (e) => {
        setStatus('live');
        try {
          const data = JSON.parse(e.data);
          if (typeof data.clients === 'number') setClients(data.clients);
        } catch {}
      });

      const forward = (type) => (e) => {
        setStatus('live');
        let payload = {};
        try {
          payload = JSON.parse(e.data);
        } catch {}
        const evt = { type, ...payload, at: new Date().toISOString() };
        setLastEvent(evt);
        handler.current?.(evt);
      };

      es.addEventListener('activity', forward('activity'));
      es.addEventListener('deleted', forward('deleted'));
      es.addEventListener('target', forward('target'));

      es.onerror = () => {
        // Browser auto-reconnects; if it can't, fall back to polling so the UI
        // keeps updating rather than silently freezing.
        if (es.readyState === 2) startPolling();
      };
    } catch {
      startPolling();
    }

    return () => {
      es?.close();
      if (poll) clearInterval(poll);
    };
  }, []);

  return { status, clients, lastEvent };
}
