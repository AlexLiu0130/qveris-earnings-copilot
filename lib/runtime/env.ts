export function localEnv() {
  return process.env as Record<string, string>;
}
