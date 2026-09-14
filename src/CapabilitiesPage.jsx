import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, Layers3, Search, Sparkles } from "lucide-react";

import Sidebar from "./Sidebar";
import PageHeader from "./components/layout/PageHeader";
import { FEATURE_CATEGORIES, HEY_FEATURES } from "./core/featureCatalog.js";

export default function CapabilitiesPage() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const filteredFeatures = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return HEY_FEATURES.filter((feature) => {
      const matchesCategory = category === "All" || feature.category === category;
      const matchesQuery = !normalizedQuery || `${feature.name} ${feature.description} ${feature.category}`.toLowerCase().includes(normalizedQuery);
      return matchesCategory && matchesQuery;
    });
  }, [category, query]);

  return (
    <div className="page-with-sidebar">
      <Sidebar />
      <main className="page-content">
        <motion.div className="px-8 py-8" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}>
          <PageHeader title="HEY Capabilities" subtitle="The complete product map, with implementation state shown on every capability." />

          <section className="glass-card hey-capabilities-hero p-8">
            <div>
              <span className="section-label"><Sparkles size={14} /> The HEY universe</span>
              <h1>One system.<br /><em>100 systems mapped.</em></h1>
              <p>Mapped means specified in the product plan. Each card separately shows whether its current source foundation is active or still expanding.</p>
            </div>
            <div className="hey-capability-count"><strong>{HEY_FEATURES.length}</strong><span>capabilities mapped</span></div>
          </section>

          <div className="hey-capability-toolbar">
            <label className="hey-capability-search">
              <Search size={16} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search HEY capabilities" aria-label="Search HEY capabilities" />
            </label>
            <select className="hey-input" value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Filter capabilities by category">
              <option value="All">All systems</option>
              {FEATURE_CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>

          <div className="hey-capability-grid">
            {filteredFeatures.map((feature, index) => (
              <motion.article key={feature.id} className="glass-card hey-capability-card" initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .12 }} transition={{ delay: Math.min(index * .015, .2) }}>
                <div className="hey-capability-card-top"><span>{feature.id}</span>{feature.status === "active" ? <CheckCircle2 size={16} className="hey-capability-active" /> : <Layers3 size={16} />}</div>
                <span className="badge badge-lavender">{feature.category}</span>
                <h2>{feature.name}</h2>
                <p>{feature.description}</p>
                <div className={feature.status === "active" ? "hey-capability-status active" : "hey-capability-status"}>{feature.status === "active" ? "Active source foundation" : "Planned or expanding"}</div>
              </motion.article>
            ))}
          </div>
        </motion.div>
      </main>
    </div>
  );
}
