// The ambient layer behind every page: three slowly drifting gradient orbs,
// a masked grid, and a vignette. Pure decoration — aria-hidden, pointer-events
// none, and cheap enough to leave mounted for the whole session.
export default function AuroraField() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-surface" />
      <div className="absolute inset-0 bg-aurora opacity-80" />
      <div className="absolute inset-x-0 top-0 h-[520px] grid-backdrop opacity-[0.35]" />

      <div className="absolute -left-32 -top-40 h-[440px] w-[440px] animate-drift rounded-full bg-primary/25 blur-[110px]" />
      <div
        className="absolute -right-32 top-10 h-[380px] w-[380px] animate-drift rounded-full bg-tertiary/20 blur-[120px]"
        style={{ animationDelay: '-8s', animationDuration: '30s' }}
      />
      <div
        className="absolute bottom-[-160px] left-1/3 h-[420px] w-[420px] animate-float rounded-full bg-primary-fixed/20 blur-[130px]"
        style={{ animationDelay: '-4s' }}
      />
    </div>
  );
}
