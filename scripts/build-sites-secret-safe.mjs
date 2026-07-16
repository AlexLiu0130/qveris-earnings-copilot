import { spawn } from "node:child_process";
import { cp, lstat, mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const shadow = await mkdtemp(path.join(root, ".qveris-earnings-sites-"));
const app = path.join(shadow, "app");

const keep = [
  "app",
  "components",
  "db",
  "drizzle",
  "lib",
  "next.config.ts",
  "open-next.config.ts",
  "package-lock.json",
  "package.json",
  "postcss.config.mjs",
  "public",
  "tsconfig.json",
];

try {
  await mkdir(app, { recursive: true });
  for (const name of keep) {
    const source = path.join(root, name);
    if (await exists(source)) {
      await cp(source, path.join(app, name), { recursive: true });
    }
  }
  await symlink(path.join(root, "node_modules"), path.join(app, "node_modules"), "dir");
  await writeFile(path.join(app, "next.config.ts"), shadowNextConfig(app), "utf8");
  const cleanEnv = sanitizeEnv(process.env, await localEnvKeys());

  await run(
    path.join(root, "node_modules/.bin/opennextjs-cloudflare"),
    ["build", "--skipWranglerConfigCheck"],
    cleanEnv,
    app,
  );

  const shadowOpenNext = path.join(app, ".open-next");
  const rootOpenNext = path.join(root, ".open-next");
  await removeEnvFiles(shadowOpenNext);
  await rm(rootOpenNext, { recursive: true, force: true });
  await cp(shadowOpenNext, rootOpenNext, { recursive: true });
  await run("node", ["scripts/prepare-sites-open-next.mjs"], cleanEnv, root);
  await removeEnvFiles(rootOpenNext);
  await run("node", ["scripts/scan-dist-secrets.mjs"], process.env, root);
} finally {
  await rm(shadow, { recursive: true, force: true });
}

function run(command, args, env, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} failed with ${signal ?? code}`));
    });
  });
}

async function exists(file) {
  try {
    await lstat(file);
    return true;
  } catch {
    return false;
  }
}

async function localEnvKeys() {
  const names = new Set();
  for (const file of await envFiles()) {
    for (const line of (await readFile(file, "utf8")).split(/\r?\n/)) {
      const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/);
      if (match) names.add(match[1]);
    }
  }
  return names;
}

async function envFiles() {
  const files = [];
  for (const name of await readdir(root)) {
    if (!/^\.env(?:\.|$)/.test(name) || name.endsWith(".example")) continue;
    const file = path.join(root, name);
    if ((await lstat(file)).isFile()) files.push(file);
  }
  return files;
}

function sanitizeEnv(source, keys) {
  const env = { ...source, SKIP_WRANGLER_CONFIG_CHECK: "yes" };
  for (const key of Object.keys(env)) {
    if (keys.has(key) || isServerSecretName(key)) delete env[key];
  }
  return env;
}

function isServerSecretName(name) {
  return !name.startsWith("NEXT_PUBLIC_") && /(?:^|_)(?:API_KEY|TOKEN|SECRET|PASSWORD)(?:_|$)/i.test(name);
}

function shadowNextConfig(appRoot) {
  return `import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: ".next",
  turbopack: {
    root: ${JSON.stringify(appRoot)},
  },
  experimental: {
    turbopackFileSystemCacheForDev: false,
  },
};

export default nextConfig;
`;
}

async function removeEnvFiles(dir) {
  if (!(await exists(dir))) return;
  for (const name of await readdir(dir)) {
    const file = path.join(dir, name);
    const stat = await lstat(file);
    if (name.startsWith(".env")) {
      await rm(file, { recursive: true, force: true });
    } else if (stat.isDirectory()) {
      await removeEnvFiles(file);
    }
  }
}
