export type AssessmentCriterion = "logic" | "rhetoric" | "empathy" | "delivery";

export type FeedbackLengthMinutes = 2 | 5 | 7;

export const ALL_CRITERIA: AssessmentCriterion[] = [
  "logic",
  "rhetoric",
  "empathy",
  "delivery",
];

export const CRITERION_LABELS: Record<AssessmentCriterion, string> = {
  logic: "Logic",
  rhetoric: "Rhetoric",
  empathy: "Empathy",
  delivery: "Delivery",
};

export const CRITERION_MAX: Record<AssessmentCriterion, number> = {
  logic: 10,
  rhetoric: 10,
  empathy: 5,
  delivery: 5,
};

export type CriterionFeedback = {
  synopsis: string;
  points: string[];
};

export type StructuredFeedback = {
  logic?: CriterionFeedback;
  rhetoric?: CriterionFeedback;
  empathy?: CriterionFeedback;
  delivery?: CriterionFeedback;
  overall: string;
};

/** Normalize legacy string feedback or structured objects into CriterionFeedback. */
export function normalizeCriterionFeedback(
  value: unknown,
): CriterionFeedback | undefined {
  if (value == null) return undefined;
  if (typeof value === "string") {
    const text = value.trim();
    if (!text) return undefined;
    return { synopsis: text.slice(0, 180), points: [text].slice(0, 5) };
  }
  if (typeof value === "object") {
    const obj = value as { synopsis?: unknown; points?: unknown };
    const points = Array.isArray(obj.points)
      ? obj.points
          .filter((p): p is string => typeof p === "string" && p.trim().length > 0)
          .map((p) => p.trim())
          .slice(0, 5)
      : [];
    const synopsis =
      typeof obj.synopsis === "string" && obj.synopsis.trim()
        ? obj.synopsis.trim()
        : points[0] ?? "";
    if (!synopsis && points.length === 0) return undefined;
    return { synopsis, points: points.length > 0 ? points : synopsis ? [synopsis] : [] };
  }
  return undefined;
}

export function maxScoreForCriteria(criteria: AssessmentCriterion[]): number {
  return criteria.reduce((sum, c) => sum + CRITERION_MAX[c], 0);
}

export function totalScoreForCriteria(
  score: Partial<Record<AssessmentCriterion, number>>,
  criteria: AssessmentCriterion[],
): number {
  return criteria.reduce((sum, c) => sum + (Number(score[c]) || 0), 0);
}
