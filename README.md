# composite-model

前端 `jsonl` 聚合模型工具包，面向 WebGAL / Pixi / Live2D 场景。

当前提供两类能力：

- 纯数据核心：解析、诊断、规范化、`stringify`
- 运行时加载：基于 `pixi-live2d-display-webgal` 批量加载子模型并应用 `motion` / `expression` / `PARAM_IMPORT`

## 安装

```bash
pnpm add composite-model pixi.js pixi-live2d-display-webgal
```

## 你要怎么测试 JSONL

最直接的方式就是跑仓库里的浏览器 example。这个 example 针对你现在的真实场景设计：

- JSONL 由 Cubism2 子模型驱动
- 浏览器里先加载 `live2d.min.js`
- 再加载 `live2dcubismcore.min.js`
- 最后通过 `loadPixiCompositeModel()` 加载 `.jsonl`

### 1. 准备 Cubism2 SDK 文件

由于仓库不能分发 Live2D SDK，请你自己把文件放到：

```text
examples/lib/live2d.min.js
examples/lib/live2dcubismcore.min.js
```

这和你给的加载方式一致，example 内部也是先动态加载这两个脚本。

### 2. 准备测试资源

把你的 Cubism2 模型和 `.jsonl` 放到 example 的静态目录下，例如：

```text
examples/models/你的模型/model.jsonl
examples/models/你的模型/body/model.json
examples/models/你的模型/face/model.json
...
```

一个最小 JSONL 例子：

```jsonl
{"path":"./body/model.json","id":"body","x":0,"y":0,"xscale":1,"yscale":1}
{"path":"./face/model.json","id":"face","x":0,"y":0,"xscale":1,"yscale":1}
{"motions":["idle"],"expressions":["smile"],"import":1}
```

注意：

- 这里的子模型应该是 Cubism2 的 `model.json`
- `path` 必须能被浏览器通过 HTTP 正常访问
- 如果你直接测试 URL 模式，`.jsonl` 和子模型资源必须来自同一个可访问站点

如果你现在就要测试你给的那份资源，默认 URL 直接填：

```text
/models/%E8%B0%83%E6%95%99%E7%A5%A5%E5%AD%90/model.jsonl
```

也就是浏览器里的：

```text
/models/调教祥子/model.jsonl
```

### 3. 跑 example

```bash
pnpm install
pnpm example:dev
```

默认会打开 `http://localhost:4173`。

页面支持两种测试方式：

- `Load URL`
  - 输入一个 `.jsonl` URL，直接按运行时真实逻辑加载
- `Load Text`
  - 粘贴 `.jsonl` 文本，先在浏览器里解析，再按 `source` 推导相对路径加载子模型

另外还有一个 `Parse + Optimize` 按钮，用来验证：

- `parseCompositeModel`
- `optimizeCompositeModel`
- `stringifyCompositeModel`

## 最小运行时代码

```ts
import * as PIXI from "pixi.js";
import { loadPixiCompositeModel, resolveCompositePath } from "composite-model";

const app = new PIXI.Application({ resizeTo: window, backgroundAlpha: 0 });
document.body.appendChild(app.view as HTMLCanvasElement);

const loaded = await loadPixiCompositeModel({
  jsonlUrl: "/assets/demo/composite.model.jsonl",
  createContainer: () => {
    const container = new PIXI.Container();
    container.position.set(app.screen.width / 2, app.screen.height / 2);
    return container;
  },
  resolveAssetUrl: async (part, manifest) => {
    return resolveCompositePath(part.path, manifest.source);
  },
  configureModel: async ({ model, part }) => {
    model.anchor?.set?.(0.5);
    model.position.set(part.x ?? 0, part.y ?? 0);
  },
  initialMotion: "idle",
  initialExpression: "smile",
});

app.stage.addChild(loaded.container);
```

## Cubism2 说明

你说得对，这个 JSONL 运行时本质上还是由 Cubism2 推动的。  
也就是说：

- 这个包只负责 JSONL 聚合这一层
- 具体模型底层仍然依赖 `pixi-live2d-display-webgal`
- 而 `pixi-live2d-display-webgal` 对 Cubism2 的运行，又依赖页面中可用的 Live2D SDK 脚本

所以如果 example 页面打不开模型，第一优先检查的是：

1. `live2d.min.js` 是否成功加载
2. `live2dcubismcore.min.js` 是否成功加载
3. 子模型 `model.json` 及其贴图、动作文件是否都能通过 Network 面板拿到 200
4. `.jsonl` 中的相对路径是否真的相对于 `.jsonl` 文件本身

## 本地验证

当前仓库已经验证通过：

```bash
pnpm exec tsc --noEmit
pnpm exec vitest run
pnpm exec tsup
```
