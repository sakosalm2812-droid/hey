import { motion } from "framer-motion";

export default function DashboardGrid({ children }) {
  return (
    <motion.div
      className="grid w-full gap-6 auto-rows-[170px]"
      style={{
        gridTemplateColumns: "repeat(12, minmax(0, 1fr))",
      }}
      initial="hidden"
      animate="show"
      variants={{
        hidden: {},
        show: {
          transition: {
            staggerChildren: 0.08,
          },
        },
      }}
    >
      {children}
    </motion.div>
  );
}

export function GridItem({
  children,
  col = 3,
  row = 1,
  className = "",
}) {
  return (
    <motion.div
      variants={{
        hidden: {
          opacity: 0,
          y: 20,
        },
        show: {
          opacity: 1,
          y: 0,
          transition: {
            duration: 0.5,
          },
        },
      }}
      whileHover={{
        y: -4,
        transition: {
          duration: 0.25,
        },
      }}
      className={className}
      style={{
        gridColumn: `span ${col}`,
        gridRow: `span ${row}`,
        minHeight: 0,
      }}
    >
      {children}
    </motion.div>
  );
}