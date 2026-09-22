import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api.js';
import { Icon, CATEGORY_META } from '../../components/ui/index.jsx';

const QUICK_PROMPTS = [
  "Analyse my history for reduction opportunities",
  "What's my footprint?",
  "Which category is worst?",
  "How is my weekly progress?",
  "I drove 15 km",
];

export default function Copilot({ open, onClose, onLogged, seed }) {
  const [messages, setMessages] = useState([
    {
      role: 'bot',
      text: "Hi — I'm your Eco-Audit Copilot 🌱 I read your live ledger. Ask about your footprint, or tell me what you did (\"I drove 15 km\") and I'll log it.",
    },
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [audit, setAudit] = useState(null);
  const endRef = useRef(null);

  useEffect(() => {
    if (open) api.audit().then(setAudit).catch(() => {});
  }, [open]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open]);

  useEffect(() => {
    if (open && seed) send(seed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, seed]);

  async function send(textArg) {
    const text = (textArg ?? input).trim();
    if (!text || busy) return;
    setInput('');
    setMessages((m) => [...m, { role: 'user', text }]);
    setBusy(true);
    try {
      const history = messages.slice(-8).map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text }));
      const res = await api.chat(text, history);
      setMessages((m) => [...m, { role: 'bot', text: res.reply, engine: res.engine }]);
      if (res.logged) {
        onLogged?.();
        api.audit().then(setAudit).catch(() => {});
      }
    } catch (err) {
      setMessages((m) => [...m, { role: 'bot', text: `Sorry — ${err.message}` }]);
    } finally {
      setBusy(false);
    }
  }

  const insights = audit?.insights || [];

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className={`fixed inset-0 z-[65] bg-inverse-surface/40 backdrop-blur-sm transition-opacity ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />
      {/* Panel */}
      <aside
        className={`fixed bottom-0 right-0 top-0 z-[70] flex w-full max-w-md flex-col border-l border-outline-variant/50 bg-surface-container-lowest shadow-raised transition-transform duration-300 ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
        aria-hidden={!open}
      >
        <header className="flex items-center justify-between border-b border-outline-variant/40 px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-container text-on-primary-container">
              <Icon name="spark" size={17} />
            </div>
            <div>
              <div className="font-headline text-[15px] font-semibold text-on-surface">Eco-Audit Copilot</div>
              <div className="flex items-center gap-1 text-[11px] font-medium text-primary">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                {audit?.engine ? `${audit.engine} · live ledger` : 'connecting…'}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="rounded-full p-1.5 text-on-surface-variant hover:bg-surface-container-high" aria-label="Close copilot">
            <Icon name="close" size={18} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto bg-surface px-4 py-4">
          {/* Diagnostic report */}
          {insights.length > 0 && (
            <div className="mb-4 rounded-xl bg-secondary-container/25 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-secondary">
                  <Icon name="pulse" size={14} /> Diagnostic report
                </span>
                <span className="text-[11px] text-on-surface-variant">{audit.projection} kg projected</span>
              </div>
              <div className="space-y-2">
                {insights.map((ins, i) => (
                  <div key={i} className="flex items-start gap-2 rounded-lg bg-surface-container-lowest p-2.5 shadow-card">
                    <Icon
                      name={CATEGORY_META[ins.icon]?.icon || (ins.severity === 'high' ? 'alert' : 'target')}
                      size={16}
                      className={`mt-0.5 flex-shrink-0 ${ins.severity === 'high' ? 'text-rose' : ins.severity === 'med' ? 'text-amber' : 'text-primary'}`}
                    />
                    <div className="text-[12.5px] leading-snug">
                      <strong className="text-on-surface">{ins.title}.</strong>{' '}
                      <span className="text-on-surface-variant">{ins.detail}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Conversation */}
          <div className="space-y-3">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] whitespace-pre-line rounded-2xl px-3.5 py-2.5 text-[12.5px] leading-snug ${
                    m.role === 'user'
                      ? 'rounded-br-sm bg-primary text-on-primary'
                      : 'rounded-bl-sm border border-outline-variant/40 bg-surface-container-lowest text-on-surface shadow-card'
                  }`}
                >
                  {m.text}
                  {m.engine === 'llm' && <span className="mt-1 block text-[10px] font-medium text-outline">LLM-assisted reply</span>}
                </div>
              </div>
            ))}
            {busy && <div className="px-1 text-[11px] text-on-surface-variant">Copilot is analysing…</div>}
            <div ref={endRef} />
          </div>
        </div>

        {/* Quick prompts + composer */}
        <div className="border-t border-outline-variant/40 p-3">
          <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1">
            {QUICK_PROMPTS.map((p) => (
              <button
                key={p}
                onClick={() => send(p)}
                className="whitespace-nowrap rounded-full bg-surface-container-low px-3 py-1.5 text-[11px] font-medium text-on-surface-variant transition-colors hover:bg-surface-container-high"
              >
                {p}
              </button>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
            className="flex items-center gap-2"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder='Ask about your logs, or say "I drove 15 km"'
              className="input"
            />
            <button type="submit" disabled={busy || !input.trim()} className="btn-primary px-3 disabled:opacity-40" aria-label="Send message">
              <Icon name="send" size={16} />
            </button>
          </form>
        </div>
      </aside>
    </>
  );
}
