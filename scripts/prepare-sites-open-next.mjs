import { cp, mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const openNextDir = path.join(root, ".open-next");
const distDir = path.join(root, "dist");
const serverDir = path.join(distDir, "server");

await rm(distDir, { recursive: true, force: true });
await mkdir(serverDir, { recursive: true });
await cp(openNextDir, serverDir, { recursive: true });
await rename(path.join(serverDir, "worker.js"), path.join(serverDir, "open-next-worker.js"));

const workerWrapper = `export default {
  async fetch(request, env, ctx) {
    try {
      const worker = await import("./open-next-worker.js");
      return await worker.default.fetch(request, env, ctx);
    } catch (error) {
      console.error(error);
      const url = new URL(request.url);
      const message = error instanceof Error ? error.stack || error.message : String(error);
      if (url.searchParams.get("__debug") === "1") {
        return new Response(message, {
          status: 500,
          headers: { "content-type": "text/plain; charset=utf-8" },
        });
      }
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
  assets: { directory: "assets", binding: "ASSETS" },
  observability: { enabled: true },
};

await writeFile(
  path.join(serverDir, "wrangler.json"),
  `${JSON.stringify(wranglerConfig)}\n`,
  "utf8",
);
