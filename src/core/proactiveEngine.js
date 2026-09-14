import { getSetting, setSetting } from "./settingsRegistry.js";
import { safeStorage } from "../lib/safeStorage.js";

const PROACTIVE_LEVELS = Object.freeze({
  OFF: "off",
  MINIMAL: "minimal",
  BALANCED: "balanced",
  PROACTIVE: "proactive",
  CUSTOM: "custom",
});

const SIGNAL_TYPES = Object.freeze({
  TASK_OVERDUE: "task_overdue",
  TASK_UPCOMING: "task_upcoming",
  CALENDAR_EVENT: "calendar_event",
  PRAYER: "prayer",
  WEATHER: "weather",
  ROUTINE: "routine",
  PROJECT_STATE: "project_state",
  BROKEN_AUTOMATION: "broken_automation",
  DEVICE_HEALTH: "device_health",
  NEWS_WATCH: "news_watch",
  COMMITMENT: "commitment",
  COSMOS_PATTERN: "cosmos_pattern",
});

const AUTONOMY_DOMAINS = Object.freeze({
  SUGGESTIONS: "suggestions",
  REMINDERS: "reminders",
  CALENDAR_MANAGEMENT: "calendar_management",
  TASK_MANAGEMENT: "task_management",
  RESEARCH: "research",
  GENERATION: "generation",
  COMMUNICATION: "communication",
  DEVICE_CONTROL: "device_control",
});

function generateSuggestionId() {
  return `sugg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function generateSuppressionId() {
  return `supp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function generateNotificationId() {
  return `notif_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

class ProactiveEngine {
  constructor() {
    this.level = getSetting("proactive.enabled") || PROACTIVE_LEVELS.BALANCED;
    this.signals = new Map();
    this.suggestions = new Map();
    this.suppressionRules = new Map();
    this.notifications = new Map();
    this.routines = new Map();
    this.feedback = new Map();
    this.dailyCount = 0;
    this.lastResetDate = new Date().toDateString();
    this.listeners = new Set();
    this.load();
    this.startDailyReset();
  }

  load() {
    try {
      const stored = safeStorage.getItem("hey_proactive");
      if (stored) {
        const parsed = JSON.parse(stored);
        this.level = parsed.level || this.level;
        if (parsed.suppressionRules) Object.entries(parsed.suppressionRules).forEach(([k, v]) => this.suppressionRules.set(k, v));
        if (parsed.routines) Object.entries(parsed.routines).forEach(([k, v]) => this.routines.set(k, v));
        this.dailyCount = parsed.dailyCount || 0;
        this.lastResetDate = parsed.lastResetDate || new Date().toDateString();
      }
    } catch (err) {
      console.warn("Failed to load proactive engine:", err);
    }
  }

  save() {
    try {
      safeStorage.setItem("hey_proactive", JSON.stringify({
        level: this.level,
        suppressionRules: Object.fromEntries(this.suppressionRules),
        routines: Object.fromEntries(this.routines),
        dailyCount: this.dailyCount,
        lastResetDate: this.lastResetDate,
      }));
    } catch (err) {
      console.warn("Failed to save proactive engine:", err);
    }
  }

  startDailyReset() {
    const timer = setInterval(() => {
      const today = new Date().toDateString();
      if (today !== this.lastResetDate) {
        this.dailyCount = 0;
        this.lastResetDate = today;
        this.save();
      }
    }, 60000);
    if (typeof timer.unref === "function") timer.unref();
  }

  setLevel(level) {
    if (!Object.values(PROACTIVE_LEVELS).includes(level)) {
      return { error: "Invalid level" };
    }
    this.level = level;
    setSetting("proactive.enabled", level);
    this.save();
    this.notify("level_changed", { level });
    return { success: true, level };
  }

  getLevel() {
    return this.level;
  }

  createSignal(input) {
    const signalId = `signal_${Date.now()}`;
    const signal = {
      id: signalId,
      type: input.type,
      source: input.source,
      payload: input.payload,
      priority: input.priority || "normal",
      timestamp: new Date().toISOString(),
      processed: false,
    };
    this.signals.set(signalId, signal);
    this.processSignal(signal);
    return signal;
  }

  processSignal(signal) {
    if (this.level === PROACTIVE_LEVELS.OFF) return;
    if (this.dailyCount >= getSetting("proactivity.daily_cap")) return;

    const suggestions = this.generateSuggestions(signal);
    suggestions.forEach(s => this.createSuggestion(s));
    signal.processed = true;
  }

  generateSuggestions(signal) {
    const suggestions = [];
    
    switch (signal.type) {
      case SIGNAL_TYPES.TASK_OVERDUE:
        suggestions.push({
          type: "task_reminder",
          title: "Overdue task",
          message: `Task "${signal.payload.taskTitle}" is overdue`,
          action: { type: "open_task", taskId: signal.payload.taskId },
          priority: "high",
          domain: AUTONOMY_DOMAINS.TASK_MANAGEMENT,
        });
        break;
      case SIGNAL_TYPES.CALENDAR_EVENT:
        suggestions.push({
          type: "event_reminder",
          title: "Upcoming event",
          message: `"${signal.payload.eventTitle}" starts in ${signal.payload.minutesUntil} minutes`,
          action: { type: "open_calendar", eventId: signal.payload.eventId },
          priority: "high",
          domain: AUTONOMY_DOMAINS.CALENDAR_MANAGEMENT,
        });
        break;
      case SIGNAL_TYPES.PRAYER:
        suggestions.push({
          type: "prayer_reminder",
          title: "Prayer time",
          message: `Time for ${signal.payload.prayerName}`,
          action: { type: "open_prayer", prayerId: signal.payload.prayerId },
          priority: "high",
          domain: AUTONOMY_DOMAINS.REMINDERS,
        });
        break;
      case SIGNAL_TYPES.BROKEN_AUTOMATION:
        suggestions.push({
          type: "automation_alert",
          title: "Automation needs attention",
          message: `Automation "${signal.payload.automationName}" has failed ${signal.payload.failureCount} times`,
          action: { type: "open_automation", automationId: signal.payload.automationId },
          priority: "medium",
          domain: AUTONOMY_DOMAINS.DEVICE_CONTROL,
        });
        break;
    }
    
    return suggestions;
  }

  createSuggestion(input) {
    const suggestionId = generateSuggestionId();
    const now = new Date().toISOString();
    
    const suggestion = {
      id: suggestionId,
      type: input.type,
      title: input.title,
      message: input.message,
      action: input.action,
      priority: input.priority || "medium",
      domain: input.domain || AUTONOMY_DOMAINS.SUGGESTIONS,
      sourceSignal: input.sourceSignal,
      createdAt: now,
      expiresAt: input.expiresAt || new Date(Date.now() + 86400000).toISOString(),
      dismissed: false,
      snoozedUntil: null,
      feedback: null,
      clickCount: 0,
    };

    if (this.isSuppressed(suggestion)) return null;
    if (this.dailyCount >= getSetting("proactivity.daily_cap") && input.priority !== "high") return null;

    this.suggestions.set(suggestionId, suggestion);
    this.dailyCount++;
    this.save();
    
    this.notify("suggestion_created", suggestion);
    return suggestion;
  }

  isSuppressed(suggestion) {
    for (const rule of this.suppressionRules.values()) {
      if (rule.topic === suggestion.type && !rule.expired) {
        const cooldown = getSetting("proactivity.dismiss_cooldown") * 3600000;
        if (Date.now() - rule.dismissedAt < cooldown) return true;
      }
    }
    return false;
  }

  getSuggestions(options = {}) {
    let suggestions = Array.from(this.suggestions.values())
      .filter(s => !s.dismissed && (!s.snoozedUntil || new Date(s.snoozedUntil) < new Date()))
      .filter(s => !options.domain || s.domain === options.domain)
      .filter(s => !options.priority || s.priority === options.priority)
      .sort((a, b) => {
        const priorityOrder = { high: 3, medium: 2, low: 1 };
        return (priorityOrder[b.priority] || 2) - (priorityOrder[a.priority] || 2);
      });
    
    if (options.limit) suggestions = suggestions.slice(0, options.limit);
    return suggestions;
  }

  dismissSuggestion(suggestionId, feedback = null) {
    const suggestion = this.suggestions.get(suggestionId);
    if (!suggestion) return { error: "Suggestion not found" };

    suggestion.dismissed = true;
    suggestion.dismissedAt = new Date().toISOString();
    suggestion.feedback = feedback;
    
    this.addSuppressionRule(suggestion.type, suggestionId);
    this.suggestions.set(suggestionId, suggestion);
    this.save();
    
    this.notify("suggestion_dismissed", suggestion);
    return suggestion;
  }

  snoozeSuggestion(suggestionId, minutes = 60) {
    const suggestion = this.suggestions.get(suggestionId);
    if (!suggestion) return { error: "Suggestion not found" };

    suggestion.snoozedUntil = new Date(Date.now() + minutes * 60000).toISOString();
    this.suggestions.set(suggestionId, suggestion);
    this.save();
    return suggestion;
  }

  addSuppressionRule(topic, suggestionId) {
    const ruleId = generateSuppressionId();
    const rule = {
      id: ruleId,
      topic,
      suggestionId,
      dismissedAt: Date.now(),
      expired: false,
      createdAt: new Date().toISOString(),
    };
    this.suppressionRules.set(ruleId, rule);
    this.save();
    return rule;
  }

  getSuppressionRules() {
    return Array.from(this.suppressionRules.values());
  }

  createNotification(input) {
    const notificationId = generateNotificationId();
    const now = new Date().toISOString();
    
    const notification = {
      id: notificationId,
      type: input.type,
      title: input.title,
      message: input.message,
      priority: input.priority || "normal",
      action: input.action,
      source: input.source,
      deliveryState: "created",
      channels: input.channels || ["in_app"],
      createdAt: now,
      deliveredAt: null,
      readAt: null,
      dismissedAt: null,
      expiresAt: input.expiresAt || null,
    };

    this.notifications.set(notificationId, notification);
    this.save();
    
    this.deliverNotification(notificationId);
    return notification;
  }

  async deliverNotification(notificationId) {
    const notification = this.notifications.get(notificationId);
    if (!notification) return;

    notification.deliveryState = "submitted";
    this.notifications.set(notificationId, notification);
    this.save();

    try {
      notification.deliveryState = "delivered";
      notification.deliveredAt = new Date().toISOString();
    } catch (error) {
      notification.deliveryState = "failed";
      notification.error = error.message;
    }

    this.notifications.set(notificationId, notification);
    this.save();
  }

  getNotifications(options = {}) {
    return Array.from(this.notifications.values())
      .filter(n => !options.unreadOnly || n.readAt === null)
      .filter(n => !options.channel || n.channels.includes(options.channel))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  markNotificationRead(notificationId) {
    const notification = this.notifications.get(notificationId);
    if (!notification) return { error: "Notification not found" };

    notification.readAt = new Date().toISOString();
    notification.deliveryState = "read";
    this.notifications.set(notificationId, notification);
    this.save();
    return notification;
  }

  dismissNotification(notificationId) {
    const notification = this.notifications.get(notificationId);
    if (!notification) return { error: "Notification not found" };

    notification.dismissedAt = new Date().toISOString();
    this.notifications.set(notificationId, notification);
    this.save();
    return notification;
  }

  createRoutine(input) {
    const routineId = `routine_${Date.now()}`;
    const routine = {
      id: routineId,
      name: input.name,
      description: input.description,
      trigger: input.trigger,
      steps: input.steps || [],
      enabled: input.enabled !== false,
      quietHours: input.quietHours || false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastRun: null,
      nextRun: null,
    };
    this.routines.set(routineId, routine);
    this.save();
    return routine;
  }

  getRoutines() {
    return Array.from(this.routines.values()).filter(r => r.enabled);
  }

  getRoutine(id) {
    return this.routines.get(id) || null;
  }

  updateRoutine(id, updates) {
    const routine = this.routines.get(id);
    if (!routine) return { error: "Routine not found" };

    const updated = { ...routine, ...updates, updatedAt: new Date().toISOString() };
    this.routines.set(id, updated);
    this.save();
    return updated;
  }

  deleteRoutine(id) {
    this.routines.delete(id);
    this.save();
    return true;
  }

  addFeedback(suggestionId, feedback) {
    const suggestion = this.suggestions.get(suggestionId);
    if (!suggestion) return { error: "Suggestion not found" };

    suggestion.feedback = { ...suggestion.feedback, ...feedback };
    this.suggestions.set(suggestionId, suggestion);
    this.save();
    return suggestion;
  }

  getFeedback(suggestionId) {
    const suggestion = this.suggestions.get(suggestionId);
    return suggestion?.feedback || null;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify(event, data) {
    this.listeners.forEach(l => {
      try { l(event, data); } catch (err) { console.error("Proactive listener error:", err); }
    });
  }
}

export const proactiveEngine = new ProactiveEngine();

export function createProactiveSuggestion(input) {
  return proactiveEngine.createSuggestion(input);
}

export function evaluateContext(signalInput = {}) {
  const { overdueTasks = [], upcomingTasks = [], morningMode = false, morningSummary = null } = signalInput;
  const signals = [];
  const now = new Date().toISOString();

  overdueTasks.slice(0, 5).forEach((task) => {
    signals.push({
      type: "overdue_task",
      title: "Overdue task",
      message: `Task "${task.title}" is overdue`,
      priority: "high",
      createdAt: now,
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    });
  });

  upcomingTasks.slice(0, 5).forEach((task) => {
    signals.push({
      type: "upcoming_task",
      title: "Upcoming task",
      message: `Task "${task.title}" is due today`,
      priority: "medium",
      createdAt: now,
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    });
  });

  if (morningMode && morningSummary) {
    signals.push({
      type: "morning_summary",
      title: "Morning summary",
      message: morningSummary,
      priority: "medium",
      createdAt: now,
      expiresAt: new Date(Date.now() + 7200000).toISOString(),
    });
  }

  return signals;
}

export function evaluateProactiveSignals(signals = [], settings = {}, options = {}) {
  if (settings.level === "off") return [];
  const { now = new Date(), suggestionsToday = 0 } = options;
  const cap = settings.dailyCap ?? 10;
  if (suggestionsToday >= cap) return [];

  const priorityRank = { high: 0, medium: 1, low: 2 };
  return signals
    .filter((signal) => signal && !isSuggestionExpired(signal, now))
    .map((signal, index) => ({
      id: `suggestion_${Date.now()}_${index}`,
      type: signal.type,
      title: signal.title,
      message: signal.message,
      priority: signal.priority || "medium",
      createdAt: signal.createdAt || now.toISOString(),
      expiresAt: signal.expiresAt || new Date(now.getTime() + 86400000).toISOString(),
      dismissed: false,
      domain: settings.domain || "suggestions",
    }))
    .sort((a, b) => (priorityRank[a.priority] ?? 9) - (priorityRank[b.priority] ?? 9));
}

export function explainSuggestion(suggestion = {}) {
  if (!suggestion) return "";
  return `${suggestion.title || "Suggestion"} — ${suggestion.message || "A suggestion from HEY."}`;
}

export function isSuggestionExpired(item, now = new Date()) {
  if (!item?.expiresAt) return false;
  return new Date(item.expiresAt).getTime() <= now.getTime();
}

export function setProactiveLevel(level) {
  return proactiveEngine.setLevel(level);
}

export function getProactiveLevel() {
  return proactiveEngine.getLevel();
}

export function createProactiveSignal(input) {
  return proactiveEngine.createSignal(input);
}

export function getProactiveSuggestions(options) {
  return proactiveEngine.getSuggestions(options);
}

export function dismissProactiveSuggestion(suggestionId, feedback) {
  return proactiveEngine.dismissSuggestion(suggestionId, feedback);
}

export function clearSuggestionHistory() {
  proactiveEngine.suggestions.clear();
}

export function snoozeProactiveSuggestion(suggestionId, minutes) {
  return proactiveEngine.snoozeSuggestion(suggestionId, minutes);
}

export function createProactiveNotification(input) {
  return proactiveEngine.createNotification(input);
}

export function getProactiveNotifications(options) {
  return proactiveEngine.getNotifications(options);
}

export function markProactiveNotificationRead(notificationId) {
  return proactiveEngine.markNotificationRead(notificationId);
}

export function dismissProactiveNotification(notificationId) {
  return proactiveEngine.dismissNotification(notificationId);
}

export function createProactiveRoutine(input) {
  return proactiveEngine.createRoutine(input);
}

export function getProactiveRoutines() {
  return proactiveEngine.getRoutines();
}

export function getProactiveRoutine(id) {
  return proactiveEngine.getRoutine(id);
}

export function updateProactiveRoutine(id, updates) {
  return proactiveEngine.updateRoutine(id, updates);
}

export function deleteProactiveRoutine(id) {
  return proactiveEngine.deleteRoutine(id);
}

export function addProactiveFeedback(suggestionId, feedback) {
  return proactiveEngine.addFeedback(suggestionId, feedback);
}

export function getProactiveFeedback(suggestionId) {
  return proactiveEngine.getFeedback(suggestionId);
}

export function subscribeToProactive(listener) {
  return proactiveEngine.subscribe(listener);
}

export { PROACTIVE_LEVELS, SIGNAL_TYPES, AUTONOMY_DOMAINS };

export default proactiveEngine;
