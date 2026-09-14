import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { springs, press } from "../lib/heyMotion";
import { buzz } from "../lib/heyFeedback";
import { BookMarked, Dices, Moon, RefreshCw } from "lucide-react";
import {
  HADITH_COLLECTIONS,
  fetchHadith,
  fetchRandomHadith,
  fetchSurahContent,
  fetchSurahList,
} from "../lib/heyDeen.js";

const TABS = [
  { id: "quran", label: "Quran", icon: BookMarked },
  { id: "hadith", label: "Hadith", icon: Dices },
];

function DeenCard({ children }) {
  return (
    <motion.div
      className="glass-card h-full p-6 flex flex-col"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

function LoadingRow({ message }) {
  return (
    <div className="flex items-center gap-3 text-sm text-[var(--text-secondary)]">
      <RefreshCw size={16} className="hey-spin" />
      {message}
    </div>
  );
}

export default function DeenPage() {
  const [tab, setTab] = useState("quran");

  return (
    <div className="hey-page-stack">
      <motion.header
        initial={{ opacity: 0, y: 22 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="badge mb-3 flex w-fit items-center gap-2" style={{ color: "var(--gold)" }}>
          <Moon size={14} />
          Deen & Study
        </div>
        <h1 className="font-heading text-4xl">Quran & Hadith,<br />with care and context.</h1>
        <p className="mt-3 max-w-xl text-sm text-[var(--text-secondary)]">
          Read the Qur'an with translation, browse authentic hadith collections, and study with
          source verification in mind. HEY remains a tool, not a scholar: always confirm with
          qualified religious authority.
        </p>
      </motion.header>

      <div className="flex gap-2">
        {TABS.map(({ id, label, icon: Icon }) => (
          <motion.button
            key={id}
            type="button"
            className={tab === id ? "hey-btn-primary flex items-center gap-2" : "hey-btn-ghost flex items-center gap-2"}
            onClick={() => setTab(id)}
            onPointerDown={() => buzz("light")}
            whileHover={{ scale: 1.02, transition: springs.snappy }}
            whileTap={{ scale: 0.97, transition: press }}
          >
            <Icon size={15} />
            {label}
          </motion.button>
        ))}
      </div>

      {tab === "quran" ? <QuranTab /> : <HadithTab />}
    </div>
  );
}

function QuranTab() {
  const [surahs, setSurahs] = useState([]);
  const [selected, setSelected] = useState(1);
  const [content, setContent] = useState(null);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    fetchSurahList()
      .then((list) => {
        if (!mounted) return;
        setSurahs(list);
        setStatus("loading");
        return fetchSurahContent(selected).then((result) => {
          if (!mounted) return;
          setContent(result);
          setStatus("ready");
        });
      })
      .catch(() => {
        if (!mounted) return;
        setError("The surah list needs a connection. Check your network and try again.");
        setStatus("error");
      });
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback((number) => {
    setStatus("loading");
    setError("");
    fetchSurahContent(number)
      .then((result) => {
        setContent(result);
        setStatus("ready");
      })
      .catch(() => {
        setError("That surah could not be loaded. Try again when you are online.");
        setStatus("error");
      });
  }, []);

  const meta = useMemo(() => {
    if (!content?.meta) return null;
    return {
      name: content.meta.name,
      englishName: content.meta.englishName,
      translation: content.meta.englishNameTranslation,
      revelationType: content.meta.revelationType,
      numberOfAyahs: content.meta.numberOfAyahs,
    };
  }, [content]);

  function pickRandom() {
    const number = 1 + Math.floor(Math.random() * 114);
    setSelected(number);
    load(number);
  }

  function step(delta) {
    const next = Math.min(114, Math.max(1, selected + delta));
    setSelected(next);
    load(next);
  }

  return (
    <DeenCard>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selected}
            onChange={(event) => {
              setSelected(Number(event.target.value));
              load(Number(event.target.value));
            }}
            aria-label="Choose a surah"
            className="hey-input !h-9 !w-auto text-sm px-3 py-1"
          >
            {surahs.map((surah) => (
              <option key={surah.number} value={surah.number}>
                {surah.number}. {surah.englishName}
              </option>
            ))}
          </select>
          <motion.button
            type="button"
            className="hey-btn-ghost flex items-center gap-2"
            onClick={pickRandom}
            onPointerDown={() => buzz("light")}
            whileHover={{ scale: 1.02, transition: springs.snappy }}
            whileTap={{ scale: 0.97, transition: press }}
          >
            <Dices size={15} />
            Random surah
          </motion.button>
        </div>
        <div className="flex gap-2">
          <motion.button
            type="button"
            className="hey-btn-ghost"
            onClick={() => step(-1)}
            disabled={selected <= 1}
            onPointerDown={() => buzz("light")}
            whileHover={{ scale: 1.02, transition: springs.snappy }}
            whileTap={{ scale: 0.97, transition: press }}
          >
            Previous
          </motion.button>
          <motion.button
            type="button"
            className="hey-btn-ghost"
            onClick={() => step(1)}
            disabled={selected >= 114}
            onPointerDown={() => buzz("light")}
            whileHover={{ scale: 1.02, transition: springs.snappy }}
            whileTap={{ scale: 0.97, transition: press }}
          >
            Next
          </motion.button>
        </div>
      </div>

      {meta && (
        <div className="mt-6 rounded-2xl px-5 py-4" style={{ background: "color-mix(in srgb, var(--gold) 10%, transparent)" }}>
          <h2 className="font-heading text-2xl" style={{ color: "var(--gold)" }}>
            {meta.englishName}
            <span className="ml-2 text-lg text-[var(--text-secondary)]">{meta.translation}</span>
          </h2>
          <div className="mt-1 text-xs uppercase tracking-wider text-[var(--text-secondary)]">
            {meta.revelationType} · {meta.numberOfAyahs} ayahs
          </div>
        </div>
      )}

      <div className="mt-6 flex-1 overflow-y-auto" style={{ maxHeight: "60vh" }}>
        {status === "loading" && <LoadingRow message="Loading surah…" />}
        {status === "error" && (
          <div className="text-sm text-[var(--text-secondary)]">
            <p>{error}</p>
            <button
              type="button"
              className="hey-btn-ghost mt-3"
              onClick={() => load(selected)}
            >
              Retry
            </button>
          </div>
        )}
        {status === "ready" && content?.ayahs?.map((ayah) => (
          <div key={ayah.number} className="hey-deen-ayah">
            <p lang="ar" dir="rtl" className="hey-deen-arabic">{ayah.arabic}</p>
            {ayah.english && <p className="hey-deen-english">{ayah.number}. {ayah.english}</p>}
          </div>
        ))}
      </div>

      <p className="mt-4 text-xs leading-relaxed text-[var(--text-secondary)]">
        Uthmani script and the Muhammad Asad translation (cached offline). Meanings vary between
        scholars; treat translations as guides, not substitutes for qualified tafsir.
      </p>
    </DeenCard>
  );
}

function HadithTab() {
  const [collection, setCollection] = useState(HADITH_COLLECTIONS[0].slug);
  const [number, setNumber] = useState("");
  const [hadith, setHadith] = useState(null);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");

  const activeCollection = HADITH_COLLECTIONS.find((c) => c.slug === collection) || HADITH_COLLECTIONS[0];

  function load(numberValue) {
    setStatus("loading");
    setError("");
    fetchHadith(collection, numberValue)
      .then((result) => {
        setHadith(result);
        setStatus("ready");
      })
      .catch(() => {
        if (!hadith) setError("That hadith could not be found. Choose another number or try a random one.");
        setStatus(hadith ? "ready" : "error");
      });
  }

  function random() {
    setNumber("");
    setStatus("loading");
    setError("");
    fetchRandomHadith(collection, activeCollection.max)
      .then((result) => {
        setHadith(result);
        setStatus("ready");
      })
      .catch(() => {
        setError("No hadith could be loaded right now. Check your connection.");
        setStatus("error");
      });
  }

  function submit(event) {
    event.preventDefault();
    const value = Number(number);
    if (!value || value < 1) return;
    load(value);
  }

  return (
    <DeenCard>
      <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="hadith-collection" className="text-xs uppercase tracking-wider text-[var(--text-secondary)]">
            Collection
          </label>
          <select
            id="hadith-collection"
            value={collection}
            onChange={(event) => {
              setCollection(event.target.value);
              setHadith(null);
            }}
            className="hey-input !h-9 !w-auto text-sm px-3 py-1"
          >
            {HADITH_COLLECTIONS.map((item) => (
              <option key={item.slug} value={item.slug}>{item.label}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="hadith-number" className="text-xs uppercase tracking-wider text-[var(--text-secondary)]">
            Hadith number
          </label>
          <input
            id="hadith-number"
            type="number"
            min="1"
            value={number}
            onChange={(event) => setNumber(event.target.value)}
            placeholder={`1–${activeCollection.max}`}
            className="hey-input !h-9 !w-40 text-sm px-3 py-1"
          />
        </div>
        <motion.button
          type="submit"
          className="hey-btn-primary"
          disabled={!number}
          onPointerDown={() => buzz("light")}
          whileHover={{ scale: 1.02, transition: springs.snappy }}
          whileTap={{ scale: 0.97, transition: press }}
        >
          Load hadith
        </motion.button>
        <motion.button
          type="button"
          className="hey-btn-ghost flex items-center gap-2"
          onClick={random}
          onPointerDown={() => buzz("light")}
          whileHover={{ scale: 1.02, transition: springs.snappy }}
          whileTap={{ scale: 0.97, transition: press }}
        >
          <Dices size={15} />
          Random hadith
        </motion.button>
      </form>

      <div className="mt-6 flex-1">
        {status === "loading" && <LoadingRow message="Loading hadith…" />}
        {status === "error" && (
          <div className="text-sm text-[var(--text-secondary)]">
            <p>{error}</p>
          </div>
        )}
        {status === "ready" && hadith && (
          <div className="hey-deen-ayah">
            <p className="text-base leading-relaxed">{hadith.text}</p>
            <p className="mt-3 text-xs uppercase tracking-wider text-[var(--text-secondary)]">
              {activeCollection.label} · Hadith {hadith.number}
            </p>
            {hadith.book && (
              <p className="text-xs text-[var(--text-secondary)]">Book: {hadith.book}</p>
            )}
            {hadith.grades.length > 0 && (
              <div className="mt-2 flex flex-col gap-1 text-xs text-[var(--text-secondary)]">
                {hadith.grades.map((grade) => (
                  <span key={`${grade.name}-${grade.grade}`}>
                    {grade.name}: {grade.grade}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
        {status === "idle" && (
          <p className="text-sm text-[var(--text-secondary)]">
            Pick a collection and a hadith number, or jump straight to a random narrated hadith.
          </p>
        )}
      </div>

      <p className="mt-4 text-xs leading-relaxed text-[var(--text-secondary)]">
        Texts come from the open hadith-api archive and are cached offline. Grades shown are from
        the source's scholars; authentication (sahih/da'if) should always be cross-checked with
        qualified religious authority.
      </p>
    </DeenCard>
  );
}