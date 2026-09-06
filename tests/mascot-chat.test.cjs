const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ai = require("../ai.js");

test("会話は直近4メッセージに制限し、本文の長さと個人情報を保護する", () => {
  const history = Array.from({ length: 12 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: `${i}: ${"あ".repeat(900)}\nメール: private@example.com` }));
  const result = ai.sanitizeChatHistory(history);
  assert.equal(result.length, 4);
  assert.match(result[0].content, /^8:/);
  for (const item of result) assert.ok(Array.from(item.content).length <= (item.role === "user" ? 500 : 700));
  assert.equal(JSON.stringify(result).includes("private@example.com"), false);
  assert.deepEqual(ai.sanitizeChatHistory([{ role: "system", content: "秘密の指示" }, null, { role: "user", content: {} }]), []);
  assert.deepEqual(ai.sanitizeChatHistory("invalid"), []);
});

test("AIへの送信は認証を維持し、会話履歴にも伏せ字を適用する", async () => {
  const original = global.fetch;
  let sent;
  global.fetch = async (url, options) => { sent = options; return Response.json({ answer: "一緒に準備しよう。", remainingToday: 28 }); };
  try {
    const result = await ai.askFaq("その続きは？", { accessToken: "test-token", history: [{ role: "user", content: "メール: sample@example.com\n面接が不安です" }] });
    assert.equal(sent.headers.Authorization, "Bearer test-token");
    assert.equal(sent.body.includes("sample@example.com"), false);
    assert.equal(JSON.parse(sent.body).history.length, 1);
    assert.equal(result.remainingToday, 28);
  } finally { global.fetch = original; }
});

function harness() {
  const source = fs.readFileSync(require.resolve("../app.js"), "utf8");
  const names = ["handleMascotHelpSubmit", "closeMascotHelp", "resetMascotChat", "clearFaqUserScopedUiState"];
  const bodies = names.map((name) => {
    const start = source.search(new RegExp(`(?:async )?function ${name}\\(`));
    const tail = source.slice(start);
    const end = tail.slice(1).search(/\n(?:async )?function /);
    return end < 0 ? tail : tail.slice(0, end + 1);
  }).join("\n");
  const messages = [], calls = [];
  const input = { value: "", setCustomValidity() {}, focus() {}, reportValidity() {} };
  const state = { faqPending: false, faqHistory: [], faqRequestId: 0, mode: "cloud", session: { access_token: "token" } };
  const context = { state,
    els: { mascotHelpInput: input, mascotHelpLog: { scrollHeight: 0 }, mascotHelpPanel: { hidden: false }, mascot: { setAttribute() {}, focus() {} } },
    localAi: { ...ai, findLocalFaqAnswer: () => { throw new Error("定型FAQを返してはいけない"); },
      askFaq: async (question, options) => { calls.push({ question, options }); return { answer: "回答を一緒に考えよう。", remainingToday: 29 }; } },
    countAiCharacters: (value) => Array.from(value).length,
    appendHelpMessage: (text, role) => { const message = { textContent: text, role, classList: { remove() {}, add() {} } }; messages.push(message); return message; },
    setFaqPending: (value) => { state.faqPending = value; }
  };
  vm.createContext(context); vm.runInContext(bodies, context);
  const submit = (question) => { input.value = question; return context.handleMascotHelpSubmit({ preventDefault() {} }); };
  return { context, state, input, messages, calls, submit };
}

test("FAQに一致する質問も毎回AIへ送り、続きの質問に会話を引き継ぐ", async () => {
  const h = harness();
  await h.submit("ESの型はどう使う？");
  await h.submit("その続きも教えて");
  assert.equal(h.calls.length, 2);
  assert.equal(h.calls[0].options.history.length, 0);
  assert.equal(h.calls[1].options.history[0].content, "ESの型はどう使う？");
  assert.equal(h.calls[1].options.history[1].role, "assistant");
  assert.equal(h.state.faqHistory.length, 4);
  assert.equal(h.state.faqPending, false);
});

test("回答待ちで閉じても重複送信せず、再度開くまで回答を保持する", async () => {
  const h = harness();
  let resolve, count = 0;
  h.context.localAi.askFaq = () => { count++; return new Promise((done) => { resolve = done; }); };
  const pending = h.submit("面接が不安です");
  h.context.closeMascotHelp();
  await h.submit("もう一度");
  assert.equal(count, 1);
  assert.equal(h.state.faqPending, true);
  resolve({ answer: "自己紹介から練習してみよう。" }); await pending;
  assert.equal(h.state.faqHistory[1].content, "自己紹介から練習してみよう。");
  assert.equal(h.state.faqPending, false);
});

test("ログアウト後の遅い回答は破棄し、会話リセットで履歴を消す", async () => {
  const h = harness();
  await h.submit("ESの型は？");
  h.context.resetMascotChat();
  assert.equal(h.state.faqHistory.length, 0);
  let resolve;
  h.context.localAi.askFaq = () => new Promise((done) => { resolve = done; });
  const pending = h.submit("面接の相談です");
  h.context.clearFaqUserScopedUiState();
  resolve({ answer: "前の利用者への回答" }); await pending;
  assert.equal(h.state.faqHistory.length, 0);
  assert.equal(h.context.els.mascotHelpPanel.hidden, true);
  assert.equal(h.messages.some((m) => m.textContent.includes("前の利用者への回答")), false);
});

test("未ログインでは送信せず、通信失敗時は質問を残して再試行できる", async () => {
  const h = harness();
  h.state.session = null;
  await h.submit("使い方を教えて");
  assert.equal(h.calls.length, 0);
  assert.equal(h.input.value, "使い方を教えて");
  h.state.session = { access_token: "token" };
  h.context.localAi.askFaq = async () => { throw new Error("通信エラー"); };
  await h.submit("面接の準備は？");
  assert.equal(h.input.value, "面接の準備は？");
  assert.equal(h.state.faqHistory.length, 0);
  assert.equal(h.state.faqPending, false);
  assert.match(h.messages.at(-1).textContent, /通信エラー/);
});
