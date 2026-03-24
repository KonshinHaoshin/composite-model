import * as PIXI from "pixi.js";

type CompositeModule = typeof import("../../src/index");

const MODEL_URL = "/models/%E8%B0%83%E6%95%99%E7%A5%A5%E5%AD%90/model.jsonl";
const DEFAULT_MOTION = "sakiko/idle01";
const DEFAULT_EXPRESSION = "sakiko/default";

const viewer = document.querySelector<HTMLDivElement>("#viewer");
const motionSelect = document.querySelector<HTMLSelectElement>("#motion-select");
const expressionSelect = document.querySelector<HTMLSelectElement>("#expression-select");
const reloadButton = document.querySelector<HTMLButtonElement>("#reload");
const resetButton = document.querySelector<HTMLButtonElement>("#reset");
const statusNode = document.querySelector<HTMLElement>("#status");

if (!viewer || !motionSelect || !expressionSelect || !reloadButton || !resetButton || !statusNode) {
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
let isBusy = false;

function setStatus(message: string) {
  statusNode.textContent = message;
}

function setControlsDisabled(disabled: boolean) {
  motionSelect.disabled = disabled;
  expressionSelect.disabled = disabled;
  reloadButton.disabled = disabled;
  resetButton.disabled = disabled;
}

function replaceOptions(select: HTMLSelectElement, values: string[], selected?: string) {
  select.innerHTML = "";

  if (values.length === 0) {
    const option = document.createElement("option");
    option.textContent = "无可用项";
    option.value = "";
    select.appendChild(option);
    select.disabled = true;
    return;
  }

  for (const value of values) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    option.selected = value === selected;
    select.appendChild(option);
  }

  if (selected && values.includes(selected)) {
    select.value = selected;
  } else {
    select.value = values[0];
  }
  select.disabled = false;
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

async function ensureLive2DSdks() {
  const maybeWindow = window as typeof window & {
    Live2D?: unknown;
    Live2DCubismCore?: unknown;
  };

  if (maybeWindow.Live2D && maybeWindow.Live2DCubismCore) {
    return;
  }

  const loaders: Promise<unknown>[] = [];

  if (!maybeWindow.Live2D) {
    loaders.push(
      loadScript("/lib/live2d.min.js").catch(() => undefined),
    );
  }
  if (!maybeWindow.Live2DCubismCore) {
    loaders.push(
      loadScript("/lib/live2dcubismcore.min.js").catch(() => undefined),
    );
  }

  await Promise.all(loaders);

  if (!maybeWindow.Live2D && !maybeWindow.Live2DCubismCore) {
    throw new Error(
      "未找到 Live2D 运行时。Cubism2 需要 /lib/live2d.min.js，Cubism3/4 需要 /lib/live2dcubismcore.min.js。",
    );
  }
}

async function ensureRuntimeModule() {
  if (runtimeModule) {
    return runtimeModule;
  }
  await ensureLive2DSdks();
  runtimeModule = await import("../../src/index");
  return runtimeModule;
}

function clearCurrentModel() {
  if (!currentLoaded) {
    return;
  }
  app.stage.removeChild(currentLoaded.container);
  currentLoaded.destroy();
  currentLoaded = null;
}

function syncSelectors() {
  if (!currentLoaded) {
    replaceOptions(motionSelect, []);
    replaceOptions(expressionSelect, []);
    return;
  }

  replaceOptions(motionSelect, currentLoaded.selectors.motions, DEFAULT_MOTION);
  replaceOptions(expressionSelect, currentLoaded.selectors.expressions, DEFAULT_EXPRESSION);
}

async function mountModel() {
  if (isBusy) {
    return;
  }

  isBusy = true;
  setControlsDisabled(true);
  setStatus("加载模型中...");

  try {
    const mod = await ensureRuntimeModule();
    clearCurrentModel();

    const result = await mod.loadPixiCompositeModel({
      jsonlUrl: MODEL_URL,
      source: MODEL_URL,
      createContainer: () => {
        const container = new PIXI.Container();
        container.position.set(app.screen.width / 2, app.screen.height / 2 + 80);
        return container;
      },
      resolveAssetUrl: async (part, manifest) => mod.resolveCompositePath(part.path, manifest.source),
      configureModel: async ({ model, part }) => {
        const scale = 0.35;
        model.anchor?.set?.(0.5);
        model.scale.set(scale * (part.xscale ?? 1), scale * (part.yscale ?? 1));
        model.position.set(part.x ?? 0, part.y ?? 0);
      },
    });

    currentLoaded = result;
    app.stage.addChild(result.container);
    syncSelectors();

    if (motionSelect.value) {
      currentLoaded.applyMotion(motionSelect.value);
    }
    if (expressionSelect.value) {
      currentLoaded.applyExpression(expressionSelect.value);
    }

    setStatus(
      [
        "模型已加载",
        `parts: ${result.manifest.parts.length}`,
        `motions: ${result.selectors.motions.length}`,
        `expressions: ${result.selectors.expressions.length}`,
      ].join("\n"),
    );
  } catch (error) {
    clearCurrentModel();
    replaceOptions(motionSelect, []);
    replaceOptions(expressionSelect, []);
    setStatus(`加载失败\n${error instanceof Error ? error.message : String(error)}`);
  } finally {
    isBusy = false;
    setControlsDisabled(false);
  }
}

motionSelect.addEventListener("change", () => {
  if (!currentLoaded || !motionSelect.value) {
    return;
  }
  currentLoaded.applyMotion(motionSelect.value);
  setStatus(
    [
      "模型已加载",
      `motion: ${motionSelect.value}`,
      `expression: ${expressionSelect.value || "(none)"}`,
    ].join("\n"),
  );
});

expressionSelect.addEventListener("change", () => {
  if (!currentLoaded || !expressionSelect.value) {
    return;
  }
  currentLoaded.applyExpression(expressionSelect.value);
  setStatus(
    [
      "模型已加载",
      `motion: ${motionSelect.value || "(none)"}`,
      `expression: ${expressionSelect.value}`,
    ].join("\n"),
  );
});

reloadButton.addEventListener("click", () => {
  void mountModel();
});

resetButton.addEventListener("click", () => {
  if (!currentLoaded) {
    return;
  }

  if (currentLoaded.selectors.motions.includes(DEFAULT_MOTION)) {
    motionSelect.value = DEFAULT_MOTION;
    currentLoaded.applyMotion(DEFAULT_MOTION);
  }

  if (currentLoaded.selectors.expressions.includes(DEFAULT_EXPRESSION)) {
    expressionSelect.value = DEFAULT_EXPRESSION;
    currentLoaded.applyExpression(DEFAULT_EXPRESSION);
  }

  setStatus(
    [
      "已恢复默认状态",
      `motion: ${motionSelect.value || "(none)"}`,
      `expression: ${expressionSelect.value || "(none)"}`,
    ].join("\n"),
  );
});

replaceOptions(motionSelect, []);
replaceOptions(expressionSelect, []);
setStatus("准备加载固定示例模型...");
void mountModel();
