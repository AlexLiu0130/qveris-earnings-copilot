import { lstat, readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const scanTargets = ["dist", ".open-next"].map((name) => path.join(root, name));
const sensitiveName = /(api|auth|cookie|credential|database|db|dsn|key|pass|password|private|secret|session|token)/i;
const serverSecretName = /(?:^|_)(?:API_KEY|TOKEN|SECRET|PASSWORD)(?:_|$)/i;
const secrets = await secretsToScan();
const hits = [];

for (const target of scanTargets) {
  for await (const file of files(target)) {
    const body = await readFile(file);
    for (const [name, value] of secrets) {
      if (body.includes(Buffer.from(value))) {
        hits.push([name, path.relative(root, file)]);
      }
    }
  }
}

if (hits.length) {
  for (const [name, file] of hits) {
    console.error(`Secret literal found: ${name} in ${file}`);
  }
  process.exit(1);
}

console.log(`Secret scan passed for ${secrets.size} sensitive env value(s) in dist and .open-next.`);

async function secretsToScan() {
  return new Map([...(await localSecrets()), ...processSecrets()]);
}

async function localSecrets() {
  const found = new Map();
  for (const file of await envFiles()) {
    for (const [name, value] of parseEnv(await readFile(file, "utf8"))) {
      if (sensitiveName.test(name) && value.length >= 8) found.set(name, value);
    }
  }
  return found;
}

function processSecrets() {
  const found = new Map();
  for (const [name, value] of Object.entries(process.env)) {
    if (isServerSecretName(name) && value && value.length >= 8) found.set(name, value);
  }
  return found;
}

function isServerSecretName(name) {
  return !name.startsWith("NEXT_PUBLIC_") && serverSecretName.test(name);
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

function parseEnv(text) {
  const entries = [];
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)?\s*$/);
    if (!match) continue;
    const value = cleanValue(match[2] ?? "");
    if (value) entries.push([match[1], value]);
  }
  return entries;
}

function cleanValue(raw) {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const quote = trimmed[0];
  if ((quote === "\"" || quote === "'") && trimmed.endsWith(quote)) {
    return trimmed.slice(1, -1);
  }
  return trimmed.replace(/\s+#.*$/, "");
}

async function* files(dir) {
  try {
    await lstat(dir);
  } catch {
    return;
  }
  for (const name of await readdir(dir)) {
    const file = path.join(dir, name);
    const stat = await lstat(file);
    if (stat.isDirectory()) yield* files(file);
    else if (stat.isFile()) yield file;
  }
}
