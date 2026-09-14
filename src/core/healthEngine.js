import { publish } from "./eventBus.js";

const RECORD_TYPES = Object.freeze({
  MEDICATION: "medication",
  APPOINTMENT: "appointment",
  VITALS: "vitals",
  SYMPTOM: "symptom",
  SLEEP: "sleep",
  ACTIVITY: "activity",
  MOOD: "mood",
  WATER: "water",
  MOVEMENT: "movement",
  EYE_REST: "eye_rest",
  CUSTOM: "custom",
});

const RESOURCE_TYPES = Object.freeze({
  CRISIS_LINE: "crisis_line",
  THERAPIST: "therapist",
  SUPPORT_GROUP: "support_group",
  LEGAL_AID: "legal_aid",
  MEDICAL_INFO: "medical_info",
  RIGHTS_INFO: "rights_info",
  EMERGENCY: "emergency",
});

function generateRecordId() {
  return `health_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function generateScheduleId() {
  return `sched_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function generateResourceId() {
  return `res_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function generateEvidenceId() {
  return `evid_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function generateContactId() {
  return `contact_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

class HealthEngine {
  constructor() {
    this.records = new Map();
    this.schedules = new Map();
    this.resources = new Map();
    this.evidence = new Map();
    this.contacts = new Map();
    this.safetyCases = new Map();
    this.listeners = new Set();
    this.load();
  }

  load() {
    try {
      const stored = localStorage.getItem("hey_health");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.records) Object.entries(parsed.records).forEach(([k, v]) => this.records.set(k, v));
        if (parsed.schedules) Object.entries(parsed.schedules).forEach(([k, v]) => this.schedules.set(k, v));
        if (parsed.resources) Object.entries(parsed.resources).forEach(([k, v]) => this.resources.set(k, v));
        if (parsed.evidence) Object.entries(parsed.evidence).forEach(([k, v]) => this.evidence.set(k, v));
        if (parsed.contacts) Object.entries(parsed.contacts).forEach(([k, v]) => this.contacts.set(k, v));
        if (parsed.safetyCases) Object.entries(parsed.safetyCases).forEach(([k, v]) => this.safetyCases.set(k, v));
      }
    } catch (err) {
      console.warn("Failed to load health engine:", err);
    }
  }

  save() {
    try {
      localStorage.setItem("hey_health", JSON.stringify({
        records: Object.fromEntries(this.records),
        schedules: Object.fromEntries(this.schedules),
        resources: Object.fromEntries(this.resources),
        evidence: Object.fromEntries(this.evidence),
        contacts: Object.fromEntries(this.contacts),
        safetyCases: Object.fromEntries(this.safetyCases),
      }));
    } catch (err) {
      console.warn("Failed to save health engine:", err);
    }
  }

  createRecord(input) {
    const recordId = generateRecordId();
    const record = {
      id: recordId,
      type: input.type,
      title: input.title,
      description: input.description || "",
      value: input.value,
      unit: input.unit || "",
      metadata: input.metadata || {},
      source: input.source || "user_entered",
      tags: input.tags || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.records.set(recordId, record);
    this.save();
    this.notify("record_created", record);
    return record;
  }

  getRecord(id) {
    return this.records.get(id) || null;
  }

  getRecords(type = null) {
    return Array.from(this.records.values()).filter(r => !type || r.type === type);
  }

  updateRecord(id, updates) {
    const record = this.records.get(id);
    if (!record) return null;
    const updated = { ...record, ...updates, updatedAt: new Date().toISOString() };
    this.records.set(id, updated);
    this.save();
    return updated;
  }

  deleteRecord(id) {
    this.records.delete(id);
    this.save();
  }

  createSchedule(input) {
    const scheduleId = generateScheduleId();
    const schedule = {
      id: scheduleId,
      type: input.type,
      title: input.title,
      description: input.description || "",
      frequency: input.frequency,
      time: input.time,
      timezone: input.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
      dosage: input.dosage || null,
      instructions: input.instructions || "",
      enabled: true,
      startDate: input.startDate || new Date().toISOString(),
      endDate: input.endDate || null,
      lastTaken: null,
      nextDue: this.calculateNextDue(input.frequency, input.time),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.schedules.set(scheduleId, schedule);
    this.save();
    this.scheduleReminder(scheduleId);
    return schedule;
  }

  calculateNextDue(frequency, time) {
    const now = new Date();
    const [hours, minutes] = time.split(":").map(Number);
    const next = new Date(now);
    next.setHours(hours, minutes, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    return next.toISOString();
  }

  scheduleReminder(scheduleId) {
    const schedule = this.schedules.get(scheduleId);
    if (!schedule) return;
    const delay = new Date(schedule.nextDue).getTime() - Date.now();
    if (delay > 0) {
      setTimeout(() => this.fireReminder(scheduleId), Math.max(0, delay));
    }
  }

  fireReminder(scheduleId) {
    const schedule = this.schedules.get(scheduleId);
    if (!schedule || !schedule.enabled) return;
    publish("health.reminder_fired", schedule);
    this.notify("reminder_fired", schedule);
    schedule.lastTaken = new Date().toISOString();
    schedule.nextDue = this.calculateNextDue(schedule.frequency, schedule.time);
    this.schedules.set(scheduleId, schedule);
    this.save();
  }

  getSchedules() {
    return Array.from(this.schedules.values()).filter(s => s.enabled);
  }

  getSchedule(id) {
    return this.schedules.get(id) || null;
  }

  takeMedication(scheduleId) {
    const schedule = this.schedules.get(scheduleId);
    if (!schedule) return { error: "Schedule not found" };
    schedule.lastTaken = new Date().toISOString();
    schedule.nextDue = this.calculateNextDue(schedule.frequency, schedule.time);
    this.schedules.set(scheduleId, schedule);
    this.save();
    return schedule;
  }

  createResource(input) {
    const resourceId = generateResourceId();
    const resource = {
      id: resourceId,
      type: input.type,
      name: input.name,
      description: input.description || "",
      contact: input.contact || "",
      url: input.url || "",
      phone: input.phone || "",
      location: input.location || "",
      hours: input.hours || "",
      tags: input.tags || [],
      verified: false,
      createdAt: new Date().toISOString(),
    };
    this.resources.set(resourceId, resource);
    this.save();
    return resource;
  }

  getResources(type = null) {
    return Array.from(this.resources.values()).filter(r => !type || r.type === type);
  }

  createEvidence(input) {
    const evidenceId = generateEvidenceId();
    const evidence = {
      id: evidenceId,
      type: input.type,
      title: input.title,
      description: input.description || "",
      files: input.files || [],
      source: input.source || "user",
      timestamp: input.timestamp || new Date().toISOString(),
      verified: false,
      tags: input.tags || [],
      createdAt: new Date().toISOString(),
    };
    this.evidence.set(evidenceId, evidence);
    this.save();
    return evidence;
  }

  getEvidence() {
    return Array.from(this.evidence.values());
  }

  createContact(input) {
    const contactId = generateContactId();
    const contact = {
      id: contactId,
      name: input.name,
      role: input.role,
      phone: input.phone || "",
      email: input.email || "",
      relationship: input.relationship || "",
      priority: input.priority || "normal",
      notes: input.notes || "",
      createdAt: new Date().toISOString(),
    };
    this.contacts.set(contactId, contact);
    this.save();
    return contact;
  }

  getContacts() {
    return Array.from(this.contacts.values());
  }

  createSafetyCase(input) {
    const caseId = `safety_${Date.now()}`;
    const safetyCase = {
      id: caseId,
      type: input.type,
      title: input.title,
      description: input.description || "",
      severity: input.severity || "medium",
      status: "open",
      contacts: input.contacts || [],
      evidence: input.evidence || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.safetyCases.set(caseId, safetyCase);
    this.save();
    return safetyCase;
  }

  getSafetyCases() {
    return Array.from(this.safetyCases.values());
  }

  updateSafetyCase(id, updates) {
    const c = this.safetyCases.get(id);
    if (!c) return null;
    const updated = { ...c, ...updates, updatedAt: new Date().toISOString() };
    this.safetyCases.set(id, updated);
    this.save();
    return updated;
  }

  exportData() {
    return {
      records: Array.from(this.records.values()),
      schedules: Array.from(this.schedules.values()),
      evidence: Array.from(this.evidence.values()),
      contacts: Array.from(this.contacts.values()),
      safetyCases: Array.from(this.safetyCases.values()),
      exportedAt: new Date().toISOString(),
    };
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify(event, data) {
    this.listeners.forEach(l => {
      try { l(event, data); } catch (err) { console.error("Health listener error:", err); }
    });
  }
}

export const healthEngine = new HealthEngine();

export function createHealthRecord(input) {
  return healthEngine.createRecord(input);
}

export function getHealthRecord(id) {
  return healthEngine.getRecord(id);
}

export function getHealthRecords(type) {
  return healthEngine.getRecords(type);
}

export function updateHealthRecord(id, updates) {
  return healthEngine.updateRecord(id, updates);
}

export function deleteHealthRecord(id) {
  return healthEngine.deleteRecord(id);
}

export function createHealthSchedule(input) {
  return healthEngine.createSchedule(input);
}

export function getHealthSchedules() {
  return healthEngine.getSchedules();
}

export function getHealthSchedule(id) {
  return healthEngine.getSchedule(id);
}

export function takeMedication(scheduleId) {
  return healthEngine.takeMedication(scheduleId);
}

export function createHealthResource(input) {
  return healthEngine.createResource(input);
}

export function getHealthResources(type) {
  return healthEngine.getResources(type);
}

export function createHealthEvidence(input) {
  return healthEngine.createEvidence(input);
}

export function getHealthEvidence() {
  return healthEngine.getEvidence();
}

export function createHealthContact(input) {
  return healthEngine.createContact(input);
}

export function getHealthContacts() {
  return healthEngine.getContacts();
}

export function createSafetyCase(input) {
  return healthEngine.createSafetyCase(input);
}

export function getSafetyCases() {
  return healthEngine.getSafetyCases();
}

export function updateSafetyCase(id, updates) {
  return healthEngine.updateSafetyCase(id, updates);
}

export function exportHealthData() {
  return healthEngine.exportData();
}

export function subscribeToHealth(listener) {
  return healthEngine.subscribe(listener);
}

export { RECORD_TYPES, RESOURCE_TYPES };

export default healthEngine;