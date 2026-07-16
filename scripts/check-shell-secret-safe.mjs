import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

const env = {
  ...process.env,
  QVERIS_SHELL_SENTINEL_API_KEY: `qveris-shell-sentinel-${randomUUID()}`,
};

const child = spawn("npm", ["run", "build:sites"], { env, stdio: "inherit" });
child.on("error", (error) => {
  console.error(error.message);
  process.exit(1);
});
child.on("exit", (code, signal) => {
  if (code === 0) {
    console.log("Shell-only sentinel secret check passed.");
  } else {
    process.exitCode = code ?? 1;
    if (signal) console.error(`build:sites exited with signal ${signal}`);
  }
});
