import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  MockContainer,
  MockSprite,
  MockTexture,
  MockBaseTexture,
  MockLoader,
  registerPluginMock,
  fromMock,
  gifFromBufferMock,
} = vi.hoisted(() => {
  class HoistedMockDisplayObject {
    public visible = false;

    public destroyed = false;

    destroy() {
      this.destroyed = true;
    }
  }

  class HoistedMockContainer extends HoistedMockDisplayObject {
    public children: unknown[] = [];

    public sortableChildren = false;

    addChild(child: unknown) {
      this.children.push(child);
      return child;
    }
  }

  class HoistedMockSprite extends HoistedMockDisplayObject {
    constructor(public texture?: unknown) {
      super();
    }
  }

  const textureFrom = vi.fn((source: unknown) => ({ source }));
  const baseTextureFrom = vi.fn((source: unknown, options?: unknown) => ({ source, options }));

  class HoistedMockTexture {
    public baseTexture?: unknown;

    constructor(baseTexture?: unknown) {
      this.baseTexture = baseTexture;
    }

    static from = textureFrom;
  }

  class HoistedMockBaseTexture {
    static from = baseTextureFrom;
  }

  const registerPlugin = vi.fn();

  class HoistedMockLoader {
    static registerPlugin = registerPlugin;

    private items: Array<{ key: string; url: string }> = [];

    add(key: string, url: string) {
      this.items.push({ key, url });
      return this;
    }

    load(callback: (loader: unknown, resources: Record<string, unknown>) => void) {
      const resources = Object.fromEntries(
        this.items.map(({ key, url }) => [
          key,
          {
            url,
            animation: Object.assign(new HoistedMockSprite({ gif: url }), {
              play: vi.fn(),
              stop: vi.fn(),
            }),
          },
        ]),
      );
      callback(this, resources);
    }
  }

  return {
    MockContainer: HoistedMockContainer,
    MockSprite: HoistedMockSprite,
    MockTexture: HoistedMockTexture,
    MockBaseTexture: HoistedMockBaseTexture,
    MockLoader: HoistedMockLoader,
    registerPluginMock: registerPlugin,
    fromMock: vi.fn(),
    gifFromBufferMock: vi.fn(),
  };
});

vi.mock("pixi.js", () => ({
  Container: MockContainer,
  Sprite: MockSprite,
  Texture: MockTexture,
  BaseTexture: MockBaseTexture,
  Loader: MockLoader,
  Ticker: class MockTicker {},
}));

vi.mock("pixi-live2d-display-webgal", () => ({
  Live2DModel: {
    from: fromMock,
    registerTicker: vi.fn(),
  },
}));

vi.mock("@pixi/gif", () => ({
  AnimatedGIF: {
    fromBuffer: gifFromBufferMock,
  },
  AnimatedGIFLoader: {},
}));

import { loadPixiCompositeModel } from "../src/runtime/loadPixiCompositeModel";

type MockVideoElement = {
  src: string;
  currentSrc: string;
  preload: string;
  crossOrigin: string;
  loop: boolean;
  muted: boolean;
  autoplay: boolean;
  playsInline: boolean | undefined;
  listeners: Record<string, Array<() => void>>;
  setAttribute: (name: string, value: string) => void;
  removeAttribute: (name: string) => void;
  addEventListener: (name: string, handler: () => void) => void;
  removeEventListener: (name: string, handler: () => void) => void;
  load: () => void;
  play: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
};

const createMockVideoElement = (): MockVideoElement => {
  const listeners: Record<string, Array<() => void>> = {};
  return {
    src: "",
    currentSrc: "",
    preload: "",
    crossOrigin: "",
    loop: false,
    muted: false,
    autoplay: false,
    playsInline: undefined,
    listeners,
    setAttribute: vi.fn(),
    removeAttribute: vi.fn(),
    addEventListener(name, handler) {
      listeners[name] ??= [];
      listeners[name]!.push(handler);
    },
    removeEventListener(name, handler) {
      listeners[name] = (listeners[name] ?? []).filter((item) => item !== handler);
    },
    load() {
      this.currentSrc = this.src;
      for (const handler of listeners.loadeddata ?? []) {
        handler();
      }
    },
    play: vi.fn(async () => undefined),
    pause: vi.fn(),
  };
};

describe("loadPixiCompositeModel", () => {
  beforeEach(() => {
    fromMock.mockReset();
    gifFromBufferMock.mockReset();
    registerPluginMock.mockClear();
    MockTexture.from.mockClear();
    MockBaseTexture.from.mockClear();
    vi.restoreAllMocks();

    vi.stubGlobal(
      "document",
      {
        createElement: vi.fn((tag: string) => {
          if (tag !== "video") {
            throw new Error(`Unexpected tag: ${tag}`);
          }
          return createMockVideoElement() as unknown as HTMLVideoElement;
        }),
      } as Pick<Document, "createElement">,
    );
  });

  it("loads layered live2d, image, gif, and webm parts in one container", async () => {
    const setParamFloat = vi.fn();
    const motion = vi.fn();
    const expression = vi.fn();

    fromMock.mockImplementation(async (url: string) => ({
      url,
      visible: false,
      motion,
      expression,
      internalModel: {
        coreModel: {
          setParamFloat,
        },
      },
      destroy: vi.fn(),
    }));

    gifFromBufferMock.mockImplementation(async () =>
      Object.assign(new MockSprite({ kind: "gif" }), {
        play: vi.fn(),
        stop: vi.fn(),
      }),
    );

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => ({
        ok: true,
        status: 200,
        text: async () => "",
        json: async () => {
          if (url.endsWith("body/model.json")) {
            return {
              motions: {
                idle: [{ file: "idle.mtn" }],
                tap: [{ file: "tap.mtn" }],
              },
              expressions: [{ name: "smile" }],
            };
          }
          return {};
        },
        arrayBuffer: async () => new ArrayBuffer(8),
      })),
    );

    const configuredTypes: string[] = [];

    const result = await loadPixiCompositeModel({
      jsonlText: [
        '{"path":"./body/model.json","id":"body"}',
        '{"path":"./poster.png","type":"image","id":"poster"}',
        '{"path":"./shine.gif","type":"gif","id":"shine","autoplay":false}',
        '{"path":"./cut.webm","type":"video","id":"cut","muted":true,"loop":true}',
        '{"version":2,"motions":["idle"],"expressions":["smile"],"import":2}',
      ].join("\n"),
      source: "https://example.com/composite/model.jsonl",
      createContainer: () => new MockContainer() as never,
      resolveAssetUrl: async (part) => `https://example.com/composite/${part.path.replace(/^\.\//, "")}`,
      initialMotion: "idle",
      initialExpression: "smile",
      configureModel: async ({ partType, model }) => {
        configuredTypes.push(partType);
        model.visible = false;
      },
    });

    expect(result.nodes).toHaveLength(4);
    expect(result.models).toHaveLength(1);
    expect(result.container.children).toHaveLength(4);
    expect(result.nodes.map((node) => node.partType)).toEqual(["live2d", "image", "gif", "video"]);
    expect(configuredTypes).toEqual(["live2d", "image", "gif", "video"]);
    expect(result.nodes.every((node) => node.displayObject.visible)).toBe(true);
    expect(result.selectors).toEqual({
      motions: ["idle"],
      expressions: ["smile"],
    });
    expect(setParamFloat).toHaveBeenCalledTimes(1);
    expect(setParamFloat).toHaveBeenCalledWith("PARAM_IMPORT", 2);
    expect(motion).toHaveBeenCalledTimes(1);
    expect(expression).toHaveBeenCalledTimes(1);
    expect(MockTexture.from).toHaveBeenCalledWith("https://example.com/composite/poster.png");
    expect(MockBaseTexture.from).toHaveBeenCalledTimes(1);
    expect(gifFromBufferMock).toHaveBeenCalledTimes(1);

    result.applyImport(5);
    expect(setParamFloat).toHaveBeenLastCalledWith("PARAM_IMPORT", 5);

    const videoNode = result.nodes.find((node) => node.partType === "video");
    expect(videoNode).toBeDefined();
    const videoElement = (videoNode!.displayObject as { __compositeVideoElement?: MockVideoElement }).__compositeVideoElement;
    expect(videoElement?.play).toHaveBeenCalledTimes(1);

    result.destroy();
    expect((result.container as unknown as InstanceType<typeof MockContainer>).destroyed).toBe(true);
    expect(result.nodes).toHaveLength(0);
    expect(result.models).toHaveLength(0);
    expect(videoElement?.pause).toHaveBeenCalledTimes(1);
  });
});
