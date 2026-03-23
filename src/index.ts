export { parseCompositeModel } from "./core/parse";
export { optimizeCompositeModel } from "./core/optimize";
export { stringifyCompositeModel } from "./core/stringify";
export { extractCompositeSelectors } from "./core/selectors";
export { resolveCompositePath } from "./core/path";
export { loadPixiCompositeModel } from "./runtime/loadPixiCompositeModel";

export type {
  CompositeDiagnostic,
  CompositeDiagnosticSeverity,
  CompositePartType,
  CompositeModelManifest,
  CompositeParsedLine,
  CompositePart,
  CompositePathResolver,
  CompositeSummary,
  ExtractCompositeSelectorsResult,
  MaybePromise,
  OptimizeCompositeModelOptions,
  OptimizedCompositeModel,
  ParseCompositeModelOptions,
} from "./core/types";

export type {
  CompositeDisplayObject,
  CompositeLoadedNode,
  CompositeLive2DModel,
  CompositeLoadedModelContext,
  CompositeModelLoadContext,
  CompositeVideoSprite,
  LoadPixiCompositeModelOptions,
  LoadedPixiCompositeModel,
} from "./runtime/loadPixiCompositeModel";
