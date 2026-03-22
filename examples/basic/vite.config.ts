import path from "node:path";
import fs from "node:fs";

import { defineConfig } from "vite";

const examplesRoot = path.resolve(__dirname, "..");
const libDir = path.resolve(examplesRoot, "lib");
const modelsDir = path.resolve(examplesRoot, "models");

export default defineConfig({
  root: __dirname,
  publicDir: false,
  server: {
    open: true,
    port: 4173,
    fs: {
      allow: [path.resolve(__dirname, "../..")],
    },
  },
  plugins: [
    {
      name: "serve-example-assets",
      configureServer(server) {
        server.middlewares.use("/lib", (req, res, next) => {
          const requestPath = decodeURIComponent((req.url ?? "/").replace(/^\/+/, ""));
          const filePath = path.join(libDir, requestPath);
          if (!filePath.startsWith(libDir) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
            next();
            return;
          }
          res.setHeader("Content-Type", "application/javascript; charset=utf-8");
          fs.createReadStream(filePath).pipe(res);
        });

        server.middlewares.use("/models", (req, res, next) => {
          const requestPath = decodeURIComponent((req.url ?? "/").replace(/^\/+/, ""));
          const filePath = path.join(modelsDir, requestPath);
          if (!filePath.startsWith(modelsDir) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
            next();
            return;
          }

          const ext = path.extname(filePath).toLowerCase();
          const contentType =
            ext === ".jsonl"
              ? "application/x-ndjson; charset=utf-8"
              : ext === ".json"
                ? "application/json; charset=utf-8"
                : ext === ".moc"
                  ? "application/octet-stream"
                  : ext === ".mtn"
                    ? "application/octet-stream"
                    : ext === ".png"
                      ? "image/png"
                      : ext === ".jpg" || ext === ".jpeg"
                        ? "image/jpeg"
                        : "application/octet-stream";

          res.setHeader("Content-Type", contentType);
          fs.createReadStream(filePath).pipe(res);
        });
      },
    },
  ],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
