import { cp, mkdir, rename, rm, writeFile } from "node:fs/promises";
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
await rm(path.join(serverDir, "open-next-worker.js"), { force: true });
await rm(path.join(serverDir, ".build"), { recursive: true, force: true });
await rm(path.join(serverDir, "cache"), { recursive: true, force: true });
await rm(path.join(serverDir, "cloudflare"), { recursive: true, force: true });
await rm(path.join(serverDir, "cloudflare-templates"), { recursive: true, force: true });
await rm(path.join(serverDir, "dynamodb-provider"), { recursive: true, force: true });
await rm(path.join(serverDir, "middleware"), { recursive: true, force: true });
await rm(path.join(serverDir, "server-functions"), { recursive: true, force: true });
await rm(bundleDir, { recursive: true, force: true });
