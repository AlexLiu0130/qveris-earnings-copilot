import { cp, mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const openNextDir = path.join(root, ".open-next");
const distDir = path.join(root, "dist");
const serverDir = path.join(distDir, "server");

await rm(distDir, { recursive: true, force: true });
await mkdir(serverDir, { recursive: true });
await cp(openNextDir, serverDir, { recursive: true });
await rename(path.join(serverDir, "worker.js"), path.join(serverDir, "index.js"));

const wranglerConfig = {
  main: "index.js",
  name: "qveris-earnings-copilot",
  compatibility_date: "2026-07-10",
  compatibility_flags: ["nodejs_compat", "global_fetch_strictly_public"],
  assets: { directory: "assets", binding: "ASSETS" },
  observability: { enabled: true },
};

await writeFile(
  path.join(serverDir, "wrangler.json"),
  `${JSON.stringify(wranglerConfig)}\n`,
  "utf8",
);
