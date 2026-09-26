"use strict";
const assert = require("node:assert/strict");
const { test } = require("node:test");
const ai = require("../ai.js");
const handlerPath = require.resolve("../api/ai-cards.js");
const legacyModel = "@cf/qwen/qwen3-30b-a3b-fp8";
const tasks = [
  ["cards", { memo: "株式会社サンプルテック。本選考のES締切は2026年10月25日。" }, ai.buildRequest("株式会社サンプルテック。本選考のES締切は2026年10月25日。")],
  ["faq", { question: "面接が不安です。" }, ai.buildFaqRequest("面接が不安です。")],
  ["es-review", { question: "志望動機を教えてください。", answer: "技術で顧客の課題を解決したいからです。" }, ai.buildEsReviewRequest({ question: "志望動機を教えてください。", answer: "技術で顧客の課題を解決したいからです。" })]
];

test("新Qwenの3用途でJSON形式・出力上限・推論無効化を適用し、元の要求は変えない", () => {
  for (const [task, , original] of tasks) {
    const before = JSON.stringify(original);
    const sent = ai.buildCloudflareRequest(original);
    assert.equal(sent.stream, false, task);
    assert.equal(sent.max_completion_tokens, original.max_tokens, task);
    assert.equal("max_tokens" in sent, false, task);
    assert.equal(sent.reasoning_effort, "low", task);
    assert.deepEqual(sent.chat_template_kwargs, { enable_thinking: false }, task);
    assert.equal(sent.response_format.json_schema.name, "shukatsu_response", task);
    assert.equal(sent.response_format.json_schema.strict, true, task);
    assert.deepEqual(sent.response_format.json_schema.schema, original.response_format.json_schema, task);
    assert.equal(sent.messages.at(-1).content.endsWith("\n/no_think"), false, task);
    assert.equal(sent.messages[0].content, original.messages[0].content, task);
    assert.equal(JSON.stringify(original), before, task);
    assert.equal(ai.buildCloudflareRequest(original, legacyModel), original, task);
  }
});

test("新モデルのchoices応答から推論を混ぜずに3用途を読み取れる", () => {
  const wrap = (value) => ({ result: { choices: [{ message: { reasoning_content: "内部推論", content: JSON.stringify(value) } }] } });
  assert.equal(ai.parseProviderFaq(wrap({ answer: "自己紹介から練習しよう。" })), "自己紹介から練習しよう。");
  assert.equal(ai.parseProviderCards(wrap({ cards: [{ companyName: "サンプルテック", trackType: "本選考", status: "気になる" }] }))[0].companyName, "サンプルテック");
  assert.equal(ai.parseProviderEsReview(wrap({ summary: "結論が明確です。", strengths: ["結論がある"], improvements: ["具体例を追加する"], revisedAnswer: "技術で顧客の課題を解決したいと考えています。" })).summary, "結論が明確です。");
});

test("APIの公開モデル設定と3用途の送信先が一致し、環境の旧モデル指定も維持する", async () => {
  const originalFetch = global.fetch;
  const savedEnv = Object.fromEntries(["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_AI_TOKEN", "CLOUDFLARE_AI_MODEL"].map((key) => [key, process.env[key]]));
  const response = () => ({ setHeader() {}, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });
  try {
    process.env.CLOUDFLARE_ACCOUNT_ID = "test-account";
    process.env.CLOUDFLARE_AI_TOKEN = "test-token";
    for (const model of [ai.defaultCloudflareModel, legacyModel]) {
      if (model === ai.defaultCloudflareModel) delete process.env.CLOUDFLARE_AI_MODEL;
      else process.env.CLOUDFLARE_AI_MODEL = model;
      delete require.cache[handlerPath];
      const handler = require(handlerPath);
      const health = response();
      await handler({ method: "GET" }, health);
      assert.equal(health.body.model, model);
      assert.equal(health.body.ready, true);
      for (const [task, body] of tasks) {
        let providerCall;
        global.fetch = async (url, options) => {
          if (String(url).includes("/auth/v1/user")) return Response.json({ id: "user-1", email_confirmed_at: "2026-09-26" });
          if (String(url).includes("/rpc/consume_ai_quota")) return Response.json([{ is_allowed: true, remaining: 29 }]);
          providerCall = { url: String(url), body: JSON.parse(options.body) };
          return Response.json({ result: { response: "invalid" } });
        };
        await handler({ method: "POST", headers: { "content-type": "application/json", authorization: "Bearer test-user" }, body: { task, ...body } }, response());
        assert.equal(providerCall.url, `https://api.cloudflare.com/client/v4/accounts/test-account/ai/run/${model}`, task);
        if (model === ai.defaultCloudflareModel) assert.equal(providerCall.body.response_format.json_schema.schema.type, "object", task);
        else assert.equal(providerCall.body.response_format.json_schema.type, "object", task);
      }
    }
  } finally {
    global.fetch = originalFetch;
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    delete require.cache[handlerPath];
  }
});
