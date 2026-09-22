import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createLiveConnection } from './liveSocket.js';

// ---------------------------------------------------------------------------
// useLive — the app's real-time spine.
//
// One connection per browser tab, shared by every feature: the header pills,
// the dashboard, the targets page, the nudge centre and the copilot all read
// the same pushed state, and every mutation travels back over the same socket.
// ---------------------------------------------------------------------------

export function useLive(onEvent) {
  const [state, setState] = useState(null);
  const connectionRef = useRef(null);
  const handler = useRef(onEvent);
  handler.current = onEvent;

  if (!connectionRef.current) {
    connectionRef.current = createLiveConnection({
      onFrame: (frame) => handler.current?.(frame),
      onState: (next) => setState(next),
    });
  }

  useEffect(() => {
    const connection = connectionRef.current;
    connection.start();
    return () => connection.stop();
  }, []);

  const send = useCallback((cmd, payload, options) => connectionRef.current.send(cmd, payload, options), []);
  const chat = useCallback((message, history, onChunk) => connectionRef.current.chat(message, history, onChunk), []);
  const notifyTyping = useCallback((typingOn, page) => connectionRef.current.typing(typingOn, page), []);

  return useMemo(
    () => ({
      // connection health
      status: state?.status || 'connecting',
      transport: state?.transport || 'none',
      mode: state?.mode || 'websocket',
      latencyMs: state?.latencyMs ?? null,
      reconnects: state?.reconnects || 0,
      lastEventId: state?.lastEventId ?? null,
      error: state?.error || null,

      // pushed state
      clients: state?.clients || 1,
      presence: state?.presence || [],
      typing: state?.typing || null,
      snapshot: state?.snapshot || null,
      metrics: state?.metrics || null,
      telemetry: state?.telemetry || null,
      grid: state?.grid || null,
      log: state?.log || [],
      lastEvent: state?.lastEvent || null,
      queueSize: state?.queueSize || 0,

      // actions
      connection: connectionRef.current,
      send,
      chat,
      notifyTyping,
    }),
    [state, send, chat, notifyTyping]
  );
}
