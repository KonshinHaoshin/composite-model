import { describe, expect, it } from "vitest";

import { optimizeCompositeModel } from "../src/core/optimize";
import { parseCompositeModel } from "../src/core/parse";
import { resolveCompositePath } from "../src/core/path";
import { extractCompositeSelectors } from "../src/core/selectors";
import { stringifyCompositeModel } from "../src/core/stringify";

const sampleJsonl = [
  '{"path":"./parts\\\\body/model.json","id":"body","x":10,"yscale":1.2,"unknown":"ignored"}',
  "",
  "not-json",
  '{"path":"game/figure/parts/face/model.json","folder":"face"}',
  '{"motions":["idle","idle","wink"],"expressions":["smile","smile"],"import":"3"}',
].join("\n");

describe("parseCompositeModel", () => {
  it("parses parts, summary, and diagnostics", () => {
    const manifest = parseCompositeModel({
      text: sampleJsonl,
      source: "https://example.com/models/composite/model.jsonl",
    });

    expect(manifest.parts).toHaveLength(2);
    expect(manifest.parts[0]).toMatchObject({
      path: "./parts/body/model.json",
      id: "body",
      x: 10,
      yscale: 1.2,
      lineNumber: 1,
    });
    expect(manifest.parts[1]).toMatchObject({
      path: "game/figure/parts/face/model.json",
      folder: "face",
      lineNumber: 4,
    });
    expect(manifest.summary).toMatchObject({
      motions: ["idle", "wink"],
      expressions: ["smile"],
      import: 3,
      lineNumber: 5,
    });
    expect(manifest.diagnostics.map((item) => item.code)).toEqual([
      "extra-fields",
      "invalid-json",
    ]);
  });
});

describe("optimizeCompositeModel", () => {
  it("normalizes paths, fills missing indexes, and emits stable text", () => {
    const optimized = optimizeCompositeModel(parseCompositeModel(sampleJsonl));

    expect(optimized.parts.map((part) => part.index)).toEqual([0, 1]);
    expect(optimized.parts[0]!.path).toBe("./parts/body/model.json");
    expect(optimized.summary).toMatchObject({
      motions: ["idle", "wink"],
      expressions: ["smile"],
      import: 3,
    });
    expect(optimized.text).toBe(
      [
        '{"path":"./parts/body/model.json","id":"body","index":0,"x":10,"yscale":1.2}',
        '{"path":"game/figure/parts/face/model.json","folder":"face","index":1}',
        '{"motions":["idle","wink"],"expressions":["smile"],"import":3}',
      ].join("\n"),
    );

    const reparsed = parseCompositeModel(optimized.text);
    expect(stringifyCompositeModel(reparsed)).toBe(optimized.text);
  });
});

describe("extractCompositeSelectors", () => {
  it("uses summary values when present and falls back to first model json when absent", () => {
    const fromSummary = extractCompositeSelectors(
      {
        summary: {
          motions: ["idle", "wink"],
          expressions: ["smile"],
        },
      },
      {
        motions: { tap: [{ file: "tap.mtn" }] },
        expressions: [{ name: "sad" }],
      },
    );

    expect(fromSummary).toEqual({
      motions: ["idle", "wink"],
      expressions: ["smile"],
    });

    const fallback = extractCompositeSelectors(
      { summary: {} },
      {
        motions: {
          idle: [{ file: "idle.mtn" }],
          tap: [{ file: "tap.mtn" }],
        },
        expressions: [{ name: "smile" }, { file: "angry.exp.json" }],
      },
    );

    expect(fallback).toEqual({
      motions: ["idle", "tap"],
      expressions: ["smile", "angry.exp.json"],
    });
  });
});

describe("resolveCompositePath", () => {
  it("resolves relative, url, game, and absolute paths", async () => {
    await expect(
      resolveCompositePath(
        "./parts/model.json",
        "https://example.com/assets/composite/model.jsonl",
      ),
    ).resolves.toBe("https://example.com/assets/composite/parts/model.json");

    await expect(
      resolveCompositePath(
        "parts/model.json",
        "C:/games/project/game/figure/group/model.jsonl",
      ),
    ).resolves.toBe("C:/games/project/game/figure/group/parts/model.json");

    await expect(
      resolveCompositePath(
        "https://cdn.example.com/live2d/model.json",
        "https://example.com/assets/composite/model.jsonl",
      ),
    ).resolves.toBe("https://cdn.example.com/live2d/model.json");

    await expect(
      resolveCompositePath("game/figure/a/model.json", "/game/figure/root/model.jsonl", ({ defaultPath }) => `/root/${defaultPath}`),
    ).resolves.toBe("/root/game/figure/a/model.json");
  });
});
