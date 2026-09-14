const QURAN_LIST_KEY = "hey_quran_surahs";
const QURAN_SURAH_KEY = (n) => `hey_quran_surah_${n}`;
const HADITH_KEY = (collection, number) => `hey_hadith_${collection}_${number}`;

const QURAN_API = "https://api.alquran.cloud/v1";
const HADITH_API = "https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions";

export const QURAN_TRANSLATION = "en.asad";

export const HADITH_COLLECTIONS = [
  { slug: "eng-bukhari", label: "Sahih al-Bukhari", max: 7563 },
  { slug: "eng-muslim", label: "Sahih Muslim", max: 7563 },
  { slug: "eng-abudawud", label: "Sunan Abi Dawud", max: 5274 },
  { slug: "eng-tirmidhi", label: "Jami at-Tirmidhi", max: 3956 },
  { slug: "eng-nasai", label: "Sunan an-Nasai", max: 5758 },
  { slug: "eng-ibnmajah", label: "Sunan Ibn Majah", max: 4341 },
  { slug: "eng-malik", label: "Muwatta Malik", max: 1861 },
];

export function cacheGet(key, ttlSeconds) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.ts || !("data" in parsed)) return null;
    const age = (Date.now() - parsed.ts) / 1000;
    if (age > ttlSeconds) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

export function cacheSet(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }));
  } catch {
    /* storage unavailable */
  }
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchSurahList() {
  const cached = cacheGet(QURAN_LIST_KEY, 30 * 24 * 60 * 60);
  if (cached) return cached;
  const payload = await fetchJson(`${QURAN_API}/surah`);
  const surahs = payload?.data;
  if (!Array.isArray(surahs)) throw new Error("Could not load the surah list.");
  cacheSet(QURAN_LIST_KEY, surahs);
  return surahs;
}

export async function fetchSurahContent(number) {
  const key = QURAN_SURAH_KEY(number);
  const cached = cacheGet(key, 60 * 24 * 60 * 60);
  if (cached) return cached;
  const [arabic, translation] = await Promise.all([
    fetchJson(`${QURAN_API}/surah/${number}/quran-uthmani`),
    fetchJson(`${QURAN_API}/surah/${number}/${QURAN_TRANSLATION}`),
  ]);
  const arabicAyahs = arabic?.data?.ayahs || [];
  const englishAyahs = translation?.data?.ayahs || [];
  const ayahs = arabicAyahs.map((ayah, index) => ({
    number: ayah.numberInSurah,
    arabic: ayah.text,
    english: englishAyahs[index]?.text || "",
  }));
  const result = { meta: arabic?.data || translation?.data || null, ayahs };
  cacheSet(key, result);
  return result;
}

export async function fetchHadith(collection, number) {
  const key = HADITH_KEY(collection, number);
  const cached = cacheGet(key, 365 * 24 * 60 * 60);
  if (cached) return cached;
  const payload = await fetchJson(`${HADITH_API}/${collection}/${number}.json`);
  if (!payload?.hadiths?.[0]) throw new Error("That hadith could not be found.");
  const hadith = payload.hadiths[0];
  const result = {
    number: hadith.hadithnumber,
    text: hadith.text,
    grades: Array.isArray(hadith.grades) ? hadith.grades : [],
    reference: hadith.reference || null,
    book: hadith.book || null,
    chapter: hadith.chapter || null,
  };
  cacheSet(key, result);
  return result;
}

export async function fetchRandomHadith(collection, max) {
  let lastError;
  for (let attempt = 0; attempt < 7; attempt += 1) {
    const number = 1 + Math.floor(Math.random() * max);
    try {
      return await fetchHadith(collection, number);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("No hadith found.");
}

export default {
  QURAN_TRANSLATION,
  HADITH_COLLECTIONS,
  cacheGet,
  cacheSet,
  fetchSurahList,
  fetchSurahContent,
  fetchHadith,
  fetchRandomHadith,
};