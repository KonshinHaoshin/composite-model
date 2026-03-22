import type { CompositeModelManifest, CompositePart, CompositeSummary } from "./types";

const serializePart = (part: CompositePart) => {
  const out: Record<string, unknown> = {
    path: part.path,
  };
  if (part.id !== undefined) out.id = part.id;
  if (part.folder !== undefined) out.folder = part.folder;
  if (part.index !== undefined) out.index = part.index;
  if (part.x !== undefined) out.x = part.x;
  if (part.y !== undefined) out.y = part.y;
  if (part.xscale !== undefined) out.xscale = part.xscale;
  if (part.yscale !== undefined) out.yscale = part.yscale;
  return JSON.stringify(out);
};

const hasSummaryContent = (summary: CompositeSummary) =>
  (summary.motions?.length ?? 0) > 0 ||
  (summary.expressions?.length ?? 0) > 0 ||
  summary.import !== undefined;

const serializeSummary = (summary: CompositeSummary) => {
  const out: Record<string, unknown> = {};
  if (summary.motions && summary.motions.length > 0) {
    out.motions = summary.motions;
  }
  if (summary.expressions && summary.expressions.length > 0) {
    out.expressions = summary.expressions;
  }
  if (summary.import !== undefined) {
    out.import = summary.import;
  }
  return Object.keys(out).length > 0 ? JSON.stringify(out) : undefined;
};

export function stringifyCompositeModel(manifest: Pick<CompositeModelManifest, "parts" | "summary">): string {
  const lines = manifest.parts.map(serializePart);
  if (hasSummaryContent(manifest.summary)) {
    const summaryLine = serializeSummary(manifest.summary);
    if (summaryLine) {
      lines.push(summaryLine);
    }
  }
  return lines.join("\n");
}
