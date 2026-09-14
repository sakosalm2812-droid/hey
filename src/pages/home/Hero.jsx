import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { durations } from "../../lib/heyMotion";
import LandingButton from "./Button.jsx";

const entrance = (delay) => ({
  initial: { opacity: 0, y: 28 },
  animate: { opacity: 1, y: 0 },
  transition: { delay, duration: durations.flow, ease: [0.22, 1, 0.36, 1] },
});

export default function Hero() {
  const navigate = useNavigate();

  return (
    <section className="hey-landing-hero">
      <div className="hey-landing-hero-content">
        <motion.p className="hey-landing-eyebrow" {...entrance(0)}>
          Personal intelligence system
        </motion.p>

        <motion.h1 {...entrance(0.12)}>
          Your life,
          <br />
          <em>with an intelligence layer.</em>
        </motion.h1>

        <motion.p className="hey-landing-hero-tag" {...entrance(0.26)}>
          HEY holds memory, voice, and creation in one calm system — so the distance between a thought and the next
          move gets small.
        </motion.p>

        <motion.div className="hey-landing-actions" {...entrance(0.4)}>
          <LandingButton onClick={() => navigate("/signup")}>
            Enter HEY <ArrowRight size={16} />
          </LandingButton>
          <LandingButton secondary onClick={() => navigate("/features")}>
            See how it works
          </LandingButton>
        </motion.div>
      </div>
    </section>
  );
}