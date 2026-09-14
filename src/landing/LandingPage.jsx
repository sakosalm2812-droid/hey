import LivingWorld from "./background/LivingWorld";

import HeroSection from "./sections/HeroSection";
import WorldSection from "./sections/WorldSection";
import CosmosSection from "./sections/CosmosSection";
import ForgeSection from "./sections/ForgeSection";
import AgentsSection from "./sections/AgentsSection";
import VoiceSection from "./sections/VoiceSection";
import PricingSection from "./sections/PricingSection";
import FinalCTA from "./sections/FinalCTA";


export default function LandingPage(){

  return (

    <div

      style={{
        minHeight:"100vh",
        background:"#020508",
        color:"var(--text-primary)",
        overflow:"hidden",
        position:"relative",
      }}

    >


      <LivingWorld />


      <main
        style={{
          position:"relative",
          zIndex:1,
        }}
      >

        <HeroSection />

        <WorldSection />

        <CosmosSection />

        <ForgeSection />

        <AgentsSection />

        <VoiceSection />

        <PricingSection />

        <FinalCTA />

      </main>


    </div>

  );

}