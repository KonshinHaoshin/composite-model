# composite-model

`composite-model` 是一个面向前端的 `JSONL` 聚合模型工具包，用来统一解析、优化并加载 `Live2D / 图片 / GIF / WebM` 复合立绘。

它的定位很明确：

- 负责 `JSONL` 聚合模型这一层
- 不负责分发 Live2D SDK
- 不直接依赖 Tauri / Node 文件系统
- 运行时面向浏览器
- 当前运行时适配层基于 `pixi-live2d-display-webgal` + `Pixi`
- `Live2D` part 同时支持 Cubism2 `model.json` 与 Cubism3/4 `model3.json`

这个包适合三类场景：

1. 你只想解析 `.jsonl`，拿到部件列表、动作列表、表情列表、`import` 参数
2. 你想把现有项目里重复的 `jsonl` 解析逻辑抽成公共库
3. 你想在 Pixi + Live2D 场景下直接加载聚合模型，并统一应用 `motion` / `expression` / `PARAM_IMPORT`

---

## 目录

- [1. 这个包解决什么问题](#1-这个包解决什么问题)
- [2. 当前支持的 JSONL 格式](#2-当前支持的-jsonl-格式)
- [3. 安装](#3-安装)
- [4. 核心 API 总览](#4-核心-api-总览)
- [5. 纯数据能力使用说明](#5-纯数据能力使用说明)
- [6. 运行时加载能力使用说明](#6-运行时加载能力使用说明)
- [7. Cubism2 和 Live2D SDK 说明](#7-cubism2-和-live2d-sdk-说明)
- [8. 仓库内 example 的详细使用方法](#8-仓库内-example-的详细使用方法)
- [9. 当前 example 的固定测试资源](#9-当前-example-的固定测试资源)
- [10. 常见问题与排查](#10-常见问题与排查)
- [11. 本地开发与验证命令](#11-本地开发与验证命令)
- [12. 当前实现边界](#12-当前实现边界)
- [13. 代码位置](#13-代码位置)

---

## 1. 这个包解决什么问题

社区里的 `.jsonl` 聚合模型通常长这样：

- 前几行是多个子模型声明
- 每个子模型指向一个 `model.json` 或 `model3.json`
- 最后一行是汇总信息，比如：
  - `motions`
  - `expressions`
  - `import`

这类模型在多个项目里通常会重复写同一套逻辑：

- 逐行 `JSON.parse`
- 过滤空行、坏行
- 识别哪一行是 part，哪一行是 summary
- 解析相对路径
- 拿第一个子模型反推动作 / 表情
- 给所有子模型设置 `PARAM_IMPORT`
- 批量切换动作和表情

这个包做的就是把这套重复逻辑收敛成一套统一 API。

---

## 2. 当前支持的 JSONL 格式

当前版本同时支持两套写法：

- 兼容旧版 `v1`：只有 `model.json` 子模型 part
- 扩展新版 `v2`：允许把图片、GIF、WebM 也写成 part 行，和 Live2D 部件一起按行参与图层堆叠

### 2.1 part 行字段

基础字段：

- `path`
- `type`
- `id`
- `folder`
- `index`
- `x`
- `y`
- `xscale`
- `yscale`

其中：

- `path` 必填
- `type` 可选，支持 `live2d`、`image`、`gif`、`video`
- 不写 `type` 时会按扩展名推断：
  - `.json` 默认按 `live2d`
  - `.png/.jpg/.jpeg/.webp/.avif/.bmp` 按 `image`
  - `.gif` 按 `gif`
  - `.webm/.mp4/.ogv` 按 `video`

媒体 part 还支持这些可选字段：

- `loop`
- `muted`
- `autoplay`
- `playsinline`

### 2.2 summary 行字段

- `version`
- `motions`
- `expressions`
- `import`

### 2.3 旧版 v1 例子

```jsonl
{"path":"./body/model.json","id":"body","x":0,"y":0,"xscale":1,"yscale":1}
{"path":"./face/model.json","id":"face","x":0,"y":0,"xscale":1,"yscale":1}
{"motions":["idle","tap"],"expressions":["smile","sad"],"import":1}
```

### 2.4 新版 v2 分层例子

这就是“图片和模型一样，一行一个 part，用来参与图层”的格式：

```jsonl
{"index":0,"id":"sakiko0","path":"1.后发/model.json","folder":"1.后发"}
{"index":1,"id":"sakiko1","path":"2.衣服/model.json","folder":"2.衣服"}
{"index":2,"id":"sakiko2","path":"3.脸/model.json","folder":"3.脸"}
{"index":3,"id":"sakiko3","path":"4.帽子/model.json","folder":"4.帽子"}
{"index":4,"id":"sakiko4","type":"image","path":"5.前景/特效.png","folder":"5.前景"}
{"index":5,"id":"sakiko5","type":"gif","path":"6.闪光/shine.gif","folder":"6.闪光","autoplay":true,"loop":true}
{"index":6,"id":"sakiko6","type":"video","path":"7.雨幕/rain.webm","folder":"7.雨幕","autoplay":true,"loop":true,"muted":true,"playsinline":true}
{"version":2,"motions":["sakiko/idle01"],"expressions":["sakiko/default"],"import":50}
```

这类 `v2` JSONL 的含义是：

- 每一行 part 都是一个图层节点
- `model.json`、图片、GIF、WebM 都能混排
- 包不会把图片/GIF/视频拆成另一套资源清单
- 图层顺序保持 part 行原顺序；如果你自己传了 `index`，会原样保留

规则说明：

- 只要一行里出现 `version` / `motions` / `expressions` / `import`，并且该行没有 `path`，就会被视为 summary 行
- 只要一行里出现 `path`，就会被视为 part 行
- 坏行不会让解析直接失败，而是进入 diagnostics
- `motions` / `expressions` 当前只支持数组，不支持对象型 summary
- `import` 会被规范为数字；如果不是合法数字，会给出诊断
- 当 part 使用了 `type` 或媒体控制字段时，`optimizeCompositeModel()` 会把 summary 规范到 `version: 2`
- 当 summary 没有给出 `motions/expressions` 时，会自动兼容：
  - Cubism2 `model.json` 的 `motions` / `expressions`
  - Cubism3/4 `model3.json` 的 `FileReferences.Motions` / `FileReferences.Expressions`

---

## 3. 安装

### 3.1 安装包本身

```bash
pnpm add composite-model
```

### 3.2 安装运行时依赖

如果你要用运行时加载能力，还需要：

```bash
pnpm add pixi.js pixi-live2d-display-webgal
```

如果你的聚合模型里包含 GIF part，再额外安装：

```bash
pnpm add @pixi/gif
```

### 3.3 依赖关系说明

请注意：

- `pixi.js` 和 `pixi-live2d-display-webgal` 是运行时依赖
- `@pixi/gif` 只在你使用 GIF part 时需要
- Live2D SDK 不是 npm 依赖
- 你需要自己在页面里提供与模型版本匹配的 Live2D 运行库

---

## 4. 核心 API 总览

当前导出的主要 API：

- `parseCompositeModel`
- `optimizeCompositeModel`
- `stringifyCompositeModel`
- `extractCompositeSelectors`
- `resolveCompositePath`
- `loadPixiCompositeModel`

主要类型：

- `CompositePart`
- `CompositePartType`
- `CompositeSummary`
- `CompositeModelManifest`
- `CompositeDiagnostic`
- `LoadPixiCompositeModelOptions`
- `LoadedPixiCompositeModel`

可以从 [src/index.ts](G:\git\composite-model\src\index.ts) 查看完整导出。

---

## 5. 纯数据能力使用说明

这一层不要求你真的加载 Live2D，也不要求浏览器里一定能渲染模型。  
它适合：

- 做 JSONL 格式检查
- 做路径规范化
- 在工具链中生成标准化文本
- 在编辑器中抽取动作和表情列表

### 5.1 `parseCompositeModel`

最基础的入口。

```ts
import { parseCompositeModel } from "composite-model";

const manifest = parseCompositeModel({
  text: jsonlText,
  source: "/models/demo/model.jsonl",
});
```

返回内容包括：

- `parts`
- `summary`
- `diagnostics`
- `lines`
- `rawText`
- `source`

适合拿它做：

- JSONL 是否有坏行
- 解析出了多少个子模型
- `motions` / `expressions` / `import` 是否存在

### 5.2 `optimizeCompositeModel`

把解析结果规范化。

```ts
import { parseCompositeModel, optimizeCompositeModel } from "composite-model";

const manifest = parseCompositeModel(jsonlText);
const optimized = optimizeCompositeModel(manifest);

console.log(optimized.text);
```

它会做这些事：

- 清理空行和无效行
- 归并 summary 行
- 规范路径分隔符为 `/`
- 自动补齐缺失的 `index`
- 去重 `motions` / `expressions`
- 规范 `import`

### 5.3 `stringifyCompositeModel`

将标准化后的结果重新写回 `.jsonl` 文本。

```ts
import { stringifyCompositeModel } from "composite-model";

const text = stringifyCompositeModel({
  parts,
  summary,
});
```

### 5.4 `extractCompositeSelectors`

用于抽取动作和表情选择列表。

```ts
import { extractCompositeSelectors } from "composite-model";

const selectors = extractCompositeSelectors(manifest, firstModelJson);
console.log(selectors.motions);
console.log(selectors.expressions);
```

行为规则：

- 如果 summary 里已经有 `motions` / `expressions`，优先使用 summary
- 如果 summary 里没有，就回退到第一个子模型的 `model.json`

### 5.5 `resolveCompositePath`

用于统一解析 part 路径。

```ts
import { resolveCompositePath } from "composite-model";

const fullPath = await resolveCompositePath(
  "./body/model.json",
  "/models/demo/model.jsonl",
);
```

当前支持处理：

- `./foo/bar.json`
- 相对路径
- 绝对 URL
- `game/...` 风格路径

---

## 6. 运行时加载能力使用说明

这一层用于真实加载 `.jsonl` 聚合模型。

### 6.1 最小示例

```ts
import * as PIXI from "pixi.js";
import { loadPixiCompositeModel, resolveCompositePath } from "composite-model";

const app = new PIXI.Application({
  resizeTo: window,
  backgroundAlpha: 0,
});

document.body.appendChild(app.view as HTMLCanvasElement);

const loaded = await loadPixiCompositeModel({
  jsonlUrl: "/models/demo/model.jsonl",
  source: "/models/demo/model.jsonl",
  createContainer: () => {
    const container = new PIXI.Container();
    container.position.set(app.screen.width / 2, app.screen.height / 2);
    return container;
  },
  resolveAssetUrl: async (part, manifest) => {
    return resolveCompositePath(part.path, manifest.source);
  },
  configureModel: async ({ displayObject, part }) => {
    (displayObject as PIXI.Sprite).anchor?.set?.(0.5);
    displayObject.position.set(part.x ?? 0, part.y ?? 0);
  },
  initialMotion: "idle",
  initialExpression: "smile",
});

app.stage.addChild(loaded.container);
```

### 6.2 `loadPixiCompositeModel` 会做什么

它会按顺序做这些事情：

1. 读取 `.jsonl`
2. 解析为 `manifest`
3. 遍历所有 `parts`
4. 调用 `resolveAssetUrl` 得到每个子模型 URL
5. 按 `type` 或扩展名选择加载方式：
   - `live2d` -> `Live2DModel.from(...)`
   - `image` -> `PIXI.Sprite`
   - `gif` -> `@pixi/gif`
   - `video` -> `HTMLVideoElement + PIXI.Texture.from(...)`
6. 对所有 Live2D 子模型批量应用 summary 里的 `import`
7. 读取首个 Live2D 子模型的设置文件，生成动作 / 表情列表
   - Cubism2: `model.json`
   - Cubism3/4: `model3.json`
8. 根据 `initialMotion` / `initialExpression` 对所有 Live2D 子模型进行初始化
9. 返回统一的控制对象

### 6.3 返回对象能做什么

`loadPixiCompositeModel()` 返回：

- `container`
- `models`
- `nodes`
- `manifest`
- `selectors`
- `applyMotion(name)`
- `applyExpression(name)`
- `applyImport(value?)`
- `destroy()`

常见用法：

```ts
loaded.applyMotion("sakiko/idle01");
loaded.applyExpression("sakiko/default");
loaded.applyImport(50);
loaded.destroy();
```

补充说明：

- `models` 只包含 Live2D 子模型，主要用于兼容旧调用方
- `nodes` 包含全部 part，包括 `image/gif/video`
- `applyMotion` / `applyExpression` / `applyImport` 只会作用于 Live2D 子模型；对图片、GIF、视频只会跳过

### 6.4 `configureModel` 用来做什么

这个回调用来放“项目自己的舞台逻辑”，例如：

- anchor 设置
- scale 设置
- 位置偏移
- 特殊参数初始化

现在这个回调还会额外收到：

- `partType`
- `displayObject`
- `live2dModel`
- `node`

这个包不会强行规定你的定位方案，所以这类行为由调用方决定。

### 6.5 `createContainer` 用来做什么

如果你需要：

- 特殊容器类型
- 自定义容器坐标系
- 不同项目的初始布局方式

就通过 `createContainer()` 自己创建容器。

---

## 7. Cubism2 / 3 / 4 和 Live2D SDK 说明

这点非常重要。

这个包虽然能加载 JSONL 聚合模型，但它本身并不提供 Live2D SDK。  
你实际加载的仍然是模型自身对应的 Cubism 运行时，所以页面里必须存在与模型版本匹配的运行库。

### 7.1 你需要自己提供的脚本

按模型版本区分：

- Cubism2 模型需要：`live2d.min.js`
- Cubism3 / Cubism4 模型需要：`live2dcubismcore.min.js`
- 如果一个聚合模型里可能混用 Cubism2 和 Cubism3/4，就两个都加载

```html
<script src="live2d.min.js"></script>
<script src="live2dcubismcore.min.js"></script>
```

### 7.2 本仓库 example 的处理方式

example 会在运行时动态加载：

- `/lib/live2d.min.js`
- `/lib/live2dcubismcore.min.js`

也就是说，仓库不会内置 SDK 文件；你需要自己把文件放到 example 对应目录。  
如果你只测试 Cubism3/4 模型，至少要放 `live2dcubismcore.min.js`；如果你还要测 Cubism2，则再补 `live2d.min.js`。

### 7.3 运行时还有一个关键点

`pixi-live2d-display-webgal` 需要拿到 Pixi `Ticker` 才能正确更新和绘制模型。  
当前包已经在运行时加载器里自动做了 `registerTicker` 处理，所以你正常使用 `loadPixiCompositeModel()` 时，不需要再手动补这一层。

---

## 8. 仓库内 example 的详细使用方法

example 是为了验证：

- JSONL 能不能被解析
- 子模型路径能不能正确解析
- Cubism2 SDK 是否加载成功
- 动作 / 表情切换是否正常

### 8.1 example 的特点

当前 example 是一个固定模型预览器，不是通用编辑器。

它的特点是：

- 模型路径写死
- 页面打开后自动加载模型
- 左侧只有动作和表情两个下拉框
- 用户通过下拉框切换动作和表情

### 8.2 SDK 放哪里

请把 SDK 文件放到：

```text
examples/lib/live2d.min.js
examples/lib/live2dcubismcore.min.js
```

其中：

- 只跑 Cubism2 时，至少需要 `live2d.min.js`
- 只跑 Cubism3/4 时，至少需要 `live2dcubismcore.min.js`
- 要让同一个 example 同时兼容两类模型，就把两个都放进去

### 8.3 模型资源放哪里

请把模型放到：

```text
examples/models/你的模型目录
```

例如：

```text
examples/models/调教祥子/model.jsonl
examples/models/调教祥子/1.后发/model.json
examples/models/调教祥子/2.衣服/model.json
examples/models/调教祥子/3.脸/model.json
examples/models/调教祥子/4.帽子/model.json
```

### 8.4 如何启动 example

```bash
pnpm install
pnpm example:dev
```

然后打开：

```text
http://localhost:4173
```

### 8.5 页面加载后会发生什么

页面启动后会自动：

1. 创建 Pixi 应用
2. 加载 Cubism2 SDK
3. 读取固定的 `model.jsonl`
4. 逐个加载 part
5. 生成动作下拉框
6. 生成表情下拉框
7. 默认切到预设动作与表情

### 8.6 页面上的按钮说明

#### `重载模型`

重新加载整套聚合模型。适用于：

- 你修改了 `.jsonl`
- 你替换了某个 part 模型
- 你想重置整个 Live2D 状态

#### `恢复默认`

回到 example 写死的默认状态：

- 默认动作：`sakiko/idle01`
- 默认表情：`sakiko/default`

### 8.7 下拉框说明

#### 动作下拉框

- 数据来源：summary 行里的 `motions`
- 如果 summary 不存在，则回退到第一个子模型的 `model.json`
- 选择后会对所有子模型统一调用 `applyMotion`

#### 表情下拉框

- 数据来源：summary 行里的 `expressions`
- 如果 summary 不存在，则回退到第一个子模型的 `model.json`
- 选择后会对所有子模型统一调用 `applyExpression`

---

## 9. 当前 example 的固定测试资源

当前 example 默认写死的是这份模型：

```text
/models/调教祥子/model.jsonl
```

对应本地路径：

[model.jsonl](G:\git\composite-model\examples\models\调教祥子\model.jsonl)

它当前的解析结果是：

- `parts`: 4
- `motions`: 150
- `expressions`: 46
- `import`: 50
- `diagnostics`: 0

默认状态是：

- 默认动作：`sakiko/idle01`
- 默认表情：`sakiko/default`

---

## 10. 常见问题与排查

### 10.1 页面是空白的，什么都没有

优先检查这几项：

1. Console 里是否有红色报错
2. `/lib/live2d.min.js` 是否 200
3. `/lib/live2dcubismcore.min.js` 是否 200
4. `/models/调教祥子/model.jsonl` 是否 200
5. JSONL 里引用的子模型 `model.json` 是否 200
6. 纹理文件 `.png`、动作文件 `.mtn`、表情文件 `.exp.json` 是否都能拿到 200

### 10.2 左侧状态显示“加载失败”

通常说明以下几种问题之一：

- SDK 没有放对位置
- `.jsonl` 路径错了
- 子模型相对路径错了
- 模型资源被浏览器拦截或拿到 404

### 10.3 动作下拉框有值，但切换没反应

优先检查：

- 这个动作名是否真的是模型支持的动作名
- JSONL summary 中的动作名是否和实际 `.mtn` 对应
- 子模型本身是否都支持这个动作

### 10.4 表情切换没反应

优先检查：

- 表情名是否真实存在
- `.exp.json` 文件路径是否正常
- 该表情是否只对部分部件有效

### 10.5 为什么我看到了 `No Ticker registered`

这是 `pixi-live2d-display-webgal` 的运行时要求。  
当前版本已经在包内部自动注册 `PIXI.Ticker`，如果你仍然看到这个报错，通常说明：

- 你没有通过本包的 `loadPixiCompositeModel()` 加载
- 或者你的运行环境里 `pixi.js` / `pixi-live2d-display-webgal` 被重复加载成了不同实例

### 10.6 为什么 `parseCompositeModel` 在 Node 里也能跑

因为当前版本已经把运行时依赖做成了惰性导入：

- 纯解析 API 不会在导入时触发浏览器 `window`
- 真正调用 `loadPixiCompositeModel()` 时才会动态引入 Pixi / Live2D 运行时

这对：

- CI 检查
- 编辑器工具链
- 预处理脚本

都更安全。

---

## 11. 本地开发与验证命令

### 11.1 安装依赖

```bash
pnpm install
```

### 11.2 类型检查

```bash
pnpm exec tsc --noEmit
```

### 11.3 单元测试

```bash
pnpm exec vitest run
```

### 11.4 构建 npm 包

```bash
pnpm exec tsup
```

### 11.5 启动 example

```bash
pnpm example:dev
```

### 11.6 构建 example

```bash
pnpm example:build
```

---

## 12. 当前实现边界

当前版本已经解决的是：

- JSONL 解析
- 规范化
- 路径解析
- 动作 / 表情提取
- Pixi + Live2D / image / gif / video 运行时聚合加载

当前版本没有做的是：

- 不直接修改磁盘上的 `.jsonl` 文件
- 不内置 Tauri 文件读取
- 不内置 WebGAL 的舞台布局策略
- 不内置 l2d-movie-maker 的录制边界与拖拽逻辑
- 不分发 Live2D SDK

也就是说，这个包只统一“可复用的核心与运行时装配层”，不接管每个消费方自己的舞台业务逻辑。

---

## 13. 代码位置

如果你想继续阅读实现，可以从这些文件开始：

- [src/index.ts](G:\git\composite-model\src\index.ts)
- [src/core/parse.ts](G:\git\composite-model\src\core\parse.ts)
- [src/core/optimize.ts](G:\git\composite-model\src\core\optimize.ts)
- [src/core/path.ts](G:\git\composite-model\src\core\path.ts)
- [src/core/selectors.ts](G:\git\composite-model\src\core\selectors.ts)
- [src/runtime/loadPixiCompositeModel.ts](G:\git\composite-model\src\runtime\loadPixiCompositeModel.ts)
- [examples/basic/index.html](G:\git\composite-model\examples\basic\index.html)
- [examples/basic/main.ts](G:\git\composite-model\examples\basic\main.ts)
