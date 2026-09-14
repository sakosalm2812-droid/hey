import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { springs } from "../../../lib/heyMotion";
import {
  Activity,
  Hammer,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  ArrowUpRight,
} from "lucide-react";
import { listAuditEntries } from "../../../core/auditLog.js";
import { subscribe } from "../../../core/eventBus.js";


const ACTION_LABELS = {
  "authorization.decision": "Authorization decision made",
  "permission.granted": "Permission granted",
  "permission.revoked": "Permission revoked",
  "action.executed": "Action executed",
  "tool.executed": "Tool executed",
  "forge.artifact_validated": "Forge artifact validated",
  "forge.artifact_saved": "Forge artifact saved",
  "execution.started": "Execution started",
  "execution.failed": "Execution failed",
  "execution.completed": "Execution completed",
};


function labelFor(action) {
  return ACTION_LABELS[action] || action || "Unknown activity";
}


function timeAgo(date) {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 45) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}


function iconFor(entry) {
  if (entry.status === "denied" || entry.status === "failed") return { icon: XCircle, color: "var(--coral)" };
  if (entry.tool && entry.metadata?.tool) return { icon: Hammer, color: "var(--lavender)" };
  if (entry.action && entry.action.startsWith("permission")) return { icon: ShieldCheck, color: "var(--gold)" };
  if (entry.action && entry.action.startsWith("forge")) return { icon: CheckCircle2, color: "var(--green-accent)" };
  return { icon: CheckCircle2, color: "var(--green-accent)" };
}


export default function ActivityWidget() {
  const [entries, setEntries] = useState(() => listAuditEntries(6));

  useEffect(() => {
    const refresh = () => setEntries(listAuditEntries(6));
    const stop = subscribe("audit.recorded", refresh);
    return stop;
  }, []);

  return (
    <motion.div
      className="glass-card h-full p-6 flex flex-col"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -4, transition: springs.gentle }}
    >
      <div className="flex items-center justify-between">
        <div>
          <div className="badge badge-green mb-3 flex w-fit items-center gap-2">
            <Activity size={14} />
            My Activity
          </div>

          <h2 className="font-heading text-2xl text-[var(--text-primary)]">
            Recent Timeline
          </h2>

          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            Actions recorded for this account.
          </p>
        </div>

        <ArrowUpRight
          size={18}
          color="var(--green-accent)"
        />
      </div>

      <div className="mt-8 flex-1 space-y-4">
        {entries.length === 0 ? (
          <div className="rounded-2xl bg-[var(--bg-secondary)] p-5 text-sm leading-relaxed text-[var(--text-secondary)]">
            Nothing recorded yet. Your actions will show up here once HEY starts taking them.
          </div>
        ) : (
          entries.map((entry) => {
            const { icon: Icon, color } = iconFor(entry);
            const title = labelFor(entry.action);

            return (
              <motion.div
                key={entry.id}
                whileHover={{ x: 4, transition: springs.snappy }}
                className="flex gap-4 rounded-2xl bg-[var(--bg-secondary)] p-4"
              >
                <div
                  className="flex h-11 w-11 items-center justify-center rounded-xl"
                  style={{
                    background: `${color}20`,
                  }}
                >
                  <Icon
                    size={20}
                    color={color}
                  />
                </div>

                <div className="flex-1">
                  <div className="text-[var(--text-primary)]">
                    {title}
                  </div>

                  <div className="mt-1 text-xs text-[var(--text-secondary)]">
                    {timeAgo(entry.createdAt)}
                  </div>
                </div>
              </motion.div>
            );
          })
        )}
      </div>
    </motion.div>
  );
}