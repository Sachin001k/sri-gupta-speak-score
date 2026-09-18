import {
  ALL_CRITERIA,
  CRITERION_MAX,
  totalScoreForCriteria,
  type AssessmentCriterion,
  type CriterionFeedback,
  type FeedbackLengthMinutes,
  type StructuredFeedback,
} from "@/types/feedback";

interface Score {
  logic: number;
  rhetoric: number;
  empathy: number;
  delivery: number;
  total: number;
}

interface CounterArgument {
  rebuttal: string;
  strengthLevel: "Low" | "Medium" | "High";
  supportingEvidence: string;
  commonSources: string;
  keyPoints?: string[];
}

interface DefenseStrategy {
  preemptiveDefense: string;
  directResponse: string;
  redirectTechnique: string;
  evidenceArsenal: string;
  keyPoints?: string[];
}

interface EnhancedFeedback {
  argumentAnalysis: {
    logicalStructure: string;
    evidenceQuality: string;
    clarityScore: number;
    persuasiveness: string;
  };
  dataEnhancements: {
    statisticalSupport: string[];
    expertCitations: string[];
    caseStudies: string[];
    quantifiableClaims: string[];
  };
  counterArguments: CounterArgument[];
  defenseStrategies: DefenseStrategy[];
  strategicRecommendations: string[];
}

export interface ScoreData {
  score: Score;
  feedback: StructuredFeedback;
  transcript: string;
  missingPoints: string[];
  enhancedArgument: string;
  enhancedFeedback?: EnhancedFeedback;
  selectedCriteria?: AssessmentCriterion[];
  feedbackLengthMinutes?: FeedbackLengthMinutes;
}

function asCriterion(text: string, extra?: string[]): CriterionFeedback {
  return {
    synopsis: text,
    points: [text, ...(extra || [])].slice(0, 5),
  };
}

export function generateMockScore(
  audioBlob: Blob,
  motion: string,
  stance?: string,
  providedTranscript?: string,
  options?: {
    feedbackLengthMinutes?: FeedbackLengthMinutes;
    selectedCriteria?: AssessmentCriterion[];
  },
): ScoreData {
  void audioBlob;
  const selected = options?.selectedCriteria?.length
    ? options.selectedCriteria
    : ALL_CRITERIA;
  const feedbackLength = options?.feedbackLengthMinutes ?? 5;

  const baseLogic = Math.floor(Math.random() * 3) + 6;
  const baseRhetoric = Math.floor(Math.random() * 3) + 6;
  const baseEmpathy = Math.floor(Math.random() * 2) + 3;
  const baseDelivery = Math.floor(Math.random() * 2) + 3;

  const score: Score = {
    logic: selected.includes("logic") ? baseLogic : 0,
    rhetoric: selected.includes("rhetoric") ? baseRhetoric : 0,
    empathy: selected.includes("empathy") ? baseEmpathy : 0,
    delivery: selected.includes("delivery") ? baseDelivery : 0,
    total: 0,
  };
  score.total = totalScoreForCriteria(score, selected);

  const maxPoints = feedbackLength === 2 ? 3 : 5;
  const feedback: StructuredFeedback = {
    overall: `Your speech scored ${score.total}/${selected.reduce((s, c) => s + CRITERION_MAX[c], 0)}.`,
  };
  if (selected.includes("logic")) {
    feedback.logic = {
      ...asCriterion(generateLogicFeedback(baseLogic), [
        "Clarify your main premise before the first example.",
        "Link each claim to a clear conclusion.",
      ]),
      points: asCriterion(generateLogicFeedback(baseLogic), [
        "Clarify your main premise before the first example.",
        "Link each claim to a clear conclusion.",
      ]).points.slice(0, maxPoints),
    };
  }
  if (selected.includes("rhetoric")) {
    feedback.rhetoric = {
      synopsis: generateRhetoricFeedback(baseRhetoric),
      points: [
        generateRhetoricFeedback(baseRhetoric),
        "Add one vivid comparison to make the claim stick.",
        "End with a sharper call-to-action phrase.",
      ].slice(0, maxPoints),
    };
  }
  if (selected.includes("empathy")) {
    feedback.empathy = {
      synopsis: generateEmpathyFeedback(baseEmpathy),
      points: [
        generateEmpathyFeedback(baseEmpathy),
        "Acknowledge one opposing concern before rebutting it.",
      ].slice(0, maxPoints),
    };
  }
  if (selected.includes("delivery")) {
    feedback.delivery = {
      synopsis: generateDeliveryFeedback(baseDelivery),
      points: [
        generateDeliveryFeedback(baseDelivery),
        "Slow down on key transitions so listeners can follow.",
      ].slice(0, maxPoints),
    };
  }

  const transcript = providedTranscript || generateMockTranscript(motion, stance);
  const missingPoints = generateMissingPoints(motion, stance).slice(
    0,
    feedbackLength === 2 ? 2 : 4,
  );
  const enhancedArgument = generateEnhancedArgument(motion, missingPoints, stance);

  return {
    score,
    feedback,
    transcript,
    missingPoints,
    enhancedArgument,
    selectedCriteria: selected,
    feedbackLengthMinutes: feedbackLength,
  };
}

function generateLogicFeedback(score: number): string {
  if (score >= 8) {
    return "Strong logical structure from premise to conclusion.";
  }
  if (score >= 6) {
    return "Solid foundation — tighten how evidence supports each claim.";
  }
  return "Organize main points more clearly before supporting details.";
}

function generateRhetoricFeedback(score: number): string {
  if (score >= 8) {
    return "Persuasive language landed well.";
  }
  if (score >= 6) {
    return "Good wording — add one stronger rhetorical device.";
  }
  return "Choose sharper, more concrete language for key claims.";
}

function generateEmpathyFeedback(score: number): string {
  if (score >= 4) {
    return "You respected opposing views while defending your stance.";
  }
  if (score >= 3) {
    return "Add a brief acknowledgment of the other side.";
  }
  return "Show you understand why someone might disagree.";
}

function generateDeliveryFeedback(score: number): string {
  if (score >= 4) {
    return "Clear, confident delivery overall.";
  }
  if (score >= 3) {
    return "Mostly clear — smooth a few rushed transitions.";
  }
  return "Slow down and emphasize your strongest line.";
}

function generateMockTranscript(motion: string, stance?: string): string {
  const stanceText = stance ? ` arguing ${stance}` : "";
  return `This is a practice speech${stanceText} on: ${motion}. The speaker presented opening claims, supporting reasons, and a closing appeal.`;
}

function generateMissingPoints(motion: string, stance?: string): string[] {
  return [
    `Add a clearer thesis that directly answers "${motion}".`,
    "Define one key term early so listeners share your framing.",
    stance
      ? `Address the strongest objection to arguing ${stance}.`
      : "Acknowledge a meaningful counterpoint before your rebuttal.",
    "Close with a concrete next-step ask, not a vague summary.",
  ];
}

function generateEnhancedArgument(
  motion: string,
  missingPoints: string[],
  stance?: string,
): string {
  return `Improved outline for "${motion}"${stance ? ` (${stance})` : ""}:\n1. Open with a crisp thesis.\n2. Support with two logical reasons.\n3. Address one counterpoint.\n4. Close with a memorable call to action.\n\nGaps to fill:\n- ${missingPoints.join("\n- ")}`;
}
