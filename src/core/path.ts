import type { CompositePathResolver } from "./types";

const URL_SCHEME_RE = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//;
const WINDOWS_ABS_RE = /^[a-zA-Z]:[\\/]/;

const normalize = (value: string) => value.replace(/\\/g, "/");

const dirname = (value: string) => {
  const normalized = normalize(value);
  const lastSlash = normalized.lastIndexOf("/");
  if (lastSlash === -1) {
    return "";
  }
  return normalized.slice(0, lastSlash + 1);
};

const removeDotSegments = (value: string) => {
  const segments = normalize(value).split("/");
  const out: string[] = [];
  for (const segment of segments) {
    if (!segment || segment === ".") {
      continue;
    }
    if (segment === "..") {
      out.pop();
      continue;
    }
    out.push(segment);
  }
  return out.join("/");
};

const joinRelativePath = (base: string, partPath: string) => {
  const baseDir = dirname(base);
  const normalizedBaseDir = normalize(baseDir);
  const drivePrefix = WINDOWS_ABS_RE.test(normalizedBaseDir) ? normalizedBaseDir.slice(0, 2) : "";
  const trimmedBaseDir = drivePrefix ? normalizedBaseDir.slice(2) : normalizedBaseDir;
  const baseSegments = trimmedBaseDir.split("/").filter(Boolean);
  const partSegments = normalize(partPath).split("/").filter(Boolean);
  const combined = [...baseSegments];

  for (const segment of partSegments) {
    if (segment === ".") {
      continue;
    }
    if (segment === "..") {
      combined.pop();
      continue;
    }
    combined.push(segment);
  }

  const prefix = normalize(base).startsWith("/") ? "/" : drivePrefix ? `${drivePrefix}/` : "";
  return prefix + combined.join("/");
};

export async function resolveCompositePath(
  partPath: string,
  source?: string,
  resolver?: CompositePathResolver,
): Promise<string> {
  const normalizedPartPath = normalize(partPath.trim());
  const isGamePath = normalizedPartPath.startsWith("game/");

  let defaultPath = normalizedPartPath;
  if (isGamePath) {
    defaultPath = normalizedPartPath;
  } else if (URL_SCHEME_RE.test(normalizedPartPath)) {
    defaultPath = normalizedPartPath;
  } else if (source && URL_SCHEME_RE.test(source)) {
    defaultPath = new URL(normalizedPartPath.replace(/^\.\//, ""), source).toString();
  } else if (source && WINDOWS_ABS_RE.test(source)) {
    defaultPath = joinRelativePath(source, normalizedPartPath);
  } else if (source && normalize(source).startsWith("/")) {
    defaultPath = joinRelativePath(source, normalizedPartPath);
  } else if (source) {
    defaultPath = removeDotSegments(`${dirname(source)}${normalizedPartPath}`);
  }

  if (resolver) {
    const resolved = await resolver({
      partPath,
      normalizedPartPath,
      ...(source ? { source } : {}),
      defaultPath,
      isGamePath,
    });
    if (typeof resolved === "string" && resolved.trim()) {
      return normalize(resolved.trim());
    }
  }

  return normalize(defaultPath);
}
