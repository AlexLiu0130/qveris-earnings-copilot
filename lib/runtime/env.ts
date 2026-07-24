export function localEnv() {
  return process.env as Record<string, string>;
}

export function aiApiKey(env = localEnv()) {
  return env.DEEPSEEK_API_KEY || env.OPENAI_API_KEY;
}

export function aiRuntimeConfig(env = localEnv()) {
  if (env.DEEPSEEK_API_KEY) {
    return {
      apiKey: env.DEEPSEEK_API_KEY,
      baseUrl: aiBaseUrl(env.OPENAI_BASE_URL || "https://api.deepseek.com"),
      model: env.OPENAI_MODEL || "deepseek-chat",
      provider: "deepseek" as const,
    };
  }
  if (env.OPENAI_API_KEY) {
    return {
      apiKey: env.OPENAI_API_KEY,
      baseUrl: aiBaseUrl(env.OPENAI_BASE_URL || "https://api.openai.com/v1"),
      model: env.OPENAI_MODEL || "gpt-4.1-mini",
      provider: "openai-compatible" as const,
    };
  }
  return null;
}

function aiBaseUrl(value: string) {
  const baseUrl = value.replace(/\/+$/, "");
  return baseUrl === "https://aigateway.qveris.ai" ? `${baseUrl}/v1` : baseUrl;
}
