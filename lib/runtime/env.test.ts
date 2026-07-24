import assert from "node:assert/strict";
import test from "node:test";
import { aiRuntimeConfig } from "@/lib/runtime/env";

test("DeepSeek credentials resolve with the DeepSeek endpoint as one configuration", () => {
  const config = aiRuntimeConfig({ DEEPSEEK_API_KEY: "deepseek-test" });
  assert.deepEqual(config, {
    apiKey: "deepseek-test",
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-chat",
    provider: "deepseek",
  });
});

test("an OpenAI key without an explicit base URL is never sent to DeepSeek", () => {
  const config = aiRuntimeConfig({ OPENAI_API_KEY: "openai-test" });
  assert.equal(config?.baseUrl, "https://api.openai.com/v1");
  assert.equal(config?.provider, "openai-compatible");
});

test("QVeris AI gateway resolves to its OpenAI-compatible v1 endpoint", () => {
  const config = aiRuntimeConfig({
    OPENAI_API_KEY: "qveris-test",
    OPENAI_BASE_URL: "https://aigateway.qveris.ai/",
    OPENAI_MODEL: "deepseek-v4-pro",
  });
  assert.equal(config?.baseUrl, "https://aigateway.qveris.ai/v1");
  assert.equal(config?.model, "deepseek-v4-pro");
});
