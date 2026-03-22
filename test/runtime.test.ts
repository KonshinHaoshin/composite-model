import { beforeEach, describe, expect, it, vi } from "vitest";

const { MockContainer, fromMock } = vi.hoisted(() => {
  class HoistedMockContainer {
    public children: unknown[] = [];

    public sortableChildren = false;

    public destroyed = false;

    addChild(child: unknown) {
      this.children.push(child);
      return child;
    }

    destroy() {
      this.destroyed = true;
    }
  }

  return {
    MockContainer: HoistedMockContainer,
    fromMock: vi.fn(),
  };
});

vi.mock("pixi.js", () => ({
  Container: MockContainer,
}));

vi.mock("pixi-live2d-display-webgal", () => ({
  Live2DModel: {
    from: fromMock,
  },
}));

import { loadPixiCompositeModel } from "../src/runtime/loadPixiCompositeModel";

describe("loadPixiCompositeModel", () => {
  beforeEach(() => {
    fromMock.mockReset();
    vi.restoreAllMocks();
  });

  it("loads models, applies summary state, and destroys resources", async () => {
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
      })),
    );

    const result = await loadPixiCompositeModel({
      jsonlText: [
        '{"path":"./body/model.json","id":"body"}',
        '{"path":"./face/model.json","id":"face"}',
        '{"motions":["idle"],"expressions":["smile"],"import":2}',
      ].join("\n"),
      source: "https://example.com/composite/model.jsonl",
      createContainer: () => new MockContainer() as never,
      resolveAssetUrl: async (part) => `https://example.com/composite/${part.path.replace(/^\.\//, "")}`,
      initialMotion: "idle",
      initialExpression: "smile",
      configureModel: async ({ model }) => {
        model.visible = false;
      },
    });

    expect(result.models).toHaveLength(2);
    expect(result.container.children).toHaveLength(2);
    expect(result.models.every((model) => model.visible)).toBe(true);
    expect(result.selectors).toEqual({
      motions: ["idle"],
      expressions: ["smile"],
    });
    expect(setParamFloat).toHaveBeenCalledTimes(2);
    expect(setParamFloat).toHaveBeenCalledWith("PARAM_IMPORT", 2);
    expect(motion).toHaveBeenCalledTimes(2);
    expect(expression).toHaveBeenCalledTimes(2);

    result.applyImport(5);
    expect(setParamFloat).toHaveBeenLastCalledWith("PARAM_IMPORT", 5);

    result.destroy();
    expect((result.container as unknown as InstanceType<typeof MockContainer>).destroyed).toBe(true);
  });
});
