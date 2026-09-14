import { motion } from "framer-motion";
import { RefreshCw } from "lucide-react";
import { usePullToRefresh } from "../../hooks/usePullToRefresh.js";

export default function PullToRefresh({ onRefresh, children, className = "" }) {
  const { containerRef, pullDistance, refreshing, progress, handlers } = usePullToRefresh(onRefresh);

  return (
    <motion.div
      ref={containerRef}
      className={className}
      style={{
        position: "relative",
        minHeight: "100%",
        overflowX: "hidden",
      }}
      {...handlers}
    >
      <motion.div
        aria-hidden={refreshing || pullDistance === 0}
        style={{
          position: "sticky",
          top: 0,
          height: refreshing ? 44 : pullDistance,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          pointerEvents: "none",
        }}
      >
        <motion.div
          animate={{ rotate: refreshing ? 360 : 0 }}
          transition={{ duration: 0.7, repeat: refreshing ? Infinity : 0, ease: "linear" }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 12,
            color: "var(--text-secondary)",
            opacity: Math.max(progress, refreshing ? 1 : 0),
          }}
        >
          <RefreshCw size={16} />
          {refreshing ? "Syncing..." : "Release to refresh"}
        </motion.div>
      </motion.div>
      {children}
    </motion.div>
  );
}