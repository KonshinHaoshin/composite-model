export type MaybePromise<T> = T | Promise<T>;

export type CompositeDiagnosticSeverity = "warning" | "error";

export interface CompositeDiagnostic {
  code:
    | "invalid-json"
    | "invalid-root"
    | "invalid-summary-field"
    | "invalid-import"
    | "missing-path"
    | "invalid-path"
    | "invalid-part-field"
    | "duplicate-summary"
    | "extra-fields"
    | "unknown-line";
  message: string;
  severity: CompositeDiagnosticSeverity;
  lineNumber?: number;
  line?: string;
  field?: string;
}

export interface CompositePart {
  path: string;
  id?: string;
  folder?: string;
  index?: number;
  x?: number;
  y?: number;
  xscale?: number;
  yscale?: number;
  lineNumber: number;
}

export interface CompositeSummary {
  motions?: string[];
  expressions?: string[];
  import?: number;
  lineNumber?: number;
}

export interface CompositePartLine {
  kind: "part";
  lineNumber: number;
  raw: string;
  part: CompositePart;
}

export interface CompositeSummaryLine {
  kind: "summary";
  lineNumber: number;
  raw: string;
  summary: CompositeSummary;
}

export interface CompositeEmptyLine {
  kind: "empty";
  lineNumber: number;
  raw: string;
}

export interface CompositeInvalidLine {
  kind: "invalid";
  lineNumber: number;
  raw: string;
}

export interface CompositeUnknownLine {
  kind: "unknown";
  lineNumber: number;
  raw: string;
}

export type CompositeParsedLine =
  | CompositePartLine
  | CompositeSummaryLine
  | CompositeEmptyLine
  | CompositeInvalidLine
  | CompositeUnknownLine;

export interface CompositeModelManifest {
  source?: string;
  rawText: string;
  parts: CompositePart[];
  summary: CompositeSummary;
  diagnostics: CompositeDiagnostic[];
  lines: CompositeParsedLine[];
}

export interface OptimizedCompositeModel extends CompositeModelManifest {
  text: string;
  changed: boolean;
}

export interface ParseCompositeModelOptions {
  source?: string;
}

export interface OptimizeCompositeModelOptions {
  fillMissingIndex?: boolean;
}

export interface ExtractCompositeSelectorsResult {
  motions: string[];
  expressions: string[];
}

export type CompositePathResolver = (context: {
  partPath: string;
  normalizedPartPath: string;
  source?: string;
  defaultPath: string;
  isGamePath: boolean;
}) => MaybePromise<string | undefined>;
