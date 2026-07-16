import { cp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const root = process.cwd();
const openNextDir = path.join(root, ".open-next");
const distDir = path.join(root, "dist");
const serverDir = path.join(distDir, "server");
const clientDir = path.join(distDir, "client");
const bundleDir = path.join(distDir, ".worker-bundle");
const execFileAsync = promisify(execFile);
const hostingConfigPath = path.join(root, ".openai", "hosting.json");

await rm(distDir, { recursive: true, force: true });
await mkdir(serverDir, { recursive: true });
await cp(openNextDir, serverDir, { recursive: true });
await mkdir(clientDir, { recursive: true });
await cp(path.join(serverDir, "assets"), clientDir, { recursive: true });
await rename(path.join(serverDir, "worker.js"), path.join(serverDir, "open-next-worker.js"));

const workerWrapper = `export default {
  async fetch(request, env, ctx) {
    try {
      const worker = await import("./open-next-worker.js");
      return await worker.default.fetch(request, env, ctx);
    } catch (error) {
      console.error(error);
      return new Response("Internal Server Error", {
        status: 500,
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }
  },
};
`;

await writeFile(path.join(serverDir, "index.js"), workerWrapper, "utf8");

const wranglerConfig = {
  main: "index.js",
  name: "qveris-earnings-copilot",
  compatibility_date: "2026-07-10",
  compatibility_flags: ["nodejs_compat", "global_fetch_strictly_public"],
  assets: { directory: "../client", binding: "ASSETS" },
  observability: { enabled: true },
};

await writeFile(
  path.join(serverDir, "wrangler.json"),
  `${JSON.stringify(wranglerConfig)}\n`,
  "utf8",
);

await rm(bundleDir, { recursive: true, force: true });
await execFileAsync(
  "npx",
  ["wrangler", "deploy", "--config", "wrangler.json", "--dry-run", "--outdir", bundleDir],
  { cwd: serverDir, maxBuffer: 1024 * 1024 * 20 },
);

await cp(path.join(bundleDir, "index.js"), path.join(serverDir, "index.js"));
await assertEmptyMiddlewareManifest(
  path.join(serverDir, "server-functions", "default", ".next", "server", "middleware-manifest.json"),
);
await patchMiddlewareManifestRequire(path.join(serverDir, "index.js"));
await rm(path.join(serverDir, "open-next-worker.js"), { force: true });
await rm(path.join(serverDir, ".build"), { recursive: true, force: true });
await rm(path.join(serverDir, "cache"), { recursive: true, force: true });
await rm(path.join(serverDir, "cloudflare"), { recursive: true, force: true });
await rm(path.join(serverDir, "cloudflare-templates"), { recursive: true, force: true });
await rm(path.join(serverDir, "dynamodb-provider"), { recursive: true, force: true });
await rm(path.join(serverDir, "middleware"), { recursive: true, force: true });
await rm(path.join(serverDir, "server-functions"), { recursive: true, force: true });
await rm(bundleDir, { recursive: true, force: true });

const openaiDistDir = path.join(distDir, ".openai");
await mkdir(openaiDistDir, { recursive: true });
await cp(hostingConfigPath, path.join(openaiDistDir, "hosting.json"));
await cp(path.join(root, "drizzle"), path.join(openaiDistDir, "drizzle"), { recursive: true });
await assertSitesBundle();

async function assertEmptyMiddlewareManifest(file) {
  const manifest = JSON.parse(await readFile(file, "utf8"));
  if (
    !isEmptyObject(manifest.middleware) ||
    !isEmptyObject(manifest.functions) ||
    !Array.isArray(manifest.sortedMiddleware) ||
    manifest.sortedMiddleware.length !== 0
  ) {
    throw new Error("OpenNext middleware manifest is not empty; refusing to disable middleware");
  }
}

async function patchMiddlewareManifestRequire(file) {
  const source = await readFile(file, "utf8");
  const patched = source.replace(
    /getMiddlewareManifest\(\)\s*\{\s*return this\.minimalMode\s*\?\s*null\s*:\s*__require\(this\.middlewareManifestPath\);?\s*\}/,
    "getMiddlewareManifest(){return null}",
  );
  if (patched === source) {
    throw new Error("OpenNext bundle is missing the expected getMiddlewareManifest() shape");
  }
  await writeFile(file, patched, "utf8");
}

function isEmptyObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0;
}

async function assertSitesBundle() {
  const index = await readFile(path.join(serverDir, "index.js"), "utf8");
  if (!/getMiddlewareManifest\(\)\s*\{\s*return null;?\s*\}/.test(index)) {
    throw new Error("dist/server/index.js must patch getMiddlewareManifest() to return null");
  }
  if (/getMiddlewareManifest\(\)\s*\{\s*return this\.minimalMode/.test(index)) {
    throw new Error("dist/server/index.js still dynamically requires middleware-manifest.json");
  }

  const hosting = JSON.parse(await readFile(path.join(openaiDistDir, "hosting.json"), "utf8"));
  if (hosting.d1 !== "DB") {
    throw new Error("dist/.openai/hosting.json must declare D1 binding DB");
  }
}
