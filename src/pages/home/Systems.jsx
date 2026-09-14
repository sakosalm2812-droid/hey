import { motion } from "framer-motion";
import { ArrowUpRight, Hammer, Mic2, Orbit, ShieldCheck } from "lucide-react";
import { springs } from "../../lib/heyMotion";

const systems = [
  { Icon: Orbit, eyebrow: "01 / COSMOS", title: "A memory that has shape.", text: "Ideas, decisions, goals, and patterns connect into a living map instead of disappearing into a chat history.", tone: "violet" },
  { Icon: Hammer, eyebrow: "02 / FORGE", title: "Build intelligence for the work ahead.", text: "Create agents, workflows, and tools that understand the way you think and move.", tone: "peach" },
  { Icon: Mic2, eyebrow: "03 / VOICE", title: "Speak at the speed of thought.", text: "Talk naturally, keep the context, and move from an idea to the next useful action.", tone: "mint" },
  { Icon: ShieldCheck, eyebrow: "04 / TRUST", title: "Power with boundaries.", text: "Permissions, confirmations, receipts, and memory controls keep the system yours.", tone: "blue" },
];

export default function Systems() {
  return (
    <section className="hey-system-section">
      <div className="hey-section-heading">
        <div>
          <span className="hey-landing-kicker">The HEY system</span>
          <h2>Everything connects.</h2>
        </div>
        <div className="hey-section-sub"><p>One intelligence. Many ways to move.</p></div>
      </div>
      <div className="hey-system-grid">
        {systems.map(({ Icon, eyebrow, title, text, tone }, index) => (
          <motion.article
            key={title}
            className={`hey-system-card ${tone}`}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.18 }}
            transition={{ delay: index * 0.08, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            whileHover={{ y: -6, transition: springs.gentle }}
          >
            <div className="hey-system-icon"><Icon size={19} aria-hidden="true" /></div>
            <span className="hey-system-eyebrow">{eyebrow}</span>
            <h3>{title}</h3>
            <p>{text}</p>
            <ArrowUpRight size={17} className="hey-system-arrow" aria-hidden="true" />
          </motion.article>
        ))}
      </div>
    </section>
  );
}