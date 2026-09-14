import { writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "public");
const outFile = path.join(outDir, "sitemap.xml");

const publicRoutes = [
  "",
  "features",
  "voice",
  "customization",
  "pricing",
  "privacy",
  "terms",
];

const siteUrl = (process.env.SITE_URL || "").trim().replace(/\/+$/, "");
const today = new Date().toISOString().slice(0, 10);

if (!siteUrl) {
  console.log("sitemap generation skipped (set SITE_URL to an absolute https URL to enable)");
  process.exit(0);
}

if (!/^https:\/\/[^\s/]+$/.test(siteUrl)) {
  console.error("SITE_URL must be an absolute https URL, for example https://hey.app");
  process.exit(1);
}

const urls = publicRoutes
  .map((route) => {
    const loc = `${siteUrl}/${route}`;
    return `  <url>\n    <loc>${loc}</loc>\n    <changefreq>${route === "" ? "weekly" : "monthly"}</changefreq>\n    <lastmod>${today}</lastmod>\n    <priority>${route === "" ? "1.0" : "0.7"}</priority>\n  </url>`;
  })
  .join("\n");

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;

await mkdir(outDir, { recursive: true });
await writeFile(outFile, sitemap, "utf8");
console.log(`wrote ${outFile}`);