import type * as PIXI from "pixi.js";

import { optimizeCompositeModel } from "../core/optimize";
import { parseCompositeModel } from "../core/parse";
import { extractCompositeSelectors } from "../core/selectors";
import type {
  CompositeModelManifest,
  CompositePart,
  ExtractCompositeSelectorsResult,
  MaybePromise,
} from "../core/types";

type OverrideBoundsTuple = [number, number, number, number];

type Live2DCoreModel = {
  setParamFloat?: (id: string, value: number) => unknown;
};

type Live2DInternalModel = {
  coreModel?: Live2DCoreModel;
};

export type CompositeLive2DModel = PIXI.Container & {
  visible: boolean;
  motion?: (name: string, index?: number, priority?: number) => unknown;
  expression?: (name: string) => unknown;
  destroy: (options?: unknown) => void;
  internalModel?: Live2DInternalModel;
  __compositePart?: CompositePart;
  __compositeResolvedUrl?: string;
  __compositeCharacterId?: string;
  __compositeCharacterLabel?: string;
};

type CompositeLive2DModelStatic = {
  from: (url: string, options?: Record<string, unknown>) => Promise<CompositeLive2DModel>;
};

export interface CompositeModelLoadContext {
  container: PIXI.Container;
  manifest: CompositeModelManifest;
  part: CompositePart;
  resolvedUrl: string;
  model: CompositeLive2DModel;
  modelIndex: number;
  overrideBounds?: OverrideBoundsTuple;
}

export interface CompositeLoadedModelContext {
  container: PIXI.Container;
  manifest: CompositeModelManifest;
  models: CompositeLive2DModel[];
  selectors: ExtractCompositeSelectorsResult;
}

export interface LoadPixiCompositeModelOptions {
  jsonlText?: string;
  jsonlUrl?: string;
  source?: string;
  createContainer?: () => PIXI.Container;
  resolveAssetUrl: (part: CompositePart, manifest: CompositeModelManifest) => MaybePromise<string>;
  configureModel?: (context: CompositeModelLoadContext) => MaybePromise<void>;
  afterLoad?: (context: CompositeLoadedModelContext) => MaybePromise<void>;
  initialMotion?: string;
  initialExpression?: string;
  overrideBounds?: OverrideBoundsTuple;
}

export interface LoadedPixiCompositeModel {
  container: PIXI.Container;
  models: CompositeLive2DModel[];
  manifest: CompositeModelManifest;
  selectors: ExtractCompositeSelectorsResult;
  applyMotion: (name: string) => void;
  applyExpression: (name: string) => void;
  applyImport: (value?: number) => void;
  destroy: () => void;
}

const loadRuntimeModules = async () => {
  const [PIXI, Live2D] = await Promise.all([
    import("pixi.js"),
    import("pixi-live2d-display-webgal"),
  ]);

  const maybeModelCtor = (Live2D as unknown as {
    Live2DModel?: CompositeLive2DModelStatic & {
      registerTicker?: (tickerClass: unknown) => void;
    };
  }).Live2DModel;

  maybeModelCtor?.registerTicker?.((PIXI as unknown as { Ticker?: unknown }).Ticker);

  return {
    PIXI,
    modelCtor: maybeModelCtor,
  };
};

const makeOverwriteBounds = (bounds: OverrideBoundsTuple | undefined) => {
  if (!bounds) {
    return undefined;
  }
  return {
    x0: bounds[0],
    y0: bounds[1],
    x1: bounds[2],
    y1: bounds[3],
  };
};

const toCharacterId = (part: CompositePart, fallbackIndex: number) => {
  const base = part.id?.trim() || part.folder?.trim() || `part${part.index ?? fallbackIndex}`;
  return base || `part${fallbackIndex}`;
};

const fetchText = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: HTTP ${response.status}`);
  }
  return response.text();
};

const fetchJson = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: HTTP ${response.status}`);
  }
  return response.json() as Promise<Record<string, unknown>>;
};

const callMotion = (model: CompositeLive2DModel, name: string) => {
  if (!name) {
    return;
  }
  try {
    model.motion?.(name, 0, 3);
  } catch {
    model.motion?.(name);
  }
};

const callExpression = (model: CompositeLive2DModel, name: string) => {
  if (!name) {
    return;
  }
  model.expression?.(name);
};

const setImportValue = (model: CompositeLive2DModel, value: number | undefined) => {
  if (value === undefined) {
    return;
  }
  model.internalModel?.coreModel?.setParamFloat?.("PARAM_IMPORT", value);
};

export async function loadPixiCompositeModel(
  options: LoadPixiCompositeModelOptions,
): Promise<LoadedPixiCompositeModel> {
  const { PIXI, modelCtor } = await loadRuntimeModules();
  if (!modelCtor) {
    throw new Error("pixi-live2d-display-webgal does not expose Live2DModel.");
  }

  const source = options.source ?? options.jsonlUrl;
  const jsonlText =
    options.jsonlText ??
    (options.jsonlUrl ? await fetchText(options.jsonlUrl) : undefined);

  if (!jsonlText) {
    throw new Error("Either jsonlText or jsonlUrl is required.");
  }

  const optimized = optimizeCompositeModel(
    parseCompositeModel(source ? { text: jsonlText, source } : { text: jsonlText }),
  );
  const manifest: CompositeModelManifest = optimized;

  if (manifest.parts.length === 0) {
    throw new Error("Composite model manifest contains no valid parts.");
  }

  const container = options.createContainer?.() ?? new PIXI.Container();
  if ("sortableChildren" in container) {
    container.sortableChildren = true;
  }

  const models: CompositeLive2DModel[] = [];
  const resolvedUrls: string[] = [];

  for (const [index, part] of manifest.parts.entries()) {
    const resolvedUrl = await options.resolveAssetUrl(part, manifest);
    const model = await modelCtor.from(resolvedUrl, {
      autoInteract: false,
      overWriteBounds: makeOverwriteBounds(options.overrideBounds),
    });

    const characterId = toCharacterId(part, index);
    model.__compositePart = part;
    model.__compositeResolvedUrl = resolvedUrl;
    model.__compositeCharacterId = characterId;
    model.__compositeCharacterLabel = characterId;
    model.visible = false;

    container.addChild(model as unknown as PIXI.DisplayObject);
    setImportValue(model, manifest.summary.import);

    if (options.configureModel) {
      const context: CompositeModelLoadContext = {
        container,
        manifest,
        part,
        resolvedUrl,
        model,
        modelIndex: index,
      };
      if (options.overrideBounds) {
        context.overrideBounds = options.overrideBounds;
      }
      await options.configureModel({
        ...context,
      });
    }

    models.push(model);
    resolvedUrls.push(resolvedUrl);
  }

  if (models.length === 0) {
    throw new Error("Composite model loader could not load any sub-models.");
  }

  const firstModelJson = await fetchJson(resolvedUrls[0]!);
  const selectors = extractCompositeSelectors(manifest, firstModelJson);

  const applyMotion = (name: string) => {
    for (const model of models) {
      callMotion(model, name);
    }
  };

  const applyExpression = (name: string) => {
    for (const model of models) {
      callExpression(model, name);
    }
  };

  const applyImport = (value = manifest.summary.import) => {
    for (const model of models) {
      setImportValue(model, value);
    }
  };

  if (options.initialMotion) {
    applyMotion(options.initialMotion);
  }
  if (options.initialExpression) {
    applyExpression(options.initialExpression);
  }

  for (const model of models) {
    model.visible = true;
  }

  if (options.afterLoad) {
    await options.afterLoad({
      container,
      manifest,
      models,
      selectors,
    });
  }

  const destroy = () => {
    for (const model of models) {
      try {
        model.destroy({ children: true });
      } catch {
        model.destroy();
      }
    }
    container.destroy({ children: true });
  };

  return {
    container,
    models,
    manifest,
    selectors,
    applyMotion,
    applyExpression,
    applyImport,
    destroy,
  };
}
