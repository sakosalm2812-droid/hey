/** Shared primitives for HEY mode workbenches. */
export function Panel({ label, children, right }) {
  return (
    <section className="glass-card p-5" style={{ borderColor: "rgba(255,255,255,.08)" }}>
      <div className="mb-4 flex items-center justify-between">
        <span className="text-xs uppercase tracking-widest text-[var(--text-muted)]">{label}</span>
        {right}
      </div>
      {children}
    </section>
  );
}

export function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] uppercase tracking-widest text-[var(--text-muted)]">{label}</span>
      {children}
    </label>
  );
}

export function Stat({ label, value, tone }) {
  return (
    <div className="rounded-2xl border border-[rgba(255,255,255,.08)] px-4 py-3">
      <div className="text-[11px] uppercase tracking-widest text-[var(--text-muted)]">{label}</div>
      <div className="mt-1 text-2xl font-semibold" style={{ color: tone || "var(--text-primary)" }}>{value}</div>
    </div>
  );
}

export function Tag({ children, tone }) {
  const colors = {
    gold: "rgba(247,201,111,.14)",
    coral: "rgba(255,122,138,.14)",
    green: "rgba(124,184,124,.14)",
    lavender: "rgba(201,212,224,.14)",
  };
  return (
    <span
      className="rounded-full px-3 py-1 text-[11px]"
      style={{ background: colors[tone] || colors.lavender, color: tone === "coral" ? "var(--coral)" : tone === "green" ? "var(--green-accent)" : tone === "gold" ? "var(--gold)" : "var(--lavender)" }}
    >
      {children}
    </span>
  );
}

export function Empty({ children }) {
  return (
    <div className="rounded-2xl border border-dashed border-[rgba(255,255,255,.14)] p-6 text-center text-sm text-[var(--text-muted)]">
      {children}
    </div>
  );
}

export function SmallButton({ children, onClick, kind = "ghost", style }) {
  return (
    <button
      type="button"
      className={kind === "primary" ? "hey-btn-primary" : "hey-btn-ghost"}
      onClick={onClick}
      style={{ minHeight: 34, padding: "6px 13px", fontSize: 12, ...style }}
    >
      {children}
    </button>
  );
}