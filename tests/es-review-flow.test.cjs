"use strict";
const assert = require("node:assert/strict");
const { test } = require("node:test");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const ai = require("../ai.js");
const source = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8");
const start = source.indexOf("function esDraftCountText(");
const end = source.indexOf("function updateDetailEsCharCounts(", start);
assert.ok(start >= 0 && end > start);

function harness() {
  const nodes = new Map();
  const node = (selector) => {
    if (!nodes.has(selector)) nodes.set(selector, { textContent: "", hidden: true, open: true, close() { this.open = false; }, scrollIntoView() {} });
    return nodes.get(selector);
  };
  const original = { id: "question-1", question: "経験", variants: [{ id: "answer-1", label: "400字", answer: "元の経験" }], activeVariantId: "answer-1" };
  const draft = { card: { isConnected: true }, entryId: "entry-1", variantId: "answer-1", question: "経験", label: "400字", answer: "元の経験", userId: "user-1", input: { question: "経験", answer: "元の経験" }, review: { revisedAnswer: "添削した経験" } };
  const state = { esReviewDraft: draft, detailEditingId: "entry-1", session: { user: { id: "user-1" }, access_token: "test" } };
  const replacements = [];
  const localAi = { ...ai };
  const context = vm.createContext({ state, localAi, document: { querySelector: node }, AbortController,
    els: { detailEsList: { querySelector: () => null } }, cssEscape: (value) => value,
    collectEsItemFromCard: () => structuredClone(original),
    createEsVariant: (label, answer) => ({ id: "new-answer", label, answer }),
    replaceEsCard: (_card, item) => replacements.push(item), showToast() {},
    escapeHtml: (text) => String(text).replace(/</g, "&lt;"), formatCharCount: (text) => `${ai.countCharacters(text)}文字`
  });
  vm.runInContext(source.slice(start, end), context);
  return { context, state, draft, original, replacements, localAi, node };
}

test("添削案は元回答を残して別回答へ追加し、二度取り込めない", () => {
  const h = harness();
  h.context.applyEsReview();
  h.context.applyEsReview();
  assert.equal(h.replacements.length, 1);
  assert.deepEqual(h.replacements[0].variants[0], h.original.variants[0]);
  assert.equal(h.replacements[0].variants[1].answer, "添削した経験");
  assert.equal(h.replacements[0].activeVariantId, "new-answer");
  assert.equal(h.state.esReviewDraft, null);
});

test("別企業・別利用者・変更済み回答・回答上限では取り込まない", () => {
  for (const change of [
    (h) => { h.state.detailEditingId = "entry-2"; },
    (h) => { h.state.session.user.id = "user-2"; },
    (h) => { h.original.variants[0].answer = "書き直した経験"; },
    (h) => { h.original.variants = Array.from({ length: 20 }, (_, index) => ({ ...h.original.variants[0], id: `answer-${index + 1}` })); }
  ]) {
    const h = harness(); change(h); h.context.applyEsReview(); assert.equal(h.replacements.length, 0);
  }
});

test("連打で重複送信せず、閉じた画面の遅い応答を表示しない", async () => {
  const h = harness();
  let finish;
  let calls = 0;
  let signal;
  h.draft.review = null;
  h.localAi.reviewEs = (_input, options) => { calls++; signal = options.signal; return new Promise((resolve) => { finish = resolve; }); };
  const pending = h.context.generateEsReview();
  await h.context.generateEsReview();
  assert.equal(calls, 1);
  h.context.closeEsReview();
  assert.equal(signal.aborted, true);
  finish({ review: { summary: "古い結果" }, remainingToday: 29 });
  await pending;
  assert.equal(h.node("#esReviewSummary").textContent, "");
  assert.equal(h.state.esReviewDraft, null);
});

test("通信失敗後は再試行でき、回答を書き換えない", async () => {
  const h = harness();
  h.draft.review = null;
  h.localAi.reviewEs = async () => { throw new Error("通信失敗"); };
  await h.context.generateEsReview();
  assert.equal(h.node("#generateEsReviewButton").disabled, false);
  assert.equal(h.node("#esReviewStatus").textContent, "通信失敗");
  assert.equal(h.replacements.length, 0);
});

test("成功した結果は文字として表示し、追加操作まで元の回答を変更しない", async () => {
  const h = harness();
  h.draft.review = null;
  h.localAi.reviewEs = async () => ({ review: { summary: "確認結果", strengths: ["<script>unsafe</script>"], improvements: [], revisedAnswer: "添削した経験" }, remainingToday: 28 });
  await h.context.generateEsReview();
  assert.equal(h.node("#esReviewResult").hidden, false);
  assert.equal(h.node("#esReviewRevised").textContent, "添削した経験");
  assert.match(h.node("#esReviewStrengths").innerHTML, /&lt;script>/);
  assert.equal(h.node("#generateEsReviewButton").disabled, true);
  assert.equal(h.replacements.length, 0);
});
