const QUESTION_FIELDS = new Set(["id", "prompt", "expectedLearning", "teacherAnswer", "points"]);

export function createTeacherQuestionDraft(id, values = {}) {
  if (typeof id !== "string" || !id.trim()) throw new TypeError("Teacher question draft ID is required");
  return {
    id,
    prompt: values.prompt || "",
    expectedLearning: values.expectedLearning || "",
    teacherAnswer: values.teacherAnswer || "",
    points: values.points || "1",
  };
}

export function buildTeacherAssessmentQuestions(drafts, objective) {
  if (!Array.isArray(drafts) || drafts.length < 1 || drafts.length > 20) {
    throw new RangeError("A Teacher quiz must contain between 1 and 20 questions");
  }
  for (const key of Reflect.ownKeys(drafts)) {
    if (key === "length") continue;
    const index = typeof key === "string" && /^(0|[1-9]\d*)$/.test(key) ? Number(key) : -1;
    const descriptor = Object.getOwnPropertyDescriptor(drafts, key);
    if (!Number.isInteger(index) || index < 0 || index >= drafts.length
      || !descriptor || !Object.hasOwn(descriptor, "value")) {
      throw new TypeError("Question list must contain only dense data entries");
    }
  }
  for (let index = 0; index < drafts.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(drafts, String(index));
    if (!descriptor || !Object.hasOwn(descriptor, "value")) {
      throw new TypeError("Question list must contain only dense data entries");
    }
  }
  if (typeof objective !== "string" || !objective.trim()) {
    throw new Error("Add a learning objective before building quiz questions");
  }
  const ids = new Set();
  return Object.freeze(drafts.map((draft, index) => {
    if (!draft || typeof draft !== "object" || Array.isArray(draft)
      || (Object.getPrototypeOf(draft) !== Object.prototype && Object.getPrototypeOf(draft) !== null)) {
      throw new TypeError(`Question ${index + 1} must be a plain object`);
    }
    for (const key of Reflect.ownKeys(draft)) {
      const descriptor = Object.getOwnPropertyDescriptor(draft, key);
      if (typeof key !== "string" || !descriptor || !Object.hasOwn(descriptor, "value")) {
        throw new TypeError(`Question ${index + 1} must contain only string data fields`);
      }
      if (!QUESTION_FIELDS.has(key)) throw new Error(`Unsupported question ${index + 1} field: ${key}`);
    }
    if (typeof draft.id !== "string" || !draft.id.trim() || ids.has(draft.id)) {
      throw new Error(`Question ${index + 1} needs a unique draft ID`);
    }
    ids.add(draft.id);
    const text = (field) => {
      if (typeof draft[field] !== "string" || !draft[field].trim()) {
        throw new Error(`Question ${index + 1} needs ${field}`);
      }
      return draft[field].trim();
    };
    const points = Number(draft.points);
    if (!Number.isInteger(points) || points < 1 || points > 10) {
      throw new Error(`Question ${index + 1} points must be a whole number from 1 to 10`);
    }
    return Object.freeze({
      objective: objective.trim(),
      prompt: text("prompt"),
      expectedLearning: text("expectedLearning"),
      teacherAnswer: text("teacherAnswer"),
      points,
    });
  }));
}
