import { registerTutorial } from "./onboardingEngine.js";

const tutorials = [
  {
    capabilityId: "chat",
    title: "Chat with HEY",
    steps: [
      {
        title: "Say hello",
        body: "Open Chat and type your first message in the composer. HEY replies in real time.",
        anchor: "[data-tutorial='chat-composer']",
      },
      {
        title: "Ask for anything",
        body: "Try a request, a question, or a task. HEY routes it to the right capability automatically.",
        anchor: "[data-tutorial='chat-composer-input']",
      },
      {
        title: "Follow up",
        body: "Messages build into a conversation. Reply, and HEY remembers the context.",
        anchor: "[data-tutorial='chat-messages']",
      },
    ],
  },
  {
    capabilityId: "memory",
    title: "Memory & the Cosmos",
    steps: [
      {
        title: "Save a memory",
        body: "Tell HEY something you want to remember — a fact, an idea, a plan.",
        anchor: "[data-tutorial='chat-composer']",
      },
      {
        title: "Explore the Cosmos",
        body: "Open the Cosmos to see how your memories connect into a living web.",
        anchor: "[data-tutorial='nav-cosmos']",
      },
      {
        title: "Recall naturally",
        body: "Ask HEY about it later in any conversation — memory is always close by.",
        anchor: "[data-tutorial='chat-composer-input']",
      },
    ],
  },
  {
    capabilityId: "forge",
    title: "Build in the Forge",
    steps: [
      {
        title: "Pick a starting point",
        body: "The Forge has templates for agents, workflows, and tools.",
        anchor: "[data-tutorial='forge-studio']",
      },
      {
        title: "Describe the outcome",
        body: "Explain what you want to build. HEY assembles the pieces.",
        anchor: "[data-tutorial='forge-builder']",
      },
      {
        title: "Run and refine",
        body: "Execute your creation, then adjust until it feels right.",
        anchor: "[data-tutorial='forge-run']",
      },
    ],
  },
  {
    capabilityId: "voice",
    title: "Use your voice",
    steps: [
      {
        title: "Talk to HEY",
        body: "Enable voice input and speak naturally. HEY listens and responds by voice.",
        anchor: "[data-tutorial='chat-voice']",
      },
      {
        title: "Hands-free",
        body: "Use voice throughout the app — from quick notes to full conversations.",
        anchor: "[data-tutorial='chat-voice']",
      },
    ],
  },
  {
    capabilityId: "studio",
    title: "Create in the Studio",
    steps: [
      {
        title: "Open the Studio",
        body: "Generate images and videos from your ideas.",
        anchor: "[data-tutorial='nav-studio']",
      },
      {
        title: "Write your prompt",
        body: "Describe what you want to create and let HEY bring it to life.",
        anchor: "[data-tutorial='studio-composer']",
      },
    ],
  },
];

export function registerDefaultTutorials() {
  tutorials.forEach((tutorial) => registerTutorial(tutorial));
}

export const defaultTutorials = tutorials;
registerDefaultTutorials();

export default tutorials;