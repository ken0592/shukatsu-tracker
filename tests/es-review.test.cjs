"use strict";
const assert = require("node:assert/strict");
const { test } = require("node:test");
const ai = require("../ai.js");
process.env.CLOUDFLARE_ACCOUNT_ID = "test-account";
process.env.CLOUDFLARE_AI_TOKEN = "test-token";
const handler = require("../api/ai-cards.js");
const input = { question: "学生時代に力を入れたこと（400字以内）", answer: "研究で手順を見直し、作業時間を減らしました。", targetCharacters: 400 };
const review = { summary: "行動が伝わります。", strengths: ["行動が具体的です。"], improvements: ["工夫した背景を補ってください。"], revisedAnswer: "研究では、作業時間の短縮を目指して手順を見直しました。" };

test("字数はUnicode文字で数え、目安と下限・曖昧な指定を区別する", () => {
  assert.equal(ai.esCharacterLimit("４００文字版"), 400);
  assert.equal(ai.esCharacterLimit("1,000字"), 1000);
  assert.equal(ai.esCharacterLimit("面接用", "300〜400字以内"), 400);
  assert.equal(ai.esCharacterLimit("400字以上"), null);
  assert.equal(ai.esCharacterLimit("400字程度"), null);
  assert.equal(ai.esCharacterLimit("200字・400字"), null);
  assert.equal(ai.esCharacterLimit("200字", "400字以内"), 200);
  const checked = ai.checkEsDraft({ question: "経験", label: "3字", answer: "あ😀\n○○" });
  assert.equal(checked.count, 5);
  assert.equal(checked.issues.length, 2);
  assert.equal(ai.checkEsDraft().issues.length, 2);
});

test("添削入力は長文・不正型を拒否し、選択回答以外や秘密情報を送らない", () => {
  const prepared = ai.prepareEsReview({ ...input, answer: "研究を工夫しました。\nメール: test@example.com\nパスワード: DontSendThis123", companyMemo: "PRIVATE_OTHER_MEMO" });
  assert.ok(prepared.total > 0);
  const request = ai.buildEsReviewRequest(prepared.value);
  const body = JSON.stringify(request);
  assert.equal(body.includes("test@example.com"), false);
  assert.equal(body.includes("DontSendThis123"), false);
  assert.equal(body.includes("PRIVATE_OTHER_MEMO"), false);
  assert.deepEqual(ai.prepareEsReview(prepared.value).value, prepared.value);
  assert.equal(request.max_tokens, 3000);
  assert.equal(request.response_format.type, "json_schema");
  assert.throws(() => ai.prepareEsReview({ ...input, answer: "あ".repeat(2001) }), /2000/);
  assert.throws(() => ai.prepareEsReview({ ...input, question: [] }), /質問/);
  assert.throws(() => ai.prepareEsReview({ ...input, answer: "\0" }), /バイナリ/);
  assert.equal(ai.prepareEsReview({ ...input, targetCharacters: "400" }).value.targetCharacters, null);
});

test("プロバイダーの形式を読み取り、不完全な推敲案は切り詰めず拒否する", () => {
  for (const payload of [
    { result: { response: JSON.stringify(review) } },
    { result: { choices: [{ message: { content: `<think>internal</think>\n\`\`\`json\n${JSON.stringify(review)}\n\`\`\`` } }] } },
    { result: { response: review } }
  ]) assert.deepEqual(ai.parseProviderEsReview(payload), review);
  assert.equal(ai.parseProviderEsReview({ result: { response: "not json" } }), null);
  assert.equal(ai.sanitizeEsReview({ ...review, revisedAnswer: "あ".repeat(4001) }), null);
  assert.equal(ai.sanitizeEsReview({ ...review, strengths: {} }), null);
  assert.equal(ai.sanitizeEsReview({ ...review, revisedAnswer: "[氏名を非表示]です。" }).revisedAnswer, "[氏名を非表示]です。");
});

async function invoke(body, options = {}) {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).includes("/auth/v1/user")) return Response.json({ id: "test-user", email_confirmed_at: "2026-09-05" });
    if (String(url).includes("/rpc/consume_ai_quota")) return Response.json([{ is_allowed: options.allowed !== false, remaining: 28 }]);
    return Response.json({ result: { response: options.invalid ? "invalid" : JSON.stringify(review) } }, { status: options.providerStatus || 200 });
  };
  const response = { headers: {}, setHeader(name, value) { this.headers[name] = value; }, status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; return this; } };
  try {
    await handler({ method: "POST", headers: { "content-type": "application/json", authorization: options.anonymous ? "" : "Bearer test-token" }, body }, response);
    return { response, calls };
  } finally { global.fetch = originalFetch; }
}

test("ES添削APIは認証・共通回数制限・二重の伏せ字・不正応答を扱う", async () => {
  const success = await invoke({ task: "es-review", ...input, answer: `${input.answer}\nメール: private@example.com` });
  assert.equal(success.response.statusCode, 200);
  assert.deepEqual(success.response.body.review, review);
  assert.equal(success.response.body.remainingToday, 28);
  assert.equal(success.calls.length, 3);
  assert.equal(success.calls[2].init.body.includes("private@example.com"), false);
  assert.ok(success.response.body.serverRedactions > 0);
  const invalid = await invoke({ task: "es-review", ...input, answer: "あ".repeat(2001) });
  assert.equal(invalid.response.statusCode, 400);
  assert.equal(invalid.calls.length, 1);
  const anonymous = await invoke({ task: "es-review", ...input }, { anonymous: true });
  assert.equal(anonymous.response.statusCode, 401);
  assert.equal(anonymous.calls.length, 0);
  const limited = await invoke({ task: "es-review", ...input }, { allowed: false });
  assert.equal(limited.response.statusCode, 429);
  assert.equal(limited.calls.length, 2);
  assert.ok(Number(limited.response.headers["Retry-After"]) > 0);
  assert.equal((await invoke({ task: "es-review", ...input }, { invalid: true })).response.statusCode, 422);
  assert.equal((await invoke({ task: "es-review", ...input }, { providerStatus: 429 })).response.statusCode, 429);
});

test("クライアントも送信前に検証・伏せ字処理を行い、ready=falseを尊重する", async () => {
  const originalFetch = global.fetch;
  const bodies = [];
  global.fetch = async (_url, init) => {
    if (init.method === "GET") return Response.json({ ready: false });
    bodies.push(JSON.parse(init.body));
    return Response.json({ review, remainingToday: 27 });
  };
  try {
    const result = await ai.reviewEs({ ...input, answer: `${input.answer}\n電話: 090-1234-5678`, memo: "other data" }, { accessToken: "test" });
    assert.deepEqual(result.review, review);
    assert.equal(JSON.stringify(bodies).includes("090-1234-5678"), false);
    assert.deepEqual(Object.keys(bodies[0]).sort(), ["answer", "question", "targetCharacters", "task"]);
    await assert.rejects(ai.reviewEs({ ...input, answer: "" }), /回答/);
    assert.equal(bodies.length, 1);
    assert.equal((await ai.testConnection()).ready, false);
  } finally { global.fetch = originalFetch; }
});
