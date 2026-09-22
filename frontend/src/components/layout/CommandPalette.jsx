import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../ui/index.jsx';

// ⌘K / Ctrl+K palette. Commands are plain objects: { id, label, hint, icon,
// group, run }. Filtering is a lightweight subsequence match so "wgt" finds
// "Weekly Target" — no dependency, instant on keystroke.
function score(query, text) {
  if (!query) return 1;
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (t.includes(q)) return 100 - t.indexOf(q);
  let qi = 0;
  let hits = 0;
  for (let i = 0; i < t.length && qi < q.length; i += 1) {
    if (t[i] === q[qi]) {
      qi += 1;
      hits += 1;
    }
  }
  return qi === q.length ? hits : 0;
}

export default function CommandPalette({ open, onClose, commands = [] }) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const results = useMemo(() => {
    return commands
      .map((c) => ({ cmd: c, s: Math.max(score(query, c.label), score(query, c.group || '') * 0.6) }))
      .filter((r) => r.s > 0)
      .sort((a, b) => b.s - a.s)
      .map((r) => r.cmd);
  }, [commands, query]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
      // focus after the open animation frame so the caret lands correctly
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive((a) => Math.min(a + 1, results.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((a) => Math.max(a - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const cmd = results[active];
        if (cmd) {
          onClose();
          cmd.run();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, results, active, onClose]);

  useEffect(() => {
    const el = listRef.current?.querySelector('[data-active="true"]');
    el?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

  // Group headers are rendered inline as the list is walked.
  let lastGroup = null;

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center p-4 pt-[10vh]" role="dialog" aria-modal="true" aria-label="Command palette">
      <button aria-label="Close command palette" onClick={onClose} className="absolute inset-0 animate-fade-in cursor-default bg-inverse-surface/50 backdrop-blur-md" />
      <div className="relative w-full max-w-xl animate-scale-in overflow-hidden rounded-2xl border border-outline-variant/50 bg-surface-container-lowest shadow-pop">
        <div className="flex items-center gap-3 border-b border-outline-variant/50 px-4 py-3.5">
          <Icon name="search" size={17} className="text-primary" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search actions, pages and questions…"
            className="w-full bg-transparent text-[14px] text-on-surface outline-none placeholder:text-outline"
            aria-label="Command search"
          />
          <span className="kbd">esc</span>
        </div>

        <div ref={listRef} className="max-h-[52vh] overflow-y-auto py-1.5 scroll-thin">
          {results.length === 0 && (
            <div className="px-4 py-10 text-center text-[13px] text-on-surface-variant">
              Nothing matches “{query}”.
            </div>
          )}
          {results.map((cmd, i) => {
            const header = cmd.group && cmd.group !== lastGroup ? cmd.group : null;
            lastGroup = cmd.group || lastGroup;
            return (
              <div key={cmd.id}>
                {header && <div className="muted-label px-4 pb-1 pt-3">{header}</div>}
                <button
                  data-active={i === active}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => {
                    onClose();
                    cmd.run();
                  }}
                  className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                    i === active ? 'bg-primary/10' : 'hover:bg-surface-container-low'
                  }`}
                >
                  <span
                    className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${
                      i === active ? 'bg-sheen text-on-primary shadow-glow-sm' : 'bg-surface-container-high text-on-surface-variant'
                    }`}
                  >
                    <Icon name={cmd.icon || 'arrowRight'} size={15} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-semibold text-on-surface">{cmd.label}</span>
                    {cmd.hint && <span className="block truncate text-[11.5px] text-on-surface-variant">{cmd.hint}</span>}
                  </span>
                  {cmd.shortcut && <span className="kbd">{cmd.shortcut}</span>}
                </button>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between border-t border-outline-variant/50 bg-surface-container-low px-4 py-2 text-[11px] text-on-surface-variant">
          <span className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <span className="kbd">↑</span>
              <span className="kbd">↓</span> navigate
            </span>
            <span className="flex items-center gap-1">
              <span className="kbd">↵</span> run
            </span>
          </span>
          <span className="font-semibold text-primary">CarbonPulse Command</span>
        </div>
      </div>
    </div>
  );
}
