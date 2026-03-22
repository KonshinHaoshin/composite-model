import * as PIXI from "pixi.js";

type CompositeModule = typeof import("../../src/index");

const viewer = document.querySelector<HTMLDivElement>("#viewer");
const jsonlUrlInput = document.querySelector<HTMLInputElement>("#jsonl-url");
const motionInput = document.querySelector<HTMLInputElement>("#motion-name");
const expressionInput = document.querySelector<HTMLInputElement>("#expression-name");
const jsonlTextArea = document.querySelector<HTMLTextAreaElement>("#jsonl-text");
const statusNode = document.querySelector<HTMLElement>("#status");
const loadUrlButton = document.querySelector<HTMLButtonElement>("#load-url");
const loadTextButton = document.querySelector<HTMLButtonElement>("#load-text");
const normalizeButton = document.querySelector<HTMLButtonElement>("#normalize");
const destroyButton = document.querySelector<HTMLButtonElement>("#destroy");

if (
  !viewer ||
  !jsonlUrlInput ||
  !motionInput ||
  !expressionInput ||
  !jsonlTextArea ||
  !statusNode ||
  !loadUrlButton ||
  !loadTextButton ||
  !normalizeButton ||
  !destroyButton
) {
  throw new Error("Example UI initialization failed.");
}

const app = new PIXI.Application({
  resizeTo: viewer,
  autoDensity: true,
  antialias: true,
  backgroundAlpha: 0,
});

viewer.appendChild(app.view as HTMLCanvasElement);
(window as typeof window & { PIXI?: typeof PIXI }).PIXI = PIXI;

let runtimeModule: CompositeModule | null = null;
let currentLoaded:
  | Awaited<ReturnType<CompositeModule["loadPixiCompositeModel"]>>
  | null = null;

jsonlTextArea.value = [
  '{"path":"./body/model.json","id":"body","x":0,"y":0,"xscale":1,"yscale":1}',
  '{"path":"./face/model.json","id":"face","x":0,"y":0,"xscale":1,"yscale":1}',
  '{"motions":["idle"],"expressions":["smile"],"import":1}',
].join("\n");

jsonlUrlInput.value = "/models/%E8%B0%83%E6%95%99%E7%A5%A5%E5%AD%90/model.jsonl";
motionInput.value = "sakiko/idle01";
expressionInput.value = "sakiko/default";

function setStatus(message: string) {
  statusNode.textContent = message;
}

function loadScript(url: string) {
  return new Promise<string>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = url;
    script.onload = () => resolve(`Loaded: ${url}`);
    script.onerror = () => reject(new Error(`Failed to load: ${url}`));
    document.head.appendChild(script);
  });
}

async function ensureCubism2Sdk() {
  const maybeWindow = window as typeof window & {
    Live2D?: unknown;
    Live2DCubismCore?: unknown;
  };

  if (maybeWindow.Live2D && maybeWindow.Live2DCubismCore) {
    return;
  }

  await loadScript("/lib/live2d.min.js");
  await loadScript("/lib/live2dcubismcore.min.js");
}

async function ensureRuntimeModule() {
  if (runtimeModule) {
    return runtimeModule;
  }
  await ensureCubism2Sdk();
  runtimeModule = await import("../../src/index");
  return runtimeModule;
}

function clearCurrentModel() {
  if (currentLoaded) {
    app.stage.removeChild(currentLoaded.container);
    currentLoaded.destroy();
    currentLoaded = null;
  }
}

async function mountLoadedModel(
  input:
    | { jsonlUrl: string; source?: string }
    | { jsonlText: string; source: string },
) {
  const mod = await ensureRuntimeModule();
  clearCurrentModel();

  const result = await mod.loadPixiCompositeModel({
    ...input,
    createContainer: () => {
      const container = new PIXI.Container();
      container.position.set(app.screen.width / 2, app.screen.height / 2);
      return container;
    },
    resolveAssetUrl: async (part, manifest) => {
      const source = manifest.source ?? input.source;
      return mod.resolveCompositePath(part.path, source);
    },
    configureModel: async ({ model, part }) => {
      const scale = 0.35;
      model.anchor?.set?.(0.5);
      model.scale.set(
        scale * (part.xscale ?? 1),
        scale * (part.yscale ?? 1),
      );
      model.position.set(part.x ?? 0, part.y ?? 0);
    },
    afterLoad: async ({ selectors }) => {
      setStatus(
        [
          "加载成功",
          `motions: ${selectors.motions.join(", ") || "(none)"}`,
          `expressions: ${selectors.expressions.join(", ") || "(none)"}`,
        ].join("\n"),
      );
    },
    initialMotion: motionInput.value.trim() || undefined,
    initialExpression: expressionInput.value.trim() || undefined,
  });

  currentLoaded = result;
  app.stage.addChild(result.container);
}

loadUrlButton.addEventListener("click", async () => {
  try {
    const jsonlUrl = jsonlUrlInput.value.trim();
    if (!jsonlUrl) {
      throw new Error("JSONL URL is required.");
    }
    setStatus(`加载中: ${jsonlUrl}`);
    await mountLoadedModel({ jsonlUrl, source: jsonlUrl });
  } catch (error) {
    setStatus(`加载失败\n${error instanceof Error ? error.message : String(error)}`);
  }
});

async function autoLoadDefaultModel() {
  try {
    const jsonlUrl = jsonlUrlInput.value.trim();
    if (!jsonlUrl) {
      return;
    }
    setStatus(`自动加载中: ${jsonlUrl}`);
    await mountLoadedModel({ jsonlUrl, source: jsonlUrl });
  } catch (error) {
    setStatus(`自动加载失败\n${error instanceof Error ? error.message : String(error)}`);
  }
}

loadTextButton.addEventListener("click", async () => {
  try {
    const source = jsonlUrlInput.value.trim() || `${location.origin}/assets/demo/composite.model.jsonl`;
    const jsonlText = jsonlTextArea.value.trim();
    if (!jsonlText) {
      throw new Error("JSONL Text is empty.");
    }
    setStatus("按文本加载中");
    await mountLoadedModel({ jsonlText, source });
  } catch (error) {
    setStatus(`加载失败\n${error instanceof Error ? error.message : String(error)}`);
  }
});

normalizeButton.addEventListener("click", async () => {
  try {
    const mod = await ensureRuntimeModule();
    const source = jsonlUrlInput.value.trim() || undefined;
    const manifest = mod.parseCompositeModel(source ? { text: jsonlTextArea.value, source } : jsonlTextArea.value);
    const optimized = mod.optimizeCompositeModel(manifest);
    jsonlTextArea.value = optimized.text;
    setStatus(
      [
        "Parse + Optimize 完成",
        `parts: ${optimized.parts.length}`,
        `diagnostics: ${optimized.diagnostics.length}`,
      ].join("\n"),
    );
  } catch (error) {
    setStatus(`规范化失败\n${error instanceof Error ? error.message : String(error)}`);
  }
});

destroyButton.addEventListener("click", () => {
  clearCurrentModel();
  setStatus("已销毁当前模型");
});

setStatus(
  [
    "运行前请确认：",
    "1. examples/lib 下已放入 Cubism2 脚本",
    "2. JSONL 与其子模型资源可通过当前 dev server 访问",
  ].join("\n"),
);

void autoLoadDefaultModel();
