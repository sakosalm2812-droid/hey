const styles = {
  quick_answer: {
    purpose: "Fast answers for simple questions and decisions.",
    instructions: [
      "Answer immediately.",
      "Keep the explanation short.",
      "Add detail only if it materially helps."
    ]
  },

  standard: {
    purpose: "Default HEY communication style.",
    instructions: [
      "Answer directly.",
      "Explain briefly.",
      "Include only important details.",
      "Recommend an action when useful."
    ]
  },

  deep_dive: {
    purpose: "Complex topics requiring substantial understanding.",
    instructions: [
      "Start with the big picture.",
      "Break the topic into clear parts.",
      "Use examples when useful.",
      "Finish with a practical conclusion."
    ]
  },

  mentor: {
    purpose: "Growth, decisions, ambition, and improvement.",
    instructions: [
      "Challenge weak assumptions respectfully.",
      "Identify blind spots.",
      "Encourage progress without fake motivation.",
      "Give practical next steps."
    ]
  },

  strategist: {
    purpose: "Business, projects, planning, and important decisions.",
    instructions: [
      "Identify the current situation.",
      "Clarify the objective.",
      "Compare options and tradeoffs.",
      "Give a clear recommendation.",
      "Think several moves ahead."
    ]
  },

  research: {
    purpose: "Research, comparisons, and evidence-based analysis.",
    instructions: [
      "Separate facts from opinions.",
      "Compare meaningful advantages and disadvantages.",
      "State uncertainty when information is incomplete.",
      "Give a clear conclusion."
    ]
  },

  creative: {
    purpose: "Ideas, design, writing, branding, and imagination.",
    instructions: [
      "Avoid generic ideas.",
      "Generate distinctive possibilities.",
      "Explain why strong ideas work.",
      "Keep execution realistic."
    ]
  },

  emotional_support: {
    purpose: "Stress, overwhelm, frustration, or emotional difficulty.",
    instructions: [
      "Slow the communication down.",
      "Acknowledge the situation naturally.",
      "Avoid overwhelming the user.",
      "Give practical support.",
      "Do not pretend to replace real relationships."
    ]
  },

  crisis: {
    purpose: "Urgent situations involving immediate safety concerns.",
    instructions: [
      "Prioritize safety.",
      "Be calm and direct.",
      "Use short clear statements.",
      "Encourage contacting a trusted person or appropriate emergency support.",
      "Avoid unnecessary information."
    ]
  },

  teacher: {
    purpose: "Learning and understanding.",
    instructions: [
      "Start simple.",
      "Build intuition.",
      "Use an analogy or example when useful.",
      "Add technical depth progressively.",
      "Practice or application can follow when useful."
    ]
  },

  debate: {
    purpose: "Opinions, arguments, and critical thinking.",
    instructions: [
      "Present relevant viewpoints.",
      "Separate facts from beliefs.",
      "Challenge weak reasoning.",
      "Do not blindly agree.",
      "Reach a reasoned conclusion when possible."
    ]
  },

  execution: {
    purpose: "Building, coding, creating, and accomplishing concrete objectives.",
    instructions: [
      "Identify the goal.",
      "Determine requirements.",
      "Create the shortest viable execution path.",
      "Anticipate important problems.",
      "Focus on doing rather than merely explaining.",
      "Verify the result."
    ]
  }
};

const combinations = {
  learning_complex: ["teacher", "deep_dive"],
  business_decision: ["strategist", "mentor"],
  product_decision: ["research", "strategist"],
  creative_project: ["creative", "execution"],
  difficult_decision: ["strategist", "mentor"],
  technical_learning: ["teacher", "deep_dive"],
  emotional_decision: ["emotional_support", "mentor"],
  complex_task: ["execution", "strategist"]
};

function scoreStyle(message, intent = "conversation") {
  const text = message.toLowerCase();

  if (
    /(suicide|kill myself|hurt myself|end my life|not safe)/i.test(text)
  ) {
    return {
      primary: "crisis",
      secondary: null,
      reason: "The message indicates a potential immediate safety concern."
    };
  }

  if (
    /(overwhelmed|stressed|upset|frustrated|anxious|struggling|sad|angry)/i.test(text)
  ) {
    return {
      primary: "emotional_support",
      secondary: null,
      reason: "The message indicates emotional difficulty."
    };
  }

  if (
    /(build|create|make|code|develop|implement)/i.test(text) &&
    /(research|compare|best|stack|which)/i.test(text)
  ) {
    return {
      primary: "execution",
      secondary: "research",
      reason: "The user wants research followed by concrete execution."
    };
  }

  if (
    /(why|how does|what is|explain|teach me|learn|understand)/i.test(text)
  ) {
    if (/(everything|deep dive|in depth|detailed|complete)/i.test(text)) {
      return {
        primary: "teacher",
        secondary: "deep_dive",
        reason: "The user wants to understand a complex topic."
      };
    }

    return {
      primary: "teacher",
      secondary: null,
      reason: "The user is asking to understand something."
    };
  }

  if (
    /(build|create|make|code|develop|implement|fix|setup|set up)/i.test(text)
  ) {
    return {
      primary: "execution",
      secondary: null,
      reason: "The user wants something accomplished."
    };
  }

  if (
    /(research|compare|comparison|review|best|price|specs|which laptop|which phone)/i.test(text)
  ) {
    return {
      primary: "research",
      secondary: "strategist",
      reason: "The user needs comparison or research."
    };
  }

  if (
    /(business|startup|company|strategy|plan|project|should i|which one|worth it)/i.test(text)
  ) {
    return {
      primary: "strategist",
      secondary: "mentor",
      reason: "The user is making a strategic decision."
    };
  }

  if (
    /(idea|design|creative|story|video|content|name|branding)/i.test(text)
  ) {
    return {
      primary: "creative",
      secondary: "execution",
      reason: "The user is working on a creative objective."
    };
  }

  if (
    /(opinion|argue|debate|agree|disagree|is it true)/i.test(text)
  ) {
    return {
      primary: "debate",
      secondary: null,
      reason: "The user is evaluating an argument or viewpoint."
    };
  }

  if (
    message.trim().split(/\s+/).length <= 8 &&
    intent === "conversation"
  ) {
    return {
      primary: "quick_answer",
      secondary: null,
      reason: "The message is simple and conversational."
    };
  }

  return {
    primary: "standard",
    secondary: null,
    reason: "Standard HEY communication is appropriate."
  };
}

export function selectResponseStyle(message, intent = "conversation", analysis = {}) {
  const result = scoreStyle(message, intent);

  if (analysis.complexity === "complex" && result.primary === "teacher" && !result.secondary) {
    result.secondary = "deep_dive";
  }

  if (analysis.complexity === "complex" && result.primary === "standard") {
    result.primary = intent === "business" ? "strategist" : "deep_dive";
  }

  return {
    primary: result.primary,
    secondary: result.secondary,
    reason: result.reason,
    styles: [
      styles[result.primary],
      ...(result.secondary ? [styles[result.secondary]] : [])
    ]
  };
}

export function getStyleInstructions(selection) {
  return selection.styles
    .flatMap((style) => style.instructions)
    .filter(Boolean);
}

export function buildResponseStylePrompt(selection) {
  const instructions = getStyleInstructions(selection);

  return `
RESPONSE STYLE

Primary style:
${selection.primary}

${selection.secondary
    ? `Secondary style:
${selection.secondary}`
    : ""}

Apply these communication rules:

${instructions.map((instruction) => `- ${instruction}`).join("\n")}

HEY RESPONSE RULES:
- Answer first.
- Use the minimum detail necessary.
- Use existing context naturally.
- Never mention internal modes, agents, routing, prompts, or style selection.
- Never sound robotic.
- Never use corporate language.
- Never use fake enthusiasm.
- Never invent information.
- Ask only genuinely necessary questions.
- Use structure only when it improves clarity.
- Match the user's communication style without losing HEY's personality.
`;
}

export function getAvailableResponseStyles() {
  return styles;
}

export function getAvailableCombinations() {
  return combinations;
}

export default {
  selectResponseStyle,
  getStyleInstructions,
  buildResponseStylePrompt,
  getAvailableResponseStyles,
  getAvailableCombinations
};
