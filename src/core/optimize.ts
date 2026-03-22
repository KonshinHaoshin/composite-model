import { stringifyCompositeModel } from "./stringify";
import type {
  CompositeModelManifest,
  CompositePart,
  CompositeSummary,
  OptimizeCompositeModelOptions,
  OptimizedCompositeModel,
} from "./types";

const dedupe = (values: string[] | undefined) => {
  if (!values) {
    return undefined;
  }
  const result: string[] = [];
  for (const value of values) {
    if (!result.includes(value)) {
      result.push(value);
    }
  }
  return result;
};

const normalizePath = (value: string) => value.replace(/\\/g, "/");

const normalizeSummary = (summary: CompositeSummary): CompositeSummary => {
  const motions = dedupe(summary.motions);
  const expressions = dedupe(summary.expressions);
  const importValue = typeof summary.import === "number" && Number.isFinite(summary.import) ? summary.import : undefined;

  const next: CompositeSummary = {};
  if (motions && motions.length > 0) {
    next.motions = motions;
  }
  if (expressions && expressions.length > 0) {
    next.expressions = expressions;
  }
  if (importValue !== undefined) {
    next.import = importValue;
  }
  return next;
};

export function optimizeCompositeModel(
  manifest: CompositeModelManifest,
  options: OptimizeCompositeModelOptions = {},
): OptimizedCompositeModel {
  const fillMissingIndex = options.fillMissingIndex ?? true;

  const parts: CompositePart[] = manifest.parts.map((part, index) => {
    const next: CompositePart = {
      ...part,
      path: normalizePath(part.path),
    };
    const resolvedIndex = part.index ?? (fillMissingIndex ? index : undefined);
    if (resolvedIndex !== undefined) {
      next.index = resolvedIndex;
    }
    return next;
  });

  const summary = normalizeSummary(manifest.summary);
  const text = stringifyCompositeModel({ parts, summary });
  const lines = text
    .split(/\r?\n/)
    .filter(Boolean)
    .map((raw, index) => ({ raw, index, lineNumber: index + 1 }));

  const normalizedSummary: CompositeSummary = {
    ...summary,
  };
  if (Object.keys(summary).length > 0) {
    normalizedSummary.lineNumber = parts.length + 1;
  }

  return {
    ...(manifest.source ? { source: manifest.source } : {}),
    rawText: text,
    parts: parts.map((part, index) => ({
      ...part,
      lineNumber: index + 1,
    })),
    summary: normalizedSummary,
    diagnostics: manifest.diagnostics,
    lines: lines.map((entry, index) => {
      const part = parts[index];
      if (part) {
        return {
          kind: "part" as const,
          lineNumber: entry.lineNumber,
          raw: entry.raw,
          part: {
            ...part,
            lineNumber: entry.lineNumber,
          },
        };
      }

      return {
        kind: "summary" as const,
        lineNumber: entry.lineNumber,
        raw: entry.raw,
        summary: {
          ...summary,
          lineNumber: entry.lineNumber,
        },
      };
    }),
    text,
    changed: text !== manifest.rawText,
  };
}
