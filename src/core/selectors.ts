import type { CompositeModelManifest, ExtractCompositeSelectorsResult } from "./types";

type JsonLike = string | Record<string, unknown>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const dedupe = (values: string[]) => {
  const result: string[] = [];
  for (const value of values) {
    if (!result.includes(value)) {
      result.push(value);
    }
  }
  return result;
};

const parseJsonLike = (input: JsonLike) => (typeof input === "string" ? JSON.parse(input) : input);

const extractNamesFromArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const out: string[] = [];
  for (const item of value) {
    if (typeof item === "string" && item.trim()) {
      out.push(item.trim());
      continue;
    }
    if (!isRecord(item)) {
      continue;
    }
    const nameLike = [item.name, item.file, item.id];
    for (const candidate of nameLike) {
      if (typeof candidate === "string" && candidate.trim()) {
        out.push(candidate.trim());
        break;
      }
    }
  }
  return out;
};

const extractMotionNames = (motions: unknown): string[] => {
  if (Array.isArray(motions)) {
    return extractNamesFromArray(motions);
  }
  if (isRecord(motions)) {
    return Object.keys(motions);
  }
  return [];
};

const extractExpressionNames = (expressions: unknown): string[] => {
  if (Array.isArray(expressions)) {
    return extractNamesFromArray(expressions);
  }
  if (isRecord(expressions)) {
    return Object.keys(expressions);
  }
  return [];
};

export function extractCompositeSelectors(
  manifest: Pick<CompositeModelManifest, "summary">,
  firstModelJson: JsonLike,
): ExtractCompositeSelectorsResult {
  const parsed = parseJsonLike(firstModelJson);
  const motions =
    manifest.summary.motions && manifest.summary.motions.length > 0
      ? dedupe(manifest.summary.motions)
      : dedupe(extractMotionNames(parsed.motions));
  const expressions =
    manifest.summary.expressions && manifest.summary.expressions.length > 0
      ? dedupe(manifest.summary.expressions)
      : dedupe(extractExpressionNames(parsed.expressions));

  return { motions, expressions };
}
