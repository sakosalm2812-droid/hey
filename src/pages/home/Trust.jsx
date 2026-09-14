import { motion } from "framer-motion";
import { ClipboardList, Map, ShieldCheck } from "lucide-react";

const items = [
  { Icon: ShieldCheck, title: "You approve the moves", text: "Terminal, input, and file-deletion actions ask before they run. Critical moves can never run silently." },
  { Icon: ClipboardList, title: "Every action leaves a receipt", text: "HEY keeps an audit trail behind your workspace: what ran, what it touched, and when." },
  { Icon: Map, title: "The map is the memory", text: "See memory, connect context, and prune what you don't want kept. Nothing accumulates by accident." },
];

export default function Trust() {
  return (
    <section className="hey-trust">
      <div className="hey-section-heading">
        <div>
          <span className="hey-landing-kicker">Can you trust it</span>
          <h2>Power with boundaries.</h2>
        </div>
        <div className="hey-section-sub"><p>HEY behaves the way a tool should: visible, askable, reversible.</p></div>
      </div>

      <div className="hey-trust-grid">
        {items.map(({ Icon, title, text }, index) => (
          <motion.article
            key={title}
            className="hey-trust-card"
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ delay: index * 0.1, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          >
            <Icon size={22} aria-hidden="true" />
            <strong>{title}</strong>
            <p>{text}</p>
          </motion.article>
        ))}
      </div>

      <motion.div
        className="hey-trust-banner"
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.5 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      >
        <strong>What HEY can't do yet, it says.</strong>
        <span>Capabilities are registered and reported honestly — no phantom features, no invented services.</span>
      </motion.div>
    </section>
  );
}