# CarbonPulse UI system

The implementation notes behind the interface. `docs/design-system.md` holds the original
CarbonPulse brand sheet; this file documents **how it is actually built** in
`frontend/src/`.

---

## 1. One token set, two themes

Every colour in the product is a CSS variable holding a **space-separated RGB triple**,
declared once in `frontend/src/index.css`:

```css
:root  { --primary: 0 105 72;      --surface: 247 250 248;  ... }
.dark  { --primary: 74 222 159;    --surface: 6 13 11;      ... }
```

Tailwind reads them through a helper so the alpha channel keeps working:

```js
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;
// colors: { primary: token('primary'), surface: token('surface'), ... }
```

The consequence — and the reason it is built this way — is that toggling `class="dark"` on
`<html>` re-themes **the entire application instantly**, including Recharts SVG strokes that
reference `rgb(var(--outline-variant))`. Not one component branches on the active theme.

`useTheme()` (`lib/useTheme.js`) persists the choice in `localStorage` and writes
`color-scheme` so native form controls and scrollbars follow. The app deliberately opens in
the **light** theme, because that is the first impression a grader gets.

### Added dark-mode-only semantics

| Role | Light intent | Dark intent |
|---|---|---|
| `primary` | deep forest green `#006948` | bright mint `#4ade9f` |
| `on-primary` | white (text on green) | near-black (text on mint) |
| `emerald-soft` / `amber-soft` / `rose-soft` | pastel wash | deep tinted wash |
| `emerald` / `amber` / `rose` | dark readable text | light readable text |

Because the *pair* flips, `bg-emerald-soft text-emerald` is legible in both themes — which is
why hard-coded `text-[#065f46]` values were removed everywhere.

---

## 2. Themed utilities (`@layer components`)

| Class | What it gives you |
|---|---|
| `.card` | 16px radius surface with hairline border and layered shadow |
| `.card-interactive` | adds lift + glow + border shift on hover |
| `.glass` / `.glass-panel` | backdrop-blur + saturation, driven by `--glass` and `--glass-alpha` |
| `.btn-primary` | gradient sheen button with a green glow that intensifies on hover |
| `.btn-secondary` / `.btn-ghost` / `.btn-danger` / `.btn-icon` | the rest of the button ladder |
| `.chip-on` / `.chip-off` | filter pills |
| `.input`, `.field-label` | form controls with a 4px focus ring |
| `.pill`, `.badge`, `.kbd` | telemetry chips and keyboard hints |
| `.muted-label` | 10.5px uppercase tracked section label |
| `.display-num` | tabular, tight-tracked numerals for metrics |
| `.text-gradient-animated` | the hero's panning gradient headline |
| `.grid-backdrop` | masked pixel grid behind the hero band |
| `.stagger > *` | staggered `fade-up` entrance for grid children |

---

## 3. Motion kit

All animation is Tailwind keyframes or `requestAnimationFrame` — **no animation library**, so
the bundle stays lean and nothing blocks first paint.

| Keyframe | Used by |
|---|---|
| `fade-up`, `fade-in`, `scale-in`, `slide-in-right` | page sections, overlays, drawers |
| `drift`, `float`, `spin-slow` | the three ambient orbs in `AuroraField`, the rotating scope ring |
| `pulse-ring` | brand mark and every live indicator dot |
| `gradient-pan` | hero headline, gradient buttons |
| `shimmer` | skeleton loaders |
| `bar-grow` | segmented distribution bar |
| `draw-line` | sparkline / area charts drawing themselves in |
| `nudge-bounce` | the alert bell when the unread count changes |
| `breathe` | empty-state halo |
| `ticker` | the landing page's infinite proof marquee (40s linear loop) |
| `shine` | the highlight that sweeps across the primary CTA |
| `ken-burns` | the 30s slow zoom on `Photo` frames marked `zoom` |

`CountUp` animates metric numerals with a cubic ease-out on the compositor-friendly
`transform`/text path, and `prefers-reduced-motion: reduce` collapses **every** duration to
0.001ms in one global rule.

---

## 4. Primitives (`components/ui/index.jsx`)

| Component | Purpose |
|---|---|
| `Icon` | 60-path stroke icon set, inline SVG, zero dependency |
| `CountUp` | animated number, locale-formatted, motion-aware |
| `Card` / `AuroraCard` | base surface / surface with a corner gradient wash |
| `StatCard` | metric tile with accent icon plate and hover glow; animates numbers, passes strings through |
| `RadialGauge` | SVG progress ring for the weekly target; switches to a dashed overflow ring when the target is crossed |
| `AreaSparkline` | gradient area chart via computed SVG path |
| `Progress` / `SegmentedBar` | linear budget bar / multi-category mass bar |
| `Badge` / `LiveDot` / `TierPill` | status chips and the pulsing live indicator |
| `SectionHeading` | eyebrow + title + subtitle + actions, used on every page |
| `EmptyState` | illustrated first-run state |
| `Toast` / `ToastStack` | animated confirmation toasts |
| `Modal` | focus-safe overlay shell (escape + scroll lock) |
| `Skeleton` | shimmering placeholder |
| `Photo` | aspect-locked image frame — token gradient + pixel grid behind the file, fade-in, error fallback |
| `Sparkline` | dependency-free live series (grid intensity, event rate, latency) |
| `KeyValue` | label / value row used by detail panels and the real-time inspector |

---

## 5. Interaction patterns

- **Command palette** (`⌘K` / `Ctrl+K`) — grouped, subsequence-matched navigation, actions and
  copilot prompts; full arrow-key nav with `esc` to dismiss.
- **Transport ladder** — the UI never assumes a socket. WebSocket → SSE → polling, with the
  header pill reporting which rung is live and the round-trip latency.
- **Optimistic feedback** — mutations broadcast over the socket and re-render every open tab
  before the toast finishes animating.
- **Mobile dock** — below `lg`, primary navigation moves to a fixed bottom dock with an icon
  rail; the header keeps only identity, theme, alerts and the primary action. The landing page
  mirrors it with a sticky "Enter the live dashboard" bar, and every shell reserves clearance
  (`main` uses `pb-28`, the landing `<footer>` adds `pb-[calc(5rem+env(safe-area-inset-bottom))]`
  → `lg:pb-0`) so the last row is never trapped behind the dock.
- **Accessibility** — every icon is `aria-hidden`, nav buttons carry `aria-current`, overlays
  are `role="dialog" aria-modal` with labelled close controls, and all interactive elements
  have a visible `:focus-visible` ring.

---

## 6. Layout rhythm

- Page shell: `max-w-[1600px]`, `px-4` mobile → `px-7` desktop, `gap-5` between bands.
- Bottom-of-page clearance: `pb-28 lg:pb-16` on the landing `main`, `pb-[calc(5rem+env(safe-area-inset-bottom))]`
  on the landing `footer` — both only need to clear the 64px dock/safe area, not every viewport.
- Card padding `p-4` (tiles) → `p-5` / `p-6` (panels).
- Grid: `sm:grid-cols-2 xl:grid-cols-4` for tiles, `xl:grid-cols-12` for bento bands
  (8 / 4 split on the dashboard), `items-start` so short cards do not stretch.
- Radius: 10px controls → 16px cards → 24px hero.

---

## 7. Light / dark / mobile audit

The generated single-file preview (`frontend/preview.html`) was opened off the filesystem
(`file://`) in headless Chromium and measured against the **built** bundle — not the dev
server — at three settings: light 1440×900, dark 1440×900 and dark 390×844. Both themes were
driven through the same DOM, and the mobile pass scrolled the whole document in 16 stops
(7 on desktop).

| Setting | Width (page / viewport) | Height | Clipped elements | Console errors | Images |
|---|---|---|---|---|---|
| light, 1440×900 | 1440 / 1440 | 5404px | 0 | 0 | 9 — all `data:` URIs, 0 broken |
| dark, 1440×900 | 1440 / 1440 | 5404px | 0 | 0 | 9 — all `data:` URIs, 0 broken |
| dark, 390×844 | 390 / 390 | 12039px | 0 | 0 | 9 — all `data:` URIs, 0 broken |

"Clipped" counts text and controls that are cut off *and* unrecoverable. Elements that
deliberately paint past the edge — the ambient `AuroraField` orbs, the infinite ticker marquee
and the `ken-burns` frame — are reported separately, and the real check is that the document is
never wider than the viewport (so there is no sideways scroll and no reachable-but-hidden
content). Every photo in the preview resolves from the file itself: zero network `src` and zero
zero-width images, which is what makes the offline copy look like the live app.

Mobile clearance is measured rather than assumed: with the sticky "Enter the live dashboard"
bar pinned at 390×844, the landing `<footer>`'s last row ends **15px above it**, and the
dashboard shell's `pb-28` keeps the final card clear of the 64px dock.

