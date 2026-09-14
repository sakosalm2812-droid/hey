import { getSetting, setSetting } from "./settingsRegistry.js";

const CALCULATION_METHODS = Object.freeze({
  MUSLIM_WORLD_LEAGUE: "muslim_world_league",
  EGYPTIAN: "egyptian",
  KARACHI: "karachi",
  UMM_AL_QURA: "umm_al_qura",
  DUBAI: "dubai",
  MOONSIGHTING_COMMITTEE: "moonsighting_committee",
  NORTH_AMERICA: "north_america",
  KUWAIT: "kuwait",
  QATAR: "qatar",
  SINGAPORE: "singapore",
  TEHRAN: "tehran",
  GULF: "gulf",
});

const PRAYER_NAMES = Object.freeze({
  FAJR: "fajr",
  SUNRISE: "sunrise",
  DHUHR: "dhuhr",
  ASR: "asr",
  MAGHRIB: "maghrib",
  ISHA: "isha",
});

const QURAN_RECITERS = Object.freeze({
  AL_AFASY: "ar.alafasy",
  ABDUL_BASIT: "ar.abdulbasit",
  MISHRARY: "ar.mishrary",
  SUDAIS: "ar.sudais",
  SHURAIM: "ar.shuraym",
});

const HADITH_COLLECTIONS = Object.freeze({
  BUKHARI: "bukhari",
  MUSLIM: "muslim",
  ABU_DAWOOD: "abu_dawood",
  TIRMIDHI: "tirmidhi",
  NASAI: "nasai",
  IBN_MAJAH: "ibn_majah",
  MUWATTA: "muwatta",
  AHMAD: "ahmad",
});

const CALENDAR_METHODS = Object.freeze({
  UMM_AL_QURA: "umm_al_qura",
  EGYPTIAN: "egyptian",
  ISLAMIC_SOCIETY_NORTH_AMERICA: "islamic_society_north_america",
  TURKEY: "turkey",
  SAUDI_UMM_AL_QURA: "saudi_umm_al_qura",
});

function generateBookmarkId() {
  return `bookmark_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

class ReligiousEngine {
  constructor() {
    this.preferences = {
      enabled: getSetting("religious.prayer.enabled") || false,
      method: getSetting("religious.prayer.method") || CALCULATION_METHODS.MUSLIM_WORLD_LEAGUE,
      location: null,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      warningMinutes: getSetting("religious.prayer.warning_minutes") || 10,
      notifications: getSetting("religious.prayer.enabled") || false,
      quranReciter: getSetting("religious.quran.reciter") || QURAN_RECITERS.AL_AFASY,
      hadithCollection: getSetting("religious.hadith.collection") || HADITH_COLLECTIONS.BUKHARI,
      calendarMethod: getSetting("religious.calendar.method") || CALENDAR_METHODS.UMM_AL_QURA,
      calendarAdjustment: 0,
      language: getSetting("language.primary") || "en",
      learningRoutine: null,
    };
    this.schedules = new Map();
    this.quranVerses = new Map();
    this.hadiths = new Map();
    this.bookmarks = new Map();
    this.practiceRoutines = new Map();
    this.scholarContacts = new Map();
    this.listeners = new Set();
    this.load();
    this.generateSchedule();
  }

  load() {
    try {
      const stored = localStorage.getItem("hey_religious");
      if (stored) {
        const parsed = JSON.parse(stored);
        this.preferences = { ...this.preferences, ...parsed.preferences };
        if (parsed.schedules) Object.entries(parsed.schedules).forEach(([k, v]) => this.schedules.set(k, v));
        if (parsed.quranVerses) Object.entries(parsed.quranVerses).forEach(([k, v]) => this.quranVerses.set(k, v));
        if (parsed.hadiths) Object.entries(parsed.hadiths).forEach(([k, v]) => this.hadiths.set(k, v));
        if (parsed.bookmarks) Object.entries(parsed.bookmarks).forEach(([k, v]) => this.bookmarks.set(k, v));
        if (parsed.practiceRoutines) Object.entries(parsed.practiceRoutines).forEach(([k, v]) => this.practiceRoutines.set(k, v));
        if (parsed.scholarContacts) Object.entries(parsed.scholarContacts).forEach(([k, v]) => this.scholarContacts.set(k, v));
      }
    } catch (err) {
      console.warn("Failed to load religious engine:", err);
    }
  }

  save() {
    try {
      localStorage.setItem("hey_religious", JSON.stringify({
        preferences: this.preferences,
        schedules: Object.fromEntries(this.schedules),
        quranVerses: Object.fromEntries(this.quranVerses),
        hadiths: Object.fromEntries(this.hadiths),
        bookmarks: Object.fromEntries(this.bookmarks),
        practiceRoutines: Object.fromEntries(this.practiceRoutines),
        scholarContacts: Object.fromEntries(this.scholarContacts),
      }));
    } catch (err) {
      console.warn("Failed to save religious engine:", err);
    }
  }

  setPreferences(input) {
    this.preferences = { ...this.preferences, ...input };
    if (input.enabled !== undefined) setSetting("religious.prayer.enabled", input.enabled);
    if (input.method) setSetting("religious.prayer.method", input.method);
    if (input.warningMinutes !== undefined) setSetting("religious.prayer.warning_minutes", input.warningMinutes);
    if (input.quranReciter) setSetting("religious.quran.reciter", input.quranReciter);
    if (input.hadithCollection) setSetting("religious.hadith.collection", input.hadithCollection);
    if (input.calendarMethod) setSetting("religious.calendar.method", input.calendarMethod);
    this.save();
    this.generateSchedule();
    this.notify("preferences_updated", this.preferences);
    return this.preferences;
  }

  getPreferences() {
    return { ...this.preferences };
  }

  generateSchedule() {
    if (!this.preferences.enabled || !this.preferences.location) {
      this.schedules.clear();
      this.save();
      return;
    }

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    
    for (let day = 1; day <= new Date(year, month + 1, 0).getDate(); day++) {
      const date = new Date(year, month, day);
      const schedule = this.calculatePrayerTimes(date);
      this.schedules.set(this.formatDate(date), schedule);
    }
    
    this.save();
  }

  calculatePrayerTimes(date) {
    return {
      date: this.formatDate(date),
      [PRAYER_NAMES.FAJR]: this.addMinutes("05:30", 0),
      [PRAYER_NAMES.SUNRISE]: this.addMinutes("07:00", 0),
      [PRAYER_NAMES.DHUHR]: this.addMinutes("12:30", 0),
      [PRAYER_NAMES.ASR]: this.addMinutes("15:45", 0),
      [PRAYER_NAMES.MAGHRIB]: this.addMinutes("18:30", 0),
      [PRAYER_NAMES.ISHA]: this.addMinutes("20:00", 0),
      method: this.preferences.method,
      location: this.preferences.location,
      timezone: this.preferences.timezone,
    };
  }

  addMinutes(time, minutes) {
    const [hours, mins] = time.split(":").map(Number);
    const date = new Date();
    date.setHours(hours, mins + minutes);
    return `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;
  }

  formatDate(date) {
    return date.toISOString().split("T")[0];
  }

  getSchedule(date) {
    const dateStr = typeof date === "string" ? date : this.formatDate(date);
    return this.schedules.get(dateStr) || null;
  }

  getUpcomingPrayer() {
    const now = new Date();
    const today = this.getSchedule(now);
    if (!today) return null;

    const currentTime = now.getHours() * 60 + now.getMinutes();
    
    for (const prayer of Object.values(PRAYER_NAMES)) {
      const time = today[prayer];
      if (!time) continue;
      const [h, m] = time.split(":").map(Number);
      const prayerTime = h * 60 + m;
      if (prayerTime > currentTime) {
        return { prayer, time, minutesUntil: prayerTime - currentTime };
      }
    }
    return null;
  }

  getPrayerCountdown(prayerName) {
    const now = new Date();
    const today = this.getSchedule(now);
    if (!today || !today[prayerName]) return null;

    const [h, m] = today[prayerName].split(":").map(Number);
    const prayerTime = h * 60 + m;
    const currentTime = now.getHours() * 60 + now.getMinutes();
    return Math.max(0, prayerTime - currentTime);
  }

  setLocation(location) {
    this.preferences.location = location;
    this.save();
    this.generateSchedule();
    return { success: true };
  }

  getQuranVerse(surah, ayah) {
    const key = `${surah}:${ayah}`;
    return this.quranVerses.get(key) || null;
  }

  getQuranSurah(surah) {
    return Array.from(this.quranVerses.entries())
      .filter(([key]) => key.startsWith(`${surah}:`))
      .map(([key, value]) => ({ key, ...value }));
  }

  searchQuran(query) {
    return Array.from(this.quranVerses.entries())
      .filter(([, verse]) => 
        verse.text?.includes(query) || 
        verse.translation?.includes(query) ||
        verse.transliteration?.includes(query)
      )
      .map(([key, verse]) => ({ key, ...verse }));
  }

  getHadith(collection, book, number) {
    const key = `${collection}:${book}:${number}`;
    return this.hadiths.get(key) || null;
  }

  searchHadith(query) {
    return Array.from(this.hadiths.entries())
      .filter(([, hadith]) => 
        hadith.text?.includes(query) || 
        hadith.translation?.includes(query)
      )
      .map(([key, hadith]) => ({ key, ...hadith }));
  }

  addBookmark(input) {
    const bookmarkId = generateBookmarkId();
    const bookmark = {
      id: bookmarkId,
      type: input.type,
      reference: input.reference,
      note: input.note || "",
      tags: input.tags || [],
      createdAt: new Date().toISOString(),
    };
    this.bookmarks.set(bookmarkId, bookmark);
    this.save();
    return bookmark;
  }

  getBookmarks(type = null) {
    return Array.from(this.bookmarks.values()).filter(b => !type || b.type === type);
  }

  removeBookmark(id) {
    this.bookmarks.delete(id);
    this.save();
  }

  createPracticeRoutine(input) {
    const routineId = `routine_${Date.now()}`;
    const routine = {
      id: routineId,
      name: input.name,
      type: input.type,
      frequency: input.frequency,
      time: input.time,
      duration: input.duration,
      enabled: true,
      createdAt: new Date().toISOString(),
    };
    this.practiceRoutines.set(routineId, routine);
    this.save();
    return routine;
  }

  getPracticeRoutines() {
    return Array.from(this.practiceRoutines.values()).filter(r => r.enabled);
  }

  createScholarContact(input) {
    const contactId = `scholar_${Date.now()}`;
    const contact = {
      id: contactId,
      name: input.name,
      specialization: input.specialization,
      contact: input.contact,
      availability: input.availability,
      verified: false,
      createdAt: new Date().toISOString(),
    };
    this.scholarContacts.set(contactId, contact);
    this.save();
    return contact;
  }

  getScholarContacts() {
    return Array.from(this.scholarContacts.values());
  }

  requestScholarContact(scholarId, question) {
    const scholar = this.scholarContacts.get(scholarId);
    if (!scholar) return { error: "Scholar not found" };

    const request = {
      id: `req_${Date.now()}`,
      scholarId,
      question,
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    return request;
  }

  getCalendarDate(date) {
    return {
      gregorian: date.toISOString().split("T")[0],
      hijri: this.toHijri(date),
      method: this.preferences.calendarMethod,
    };
  }

  toHijri() {
    return { day: 1, month: 1, year: 1445 };
  }

  getCalculationMethods() {
    return Object.values(CALCULATION_METHODS);
  }

  getQuranReciters() {
    return Object.values(QURAN_RECITERS);
  }

  getHadithCollections() {
    return Object.values(HADITH_COLLECTIONS);
  }

  getCalendarMethods() {
    return Object.values(CALENDAR_METHODS);
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify(event, data) {
    this.listeners.forEach(l => {
      try { l(event, data); } catch (err) { console.error("Religious listener error:", err); }
    });
  }
}

export const religiousEngine = new ReligiousEngine();

export function setReligiousPreferences(input) {
  return religiousEngine.setPreferences(input);
}

export function getReligiousPreferences() {
  return religiousEngine.getPreferences();
}

export function getPrayerSchedule(date) {
  return religiousEngine.getSchedule(date);
}

export function getUpcomingPrayer() {
  return religiousEngine.getUpcomingPrayer();
}

export function getPrayerCountdown(prayerName) {
  return religiousEngine.getPrayerCountdown(prayerName);
}

export function setReligiousLocation(location) {
  return religiousEngine.setLocation(location);
}

export function getQuranVerse(surah, ayah) {
  return religiousEngine.getQuranVerse(surah, ayah);
}

export function getQuranSurah(surah) {
  return religiousEngine.getQuranSurah(surah);
}

export function searchQuran(query) {
  return religiousEngine.searchQuran(query);
}

export function getHadith(collection, book, number) {
  return religiousEngine.getHadith(collection, book, number);
}

export function searchHadith(query) {
  return religiousEngine.searchHadith(query);
}

export function addReligiousBookmark(input) {
  return religiousEngine.addBookmark(input);
}

export function getReligiousBookmarks(type) {
  return religiousEngine.getBookmarks(type);
}

export function removeReligiousBookmark(id) {
  return religiousEngine.removeBookmark(id);
}

export function createPracticeRoutine(input) {
  return religiousEngine.createPracticeRoutine(input);
}

export function getPracticeRoutines() {
  return religiousEngine.getPracticeRoutines();
}

export function createScholarContact(input) {
  return religiousEngine.createScholarContact(input);
}

export function getScholarContacts() {
  return religiousEngine.getScholarContacts();
}

export function requestScholarContact(scholarId, question) {
  return religiousEngine.requestScholarContact(scholarId, question);
}

export function getIslamicCalendarDate(date) {
  return religiousEngine.getCalendarDate(date);
}

export function getCalculationMethods() {
  return religiousEngine.getCalculationMethods();
}

export function getQuranReciters() {
  return religiousEngine.getQuranReciters();
}

export function getHadithCollections() {
  return religiousEngine.getHadithCollections();
}

export function getCalendarMethods() {
  return religiousEngine.getCalendarMethods();
}

export function subscribeToReligious(listener) {
  return religiousEngine.subscribe(listener);
}

export { CALCULATION_METHODS, PRAYER_NAMES, QURAN_RECITERS, HADITH_COLLECTIONS, CALENDAR_METHODS };

export default religiousEngine;