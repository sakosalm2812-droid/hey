import { publish } from "./eventBus.js";
import { getSetting } from "./settingsRegistry.js";

const TASK_STATES = Object.freeze({
  DRAFT: "draft",
  ACTIVE: "active",
  COMPLETED: "completed",
  BLOCKED: "blocked",
  CANCELLED: "cancelled",
  ARCHIVED: "archived",
});

const PRIORITIES = Object.freeze({
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
  CRITICAL: "critical",
});

const REMINDER_STATES = Object.freeze({
  SCHEDULED: "scheduled",
  SUBMITTED: "submitted",
  FIRED: "fired",
  ACKNOWLEDGED: "acknowledged",
  SNOOZED: "snoozed",
  MISSED: "missed",
  CANCELLED: "cancelled",
});

const TIMER_STATES = Object.freeze({
  IDLE: "idle",
  RUNNING: "running",
  PAUSED: "paused",
  COMPLETED: "completed",
});

const MEETING_STATES = Object.freeze({
  SCHEDULED: "scheduled",
  IN_PROGRESS: "in_progress",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
});

function generateTaskId() {
  return `task_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function generateReminderId() {
  return `rem_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function generateTimerId() {
  return `timer_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function generateMeetingId() {
  return `mtg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function generateEventId() {
  return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function generateActionItemId() {
  return `ai_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

class TasksCalendarEngine {
  constructor() {
    this.tasks = new Map();
    this.taskDependencies = new Map();
    this.reminders = new Map();
    this.timers = new Map();
    this.calendarConnections = new Map();
    this.events = new Map();
    this.meetings = new Map();
    this.actionItems = new Map();
    this.listeners = new Set();
    this.load();
  }

  load() {
    try {
      const stored = localStorage.getItem("hey_tasks_calendar");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.tasks) Object.entries(parsed.tasks).forEach(([k, v]) => this.tasks.set(k, v));
        if (parsed.reminders) Object.entries(parsed.reminders).forEach(([k, v]) => this.reminders.set(k, v));
        if (parsed.timers) Object.entries(parsed.timers).forEach(([k, v]) => this.timers.set(k, v));
        if (parsed.events) Object.entries(parsed.events).forEach(([k, v]) => this.events.set(k, v));
        if (parsed.meetings) Object.entries(parsed.meetings).forEach(([k, v]) => this.meetings.set(k, v));
        if (parsed.actionItems) Object.entries(parsed.actionItems).forEach(([k, v]) => this.actionItems.set(k, v));
      }
    } catch (err) {
      console.warn("Failed to load tasks/calendar:", err);
    }
  }

  save() {
    try {
      localStorage.setItem("hey_tasks_calendar", JSON.stringify({
        tasks: Object.fromEntries(this.tasks),
        reminders: Object.fromEntries(this.reminders),
        timers: Object.fromEntries(this.timers),
        events: Object.fromEntries(this.events),
        meetings: Object.fromEntries(this.meetings),
        actionItems: Object.fromEntries(this.actionItems),
      }));
    } catch (err) {
      console.warn("Failed to save tasks/calendar:", err);
    }
  }

  createTask(input) {
    const taskId = generateTaskId();
    
    const task = {
      id: taskId,
      title: input.title,
      description: input.description || "",
      state: TASK_STATES.ACTIVE,
      priority: input.priority || PRIORITIES.MEDIUM,
      projectId: input.projectId || null,
      parentTaskId: input.parentTaskId || null,
      dependencies: input.dependencies || [],
      successCriteria: input.successCriteria || "",
      estimatedDuration: input.estimatedDuration || null,
      actualDuration: null,
      deadline: input.deadline || null,
      startedAt: null,
      completedAt: null,
      provenance: input.provenance || "user_created",
      tags: input.tags || [],
      assignee: input.assignee || null,
      metadata: input.metadata || {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.tasks.set(taskId, task);
    this.save();
    this.notify("task_created", task);
    return task;
  }

  getTask(id) {
    return this.tasks.get(id) || null;
  }

  getAllTasks() {
    return Array.from(this.tasks.values());
  }

  getTasksByProject(projectId) {
    return Array.from(this.tasks.values()).filter(t => t.projectId === projectId);
  }

  getTasksByState(state) {
    return Array.from(this.tasks.values()).filter(t => t.state === state);
  }

  updateTask(id, updates) {
    const task = this.tasks.get(id);
    if (!task) return null;

    const updated = { ...task, ...updates, updatedAt: new Date().toISOString() };
    this.tasks.set(id, updated);
    this.save();
    this.notify("task_updated", updated);
    return updated;
  }

  setTaskState(id, state) {
    const task = this.tasks.get(id);
    if (!task) return null;

    if (!Object.values(TASK_STATES).includes(state)) return { error: "Invalid state" };

    const oldState = task.state;
    task.state = state;
    task.updatedAt = new Date().toISOString();

    if (state === TASK_STATES.COMPLETED && oldState !== TASK_STATES.COMPLETED) {
      task.completedAt = new Date().toISOString();
      task.actualDuration = task.startedAt ? new Date() - new Date(task.startedAt) : null;
    }
    if (state === TASK_STATES.ACTIVE && oldState !== TASK_STATES.ACTIVE) {
      task.startedAt = new Date().toISOString();
    }

    this.tasks.set(id, task);
    this.save();
    this.notify("task_state_changed", { id, oldState, newState: state });
    return task;
  }

  addDependency(taskId, dependencyId) {
    const task = this.tasks.get(taskId);
    if (!task) return { error: "Task not found" };
    if (task.dependencies.includes(dependencyId)) return { error: "Dependency already exists" };
    if (taskId === dependencyId) return { error: "Cannot depend on self" };

    task.dependencies.push(dependencyId);
    this.tasks.set(taskId, task);
    this.save();
    return task;
  }

  removeDependency(taskId, dependencyId) {
    const task = this.tasks.get(taskId);
    if (!task) return { error: "Task not found" };

    task.dependencies = task.dependencies.filter(d => d !== dependencyId);
    this.tasks.set(taskId, task);
    this.save();
    return task;
  }

  getBlockedTasks(taskId) {
    return Array.from(this.tasks.values()).filter(t => t.dependencies.includes(taskId));
  }

  createReminder(input) {
    const reminderId = generateReminderId();
    const now = new Date().toISOString();
    
    const reminder = {
      id: reminderId,
      taskId: input.taskId || null,
      title: input.title,
      message: input.message || "",
      state: REMINDER_STATES.SCHEDULED,
      triggerAt: input.triggerAt,
      timezone: input.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
      recurrence: input.recurrence || null,
      leadTime: input.leadTime || getSetting("proactivity.quiet_hours_start") || 0,
      channels: input.channels || ["in_app"],
      stateHistory: [{ state: REMINDER_STATES.SCHEDULED, at: now }],
      snoozedUntil: null,
      acknowledgedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    this.reminders.set(reminderId, reminder);
    this.save();
    this.scheduleReminder(reminderId);
    return reminder;
  }

  getReminder(id) {
    return this.reminders.get(id) || null;
  }

  getAllReminders() {
    return Array.from(this.reminders.values());
  }

  scheduleReminder(reminderId) {
    const reminder = this.reminders.get(reminderId);
    if (!reminder) return;

    const delay = new Date(reminder.triggerAt).getTime() - Date.now();
    if (delay <= 0) {
      this.fireReminder(reminderId);
      return;
    }

    setTimeout(() => this.fireReminder(reminderId), delay);
  }

  fireReminder(reminderId) {
    const reminder = this.reminders.get(reminderId);
    if (!reminder) return;

    reminder.state = REMINDER_STATES.FIRED;
    reminder.stateHistory.push({ state: REMINDER_STATES.FIRED, at: new Date().toISOString() });
    reminder.updatedAt = new Date().toISOString();
    this.reminders.set(reminderId, reminder);
    this.save();

    this.notify("reminder_fired", reminder);
    publish("reminder.fired", reminder);
  }

  acknowledgeReminder(reminderId) {
    const reminder = this.reminders.get(reminderId);
    if (!reminder) return { error: "Reminder not found" };

    reminder.state = REMINDER_STATES.ACKNOWLEDGED;
    reminder.acknowledgedAt = new Date().toISOString();
    reminder.stateHistory.push({ state: REMINDER_STATES.ACKNOWLEDGED, at: new Date().toISOString() });
    reminder.updatedAt = new Date().toISOString();
    this.reminders.set(reminderId, reminder);
    this.save();
    return reminder;
  }

  snoozeReminder(reminderId, minutes = 10) {
    const reminder = this.reminders.get(reminderId);
    if (!reminder) return { error: "Reminder not found" };

    reminder.state = REMINDER_STATES.SNOOZED;
    reminder.snoozedUntil = new Date(Date.now() + minutes * 60000).toISOString();
    reminder.updatedAt = new Date().toISOString();
    this.reminders.set(reminderId, reminder);
    this.save();

    setTimeout(() => {
      if (this.reminders.get(reminderId)?.state === REMINDER_STATES.SNOOZED) {
        this.fireReminder(reminderId);
      }
    }, minutes * 60000);

    return reminder;
  }

  createTimer(input) {
    const timerId = generateTimerId();
    const now = new Date().toISOString();
    
    const timer = {
      id: timerId,
      name: input.name,
      duration: input.duration,
      state: TIMER_STATES.IDLE,
      elapsed: 0,
      targetTime: input.targetTime || null,
      monotonicStart: null,
      createdAt: now,
      updatedAt: now,
    };

    this.timers.set(timerId, timer);
    this.save();
    return timer;
  }

  startTimer(timerId) {
    const timer = this.timers.get(timerId);
    if (!timer || timer.state === TIMER_STATES.RUNNING) return { error: "Timer not found or already running" };

    timer.state = TIMER_STATES.RUNNING;
    timer.monotonicStart = Date.now();
    timer.updatedAt = new Date().toISOString();
    this.timers.set(timerId, timer);
    this.save();

    this.startTimerInterval(timerId);
    return timer;
  }

  startTimerInterval(timerId) {
    const interval = setInterval(() => {
      const timer = this.timers.get(timerId);
      if (!timer || timer.state !== TIMER_STATES.RUNNING) {
        clearInterval(interval);
        return;
      }
      timer.elapsed = Date.now() - timer.monotonicStart;
      this.timers.set(timerId, timer);
    }, 1000);
  }

  pauseTimer(timerId) {
    const timer = this.timers.get(timerId);
    if (!timer || timer.state !== TIMER_STATES.RUNNING) return { error: "Timer not running" };

    timer.state = TIMER_STATES.PAUSED;
    timer.elapsed = Date.now() - timer.monotonicStart;
    timer.monotonicStart = null;
    timer.updatedAt = new Date().toISOString();
    this.timers.set(timerId, timer);
    this.save();
    return timer;
  }

  resetTimer(timerId) {
    const timer = this.timers.get(timerId);
    if (!timer) return { error: "Timer not found" };

    timer.state = TIMER_STATES.IDLE;
    timer.elapsed = 0;
    timer.monotonicStart = null;
    timer.updatedAt = new Date().toISOString();
    this.timers.set(timerId, timer);
    this.save();
    return timer;
  }

  createEvent(input) {
    const eventId = generateEventId();
    const now = new Date().toISOString();
    
    const event = {
      id: eventId,
      title: input.title,
      description: input.description || "",
      startAt: input.startAt,
      endAt: input.endAt,
      timezone: input.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
      allDay: input.allDay || false,
      recurrence: input.recurrence || null,
      attendees: input.attendees || [],
      organizer: input.organizer || null,
      location: input.location || "",
      calendarId: input.calendarId || null,
      seriesId: input.seriesId || null,
      thisEventOnly: input.thisEventOnly || false,
      reminders: input.reminders || [],
      createdAt: now,
      updatedAt: now,
    };

    this.events.set(eventId, event);
    this.save();
    return event;
  }

  getEvent(id) {
    return this.events.get(id) || null;
  }

  getAllEvents() {
    return Array.from(this.events.values());
  }

  updateEvent(id, updates) {
    const event = this.events.get(id);
    if (!event) return null;

    const updated = { ...event, ...updates, updatedAt: new Date().toISOString() };
    this.events.set(id, updated);
    this.save();
    return updated;
  }

  deleteEvent(id, thisEventOnly = false) {
    const event = this.events.get(id);
    if (!event) return { error: "Event not found" };

    if (event.recurrence && !thisEventOnly) {
      const seriesEvents = Array.from(this.events.values()).filter(e => e.seriesId === event.seriesId);
      seriesEvents.forEach(e => this.events.delete(e.id));
    } else {
      this.events.delete(id);
    }
    this.save();
    return { success: true };
  }

  createMeeting(input) {
    const meetingId = generateMeetingId();
    const now = new Date().toISOString();
    
    const meeting = {
      id: meetingId,
      title: input.title,
      description: input.description || "",
      eventId: input.eventId || null,
      state: MEETING_STATES.SCHEDULED,
      participants: input.participants || [],
      agenda: input.agenda || [],
      transcript: null,
      actionItems: [],
      startAt: input.startAt,
      endAt: input.endAt,
      recording: false,
      createdAt: now,
      updatedAt: now,
    };

    this.meetings.set(meetingId, meeting);
    this.save();
    return meeting;
  }

  getMeeting(id) {
    return this.meetings.get(id) || null;
  }

  startMeeting(meetingId) {
    const meeting = this.meetings.get(meetingId);
    if (!meeting) return { error: "Meeting not found" };

    meeting.state = MEETING_STATES.IN_PROGRESS;
    meeting.updatedAt = new Date().toISOString();
    this.meetings.set(meetingId, meeting);
    this.save();
    return meeting;
  }

  endMeeting(meetingId) {
    const meeting = this.meetings.get(meetingId);
    if (!meeting) return { error: "Meeting not found" };

    meeting.state = MEETING_STATES.COMPLETED;
    meeting.updatedAt = new Date().toISOString();
    this.meetings.set(meetingId, meeting);
    this.save();
    return meeting;
  }

  addActionItem(meetingId, input) {
    const meeting = this.meetings.get(meetingId);
    if (!meeting) return { error: "Meeting not found" };

    const actionItemId = generateActionItemId();
    const actionItem = {
      id: actionItemId,
      meetingId,
      description: input.description,
      assignee: input.assignee || null,
      dueAt: input.dueAt || null,
      state: "open",
      createdAt: new Date().toISOString(),
    };

    meeting.actionItems.push(actionItem);
    this.meetings.set(meetingId, meeting);
    this.actionItems.set(actionItemId, actionItem);
    this.save();
    return actionItem;
  }

  completeActionItem(actionItemId) {
    const actionItem = this.actionItems.get(actionItemId);
    if (!actionItem) return { error: "Action item not found" };

    actionItem.state = "completed";
    actionItem.completedAt = new Date().toISOString();
    this.actionItems.set(actionItemId, actionItem);
    this.save();
    return actionItem;
  }

  connectCalendar(input) {
    const connectionId = `cal_${Date.now()}`;
    const connection = {
      id: connectionId,
      provider: input.provider,
      accountId: input.accountId,
      accessToken: input.accessToken,
      refreshToken: input.refreshToken,
      expiresAt: input.expiresAt,
      calendars: input.calendars || [],
      syncEnabled: true,
      lastSync: null,
      createdAt: new Date().toISOString(),
    };
    this.calendarConnections.set(connectionId, connection);
    this.save();
    return connection;
  }

  getCalendarConnections() {
    return Array.from(this.calendarConnections.values());
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify(event, data) {
    this.listeners.forEach(l => {
      try { l(event, data); } catch (err) { console.error("Tasks/Calendar listener error:", err); }
    });
  }
}

export const tasksCalendarEngine = new TasksCalendarEngine();

export function createTask(input) {
  return tasksCalendarEngine.createTask(input);
}

export function getTask(id) {
  return tasksCalendarEngine.getTask(id);
}

export function getAllTasks() {
  return tasksCalendarEngine.getAllTasks();
}

export function getTasksByProject(projectId) {
  return tasksCalendarEngine.getTasksByProject(projectId);
}

export function getTasksByState(state) {
  return tasksCalendarEngine.getTasksByState(state);
}

export function updateTask(id, updates) {
  return tasksCalendarEngine.updateTask(id, updates);
}

export function setTaskState(id, state) {
  return tasksCalendarEngine.setTaskState(id, state);
}

export function addTaskDependency(taskId, dependencyId) {
  return tasksCalendarEngine.addDependency(taskId, dependencyId);
}

export function removeTaskDependency(taskId, dependencyId) {
  return tasksCalendarEngine.removeDependency(taskId, dependencyId);
}

export function getBlockedTasks(taskId) {
  return tasksCalendarEngine.getBlockedTasks(taskId);
}

export function createReminder(input) {
  return tasksCalendarEngine.createReminder(input);
}

export function getReminder(id) {
  return tasksCalendarEngine.getReminder(id);
}

export function getAllReminders() {
  return tasksCalendarEngine.getAllReminders();
}

export function acknowledgeReminder(reminderId) {
  return tasksCalendarEngine.acknowledgeReminder(reminderId);
}

export function snoozeReminder(reminderId, minutes) {
  return tasksCalendarEngine.snoozeReminder(reminderId, minutes);
}

export function createTimer(input) {
  return tasksCalendarEngine.createTimer(input);
}

export function startTimer(timerId) {
  return tasksCalendarEngine.startTimer(timerId);
}

export function pauseTimer(timerId) {
  return tasksCalendarEngine.pauseTimer(timerId);
}

export function resetTimer(timerId) {
  return tasksCalendarEngine.resetTimer(timerId);
}

export function createEvent(input) {
  return tasksCalendarEngine.createEvent(input);
}

export function getEvent(id) {
  return tasksCalendarEngine.getEvent(id);
}

export function getAllEvents() {
  return tasksCalendarEngine.getAllEvents();
}

export function updateEvent(id, updates) {
  return tasksCalendarEngine.updateEvent(id, updates);
}

export function deleteEvent(id, thisEventOnly) {
  return tasksCalendarEngine.deleteEvent(id, thisEventOnly);
}

export function createMeeting(input) {
  return tasksCalendarEngine.createMeeting(input);
}

export function getMeeting(id) {
  return tasksCalendarEngine.getMeeting(id);
}

export function startMeeting(meetingId) {
  return tasksCalendarEngine.startMeeting(meetingId);
}

export function endMeeting(meetingId) {
  return tasksCalendarEngine.endMeeting(meetingId);
}

export function addActionItem(meetingId, input) {
  return tasksCalendarEngine.addActionItem(meetingId, input);
}

export function completeActionItem(actionItemId) {
  return tasksCalendarEngine.completeActionItem(actionItemId);
}

export function connectCalendar(input) {
  return tasksCalendarEngine.connectCalendar(input);
}

export function getCalendarConnections() {
  return tasksCalendarEngine.getCalendarConnections();
}

export function subscribeToTasksCalendar(listener) {
  return tasksCalendarEngine.subscribe(listener);
}

export { TASK_STATES, PRIORITIES, REMINDER_STATES, TIMER_STATES, MEETING_STATES };

export default tasksCalendarEngine;