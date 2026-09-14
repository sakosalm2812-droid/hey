import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import LandingButton from "./Button.jsx";

export default function Pricing() {
  const navigate = useNavigate();

  return (
    <section className="hey-pricing">
      <div className="hey-section-heading">
        <div>
          <span className="hey-landing-kicker">Pricing</span>
          <h2>Free to begin.</h2>
        </div>
        <div className="hey-section-sub"><p>No trials that trap you. Start free; paid plans arrive with secure billing.</p></div>
      </div>

      <motion.div
        className="hey-pricing-plans"
        initial={{ opacity: 0, y: 26 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.3 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="hey-pricing-card">
          <div className="hey-pricing-row">
            <div className="hey-pricing-price">
              <strong>Free</strong>
              <span>$0 / month</span>
            </div>
            <LandingButton onClick={() => navigate("/signup")}>
              Create free account <ArrowRight size={16} />
            </LandingButton>
          </div>
          <p>The complete personal system for one person — memory, agents, voice, and privacy built in.</p>
          <p className="hey-pricing-note">Pro and team tiers will appear here once secure billing is configured. Nothing is throttled before then.</p>
        </div>
      </motion.div>
    </section>
  );
}