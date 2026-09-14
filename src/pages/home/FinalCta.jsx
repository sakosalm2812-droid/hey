import { ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import LandingButton from "./Button.jsx";

export default function FinalCta() {
  const navigate = useNavigate();

  return (
    <section className="hey-landing-final">
      <div>
        <span className="hey-landing-kicker">Your next chapter is already moving</span>
        <h2>Start with <em>one thought.</em></h2>
        <p>HEY will help you find the thread.</p>
      </div>
      <LandingButton onClick={() => navigate("/signup")}>
        Enter HEY <ArrowRight size={16} />
      </LandingButton>
    </section>
  );
}