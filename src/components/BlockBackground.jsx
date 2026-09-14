import { useState, useEffect } from "react";

const STORAGE_KEY = "hey_block_bg";
const EVENT_NAME = "hey-block-bg-change";

const TEMPLATES = {
  none: { label: "None", blocks: [] },

  cubes: {
    label: "Soft",
    blocks: [
      { x: 12, y: 22, size: "s" },
      { x: 78, y: 16, size: "l" },
      { x: 30, y: 64, size: "l" },
      { x: 86, y: 70, size: "s" },
      { x: 56, y: 42, size: "s" },
    ],
  },

  steps: {
    label: "Float",
    blocks: [
      { x: 10, y: 30, size: "s" },
      { x: 66, y: 12, size: "l" },
      { x: 40, y: 34, size: "s" },
      { x: 26, y: 78, size: "l" },
      { x: 82, y: 56, size: "s" },
      { x: 60, y: 84, size: "s" },
    ],
  },

  layers: {
    label: "Sparse",
    blocks: [
      { x: 18, y: 18, size: "l" },
      { x: 74, y: 40, size: "s" },
      { x: 88, y: 12, size: "s" },
      { x: 40, y: 72, size: "l" },
    ],
  },

  scatter: {
    label: "Scatter",
    blocks: [
      { x: 8, y: 55, size: "s" },
      { x: 22, y: 12, size: "s" },
      { x: 52, y: 8, size: "s" },
      { x: 36, y: 40, size: "l" },
      { x: 80, y: 28, size: "s" },
      { x: 92, y: 78, size: "s" },
      { x: 60, y: 62, size: "s" },
      { x: 14, y: 84, size: "l" },
    ],
  },

  brick: {
    label: "Grid",
    blocks: [
      { x: 50, y: 18, size: "l" },
      { x: 18, y: 44, size: "s" },
      { x: 82, y: 42, size: "s" },
      { x: 38, y: 88, size: "l" },
      { x: 72, y: 76, size: "s" },
    ],
  },

  peak: {
    label: "Tall",
    blocks: [
      { x: 24, y: 26, size: "l" },
      { x: 68, y: 60, size: "l" },
      { x: 48, y: 8, size: "s" },
      { x: 88, y: 88, size: "s" },
      { x: 6, y: 90, size: "s" },
      { x: 58, y: 40, size: "s" },
    ],
  },

  mono: {
    label: "Mono",
    blocks: [
      { x: 12, y: 12, size: "l" },
      { x: 70, y: 8, size: "s" },
      { x: 34, y: 30, size: "s" },
      { x: 12, y: 62, size: "s" },
      { x: 60, y: 44, size: "l" },
      { x: 88, y: 60, size: "s" },
      { x: 44, y: 76, size: "l" },
      { x: 78, y: 88, size: "s" },
      { x: 24, y: 92, size: "s" },
    ],
  },
};

const TEMPLATE_IDS = Object.keys(TEMPLATES);


function readTemplate() {
  if (typeof window === "undefined") return "cubes";
  return localStorage.getItem(STORAGE_KEY) || "cubes";
}


export default function BlockBackground() {
  const [templateId, setTemplateId] = useState(readTemplate);

  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        setTemplateId(e.newValue);
      }
    };

    const onCustom = (e) => {
      if (e.detail) setTemplateId(e.detail);
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener(EVENT_NAME, onCustom);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(EVENT_NAME, onCustom);
    };
  }, []);

  const config = TEMPLATES[templateId] || TEMPLATES.none;

  if (!config.blocks.length) return null;

  return (
    <div className="hey-blocks-bg" aria-hidden="true">
      {config.blocks.map((block, index) => (
        <span
          key={index}
          className={`hey-block hey-block-${block.size}`}
          style={{
            left: `${block.x}%`,
            top: `${block.y}%`,
          }}
        />
      ))}
    </div>
  );
}


// eslint-disable-next-line react-refresh/only-export-components
export function setBlockTemplate(id) {
  if (!TEMPLATES[id]) return;
  localStorage.setItem(STORAGE_KEY, id);
  window.dispatchEvent(
    new CustomEvent(EVENT_NAME, { detail: id })
  );
}


// eslint-disable-next-line react-refresh/only-export-components
export function getBlockTemplates() {
  return TEMPLATE_IDS.map((id) => ({
    id,
    label: TEMPLATES[id].label,
  }));
}


export { STORAGE_KEY as BLOCK_BG_KEY };