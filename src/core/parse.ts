import type {
  CompositeDiagnostic,
  CompositeModelManifest,
  CompositePart,
  CompositePartType,
  CompositeParsedLine,
  CompositeSummary,
  ParseCompositeModelOptions,
} from "./types";

type CompositeInput = string | { text: string; source?: string };

const PART_FIELDS = new Set([
  "path",
  "type",
  "id",
  "folder",
  "index",
  "x",
  "y",
  "xscale",
  "yscale",
  "loop",
  "muted",
  "autoplay",
  "playsinline",
]);
const SUMMARY_FIELDS = new Set(["version", "motions", "expressions", "import"]);
const PART_TYPES = new Set<CompositePartType>(["live2d", "image", "gif", "video"]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const normalizeSlashes = (value: string) => value.replace(/\\/g, "/");

const toFiniteNumber = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const next = Number(value);
    if (Number.isFinite(next)) {
      return next;
    }
  }
  return undefined;
};

const toVersionNumber = (value: unknown): number | undefined => {
  const next = toFiniteNumber(value);
  if (next === undefined || !Number.isInteger(next) || next < 1) {
    return undefined;
  }
  return next;
};

const toBoolean = (value: unknown): boolean | undefined => {
  if (typeof value === "boolean") {
    return value;
  }
  return undefined;
};

const toPartType = (value: unknown): CompositePartType | undefined => {
  if (typeof value !== "string" || !value.trim()) {
    return undefined;
  }
  const normalized = value.trim().toLowerCase() as CompositePartType;
  return PART_TYPES.has(normalized) ? normalized : undefined;
};

const toStringList = (
  value: unknown,
  field: "motions" | "expressions",
  diagnostics: CompositeDiagnostic[],
  lineNumber: number,
  raw: string,
): string[] | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    diagnostics.push({
      code: "invalid-summary-field",
      message: `${field} must be an array in summary lines.`,
      severity: "warning",
      lineNumber,
      line: raw,
      field,
    });
    return undefined;
  }

  const out: string[] = [];
  for (const item of value) {
    if (typeof item === "string" && item.trim()) {
      out.push(item.trim());
    }
  }
  return out;
};

const buildSummary = (input: {
  version?: number;
  motions?: string[];
  expressions?: string[];
  import?: number;
  lineNumber?: number;
}): CompositeSummary => {
  const summary: CompositeSummary = {};
  if (input.version !== undefined) {
    summary.version = input.version;
  }
  if (input.motions && input.motions.length > 0) {
    summary.motions = input.motions;
  }
  if (input.expressions && input.expressions.length > 0) {
    summary.expressions = input.expressions;
  }
  if (input.import !== undefined) {
    summary.import = input.import;
  }
  if (input.lineNumber !== undefined) {
    summary.lineNumber = input.lineNumber;
  }
  return summary;
};

const collectExtraFields = (
  value: Record<string, unknown>,
  allowedFields: Set<string>,
  diagnostics: CompositeDiagnostic[],
  lineNumber: number,
  raw: string,
) => {
  const extraFields = Object.keys(value).filter((key) => !allowedFields.has(key));
  if (extraFields.length > 0) {
    diagnostics.push({
      code: "extra-fields",
      message: `Ignored extra fields: ${extraFields.join(", ")}.`,
      severity: "warning",
      lineNumber,
      line: raw,
    });
  }
};

const mergeStringLists = (current: string[] | undefined, next: string[] | undefined) => {
  if (!next || next.length === 0) {
    return current;
  }
  const merged = [...(current ?? [])];
  for (const item of next) {
    if (!merged.includes(item)) {
      merged.push(item);
    }
  }
  return merged;
};

export function parseCompositeModel(
  input: CompositeInput,
  options: ParseCompositeModelOptions = {},
): CompositeModelManifest {
  const text = typeof input === "string" ? input : input.text;
  const source = options.source ?? (typeof input === "string" ? undefined : input.source);

  const diagnostics: CompositeDiagnostic[] = [];
  const parts: CompositePart[] = [];
  const lines: CompositeParsedLine[] = [];
  let summary: CompositeSummary = {};
  let seenSummary = false;

  const splitLines = text.split(/\r?\n/);

  splitLines.forEach((raw, index) => {
    const lineNumber = index + 1;
    const line = raw.trim();

    if (!line) {
      lines.push({ kind: "empty", lineNumber, raw });
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      diagnostics.push({
        code: "invalid-json",
        message: "Line is not valid JSON.",
        severity: "warning",
        lineNumber,
        line: raw,
      });
      lines.push({ kind: "invalid", lineNumber, raw });
      return;
    }

    if (!isRecord(parsed)) {
      diagnostics.push({
        code: "invalid-root",
        message: "Line must parse to a JSON object.",
        severity: "warning",
        lineNumber,
        line: raw,
      });
      lines.push({ kind: "unknown", lineNumber, raw });
      return;
    }

    const isSummary =
      !("path" in parsed) &&
      ("version" in parsed || "motions" in parsed || "expressions" in parsed || "import" in parsed);

    if (isSummary) {
      if (seenSummary) {
        diagnostics.push({
          code: "duplicate-summary",
          message: "Multiple summary lines found. Summary values will be merged.",
          severity: "warning",
          lineNumber,
          line: raw,
        });
      }
      seenSummary = true;

      const summaryLine: CompositeSummary = {
        lineNumber,
      };
      if ("version" in parsed) {
        const version = toVersionNumber(parsed.version);
        if (version === undefined && parsed.version !== undefined) {
          diagnostics.push({
            code: "invalid-version",
            message: "Summary version must be a positive integer.",
            severity: "warning",
            lineNumber,
            line: raw,
            field: "version",
          });
        } else if (version !== undefined) {
          summaryLine.version = version;
        }
      }
      const motionList = toStringList(parsed.motions, "motions", diagnostics, lineNumber, raw);
      const expressionList = toStringList(parsed.expressions, "expressions", diagnostics, lineNumber, raw);
      if (motionList && motionList.length > 0) {
        summaryLine.motions = motionList;
      }
      if (expressionList && expressionList.length > 0) {
        summaryLine.expressions = expressionList;
      }

      if ("import" in parsed) {
        const importValue = toFiniteNumber(parsed.import);
        if (importValue === undefined && parsed.import !== undefined) {
          diagnostics.push({
            code: "invalid-import",
            message: "Summary import must be a finite number.",
            severity: "warning",
            lineNumber,
            line: raw,
            field: "import",
          });
        } else if (importValue !== undefined) {
          summaryLine.import = importValue;
        }
      }

      collectExtraFields(parsed, SUMMARY_FIELDS, diagnostics, lineNumber, raw);

      const mergedMotions = mergeStringLists(summary.motions, summaryLine.motions);
      const mergedExpressions = mergeStringLists(summary.expressions, summaryLine.expressions);
      const nextSummaryInput: {
        version?: number;
        motions?: string[];
        expressions?: string[];
        import?: number;
        lineNumber: number;
      } = { lineNumber };
      const mergedVersion = summaryLine.version ?? summary.version;
      if (mergedVersion !== undefined) {
        nextSummaryInput.version = mergedVersion;
      }
      if (mergedMotions && mergedMotions.length > 0) {
        nextSummaryInput.motions = mergedMotions;
      }
      if (mergedExpressions && mergedExpressions.length > 0) {
        nextSummaryInput.expressions = mergedExpressions;
      }
      const mergedImport = summaryLine.import ?? summary.import;
      if (mergedImport !== undefined) {
        nextSummaryInput.import = mergedImport;
      }
      summary = buildSummary(nextSummaryInput);

      lines.push({
        kind: "summary",
        lineNumber,
        raw,
        summary: summaryLine,
      });
      return;
    }

    if (!("path" in parsed)) {
      diagnostics.push({
        code: "missing-path",
        message: "Part lines must include a path field.",
        severity: "warning",
        lineNumber,
        line: raw,
        field: "path",
      });
      lines.push({ kind: "unknown", lineNumber, raw });
      return;
    }

    if (typeof parsed.path !== "string" || !parsed.path.trim()) {
      diagnostics.push({
        code: "invalid-path",
        message: "Part path must be a non-empty string.",
        severity: "warning",
        lineNumber,
        line: raw,
        field: "path",
      });
      lines.push({ kind: "unknown", lineNumber, raw });
      return;
    }

    const part: CompositePart = {
      path: normalizeSlashes(parsed.path.trim()),
      lineNumber,
    };

    if ("type" in parsed && parsed.type !== undefined) {
      const partType = toPartType(parsed.type);
      if (partType === undefined) {
        diagnostics.push({
          code: "invalid-part-type",
          message: "Part type must be one of: live2d, image, gif, video.",
          severity: "warning",
          lineNumber,
          line: raw,
          field: "type",
        });
      } else {
        part.type = partType;
      }
    }

    if (typeof parsed.id === "string" && parsed.id.trim()) {
      part.id = parsed.id.trim();
    }
    if (typeof parsed.folder === "string" && parsed.folder.trim()) {
      part.folder = parsed.folder.trim();
    }

    const numericFields = ["index", "x", "y", "xscale", "yscale"] as const;
    for (const field of numericFields) {
      if (!(field in parsed) || parsed[field] === undefined) {
        continue;
      }
      const next = toFiniteNumber(parsed[field]);
      if (next === undefined) {
        diagnostics.push({
          code: "invalid-part-field",
          message: `Part field ${field} must be a finite number.`,
          severity: "warning",
          lineNumber,
          line: raw,
          field,
        });
        continue;
      }
      part[field] = next;
    }

    const booleanFields = ["loop", "muted", "autoplay", "playsinline"] as const;
    for (const field of booleanFields) {
      if (!(field in parsed) || parsed[field] === undefined) {
        continue;
      }
      const next = toBoolean(parsed[field]);
      if (next === undefined) {
        diagnostics.push({
          code: "invalid-part-flag",
          message: `Part field ${field} must be a boolean.`,
          severity: "warning",
          lineNumber,
          line: raw,
          field,
        });
        continue;
      }
      part[field] = next;
    }

    collectExtraFields(parsed, PART_FIELDS, diagnostics, lineNumber, raw);

    parts.push(part);
    lines.push({
      kind: "part",
      lineNumber,
      raw,
      part,
    });
  });

  return {
    ...(source ? { source } : {}),
    rawText: text,
    parts,
    summary,
    diagnostics,
    lines,
  };
}
