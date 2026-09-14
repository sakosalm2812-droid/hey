import { motion } from "framer-motion";

const defaultTone = {
  bg: "rgba(142, 216, 255, 0.08)",
  fg: "var(--accent-cyan)",
  border: "rgba(142, 216, 255, 0.28)",
};

function getProps(props) {
  return { ...defaultTone, ...props };
}

function StateFrame({ icon, title, body, action, tone, testId }) {
  const t = getProps(tone);
  return (
    <motion.div
      data-testid={testId}
      className="hey-state"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
    >
      <div className="hey-state-icon" style={{ color: t.fg, background: t.bg, borderColor: t.border }}>
        {icon}
      </div>
      {title ? <h3 className="hey-state-title" style={{ color: t.fg }}>{title}</h3> : null}
      {body ? <p className="hey-state-body">{body}</p> : null}
      {action ? <div className="hey-state-action">{action}</div> : null}
    </motion.div>
  );
}

export function EmptyState(props) {
  return <StateFrame {...props} testId="hey-state-empty" />;
}

export function ErrorState(props) {
  const t = getProps(props.tone);
  const tone = { ...t, fg: t.fg === defaultTone.fg ? "var(--coral, #ff6b6b)" : t.fg, bg: t.bg, border: t.border };
  return <StateFrame {...props} tone={tone} testId="hey-state-error" />;
}

export function PermissionDenied(props) {
  const t = getProps(props.tone);
  const tone = { ...t, fg: "#ffb86b", bg: "rgba(255, 184, 107, 0.08)", border: "rgba(255, 184, 107, 0.28)" };
  return <StateFrame {...props} tone={tone} testId="hey-state-permission" />;
}

export function Skeleton({ lines = 3, glass = false }) {
  return (
    <div className="hey-skeleton" data-testid="hey-skeleton" aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className={`hey-skeleton-line ${i === lines - 1 ? "short" : ""} ${glass ? "glass" : ""}`} />
      ))}
    </div>
  );
}

export function LoadingState({ label = "Loading" }) {
  return (
    <div className="hey-state-loading" data-testid="hey-state-loading">
      <div className="hey-spinner" aria-hidden="true" />
      <p className="hey-state-loading-label">{label}</p>
    </div>
  );
}

export function OfflineCard({ children, compact = false }) {
  return (
    <div className={`hey-offline-card ${compact ? "compact" : ""}`} data-testid="hey-state-offline">
      <p className="hey-offline-card-title">You are offline</p>
      <p className="hey-offline-card-body">{children || "This will refresh automatically when you are back online."}</p>
    </div>
  );
}