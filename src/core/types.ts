export type MaybePromise<T> = T | Promise<T>;

export type CompositeDiagnosticSeverity = "warning" | "error";
export type CompositePartType = "live2d" | "image" | "gif" | "video";

export interface CompositeDiagnostic {
  code:
    | "invalid-json"
    | "invalid-root"
    | "invalid-summary-field"
    | "invalid-version"
    | "invalid-import"
    | "missing-path"
    | "invalid-path"
    | "invalid-part-type"
    | "invalid-part-flag"
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
  type?: CompositePartType;
  id?: string;
  folder?: string;
  index?: number;
  x?: number;
  y?: number;
  xscale?: number;
  yscale?: number;
  loop?: boolean;
  muted?: boolean;
  autoplay?: boolean;
  playsinline?: boolean;
  lineNumber: number;
}

export interface CompositeSummary {
  version?: number;
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
