/**
 * HEY Agent Workforce
 *
 * Architecture:
 *
 *                    ┌──────────────────────┐
 *                    │      HEY BRAIN       │
 *                    └──────────┬───────────┘
 *                               │
 *                    ┌──────────▼───────────┐
 *                    │     ORCHESTRATOR     │
 *                    └──────────┬───────────┘
 *                               │
 *          ┌────────────────────┼────────────────────┐
 *          │                    │                    │
 *     Specialists           Platform             Domain
 *     & Creators             Agents              Agents
 *          │                    │                    │
 *      research             memory               future
 *      engineering          permissions           specialties
 *      design               verification
 *      business             execution
 *      learning             audit
 *      etc.                 etc.
 *
 * Agents are specialists, not independent brains.
 * HEY's orchestration layer decides which agents are useful.
 */

const BASE_DEFAULTS = {
  status: "idle",
  tools: [],
  requiredPermissions: [],
  inputFormat:
    "Natural-language request with relevant context.",
  outputFormat:
    "Structured result with evidence, status, and next action.",
  riskLevel: "low",
  preferredModel:
    "qwen/qwen3-next-80b-a3b-instruct:free",
  fallbackModel:
    "configured model fallback",
  verificationMethod:
    "Check result against the request and available evidence.",
  failureBehavior:
    "Stop safely, explain the blocker, and offer the next best option.",
  testCases: [
    "Handles a valid request",
    "Reports missing permissions",
    "Reports tool failure",
  ],
};

function defineAgent(config) {
  return {
    ...BASE_DEFAULTS,
    ...config,
    capabilities: Array.isArray(config.capabilities)
      ? config.capabilities
      : [],
    tools: Array.isArray(config.tools)
      ? config.tools
      : [],
    requiredPermissions: Array.isArray(
      config.requiredPermissions,
    )
      ? config.requiredPermissions
      : [],
  };
}

/* =========================================================
   PRIMARY SPECIALISTS
   ========================================================= */

const specialistAgents = [
  defineAgent({
    id: "architect",
    name: "Architect",
    role: "System Designer",
    category: "Creation",
    description:
      "Designs systems, architectures and long-term technical strategies.",
    capabilities: [
      "System architecture",
      "Technical planning",
      "Product structure",
      "Scalability",
      "Technical tradeoffs",
    ],
    intents: [
      "architecture",
      "planning",
      "design",
      "build",
      "technical strategy",
    ],
    keywords: [
      "architecture",
      "system",
      "platform",
      "scalable",
      "structure",
    ],
    personality:
      "Precise, strategic and future-focused.",
  }),

  defineAgent({
    id: "builder",
    name: "Builder",
    role: "Full Stack Engineer",
    category: "Creation",
    description:
      "Transforms ideas into functional applications and experiences.",
    capabilities: [
      "Frontend development",
      "Backend development",
      "Database design",
      "API integration",
      "Implementation",
      "Refactoring",
    ],
    intents: [
      "build",
      "code",
      "develop",
      "implement",
      "fix",
    ],
    keywords: [
      "build",
      "code",
      "website",
      "app",
      "implement",
      "develop",
    ],
    tools: [
      "filesystem",
      "code",
      "terminal",
      "browser",
    ],
    personality:
      "Fast, practical and execution-focused.",
  }),

  defineAgent({
    id: "designer",
    name: "Designer",
    role: "Product UI/UX Designer",
    category: "Creation",
    description:
      "Creates premium interfaces, visual systems and product experiences.",
    capabilities: [
      "Interface design",
      "Design systems",
      "Visual direction",
      "Interaction design",
      "Product aesthetics",
    ],
    intents: [
      "design",
      "ui",
      "ux",
      "brand",
    ],
    keywords: [
      "design",
      "ui",
      "interface",
      "visual",
      "layout",
    ],
    personality:
      "Creative, elegant and detail-obsessed.",
  }),

  defineAgent({
    id: "strategist",
    name: "Strategist",
    role: "Business Intelligence Specialist",
    category: "Business",
    description:
      "Analyzes markets, opportunities and strategic decisions.",
    capabilities: [
      "Business models",
      "Competition analysis",
      "Growth strategy",
      "Decision making",
      "Opportunity analysis",
    ],
    intents: [
      "strategy",
      "business",
      "compare",
      "decision",
      "growth",
    ],
    keywords: [
      "business",
      "strategy",
      "market",
      "competitor",
      "growth",
      "best",
    ],
    personality:
      "Analytical, direct and ambitious.",
  }),

  defineAgent({
    id: "marketer",
    name: "Marketer",
    role: "Growth Engine",
    category: "Business",
    description:
      "Creates marketing systems that attract, educate and convert audiences.",
    capabilities: [
      "Content strategy",
      "Brand building",
      "Campaign strategy",
      "Audience psychology",
      "Growth experiments",
    ],
    intents: [
      "marketing",
      "growth",
      "content",
      "campaign",
    ],
    keywords: [
      "marketing",
      "campaign",
      "audience",
      "ads",
      "growth",
    ],
    personality:
      "Creative, persuasive and experimental.",
  }),

  defineAgent({
    id: "researcher",
    name: "Researcher",
    role: "Knowledge Explorer",
    category: "Knowledge",
    description:
      "Finds, organizes and explains information from reliable sources.",
    capabilities: [
      "Research",
      "Source discovery",
      "Summaries",
      "Fact analysis",
      "Knowledge synthesis",
    ],
    intents: [
      "research",
      "compare",
      "investigate",
      "learn",
    ],
    keywords: [
      "research",
      "find",
      "compare",
      "which",
      "best",
      "investigate",
    ],
    personality:
      "Curious, accurate and thorough.",
  }),

  defineAgent({
    id: "teacher",
    name: "Teacher",
    role: "Learning Mentor",
    category: "Knowledge",
    description:
      "Explains difficult subjects clearly and builds useful learning paths.",
    capabilities: [
      "Education",
      "Examples",
      "Study plans",
      "Skill development",
      "Concept explanation",
    ],
    intents: [
      "learn",
      "explain",
      "study",
      "education",
    ],
    keywords: [
      "explain",
      "learn",
      "teach",
      "study",
      "how does",
      "why",
    ],
    personality:
      "Patient, clear and encouraging.",
  }),

  defineAgent({
    id: "creator",
    name: "Creator",
    role: "Creative Intelligence",
    category: "Creative",
    description:
      "Generates ideas, stories, concepts and creative directions.",
    capabilities: [
      "Writing",
      "Storytelling",
      "Concept development",
      "Creative direction",
      "Ideation",
    ],
    intents: [
      "create",
      "write",
      "story",
      "creative",
    ],
    keywords: [
      "create",
      "idea",
      "story",
      "creative",
      "concept",
    ],
    personality:
      "Imaginative, original and expressive.",
  }),

  defineAgent({
    id: "analyst",
    name: "Analyst",
    role: "Data Intelligence Specialist",
    category: "Business",
    description:
      "Turns information and data into useful decisions.",
    capabilities: [
      "Data analysis",
      "Pattern recognition",
      "Reports",
      "Optimization",
      "Metrics",
    ],
    intents: [
      "analysis",
      "data",
      "compare",
      "optimization",
    ],
    keywords: [
      "data",
      "analysis",
      "numbers",
      "metrics",
      "statistics",
    ],
    personality:
      "Logical and objective.",
  }),

  defineAgent({
    id: "coach",
    name: "Coach",
    role: "Performance Mentor",
    category: "Personal",
    description:
      "Helps users turn goals into realistic action and progress.",
    capabilities: [
      "Goal setting",
      "Habits",
      "Planning",
      "Accountability",
      "Progress review",
    ],
    intents: [
      "goals",
      "planning",
      "productivity",
      "habits",
    ],
    keywords: [
      "goal",
      "habit",
      "routine",
      "discipline",
      "productivity",
    ],
    personality:
      "Motivating, honest and focused.",
  }),
];

/* =========================================================
   ENGINEERING
   ========================================================= */

const engineeringAgents = [
  defineAgent({
    id: "debugger",
    name: "Debugger",
    role: "Debugging Specialist",
    category: "Engineering",
    description:
      "Finds root causes in broken software and explains precise fixes.",
    capabilities: [
      "Bug isolation",
      "Error analysis",
      "Root-cause analysis",
      "Regression prevention",
    ],
    intents: ["debug", "fix", "error"],
    keywords: [
      "bug",
      "error",
      "broken",
      "crash",
      "fails",
      "fix",
    ],
  }),

  defineAgent({
    id: "frontend",
    name: "Frontend Engineer",
    role: "Frontend Specialist",
    category: "Engineering",
    description:
      "Builds responsive, accessible and performant client-side systems.",
    capabilities: [
      "React",
      "UI implementation",
      "Accessibility",
      "Performance",
      "Responsive design",
    ],
    intents: ["frontend", "ui", "build"],
    keywords: [
      "react",
      "frontend",
      "component",
      "css",
      "interface",
    ],
  }),

  defineAgent({
    id: "backend",
    name: "Backend Engineer",
    role: "Backend Specialist",
    category: "Engineering",
    description:
      "Designs reliable APIs, services, authentication and data flows.",
    capabilities: [
      "APIs",
      "Databases",
      "Authentication",
      "Services",
      "Data flows",
    ],
    intents: ["backend", "api", "database"],
    keywords: [
      "backend",
      "api",
      "server",
      "database",
      "endpoint",
    ],
  }),

  defineAgent({
    id: "automation",
    name: "Automation Engineer",
    role: "Workflow Automation Specialist",
    category: "Engineering",
    description:
      "Turns repeatable processes into safe, observable workflows.",
    capabilities: [
      "Workflow design",
      "Triggers",
      "Integrations",
      "Automation",
      "Scheduling",
    ],
    intents: ["automation", "workflow"],
    keywords: [
      "automate",
      "automation",
      "workflow",
      "trigger",
      "repeat",
    ],
  }),

  defineAgent({
    id: "integrator",
    name: "Integrator",
    role: "Systems Integration Specialist",
    category: "Engineering",
    description:
      "Connects independent systems into coherent and reliable workflows.",
    capabilities: [
      "Data flow",
      "Service contracts",
      "API integration",
      "Reliability",
    ],
    intents: ["integration", "connect"],
    keywords: [
      "integrate",
      "connect",
      "sync",
      "integration",
    ],
  }),

  defineAgent({
    id: "devops",
    name: "DevOps Agent",
    role: "Infrastructure Specialist",
    category: "Engineering",
    description:
      "Handles deployment architecture, environments, observability and recovery planning.",
    capabilities: [
      "Deployment",
      "CI/CD",
      "Infrastructure",
      "Observability",
      "Recovery",
    ],
    intents: ["deployment", "devops", "infrastructure"],
    keywords: [
      "deploy",
      "deployment",
      "server",
      "hosting",
      "ci",
      "cd",
    ],
  }),

  defineAgent({
    id: "database",
    name: "Database Agent",
    role: "Database Specialist",
    category: "Engineering",
    description:
      "Designs schemas, migrations, queries and data lifecycle policies.",
    capabilities: [
      "Schemas",
      "SQL",
      "Migrations",
      "Indexes",
      "Data lifecycle",
    ],
    intents: ["database", "sql", "data"],
    keywords: [
      "database",
      "sql",
      "schema",
      "migration",
      "table",
    ],
  }),

  defineAgent({
    id: "code-review",
    name: "Code Review Agent",
    role: "Software Quality Specialist",
    category: "Engineering",
    description:
      "Reviews implementation quality, maintainability, security and regressions.",
    capabilities: [
      "Code review",
      "Maintainability",
      "Security review",
      "Regression detection",
    ],
    intents: ["review", "quality", "code"],
    keywords: [
      "review",
      "quality",
      "refactor",
      "security",
    ],
  }),

  defineAgent({
    id: "security",
    name: "Security Advisor",
    role: "Application Security Specialist",
    category: "Engineering",
    description:
      "Identifies practical security threats and recommends defensive controls.",
    capabilities: [
      "Threat modeling",
      "Access control",
      "Secret handling",
      "Security architecture",
      "Abuse prevention",
    ],
    intents: ["security", "audit", "threat"],
    keywords: [
      "security",
      "secure",
      "permission",
      "auth",
      "attack",
      "threat",
    ],
    riskLevel: "low",
  }),

  defineAgent({
    id: "tester",
    name: "Tester",
    role: "Quality Assurance Specialist",
    category: "Engineering",
    description:
      "Checks whether results work reliably across expected and edge cases.",
    capabilities: [
      "Test design",
      "Acceptance testing",
      "Regression testing",
      "Edge cases",
    ],
    intents: ["test", "verify", "quality"],
    keywords: [
      "test",
      "testing",
      "verify",
      "qa",
      "regression",
    ],
  }),
];

/* =========================================================
   CREATIVE
   ========================================================= */

const creativeAgents = [
  defineAgent({
    id: "ux",
    name: "UX Researcher",
    role: "User Experience Specialist",
    category: "Creation",
    description:
      "Turns user needs and behavior into clearer product experiences.",
    capabilities: [
      "User journeys",
      "Usability",
      "Information architecture",
      "Interaction analysis",
    ],
    intents: ["ux", "usability", "research"],
    keywords: [
      "ux",
      "user",
      "usability",
      "journey",
      "experience",
    ],
  }),

  defineAgent({
    id: "writer",
    name: "Writer",
    role: "Writing Intelligence",
    category: "Creative",
    description:
      "Creates clear and distinctive writing for products and communication.",
    capabilities: [
      "Drafting",
      "Editing",
      "Voice matching",
      "Copywriting",
      "Storytelling",
    ],
    intents: ["writing", "content", "copy"],
    keywords: [
      "write",
      "writing",
      "copy",
      "article",
      "script",
      "caption",
    ],
    personality:
      "Clear, expressive and intentional.",
  }),

  defineAgent({
    id: "editor",
    name: "Editor",
    role: "Editorial Quality Specialist",
    category: "Creative",
    description:
      "Improves clarity, structure and correctness without flattening voice.",
    capabilities: [
      "Editing",
      "Proofreading",
      "Structure",
      "Tone",
    ],
    intents: ["edit", "proofread", "writing"],
    keywords: [
      "edit",
      "proofread",
      "grammar",
      "rewrite",
    ],
  }),

  defineAgent({
    id: "media",
    name: "Media Strategist",
    role: "Media Specialist",
    category: "Creative",
    description:
      "Plans video, audio and visual content for defined audiences.",
    capabilities: [
      "Content formats",
      "Editorial calendars",
      "Distribution",
      "Media strategy",
    ],
    intents: ["media", "video", "content"],
    keywords: [
      "video",
      "youtube",
      "media",
      "audio",
      "content",
    ],
  }),

  defineAgent({
    id: "creative-director",
    name: "Creative Director",
    role: "Creative Direction Specialist",
    category: "Creative",
    description:
      "Maintains coherent creative direction across brand and product work.",
    capabilities: [
      "Creative direction",
      "Visual consistency",
      "Campaign direction",
      "Brand coherence",
    ],
    intents: ["creative", "brand", "direction"],
    keywords: [
      "creative",
      "direction",
      "brand",
      "visual identity",
    ],
  }),

  defineAgent({
    id: "branding",
    name: "Branding Agent",
    role: "Brand Strategy Specialist",
    category: "Creative",
    description:
      "Builds distinctive brand positioning, voice and visual systems.",
    capabilities: [
      "Brand strategy",
      "Positioning",
      "Voice",
      "Visual identity",
    ],
    intents: ["branding", "brand"],
    keywords: [
      "brand",
      "branding",
      "identity",
      "logo",
      "positioning",
    ],
  }),

  defineAgent({
    id: "ui-design",
    name: "UI Design Agent",
    role: "Interface Design Specialist",
    category: "Creative",
    description:
      "Creates usable, accessible and premium interface systems.",
    capabilities: [
      "UI systems",
      "Components",
      "Accessibility",
      "Visual hierarchy",
    ],
    intents: ["ui", "design"],
    keywords: [
      "ui",
      "interface",
      "component",
      "screen",
      "layout",
    ],
  }),

  defineAgent({
    id: "accessibility",
    name: "Accessibility Advisor",
    role: "Inclusive Design Specialist",
    category: "Creation",
    description:
      "Improves usability for people with different abilities and contexts.",
    capabilities: [
      "WCAG",
      "Inclusive interaction",
      "Keyboard navigation",
      "Assistive technology",
    ],
    intents: ["accessibility", "ux", "design"],
    keywords: [
      "accessibility",
      "wcag",
      "screen reader",
      "keyboard",
      "inclusive",
    ],
  }),
];

/* =========================================================
   OPERATIONS / PRODUCTIVITY
   ========================================================= */

const productivityAgents = [
  defineAgent({
    id: "planner",
    name: "Planner",
    role: "Execution Planning Specialist",
    category: "Operations",
    description:
      "Breaks complex goals into ordered, verifiable work.",
    capabilities: [
      "Dependencies",
      "Priorities",
      "Milestones",
      "Completion criteria",
      "Risk planning",
    ],
    intents: ["planning", "tasks", "projects"],
    keywords: [
      "plan",
      "steps",
      "roadmap",
      "milestone",
      "schedule",
    ],
  }),

  defineAgent({
    id: "productivity",
    name: "Productivity Coach",
    role: "Productivity Specialist",
    category: "Personal",
    description:
      "Converts attention, time and priorities into consistent progress.",
    capabilities: [
      "Focus systems",
      "Prioritization",
      "Routines",
      "Time planning",
    ],
    intents: ["productivity", "focus", "planning"],
    keywords: [
      "focus",
      "productive",
      "time",
      "prioritize",
      "routine",
    ],
  }),

  defineAgent({
    id: "project",
    name: "Project Manager",
    role: "Project Delivery Specialist",
    category: "Operations",
    description:
      "Keeps multi-step work aligned with scope, timing, risks and decisions.",
    capabilities: [
      "Scope",
      "Milestones",
      "Risks",
      "Dependencies",
      "Delivery",
    ],
    intents: ["project", "planning"],
    keywords: [
      "project",
      "deadline",
      "milestone",
      "delivery",
    ],
  }),

  defineAgent({
    id: "taskmaster",
    name: "Task Coordinator",
    role: "Task Operations Specialist",
    category: "Operations",
    description:
      "Maintains task state, ownership, dependencies and next actions.",
    capabilities: [
      "Task queues",
      "Status tracking",
      "Handoffs",
      "Dependencies",
    ],
    intents: ["tasks", "planning"],
    keywords: [
      "task",
      "todo",
      "queue",
      "status",
      "next",
    ],
  }),

  defineAgent({
    id: "task",
    name: "Task Agent",
    role: "Task Management Specialist",
    category: "Productivity",
    description:
      "Creates, prioritizes, updates and verifies actionable tasks.",
    capabilities: [
      "Task creation",
      "Prioritization",
      "Task updates",
      "Completion tracking",
    ],
    intents: ["tasks", "todo"],
    keywords: [
      "task",
      "todo",
      "remind me",
      "remember to",
    ],
  }),

  defineAgent({
    id: "calendar",
    name: "Calendar Agent",
    role: "Scheduling Specialist",
    category: "Productivity",
    description:
      "Organizes calendar commitments while respecting scheduling permissions.",
    capabilities: [
      "Calendar management",
      "Scheduling",
      "Availability",
      "Conflict detection",
    ],
    intents: ["calendar", "schedule"],
    keywords: [
      "calendar",
      "meeting",
      "appointment",
      "schedule",
    ],
    requiredPermissions: [
      "calendar.read",
      "calendar.write",
    ],
  }),

  defineAgent({
    id: "reminder",
    name: "Reminder Agent",
    role: "Reminder Specialist",
    category: "Productivity",
    description:
      "Creates useful reminders without creating notification noise.",
    capabilities: [
      "Reminders",
      "Timing",
      "Notification management",
    ],
    intents: ["reminder"],
    keywords: [
      "remind",
      "reminder",
      "remember",
    ],
  }),

  defineAgent({
    id: "routine",
    name: "Routine Agent",
    role: "Routine Specialist",
    category: "Productivity",
    description:
      "Builds editable routines from approved tools and personal context.",
    capabilities: [
      "Routines",
      "Habit workflows",
      "Scheduling",
      "Automation",
    ],
    intents: ["routine", "habits"],
    keywords: [
      "routine",
      "every morning",
      "every day",
      "habit",
    ],
  }),

  defineAgent({
    id: "focus",
    name: "Focus Agent",
    role: "Focus Specialist",
    category: "Productivity",
    description:
      "Creates focused work sessions with timers and completion reviews.",
    capabilities: [
      "Focus missions",
      "Timers",
      "Check-ins",
      "Completion reviews",
    ],
    intents: ["focus", "productivity"],
    keywords: [
      "focus",
      "timer",
      "deep work",
      "concentrate",
    ],
  }),

  defineAgent({
    id: "weekly-review",
    name: "Weekly Review Agent",
    role: "Progress Review Specialist",
    category: "Productivity",
    description:
      "Synthesizes progress, unfinished work, decisions and next priorities.",
    capabilities: [
      "Progress review",
      "Task synthesis",
      "Priority analysis",
      "Weekly planning",
    ],
    intents: ["review", "planning"],
    keywords: [
      "weekly review",
      "week",
      "progress",
      "unfinished",
    ],
  }),
];

/* =========================================================
   KNOWLEDGE / VERIFICATION
   ========================================================= */

const knowledgeAgents = [
  defineAgent({
    id: "verifier",
    name: "Verifier",
    role: "Verification Specialist",
    category: "Operations",
    description:
      "Validates claims, outputs and completed actions against evidence.",
    capabilities: [
      "Evidence checks",
      "Consistency",
      "Completion criteria",
      "Result validation",
    ],
    intents: ["verify", "check", "validate"],
    keywords: [
      "verify",
      "check",
      "validate",
      "is this correct",
      "confirm",
    ],
  }),

  defineAgent({
    id: "factchecker",
    name: "Fact Checker",
    role: "Evidence Specialist",
    category: "Knowledge",
    description:
      "Separates supported facts from assumptions and uncertainty.",
    capabilities: [
      "Source review",
      "Claim checking",
      "Uncertainty",
      "Evidence quality",
    ],
    intents: ["facts", "research", "verification"],
    keywords: [
      "fact",
      "true",
      "accurate",
      "source",
      "evidence",
    ],
  }),

  defineAgent({
    id: "knowledge",
    name: "Knowledge Curator",
    role: "Knowledge Systems Specialist",
    category: "Knowledge",
    description:
      "Organizes information into useful, retrievable knowledge.",
    capabilities: [
      "Taxonomy",
      "Summaries",
      "Connections",
      "Knowledge organization",
    ],
    intents: ["knowledge", "organize", "memory"],
    keywords: [
      "organize",
      "knowledge",
      "categorize",
      "connect",
    ],
  }),

  defineAgent({
    id: "documentation",
    name: "Documentation Specialist",
    role: "Documentation Intelligence",
    category: "Knowledge",
    description:
      "Makes systems understandable and maintainable for their users.",
    capabilities: [
      "Guides",
      "API documentation",
      "Runbooks",
      "Technical writing",
    ],
    intents: ["documentation", "writing"],
    keywords: [
      "documentation",
      "docs",
      "guide",
      "readme",
      "manual",
    ],
  }),

  defineAgent({
    id: "data",
    name: "Data Analyst",
    role: "Data Intelligence Specialist",
    category: "Business",
    description:
      "Turns structured information into patterns, decisions and measurable action.",
    capabilities: [
      "Data cleaning",
      "Metrics",
      "Insights",
      "Visualization",
    ],
    intents: ["data", "analysis"],
    keywords: [
      "dataset",
      "data",
      "csv",
      "spreadsheet",
      "metrics",
    ],
  }),

  defineAgent({
    id: "finance",
    name: "Finance Analyst",
    role: "Financial Intelligence Specialist",
    category: "Business",
    description:
      "Analyzes budgets, economics and financial tradeoffs carefully.",
    capabilities: [
      "Budgeting",
      "Unit economics",
      "Financial analysis",
      "Risk analysis",
    ],
    intents: ["finance", "budget", "money"],
    keywords: [
      "budget",
      "cost",
      "price",
      "finance",
      "revenue",
      "profit",
    ],
    riskLevel: "medium",
  }),

  defineAgent({
    id: "product",
    name: "Product Strategist",
    role: "Product Development Specialist",
    category: "Business",
    description:
      "Connects user value, product scope and sustainable execution.",
    capabilities: [
      "Product strategy",
      "Prioritization",
      "Roadmaps",
      "User value",
    ],
    intents: ["product", "strategy", "planning"],
    keywords: [
      "product",
      "feature",
      "roadmap",
      "user",
      "scope",
    ],
  }),

  defineAgent({
    id: "operations",
    name: "Operations Advisor",
    role: "Operations Specialist",
    category: "Operations",
    description:
      "Improves systems that keep people, projects and services moving.",
    capabilities: [
      "Processes",
      "Capacity",
      "Risk",
      "Operational efficiency",
    ],
    intents: ["operations", "process"],
    keywords: [
      "operations",
      "process",
      "capacity",
      "efficiency",
    ],
  }),
];

/* =========================================================
   DEVICE / COMPUTER ECOSYSTEM
   ========================================================= */

const deviceAgents = [
  defineAgent({
    id: "computer-use",
    name: "Computer Use Agent",
    role: "Computer Interaction Specialist",
    category: "Devices",
    description:
      "Coordinates approved computer interactions through registered device gateways.",
    capabilities: [
      "Computer interaction",
      "Application control",
      "Input automation",
      "Screen interaction",
    ],
    intents: ["computer", "device", "control"],
    keywords: [
      "computer",
      "click",
      "open",
      "close",
      "type",
      "desktop",
    ],
    requiredPermissions: [
      "device.read",
      "device.control",
    ],
    riskLevel: "medium",
  }),

  defineAgent({
    id: "desktop-control",
    name: "Desktop Control Agent",
    role: "Desktop Control Specialist",
    category: "Devices",
    description:
      "Coordinates approved desktop actions through registered computer gateways.",
    capabilities: [
      "Desktop control",
      "Application management",
      "Window management",
      "System interaction",
    ],
    intents: ["desktop", "computer"],
    keywords: [
      "desktop",
      "window",
      "application",
      "program",
    ],
    requiredPermissions: [
      "device.control",
    ],
    riskLevel: "medium",
  }),

  defineAgent({
    id: "phone-control",
    name: "Phone Control Agent",
    role: "Mobile Device Specialist",
    category: "Devices",
    description:
      "Coordinates approved phone actions through a registered mobile gateway.",
    capabilities: [
      "Phone control",
      "Notifications",
      "Mobile applications",
      "Device state",
    ],
    intents: ["phone", "mobile", "device"],
    keywords: [
      "phone",
      "mobile",
      "android",
      "ios",
    ],
    requiredPermissions: [
      "device.read",
      "device.control",
    ],
    riskLevel: "medium",
  }),

  defineAgent({
    id: "browser",
    name: "Browser Agent",
    role: "Browser Automation Specialist",
    category: "Devices",
    description:
      "Navigates approved browser sessions with visible, auditable actions.",
    capabilities: [
      "Browser navigation",
      "Page interaction",
      "Form interaction",
      "Web extraction",
    ],
    intents: ["browser", "web"],
    keywords: [
      "browser",
      "website",
      "web",
      "search",
      "page",
    ],
    requiredPermissions: [
      "browser.read",
    ],
    riskLevel: "medium",
  }),

  defineAgent({
    id: "file-system",
    name: "File System Agent",
    role: "File Management Specialist",
    category: "Devices",
    description:
      "Finds and organizes files only within explicitly approved locations.",
    capabilities: [
      "File discovery",
      "Organization",
      "Metadata",
      "Safe file operations",
    ],
    intents: ["files", "filesystem"],
    keywords: [
      "file",
      "folder",
      "document",
      "download",
      "directory",
    ],
    requiredPermissions: [
      "filesystem.read",
    ],
    riskLevel: "medium",
  }),

  defineAgent({
    id: "camera",
    name: "Camera Agent",
    role: "Vision Input Specialist",
    category: "Devices",
    description:
      "Processes camera input only during an explicit, visible camera session.",
    capabilities: [
      "Camera input",
      "Visual analysis",
      "Object recognition",
      "Scene understanding",
    ],
    intents: ["camera", "vision"],
    keywords: [
      "camera",
      "look",
      "see",
      "visual",
      "image",
    ],
    requiredPermissions: [
      "camera.read",
    ],
    riskLevel: "medium",
  }),

  defineAgent({
    id: "notification",
    name: "Notification Agent",
    role: "Notification Specialist",
    category: "Devices",
    description:
      "Delivers approved notifications with quiet hours and frequency controls.",
    capabilities: [
      "Notifications",
      "Priority",
      "Quiet hours",
      "Frequency control",
    ],
    intents: ["notification", "reminder"],
    keywords: [
      "notification",
      "notify",
      "alert",
    ],
    requiredPermissions: [
      "notifications.write",
    ],
  }),

  defineAgent({
    id: "cross-device",
    name: "Cross-Device Continuity Agent",
    role: "Device Continuity Specialist",
    category: "Devices",
    description:
      "Moves approved tasks and context between registered devices.",
    capabilities: [
      "Device handoff",
      "Context synchronization",
      "Task continuity",
      "Session transfer",
    ],
    intents: ["sync", "device", "continuity"],
    keywords: [
      "sync",
      "continue",
      "another device",
      "tablet",
      "computer",
    ],
    requiredPermissions: [
      "device.read",
      "device.write",
    ],
    riskLevel: "medium",
  }),

  defineAgent({
    id: "smart-home",
    name: "Smart Home Agent",
    role: "Smart Home Specialist",
    category: "Devices",
    description:
      "Controls approved home devices while respecting confirmation requirements.",
    capabilities: [
      "Home devices",
      "Scenes",
      "Device state",
      "Automation",
    ],
    intents: ["home", "iot", "device"],
    keywords: [
      "home",
      "lights",
      "thermostat",
      "smart home",
      "iot",
    ],
    requiredPermissions: [
      "iot.read",
      "iot.control",
    ],
    riskLevel: "medium",
  }),

  defineAgent({
    id: "wearable",
    name: "Wearable Agent",
    role: "Wearable Device Specialist",
    category: "Devices",
    description:
      "Reads approved wearable signals while keeping them user-controlled.",
    capabilities: [
      "Wearable data",
      "Device state",
      "Activity signals",
    ],
    intents: ["wearable", "device"],
    keywords: [
      "watch",
      "wearable",
      "fitness tracker",
    ],
    requiredPermissions: [
      "wearable.read",
    ],
    riskLevel: "medium",
  }),

  defineAgent({
    id: "car",
    name: "Car Integration Agent",
    role: "Vehicle Integration Specialist",
    category: "Devices",
    description:
      "Coordinates approved vehicle information and controls through registered adapters.",
    capabilities: [
      "Vehicle information",
      "Vehicle telemetry",
      "Approved controls",
    ],
    intents: ["vehicle", "car"],
    keywords: [
      "car",
      "vehicle",
      "driving",
    ],
    requiredPermissions: [
      "vehicle.read",
    ],
    riskLevel: "high",
  }),
];

/* =========================================================
   COMMUNICATION / LANGUAGE
   ========================================================= */

const communicationAgents = [
  defineAgent({
    id: "conversation",
    name: "Conversation Agent",
    role: "Conversation Specialist",
    category: "Communication",
    description:
      "Maintains natural dialogue, continuity and useful follow-ups.",
    capabilities: [
      "Conversation",
      "Follow-ups",
      "Dialogue continuity",
      "Clarification",
    ],
    intents: ["conversation", "chat"],
    keywords: [
      "talk",
      "chat",
      "conversation",
    ],
  }),

  defineAgent({
    id: "translation",
    name: "Translation Agent",
    role: "Translation Specialist",
    category: "Communication",
    description:
      "Translates meaning, tone and context across supported languages.",
    capabilities: [
      "Translation",
      "Localization",
      "Tone preservation",
      "Context preservation",
    ],
    intents: ["translation", "language"],
    keywords: [
      "translate",
      "translation",
      "language",
    ],
  }),

  defineAgent({
    id: "arabic-language",
    name: "Arabic Language Agent",
    role: "Arabic Language Specialist",
    category: "Communication",
    description:
      "Handles Arabic understanding, writing and culturally appropriate phrasing.",
    capabilities: [
      "Arabic",
      "Translation",
      "Writing",
      "Localization",
    ],
    intents: ["arabic", "language"],
    keywords: [
      "arabic",
      "العربية",
      "عربي",
    ],
  }),

  defineAgent({
    id: "kurdish-language",
    name: "Kurdish Language Agent",
    role: "Kurdish Language Specialist",
    category: "Communication",
    description:
      "Handles Kurdish understanding and natural local communication.",
    capabilities: [
      "Kurdish",
      "Sorani",
      "Kurmanji",
      "Translation",
      "Localization",
    ],
    intents: ["kurdish", "language"],
    keywords: [
      "kurdish",
      "kurdî",
      "کوردی",
      "کوردستان",
      "سۆرانی",
    ],
  }),

  defineAgent({
    id: "english-language",
    name: "English Language Agent",
    role: "English Language Specialist",
    category: "Communication",
    description:
      "Handles precise English communication across casual and technical contexts.",
    capabilities: [
      "English",
      "Technical writing",
      "Editing",
      "Localization",
    ],
    intents: ["english", "language"],
    keywords: [
      "english",
      "English",
    ],
  }),

  defineAgent({
    id: "tone",
    name: "Tone Agent",
    role: "Communication Style Specialist",
    category: "Communication",
    description:
      "Adapts wording to the user's desired style and situation.",
    capabilities: [
      "Tone",
      "Style",
      "Conciseness",
      "Communication calibration",
    ],
    intents: ["tone", "style"],
    keywords: [
      "tone",
      "formal",
      "casual",
      "professional",
      "short",
    ],
  }),

  defineAgent({
    id: "emotional-calibration",
    name: "Emotional Calibration Agent",
    role: "Interaction Calibration Specialist",
    category: "Communication",
    description:
      "Recognizes conversational stress and adjusts pace and presentation appropriately.",
    capabilities: [
      "Stress recognition",
      "Pacing",
      "Communication calibration",
      "Context awareness",
    ],
    intents: ["support", "conversation"],
    keywords: [
      "stressed",
      "overwhelmed",
      "frustrated",
      "confused",
    ],
  }),

  defineAgent({
    id: "summarization",
    name: "Summarization Agent",
    role: "Information Compression Specialist",
    category: "Communication",
    description:
      "Turns long conversations and materials into accurate takeaways.",
    capabilities: [
      "Summaries",
      "Key points",
      "Action extraction",
      "Compression",
    ],
    intents: ["summary", "summarization"],
    keywords: [
      "summarize",
      "summary",
      "shorten",
      "key points",
    ],
  }),

  defineAgent({
    id: "voice",
    name: "Voice Specialist",
    role: "Voice Experience Engineer",
    category: "Communication",
    description:
      "Designs natural speech input, output and conversational voice flows.",
    capabilities: [
      "Speech input",
      "Speech output",
      "Turn-taking",
      "Voice interaction",
    ],
    intents: ["voice", "speech"],
    keywords: [
      "voice",
      "speak",
      "speech",
      "microphone",
      "wake word",
    ],
  }),
];

/* =========================================================
   RESEARCH PLATFORM
   ========================================================= */

const researchAgents = [
  defineAgent({
    id: "web-research",
    name: "Web Research Agent",
    role: "Web Research Specialist",
    category: "Research",
    description:
      "Searches approved web sources and tracks evidence for claims.",
    capabilities: [
      "Web search",
      "Source collection",
      "Current information",
      "Evidence tracking",
    ],
    intents: ["research", "web"],
    keywords: [
      "search",
      "web",
      "latest",
      "current",
      "online",
    ],
    tools: ["web-search"],
  }),

  defineAgent({
    id: "deep-research",
    name: "Deep Research Agent",
    role: "Research Synthesis Specialist",
    category: "Research",
    description:
      "Builds multi-step research briefs from diverse and potentially conflicting sources.",
    capabilities: [
      "Deep research",
      "Source comparison",
      "Synthesis",
      "Uncertainty analysis",
    ],
    intents: ["deep research", "research"],
    keywords: [
      "deep research",
      "investigate",
      "comprehensive",
      "thorough",
    ],
    tools: ["web-search"],
  }),

  defineAgent({
    id: "source-verification",
    name: "Source Verification Agent",
    role: "Source Quality Specialist",
    category: "Research",
    description:
      "Checks source quality, dates, provenance and claim support.",
    capabilities: [
      "Source quality",
      "Dates",
      "Provenance",
      "Claim verification",
    ],
    intents: ["verification", "research"],
    keywords: [
      "source",
      "citation",
      "credible",
      "reliable",
      "proof",
    ],
  }),

  defineAgent({
    id: "document-analysis",
    name: "Document Analysis Agent",
    role: "Document Intelligence Specialist",
    category: "Research",
    description:
      "Extracts structure, decisions, risks and actions from documents.",
    capabilities: [
      "Document analysis",
      "Structure extraction",
      "Decision extraction",
      "Risk detection",
    ],
    intents: ["document", "analysis"],
    keywords: [
      "document",
      "pdf",
      "report",
      "contract",
    ],
  }),

  defineAgent({
    id: "pdf",
    name: "PDF Agent",
    role: "PDF Processing Specialist",
    category: "Research",
    description:
      "Reads and transforms PDF content while preserving important structure.",
    capabilities: [
      "PDF reading",
      "PDF extraction",
      "Structure preservation",
    ],
    intents: ["pdf", "document"],
    keywords: [
      "pdf",
      ".pdf",
    ],
  }),

  defineAgent({
    id: "academic-research",
    name: "Academic Research Agent",
    role: "Academic Evidence Specialist",
    category: "Research",
    description:
      "Finds and explains research papers, methods and evidence quality.",
    capabilities: [
      "Research papers",
      "Methods",
      "Evidence quality",
      "Literature review",
    ],
    intents: ["academic", "research"],
    keywords: [
      "paper",
      "study",
      "academic",
      "research",
      "journal",
    ],
  }),

  defineAgent({
    id: "news-research",
    name: "News Research Agent",
    role: "Current Events Specialist",
    category: "Research",
    description:
      "Tracks current events while separating reports, facts and uncertainty.",
    capabilities: [
      "News search",
      "Current events",
      "Source comparison",
      "Timeline analysis",
    ],
    intents: ["news", "current events"],
    keywords: [
      "news",
      "today",
      "latest",
      "recent",
    ],
  }),

  defineAgent({
    id: "knowledge-graph",
    name: "Knowledge Graph Agent",
    role: "Knowledge Relationship Specialist",
    category: "Research",
    description:
      "Connects people, ideas, projects and evidence into retrievable relationships.",
    capabilities: [
      "Relationships",
      "Entity linking",
      "Knowledge graphs",
      "Context retrieval",
    ],
    intents: ["knowledge", "relationships"],
    keywords: [
      "relationship",
      "connected",
      "related",
      "graph",
    ],
  }),
];

/* =========================================================
   BUSINESS
   ========================================================= */

const businessAgents = [
  defineAgent({
    id: "startup",
    name: "Startup Agent",
    role: "Startup Strategy Specialist",
    category: "Business",
    description:
      "Turns business opportunities into focused startup execution.",
    capabilities: [
      "Validation",
      "Business models",
      "Product-market fit",
      "Execution strategy",
    ],
    intents: ["startup", "business"],
    keywords: [
      "startup",
      "business",
      "idea",
      "product",
      "founder",
    ],
  }),

  defineAgent({
    id: "sales",
    name: "Sales Agent",
    role: "Sales Systems Specialist",
    category: "Business",
    description:
      "Creates ethical sales, qualification and follow-up workflows.",
    capabilities: [
      "Sales",
      "Qualification",
      "Outreach",
      "Follow-up",
    ],
    intents: ["sales", "business"],
    keywords: [
      "sales",
      "customer",
      "lead",
      "outreach",
      "client",
    ],
  }),

  defineAgent({
    id: "customer-research",
    name: "Customer Research Agent",
    role: "Customer Intelligence Specialist",
    category: "Business",
    description:
      "Finds user needs, objections, patterns and product opportunities.",
    capabilities: [
      "Customer research",
      "User needs",
      "Objections",
      "Opportunity discovery",
    ],
    intents: ["customer research", "product"],
    keywords: [
      "customer",
      "user",
      "feedback",
      "objection",
      "needs",
    ],
  }),

  defineAgent({
    id: "competitive-intelligence",
    name: "Competitive Intelligence Agent",
    role: "Competitive Strategy Specialist",
    category: "Business",
    description:
      "Compares competitors, positioning, capabilities and strategic risks.",
    capabilities: [
      "Competitor research",
      "Positioning",
      "Feature comparison",
      "Strategic risks",
    ],
    intents: ["competition", "research", "strategy"],
    keywords: [
      "competitor",
      "competition",
      "compare",
      "alternative",
      "versus",
    ],
  }),
];

/* =========================================================
   WELLNESS / PERSONAL SUPPORT
   ========================================================= */

const personalAgents = [
  defineAgent({
    id: "mentor",
    name: "Mentor Agent",
    role: "Personal Development Mentor",
    category: "Personal",
    description:
      "Challenges assumptions respectfully and turns ambition into sustainable systems.",
    capabilities: [
      "Reflection",
      "Decision support",
      "Goal systems",
      "Long-term thinking",
    ],
    intents: ["advice", "goals", "reflection"],
    keywords: [
      "advice",
      "should I",
      "what should",
      "decision",
      "goal",
    ],
  }),

  defineAgent({
    id: "learning",
    name: "Learning Agent",
    role: "Learning Systems Specialist",
    category: "Personal",
    description:
      "Builds personalized lessons, practice paths and progress loops.",
    capabilities: [
      "Lessons",
      "Practice",
      "Learning paths",
      "Progress tracking",
    ],
    intents: ["learn", "education"],
    keywords: [
      "learn",
      "lesson",
      "practice",
      "course",
    ],
  }),

  defineAgent({
    id: "goalcoach",
    name: "Goal Coach",
    role: "Goals and Habits Specialist",
    category: "Personal",
    description:
      "Connects long-term goals with realistic behavior and feedback loops.",
    capabilities: [
      "Goal design",
      "Habit systems",
      "Accountability",
      "Progress loops",
    ],
    intents: ["goals", "habits"],
    keywords: [
      "goal",
      "habit",
      "progress",
      "accountability",
    ],
  }),

  defineAgent({
    id: "sleep",
    name: "Sleep Agent",
    role: "Sleep Routine Specialist",
    category: "Personal",
    description:
      "Helps users understand and improve sleep routines without overclaiming medical advice.",
    capabilities: [
      "Sleep routines",
      "Scheduling",
      "Sleep education",
    ],
    intents: ["sleep", "routine"],
    keywords: [
      "sleep",
      "bed",
      "wake",
      "tired",
    ],
  }),

  defineAgent({
    id: "stress-support",
    name: "Stress Support Agent",
    role: "Stress Support Specialist",
    category: "Personal",
    description:
      "Slows interactions down and offers practical support during overwhelm.",
    capabilities: [
      "Stress support",
      "Pacing",
      "Grounding",
      "Practical next steps",
    ],
    intents: ["support", "stress"],
    keywords: [
      "stressed",
      "overwhelmed",
      "anxious",
      "frustrated",
    ],
  }),

  defineAgent({
    id: "fitness",
    name: "Fitness Agent",
    role: "Movement Guidance Specialist",
    category: "Personal",
    description:
      "Provides general, age-appropriate movement guidance without unsafe extremes.",
    capabilities: [
      "Movement",
      "General fitness education",
      "Progress tracking",
      "Recovery awareness",
    ],
    intents: ["fitness", "movement"],
    keywords: [
      "exercise",
      "fitness",
      "workout",
      "movement",
    ],
    riskLevel: "medium",
  }),

  defineAgent({
    id: "nutrition",
    name: "Nutrition Agent",
    role: "Nutrition Education Specialist",
    category: "Personal",
    description:
      "Provides general nutrition education while recognizing when professional care is appropriate.",
    capabilities: [
      "Nutrition education",
      "Meal planning",
      "Food information",
      "General healthy habits",
    ],
    intents: ["nutrition", "food"],
    keywords: [
      "food",
      "nutrition",
      "meal",
      "diet",
    ],
    riskLevel: "medium",
  }),
];

/* =========================================================
   CORE INTELLIGENCE
   ========================================================= */

const coreAgents = [
  defineAgent({
    id: "orchestrator",
    name: "Orchestrator Agent",
    role: "Agent Coordination Specialist",
    category: "Core Intelligence",
    description:
      "Coordinates the smallest useful set of specialists for each request.",
    capabilities: [
      "Agent selection",
      "Team formation",
      "Delegation",
      "Handoffs",
      "Result synthesis",
    ],
    intents: ["orchestration", "routing"],
    keywords: [
      "delegate",
      "coordinate",
      "agents",
    ],
  }),

  defineAgent({
    id: "context",
    name: "Context Agent",
    role: "Context Management Specialist",
    category: "Core Intelligence",
    description:
      "Maintains the active situation, constraints and continuity required for useful decisions.",
    capabilities: [
      "Context",
      "Continuity",
      "Constraint tracking",
      "Session state",
    ],
    intents: ["context"],
    keywords: [
      "context",
      "remember",
      "previous",
      "continue",
    ],
  }),

  defineAgent({
    id: "intent",
    name: "Intent Agent",
    role: "Intent Understanding Specialist",
    category: "Core Intelligence",
    description:
      "Identifies the user's desired outcome beyond surface keywords.",
    capabilities: [
      "Intent detection",
      "Goal extraction",
      "Ambiguity detection",
      "Clarification",
    ],
    intents: ["intent", "clarification"],
    keywords: [
      "intent",
      "meaning",
      "what do I want",
    ],
  }),

  defineAgent({
    id: "planning",
    name: "Planning Agent",
    role: "Planning Intelligence Specialist",
    category: "Core Intelligence",
    description:
      "Creates ordered plans with dependencies, risks and completion criteria.",
    capabilities: [
      "Planning",
      "Dependencies",
      "Risk analysis",
      "Completion criteria",
    ],
    intents: ["planning"],
    keywords: [
      "plan",
      "steps",
      "strategy",
      "roadmap",
    ],
  }),

  defineAgent({
    id: "execution",
    name: "Execution Agent",
    role: "Execution Coordination Specialist",
    category: "Core Intelligence",
    description:
      "Runs approved work through registered tools and reports state changes.",
    capabilities: [
      "Execution",
      "Tool coordination",
      "State management",
      "Error recovery",
    ],
    intents: ["execution", "action"],
    keywords: [
      "execute",
      "do it",
      "run",
      "perform",
    ],
    riskLevel: "medium",
  }),

  defineAgent({
    id: "verification",
    name: "Verification Agent",
    role: "Verification Coordination Specialist",
    category: "Core Intelligence",
    description:
      "Checks whether actions and outputs actually satisfy completion criteria.",
    capabilities: [
      "Verification",
      "Evidence",
      "Completion checks",
      "Failure detection",
    ],
    intents: ["verification"],
    keywords: [
      "verify",
      "check",
      "done",
      "complete",
    ],
  }),

  defineAgent({
    id: "memory",
    name: "Memory Agent",
    role: "Memory Management Specialist",
    category: "Core Intelligence",
    description:
      "Selects, stores, retrieves and forgets memory according to permissions.",
    capabilities: [
      "Memory retrieval",
      "Memory storage",
      "Memory relevance",
      "Retention control",
    ],
    intents: ["memory", "context"],
    keywords: [
      "remember",
      "forget",
      "memory",
      "recall",
    ],
    requiredPermissions: [
      "memory.read",
      "memory.write",
    ],
  }),

  defineAgent({
    id: "personality",
    name: "Personality Agent",
    role: "Response Personality Specialist",
    category: "Core Intelligence",
    description:
      "Keeps responses aligned with HEY's calm, direct and adaptive identity.",
    capabilities: [
      "Personality",
      "Response style",
      "Consistency",
      "Personalization",
    ],
    intents: ["personality", "style"],
    keywords: [
      "personality",
      "style",
      "sound like",
      "respond",
    ],
  }),

  defineAgent({
    id: "quality",
    name: "Quality Agent",
    role: "Response Quality Specialist",
    category: "Core Intelligence",
    description:
      "Reviews usefulness, clarity, completeness and reliability before delivery.",
    capabilities: [
      "Quality review",
      "Clarity",
      "Completeness",
      "Consistency",
    ],
    intents: ["quality", "review"],
    keywords: [
      "quality",
      "improve",
      "better",
      "review",
    ],
  }),

  defineAgent({
    id: "permission",
    name: "Permission Agent",
    role: "Authorization Specialist",
    category: "Safety",
    description:
      "Determines whether actions are authorized and applies least privilege.",
    capabilities: [
      "Authorization",
      "Least privilege",
      "Risk evaluation",
      "Confirmation requirements",
    ],
    intents: ["permission", "authorization"],
    keywords: [
      "permission",
      "allow",
      "authorize",
      "access",
    ],
  }),

  defineAgent({
    id: "audit",
    name: "Audit Agent",
    role: "Audit and Accountability Specialist",
    category: "Safety",
    description:
      "Maintains transparent history of important actions, approvals and failures.",
    capabilities: [
      "Audit logs",
      "Action history",
      "Approval tracking",
      "Failure tracking",
    ],
    intents: ["audit", "history"],
    keywords: [
      "audit",
      "history",
      "log",
      "activity",
    ],
  }),

  defineAgent({
    id: "privacy",
    name: "Privacy Agent",
    role: "Privacy Specialist",
    category: "Safety",
    description:
      "Explains data use, local-only options, retention and privacy tradeoffs.",
    capabilities: [
      "Privacy",
      "Data handling",
      "Retention",
      "Privacy controls",
    ],
    intents: ["privacy", "data"],
    keywords: [
      "privacy",
      "private",
      "data",
      "retention",
      "delete",
    ],
  }),
];

/* =========================================================
   DYNAMIC AGENT / FORGE FOUNDATION
   ========================================================= */

const forgeAgents = [
  defineAgent({
    id: "forge",
    name: "Forge Agent",
    role: "Agent Creation Specialist",
    category: "Core Intelligence",
    description:
      "Designs, validates and registers new specialist agent definitions when HEY lacks a suitable capability.",
    capabilities: [
      "Agent generation",
      "Capability design",
      "Tool mapping",
      "Agent validation",
      "Workflow creation",
    ],
    intents: ["create agent", "forge", "automation"],
    keywords: [
      "create an agent",
      "make an agent",
      "forge",
      "new agent",
      "specialist",
    ],
    riskLevel: "medium",
  }),

  defineAgent({
    id: "workflow",
    name: "Workflow Agent",
    role: "Workflow Design Specialist",
    category: "Core Intelligence",
    description:
      "Turns repeatable goals into reusable, observable workflows.",
    capabilities: [
      "Workflow design",
      "Step orchestration",
      "Dependencies",
      "Reusable workflows",
    ],
    intents: ["workflow", "automation"],
    keywords: [
      "workflow",
      "process",
      "pipeline",
      "automate",
    ],
    riskLevel: "medium",
  }),
];

/* =========================================================
   SAFETY
   ========================================================= */

const safetyAgents = [
  defineAgent({
    id: "crisis-safety",
    name: "Crisis Safety Agent",
    role: "Safety Support Specialist",
    category: "Safety",
    description:
      "Prioritizes immediate safety and appropriate trusted human or emergency support when needed.",
    capabilities: [
      "Safety assessment",
      "De-escalation",
      "Trusted support guidance",
      "Emergency awareness",
    ],
    intents: ["safety", "crisis"],
    keywords: [
      "crisis",
      "danger",
      "unsafe",
      "emergency",
    ],
    riskLevel: "high",
  }),
];

/* =========================================================
   PLATFORM REGISTRY
   ========================================================= */

const allAgentGroups = [
  specialistAgents,
  engineeringAgents,
  creativeAgents,
  productivityAgents,
  knowledgeAgents,
  deviceAgents,
  communicationAgents,
  researchAgents,
  businessAgents,
  personalAgents,
  coreAgents,
  forgeAgents,
  safetyAgents,
];

export const agents = allAgentGroups.flat();

/**
 * Canonical categories used throughout HEY.
 */
export const agentCategories = [
  "Creation",
  "Business",
  "Knowledge",
  "Creative",
  "Personal",
  "Engineering",
  "Operations",
  "Core Intelligence",
  "Communication",
  "Research",
  "Productivity",
  "Devices",
  "Safety",
];

/**
 * Runtime metadata describing the workforce architecture.
 */
export const agentSystem = {
  version: 1,

  architecture: "central-brain-specialist-workforce",

  principles: [
    "Specialists support a central intelligence layer.",
    "The smallest useful team should be preferred.",
    "Agents may collaborate when a task crosses domains.",
    "Actions require authorization at execution time.",
    "Completed actions should be independently verified.",
    "Important actions should remain auditable.",
    "Missing capabilities may be created through Forge.",
    "Generated agents must still use registered tools and permissions.",
  ],

  lifecycle: [
    "discover",
    "route",
    "delegate",
    "execute",
    "verify",
    "synthesize",
    "audit",
  ],

  dynamicAgentCreation: {
    enabled: true,
    creatorAgentId: "forge",
    requiresValidation: true,
    requiresRegisteredTools: true,
    requiresPermissionDeclaration: true,
    defaultRiskLevel: "low",
  },
};

/**
 * Fast lookup index.
 */
const agentIndex = new Map(
  agents.map((agent) => [agent.id, agent]),
);

export const getAgentById = (id) =>
  agentIndex.get(id);

/**
 * Agents created at runtime through Forge.
 *
 * These are definitions only. Execution still
 * requires the same registered tools and
 * permission declarations as built-in agents.
 */
const customAgents = [];

/**
 * Merged view of the workforce used by every
 * registry lookup so Forge-created agents
 * participate in routing, search and teams.
 */
export function getAllAgents() {
  return [...agents, ...customAgents];
}

/**
 * Register a Forge-created agent definition into
 * the runtime registry.
 *
 * Registration does not grant execution
 * authority; permissions are enforced at
 * execution time.
 */
export function registerCustomAgent(definition) {
  if (!definition || typeof definition !== "object") {
    return { success: false, reason: "A valid agent definition is required." };
  }

  const candidate = {
    ...definition,
    custom: true,
    dynamic: true,
    source: definition.source || "forge",
    status: definition.status || "idle",
  };

  if (!candidate.id || candidate.id.length < 2) {
    return { success: false, reason: "The agent requires a unique id with at least 2 characters." };
  }

  if (agentIndex.has(candidate.id) || customAgents.some((agent) => agent.id === candidate.id)) {
    return { success: false, reason: "An agent with that id is already registered." };
  }

  customAgents.push(candidate);
  agentIndex.set(candidate.id, candidate);
  persistCustomAgents();
  return { success: true, agent: candidate };
}

/**
 * Remove a Forge-created agent. Built-in agents
 * cannot be removed through this path.
 */
export function deregisterCustomAgent(id) {
  const index = customAgents.findIndex((agent) => agent.id === id);

  if (index === -1) {
    return { success: false, reason: "Only Forge-created agents can be removed." };
  }

  customAgents.splice(index, 1);
  agentIndex.delete(id);
  persistCustomAgents();
  return { success: true };
}

/**
 * Return the Forge-created agents only.
 */
export function getCustomAgents() {
  return customAgents.map((agent) => ({
    ...agent,
    capabilities: [...(agent.capabilities || [])],
    intents: [...(agent.intents || [])],
    keywords: [...(agent.keywords || [])],
    tools: [...(agent.tools || [])],
    requiredPermissions: [...(agent.requiredPermissions || [])],
  }));
}

function persistCustomAgents() {
  try {
    localStorage.setItem("hey_custom_agents", JSON.stringify(customAgents));
  } catch {
    /* storage unavailable */
  }
}

/**
 * User-controlled activation set.
 *
 * Activation is a preference, not a permission.
 * When no agents are activated the whole active
 * workforce remains available.
 */
const ACTIVATION_KEY = "hey_agent_activation";

const activatedIds = new Set(loadActiveIds());

function loadActiveIds() {
  try {
    const raw = localStorage.getItem(ACTIVATION_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Activate or deactivate an agent for the brain's
 * routing preference.
 */
export function setAgentActive(id, active) {
  const agent = getAgentById(id);

  if (!agent) {
    return { success: false, reason: "Unknown agent." };
  }

  if (active) {
    activatedIds.add(id);
  } else {
    activatedIds.delete(id);
  }

  persistActivation();
  return { success: true, active: activatedIds.has(id) };
}

/**
 * Return the ids the user explicitly activated.
 */
export function getActivatedAgentIds() {
  return [...activatedIds];
}

/**
 * Determine whether an agent is in the user's
 * activation set.
 */
export function isAgentActivated(id) {
  return activatedIds.has(id);
}

/**
 * Return the agents the user activated.
 */
export function getActivatedAgents() {
  return getAllAgents().filter((agent) => activatedIds.has(agent.id));
}

function persistActivation() {
  try {
    localStorage.setItem(ACTIVATION_KEY, JSON.stringify([...activatedIds]));
  } catch {
    /* storage unavailable */
  }
}

/**
 * Return all agents in a category.
 */
export function getAgentsByCategory(category) {
  return getAllAgents().filter(
    (agent) =>
      agent.category.toLowerCase() ===
      String(category).toLowerCase(),
  );
}

/**
 * Find agents capable of an intent.
 */
export function getAgentsByIntent(intent) {
  const normalized = String(
    intent || "",
  ).toLowerCase();

  if (!normalized) {
    return [];
  }

  return getAllAgents().filter((agent) =>
    agent.intents?.some(
      (item) =>
        String(item).toLowerCase() ===
        normalized,
    ),
  );
}

/**
 * Find agents with a particular capability.
 */
export function getAgentsByCapability(
  capability,
) {
  const normalized = String(
    capability || "",
  ).toLowerCase();

  if (!normalized) {
    return [];
  }

  return getAllAgents().filter((agent) =>
    agent.capabilities?.some(
      (item) =>
        String(item).toLowerCase() ===
        normalized,
    ),
  );
}

/**
 * Search the workforce by ID, name, description,
 * capability, keyword or category.
 */
export function searchAgents(query) {
  const normalized = String(
    query || "",
  )
    .trim()
    .toLowerCase();

  if (!normalized) {
    return [];
  }

  return getAllAgents().filter((agent) => {
    const searchable = [
      agent.id,
      agent.name,
      agent.role,
      agent.category,
      agent.description,
      ...(agent.capabilities || []),
      ...(agent.keywords || []),
      ...(agent.intents || []),
    ]
      .join(" ")
      .toLowerCase();

    return searchable.includes(normalized);
  });
}

/**
 * Determine whether an agent is available.
 */
export function isAgentAvailable(id) {
  const agent = getAgentById(id);

  return Boolean(
    agent &&
      agent.status !== "disabled",
  );
}

/**
 * Return a safe public representation for UI.
 *
 * Internal implementation metadata such as tool names
 * and permission internals are intentionally excluded.
 */
export function getPublicAgent(agentOrId) {
  const agent =
    typeof agentOrId === "string"
      ? getAgentById(agentOrId)
      : agentOrId;

  if (!agent) {
    return null;
  }

  return {
    id: agent.id,
    name: agent.name,
    role: agent.role,
    category: agent.category,
    description: agent.description,
    capabilities: [
      ...(agent.capabilities || []),
    ],
    personality: agent.personality,
    status: agent.status,
  };
}

/**
 * Public workforce list for ordinary UI surfaces.
 */
export function getPublicAgents() {
  return getAllAgents().map(getPublicAgent);
}

/**
 * Internal registry snapshot for owner/admin
 * tooling and diagnostics.
 */
export function getAgentRegistrySnapshot() {
  return getAllAgents().map((agent) => ({
    ...agent,
    capabilities: [
      ...(agent.capabilities || []),
    ],
    tools: [...(agent.tools || [])],
    requiredPermissions: [
      ...(agent.requiredPermissions || []),
    ],
    testCases: [...(agent.testCases || [])],
  }));
}

export default agents;