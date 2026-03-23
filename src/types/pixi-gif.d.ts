declare module "@pixi/gif" {
  export const AnimatedGIF: {
    fromBuffer?: (buffer: ArrayBuffer) => Promise<unknown> | unknown;
  };

  export const AnimatedGIFLoader: unknown;
}
