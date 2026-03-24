import type * as PIXI from "pixi.js";

import { optimizeCompositeModel } from "../core/optimize";
import { parseCompositeModel } from "../core/parse";
import { extractCompositeSelectors } from "../core/selectors";
import type {
  CompositeModelManifest,
  CompositePart,
  CompositePartType,
  ExtractCompositeSelectorsResult,
  MaybePromise,
} from "../core/types";

type OverrideBoundsTuple = [number, number, number, number];

type PixiModule = typeof import("pixi.js");

type Live2DCoreModel = {
  setParamFloat?: (id: string, value: number) => unknown;
  setParameterValueById?: (id: string, value: number, weight?: number) => unknown;
};

type Live2DInternalModel = {
  coreModel?: Live2DCoreModel;
};

type CompositeNodeMetadata = {
  __compositePart?: CompositePart;
  __compositeResolvedUrl?: string;
  __compositeCharacterId?: string;
  __compositeCharacterLabel?: string;
  __compositePartType?: CompositePartType;
};

export type CompositeDisplayObject = PIXI.DisplayObject &
  CompositeNodeMetadata & {
    visible: boolean;
    destroy: (options?: unknown) => void;
  };

export type CompositeLive2DModel = PIXI.Container &
  CompositeNodeMetadata & {
    visible: boolean;
    motion?: (name: string, index?: number, priority?: number) => unknown;
    expression?: (name: string) => unknown;
    destroy: (options?: unknown) => void;
    internalModel?: Live2DInternalModel;
  };

export type CompositeVideoSprite = PIXI.Sprite &
  CompositeNodeMetadata & {
    visible: boolean;
    destroy: (options?: unknown) => void;
    __compositeVideoElement?: HTMLVideoElement;
  };

type CompositeLive2DModelStatic = {
  from: (url: string, options?: Record<string, unknown>) => Promise<CompositeLive2DModel>;
};

export interface CompositeLoadedNode {
  part: CompositePart;
  partType: CompositePartType;
  resolvedUrl: string;
  displayObject: CompositeDisplayObject;
  live2dModel?: CompositeLive2DModel;
}

export interface CompositeModelLoadContext {
  container: PIXI.Container;
  manifest: CompositeModelManifest;
  part: CompositePart;
  partType: CompositePartType;
  resolvedUrl: string;
  model: CompositeDisplayObject;
  displayObject: CompositeDisplayObject;
  live2dModel?: CompositeLive2DModel;
  node: CompositeLoadedNode;
  modelIndex: number;
  overrideBounds?: OverrideBoundsTuple;
}

export interface CompositeLoadedModelContext {
  container: PIXI.Container;
  manifest: CompositeModelManifest;
  models: CompositeLive2DModel[];
  nodes: CompositeLoadedNode[];
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
  nodes: CompositeLoadedNode[];
  manifest: CompositeModelManifest;
  selectors: ExtractCompositeSelectorsResult;
  applyMotion: (name: string) => void;
  applyExpression: (name: string) => void;
  applyImport: (value?: number) => void;
  destroy: () => void;
}

let gifPluginRegistered = false;

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

const loadGifModule = () => import("@pixi/gif");

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

const fetchArrayBuffer = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: HTTP ${response.status}`);
  }
  return response.arrayBuffer();
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
  const coreModel = model.internalModel?.coreModel;
  if (!coreModel) {
    return;
  }

  if (typeof coreModel.setParameterValueById === "function") {
    coreModel.setParameterValueById("PARAM_IMPORT", value);
    return;
  }

  coreModel.setParamFloat?.("PARAM_IMPORT", value);
};

const inferPartType = (part: CompositePart): CompositePartType => {
  if (part.type) {
    return part.type;
  }

  const normalizedPath = part.path.trim().toLowerCase();
  if (normalizedPath.endsWith(".gif")) {
    return "gif";
  }
  if (normalizedPath.endsWith(".webm") || normalizedPath.endsWith(".mp4") || normalizedPath.endsWith(".ogv")) {
    return "video";
  }
  if (
    normalizedPath.endsWith(".png") ||
    normalizedPath.endsWith(".jpg") ||
    normalizedPath.endsWith(".jpeg") ||
    normalizedPath.endsWith(".webp") ||
    normalizedPath.endsWith(".avif") ||
    normalizedPath.endsWith(".bmp")
  ) {
    return "image";
  }
  return "live2d";
};

const applyGifPlaybackState = (displayObject: CompositeDisplayObject, part: CompositePart) => {
  const maybeAnimated = displayObject as CompositeDisplayObject & {
    play?: () => unknown;
    stop?: () => unknown;
    loop?: boolean;
  };

  if (typeof part.loop === "boolean") {
    maybeAnimated.loop = part.loop;
  }

  if (part.autoplay === false) {
    maybeAnimated.stop?.();
    return;
  }

  maybeAnimated.play?.();
};

const loadGifDisplayObject = async (
  PIXI: PixiModule,
  resolvedUrl: string,
  part: CompositePart,
): Promise<CompositeDisplayObject> => {
  const gifModule = await loadGifModule();

  const animatedGifCtor = (gifModule as {
    AnimatedGIF?: {
      fromBuffer?: (buffer: ArrayBuffer) => Promise<CompositeDisplayObject> | CompositeDisplayObject;
    };
  }).AnimatedGIF;

  if (animatedGifCtor?.fromBuffer) {
    const buffer = await fetchArrayBuffer(resolvedUrl);
    const displayObject = await animatedGifCtor.fromBuffer(buffer);
    applyGifPlaybackState(displayObject, part);
    return displayObject;
  }

  const pixiWithLoader = PIXI as unknown as {
    Loader?: {
      registerPlugin?: (plugin: unknown) => void;
      new (): {
        add: (name: string, url: string) => unknown;
        load: (callback: (loader: unknown, resources: Record<string, unknown>) => void) => void;
      };
    };
  };
  const animatedGifLoader = (gifModule as { AnimatedGIFLoader?: unknown }).AnimatedGIFLoader;
  const loaderCtor = pixiWithLoader.Loader;

  if (!animatedGifLoader || !loaderCtor) {
    throw new Error("@pixi/gif does not expose a supported AnimatedGIF API.");
  }

  if (!gifPluginRegistered) {
    loaderCtor.registerPlugin?.(animatedGifLoader);
    gifPluginRegistered = true;
  }

  const resourceKey = `gif:${resolvedUrl}:${Math.random().toString(36).slice(2)}`;

  return new Promise<CompositeDisplayObject>((resolve, reject) => {
    const loader = new loaderCtor();
    loader.add(resourceKey, resolvedUrl);
    loader.load((_loader, resources) => {
      const resource = resources[resourceKey] as { animation?: CompositeDisplayObject } | undefined;
      if (!resource?.animation) {
        reject(new Error(`@pixi/gif failed to load ${resolvedUrl}.`));
        return;
      }
      applyGifPlaybackState(resource.animation, part);
      resolve(resource.animation);
    });
  });
};

const ensureDocument = () => {
  if (typeof document === "undefined" || typeof document.createElement !== "function") {
    throw new Error("Video parts require a DOM-like document.createElement environment.");
  }
  return document;
};

const waitForVideoReady = (video: HTMLVideoElement) =>
  new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener("loadeddata", onLoaded);
      video.removeEventListener("error", onError);
    };

    const onLoaded = () => {
      cleanup();
      resolve();
    };

    const onError = () => {
      cleanup();
      reject(new Error(`Failed to load video resource: ${video.currentSrc || video.src}`));
    };

    video.addEventListener("loadeddata", onLoaded);
    video.addEventListener("error", onError);
  });

const loadVideoDisplayObject = async (
  PIXI: PixiModule,
  resolvedUrl: string,
  part: CompositePart,
): Promise<CompositeVideoSprite> => {
  const doc = ensureDocument();
  const video = doc.createElement("video");
  video.src = resolvedUrl;
  video.preload = "auto";
  video.crossOrigin = "anonymous";
  video.loop = part.loop ?? true;
  video.muted = part.muted ?? true;
  video.autoplay = part.autoplay ?? true;
  if ("playsInline" in video) {
    (video as HTMLVideoElement & { playsInline?: boolean }).playsInline = part.playsinline ?? true;
  }
  video.setAttribute("playsinline", String(part.playsinline ?? true));
  const ready = waitForVideoReady(video);
  video.load();
  await ready;

  const autoPlay = part.autoplay ?? true;
  const baseTexture = PIXI.BaseTexture.from(video, {
    resourceOptions: {
      autoLoad: true,
      autoPlay,
    },
  });
  const sprite = new PIXI.Sprite(new PIXI.Texture(baseTexture)) as CompositeVideoSprite;
  sprite.__compositeVideoElement = video;

  if (!autoPlay) {
    video.pause();
    try {
      video.currentTime = 0;
    } catch {
      // Ignore browsers that block seeking before playback metadata settles.
    }
  } else {
    try {
      await video.play();
    } catch {
      // Browser autoplay policies may reject the promise; keep the sprite usable anyway.
    }
  }

  return sprite;
};

const loadImageDisplayObject = (PIXI: PixiModule, resolvedUrl: string) =>
  new PIXI.Sprite(PIXI.Texture.from(resolvedUrl)) as CompositeDisplayObject;

const attachMetadata = (
  displayObject: CompositeDisplayObject,
  part: CompositePart,
  resolvedUrl: string,
  fallbackIndex: number,
  partType: CompositePartType,
) => {
  const characterId = toCharacterId(part, fallbackIndex);
  displayObject.__compositePart = part;
  displayObject.__compositeResolvedUrl = resolvedUrl;
  displayObject.__compositeCharacterId = characterId;
  displayObject.__compositeCharacterLabel = characterId;
  displayObject.__compositePartType = partType;
  displayObject.visible = false;
};

const loadPartDisplayObject = async (
  PIXI: PixiModule,
  modelCtor: CompositeLive2DModelStatic | undefined,
  part: CompositePart,
  resolvedUrl: string,
  overrideBounds: OverrideBoundsTuple | undefined,
): Promise<CompositeLoadedNode> => {
  const partType = inferPartType(part);

  if (partType === "live2d") {
    if (!modelCtor) {
      throw new Error("pixi-live2d-display-webgal does not expose Live2DModel.");
    }

    const live2dModel = await modelCtor.from(resolvedUrl, {
      autoInteract: false,
      overWriteBounds: makeOverwriteBounds(overrideBounds),
    });

    return {
      part,
      partType,
      resolvedUrl,
      displayObject: live2dModel,
      live2dModel,
    };
  }

  if (partType === "gif") {
    return {
      part,
      partType,
      resolvedUrl,
      displayObject: await loadGifDisplayObject(PIXI, resolvedUrl, part),
    };
  }

  if (partType === "video") {
    return {
      part,
      partType,
      resolvedUrl,
      displayObject: await loadVideoDisplayObject(PIXI, resolvedUrl, part),
    };
  }

  return {
    part,
    partType,
    resolvedUrl,
    displayObject: loadImageDisplayObject(PIXI, resolvedUrl),
  };
};

const destroyDisplayObject = (displayObject: CompositeDisplayObject) => {
  const maybeVideo = displayObject as CompositeVideoSprite;
  if (maybeVideo.__compositeVideoElement) {
    maybeVideo.__compositeVideoElement.pause();
    maybeVideo.__compositeVideoElement.removeAttribute("src");
    maybeVideo.__compositeVideoElement.load();
  }

  try {
    displayObject.destroy({ children: true, texture: true, baseTexture: true });
  } catch {
    try {
      displayObject.destroy({ children: true });
    } catch {
      displayObject.destroy();
    }
  }
};

export async function loadPixiCompositeModel(
  options: LoadPixiCompositeModelOptions,
): Promise<LoadedPixiCompositeModel> {
  const { PIXI, modelCtor } = await loadRuntimeModules();

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
  const nodes: CompositeLoadedNode[] = [];

  for (const [index, part] of manifest.parts.entries()) {
    const resolvedUrl = await options.resolveAssetUrl(part, manifest);
    const node = await loadPartDisplayObject(PIXI, modelCtor, part, resolvedUrl, options.overrideBounds);
    attachMetadata(node.displayObject, part, resolvedUrl, index, node.partType);

    container.addChild(node.displayObject);

    if (node.live2dModel) {
      setImportValue(node.live2dModel, manifest.summary.import);
      models.push(node.live2dModel);
    }

    if (options.configureModel) {
      const context: CompositeModelLoadContext = {
        container,
        manifest,
        part,
        partType: node.partType,
        resolvedUrl,
        model: node.displayObject,
        displayObject: node.displayObject,
        node,
        modelIndex: index,
      };
      if (node.live2dModel) {
        context.live2dModel = node.live2dModel;
      }
      if (options.overrideBounds) {
        context.overrideBounds = options.overrideBounds;
      }
      await options.configureModel(context);
    }

    nodes.push(node);
  }

  if (nodes.length === 0) {
    throw new Error("Composite model loader could not load any sub-models.");
  }

  const firstLive2DNode = nodes.find((node) => node.partType === "live2d");
  const firstModelJson = firstLive2DNode ? await fetchJson(firstLive2DNode.resolvedUrl) : {};
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

  for (const node of nodes) {
    node.displayObject.visible = true;
  }

  if (options.afterLoad) {
    await options.afterLoad({
      container,
      manifest,
      models,
      nodes,
      selectors,
    });
  }

  const destroy = () => {
    for (const node of nodes) {
      destroyDisplayObject(node.displayObject);
    }
    container.destroy({ children: true });
    models.length = 0;
    nodes.length = 0;
  };

  return {
    container,
    models,
    nodes,
    manifest,
    selectors,
    applyMotion,
    applyExpression,
    applyImport,
    destroy,
  };
}
