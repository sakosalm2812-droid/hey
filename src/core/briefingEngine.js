export function createMorningBriefing(data = {}) {
  const tasks = Array.isArray(data.tasks) ? data.tasks : [];
  const events = Array.isArray(data.events) ? data.events : [];
  const reminders = Array.isArray(data.reminders) ? data.reminders : [];
  const priorities = Array.isArray(data.priorities) ? data.priorities : [];
  const topTasks = tasks.filter((task) => task.status !== "completed").sort((left, right) => ({ high: 0, normal: 1, low: 2 }[left.priority] ?? 1) - ({ high: 0, normal: 1, low: 2 }[right.priority] ?? 1)).slice(0, 3);
  return {
    generatedAt: new Date(),
    greeting: data.greeting || "Good morning.",
    focus: priorities[0] || topTasks[0]?.description || "Choose one meaningful priority for today.",
    priorities,
    topTasks,
    events,
    reminders,
    weather: data.weather || null,
    notifications: data.notifications || [],
    gaps: [
      !tasks.length && "No tasks are connected.",
      !events.length && "No calendar events are connected.",
      !data.weather && "Weather is unavailable.",
    ].filter(Boolean),
  };
}

export default { createMorningBriefing };