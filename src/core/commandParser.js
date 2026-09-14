function clean(value) {
  return String(value || "").replace(/[.!?]+$/, "").trim();
}

export function parseNaturalCommand(message) {
  const text = clean(message);
  if (!text) return null;

  const steps = text.split(/\s*,\s*|\s+then\s+|\s+and\s+(?=(?:open|close|go|search|find|read|save|summarize|create|run|organize|navigate)\b)/i).map(clean).filter(Boolean);
  if (steps.length > 1) {
    return {
      kind: "workflow",
      steps: steps.map((step) => parseNaturalCommand(step) || { kind: "conversation", text: step }),
      needsClarification: false,
    };
  }

  const reminderMatch = text.match(/^(?:hey,?\s+)?(?:remind me|set (?:a )?reminder|alarm)\s+(?:to\s+)?(.+?)(?:\s+(?:at|on)\s+(.+))?$/i);
  if (reminderMatch) {
    return {
      kind: "reminder",
      description: clean(reminderMatch[1]),
      scheduleText: clean(reminderMatch[2]),
      needsClarification: !reminderMatch[1] || !reminderMatch[2],
    };
  }

  const expenseMatch = text.match(/^(?:spent|paid)\s+\$?([0-9]+(?:\.[0-9]{1,2})?)\s*(?:dollars?|usd)?\s+(?:on|for)\s+(.+)$/i);
  if (expenseMatch) {
    return {
      kind: "expense",
      amount: Number(expenseMatch[1]),
      description: clean(expenseMatch[2]),
      needsClarification: false,
    };
  }

  const taskMatch = text.match(/^(?:create|add|make)\s+(?:a\s+)?(?:task|to-?do|checklist item)\s*(?::|to)?\s*(.+)$/i);
  if (taskMatch) {
    return {
      kind: "task",
      description: clean(taskMatch[1]),
      needsClarification: !taskMatch[1],
    };
  }

  const urlMatch = text.match(/^(?:open|go to|navigate to)\s+(https?:\/\/\S+)$/i);
  if (urlMatch) return { kind: "open_url", url: urlMatch[1], needsClarification: false };

  const destinationMatch = text.match(/^(?:go to|navigate to)\s+(.+)$/i);
  if (destinationMatch) return { kind: "computer", operation: "navigate_browser", target: clean(destinationMatch[1]), needsClarification: false };

  const searchMatch = text.match(/^(?:search(?: for)?|look up)\s+(.+)$/i);
  if (searchMatch) return { kind: "web_search", query: clean(searchMatch[1]), needsClarification: false };

  const readMatch = text.match(/^(?:read|summarize|inspect)\s+(.+)$/i);
  if (readMatch) return { kind: "read", target: clean(readMatch[1]), needsClarification: false };

  const saveMatch = text.match(/^(?:save|remember)\s+(this|that|.+)$/i);
  if (saveMatch) return { kind: "save", target: clean(saveMatch[1]), needsClarification: false };

  if (/^(?:look at|inspect|understand)\s+(?:my\s+)?screen$/i.test(text)) {
    return { kind: "screen_inspection", needsClarification: false };
  }

  const computerMatch = text.match(/^(open|close|quit|restart|shutdown|shut down|run|execute|read|edit|create|organize|find|take)\s+(.+)$/i);
  if (computerMatch) {
    const operation = computerMatch[1].toLowerCase().replace(" ", "_");
    return {
      kind: "computer",
      operation,
      target: clean(computerMatch[2]),
      needsClarification: false,
    };
  }

  return null;
}

export default { parseNaturalCommand };