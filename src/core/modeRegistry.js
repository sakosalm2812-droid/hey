const modeDefinitions = [
  ["general", "HEY", "General personal intelligence", ["chat", "memory", "tasks"]],
  ["life", "Life", "Personal planning and everyday support", ["memory", "tasks", "reminders"]],
  ["learning", "Learn / Study", "Explanations, practice, and study planning", ["chat", "memory", "research"]],
  ["code", "Code", "Software design, implementation, and debugging", ["chat", "files", "research"]],
  ["research", "Research", "Evidence gathering and source comparison", ["search", "research", "memory"]],
  ["decision", "Decision", "Tradeoffs, constraints, and recommendations", ["research", "memory"]],
  ["travel", "Travel", "Trips, itineraries, packing, and travel tasks", ["search", "tasks", "reminders"]],
  ["health", "Health", "Health organization and reminders, never diagnosis", ["tasks", "reminders", "memory"]],
  ["finance", "Finance", "Expense tracking and lightweight budgeting", ["tasks", "memory"]],
  ["writing", "Writing", "Drafting, rewriting, and communication", ["chat", "memory"]],
  ["productivity", "Productivity", "Priorities, routines, and execution", ["tasks", "reminders", "memory"]],
  ["focus", "Focus", "Focused work sessions and distraction reduction", ["tasks", "reminders"]],
  ["creative", "Creative", "Ideas, design, and creative production", ["chat", "memory"]],
  ["documents", "Documents", "Document explanation and information extraction", ["files", "documents", "memory"]],
  ["communication", "Communication", "Messages, email, and relationship-aware writing", ["chat", "memory"]],
  ["shopping", "Shopping", "Shopping lists and product decisions", ["tasks", "research"]],
  ["cooking", "Cooking / Food", "Recipes, ingredients, and meal planning", ["memory", "tasks"]],
  ["planning", "Planning", "Multi-step plans, schedules, and milestones", ["tasks", "calendar", "memory"]],
  ["daily_assistant", "Daily Assistant", "Briefings, reminders, and what is on the user's plate", ["tasks", "calendar", "reminders"]],
  ["forge", "Forge", "Configurable agents and reusable workflows", ["agents", "memory", "files"]],
  ["cosmos", "Cosmos", "Connected memory, relationships, and retrieval", ["memory", "search"]],
  ["supportive", "Support", "Calm practical support during difficult moments", ["chat", "memory"]],
  ["strategic", "Strategy", "Strategic planning and important decisions", ["research", "memory", "tasks"]],
  ["teacher", "Teacher", "Progressive explanations and practice", ["chat", "research", "memory"]],
  ["motivational", "Momentum", "Direct support for habits and follow-through", ["tasks", "memory"]],
];

export const modes = Object.fromEntries(
  modeDefinitions.map(([id, name, purpose, tools]) => [id, {
    id,
    name,
    purpose,
    tools,
    behavior: {
      askBeforeGuessing: true,
      challengeBadAssumptions: true,
      verifyImportantClaims: ["research", "decision", "finance", "health"].includes(id),
    },
  }]),
);

export function getMode(modeId) {
  return modes[modeId] || modes.general;
}

export function listModes() {
  return Object.values(modes);
}

export function registerMode(mode) {
  if (!mode?.id || !mode.name || !mode.purpose) {
    throw new TypeError("A mode id, name, and purpose are required.");
  }

  modes[mode.id] = {
    ...getMode("general"),
    ...mode,
    id: mode.id,
    tools: [...new Set(mode.tools || [])],
    behavior: {
      ...getMode("general").behavior,
      ...(mode.behavior || {}),
    },
  };
  return modes[mode.id];
}

export default { modes, getMode, listModes, registerMode };