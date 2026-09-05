"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ai = require("../ai.js");
const localCsv = require("../csv-import.js");

const appSource = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const earlyCsvHelpersStart = appSource.indexOf("function csvImportCardsWithConflicts(");
const earlyCsvHelpersEnd = appSource.indexOf("async function handleAiMemoFile(", earlyCsvHelpersStart);
const conflictHelpersStart = appSource.indexOf("function importConflictValueKey(");
const conflictHelpersEnd = appSource.indexOf("function buildAiImportPlan(", conflictHelpersStart);
const generateStart = appSource.indexOf("async function handleAiGenerate(");
const generateEnd = appSource.indexOf("function updateAiGenerateButton()", generateStart);
assert.ok(earlyCsvHelpersStart >= 0 && earlyCsvHelpersEnd > earlyCsvHelpersStart, "CSV helper block must remain extractable");
assert.ok(conflictHelpersStart >= 0 && conflictHelpersEnd > conflictHelpersStart, "conflict helper block must remain extractable");
assert.ok(generateStart >= 0 && generateEnd > generateStart, "generate handler must remain extractable");

function createHarness(inputValue, options = {}) {
  const generatePayloads = [];
  const errors = [];
  const notices = [];
  const state = {
    aiGeneratePending: false,
    aiFileReadPending: false,
    aiGenerateRequestId: 0,
    aiCards: [],
    aiCsvCards: [],
    aiCsvFileCount: 0,
    aiLoadedText: "",
    aiImportWarnings: [],
    session: options.loggedIn === false ? null : { access_token: "TEST_ACCESS_TOKEN" }
  };
  const els = {
    aiMemoInput: {
      value: inputValue,
      focus() {}
    }
  };
  const localAi = {
    ...ai,
    async generateCards(payload) {
      generatePayloads.push(payload);
      return [{ companyName: "TXT社", trackType: "本選考", memo: "AI整理済み" }];
    }
  };

  const context = vm.createContext({
    localAi,
    localCsv,
    state,
    els,
    aiImportIdentityKey: (card) => localCsv.cardIdentityKey(card),
    consolidateAiImportCards: (cards) => cards,
    setAiImportError: (message) => errors.push(message),
    setAiImportNotice: (message) => notices.push(message),
    updateAiPrivacyPreview() {},
    updateAiGenerateButton() {},
    renderAiCards() {},
    setAiConnectionStatus() {},
    countAiCharacters: (value) => Array.from(String(value || "")).length,
    countAiCandidateSections: () => 1,
    showToast() {},
    Map,
    Set,
    Array,
    String,
    console
  });
  vm.runInContext(
    `${appSource.slice(conflictHelpersStart, conflictHelpersEnd)}\n`
      + `${appSource.slice(earlyCsvHelpersStart, earlyCsvHelpersEnd)}\n${appSource.slice(generateStart, generateEnd)}\n`
      + "globalThis.runGenerate = handleAiGenerate; globalThis.preserveManualMemoTextForTest = preserveManualMemoText; globalThis.mergeLocalMemoIdsForTest = mergeLocalMemoIdsIntoCards;",
    context
  );
  return { context, state, els, generatePayloads, errors, notices };
}

async function test(name, run) {
  await run();
  console.log(`ok - ${name}`);
}

(async () => {
  await test("pasted CSV stays local and never calls AI", async () => {
    const harness = createHarness([
      "企業名,選考区分,締切,マイページID,ロゴURL,パスワード,メモ",
      "A社,本選考,2026-08-01,USER-1,https://tracker.example.com/pixel.png,SECRET-123,パスワードは MEMO-SECRET-456"
    ].join("\n"), { loggedIn: false });

    await harness.context.runGenerate({ preventDefault() {} });

    assert.equal(harness.generatePayloads.length, 0);
    assert.equal(harness.state.aiCsvCards.length, 1);
    assert.equal(harness.state.aiCards.length, 1);
    assert.equal(harness.state.aiCsvCards[0].companyName, "A社");
    assert.equal(harness.state.aiCsvCards[0].logoUrl, "");
    assert.equal(Object.hasOwn(harness.state.aiCsvCards[0], "password"), false);
    assert.equal(JSON.stringify(harness.state.aiCsvCards).includes("SECRET-123"), false);
    assert.equal(JSON.stringify(harness.state.aiCsvCards).includes("MEMO-SECRET-456"), false);
    assert.equal(JSON.stringify(harness.state.aiCsvCards).includes("tracker.example.com"), false);
    assert.equal(harness.els.aiMemoInput.value, "");
    assert.match(harness.notices.at(-1), /AIへ送信しません/u);
    assert.ok(harness.notices.some((notice) => /企業アイコン画像URL/u.test(notice)));
    assert.ok(harness.notices.some((notice) => /伏せ字/u.test(notice)));
    assert.deepEqual(harness.errors.filter(Boolean), []);
  });

  await test("sensitive delimited text without a company header is blocked, not sent", async () => {
    const harness = createHarness("ID,Password\nUSER-1,SECRET-123");

    await harness.context.runGenerate({ preventDefault() {} });

    assert.equal(harness.generatePayloads.length, 0);
    assert.match(harness.errors.at(-1), /CSVとして検出/u);
    assert.equal(harness.els.aiMemoInput.value.includes("SECRET-123"), true);
  });

  await test("unknown-header delimited text fails closed instead of reaching AI", async () => {
    const harness = createHarness("name,account\nAcme,SECRET-123");

    await harness.context.runGenerate({ preventDefault() {} });

    assert.equal(harness.generatePayloads.length, 0);
    assert.match(harness.errors.at(-1), /CSVとして検出/u);
    assert.equal(harness.els.aiMemoInput.value, "name,account\nAcme,SECRET-123");
  });

  await test("ragged unknown-header CSV fails closed instead of reaching AI", async () => {
    const harness = createHarness("name,account,notes\nAcme,SECRET-123");

    await harness.context.runGenerate({ preventDefault() {} });

    assert.equal(harness.generatePayloads.length, 0);
    assert.match(harness.errors.at(-1), /CSVとして検出/u);
    assert.equal(harness.els.aiMemoInput.value.includes("SECRET-123"), true);
  });

  await test("a long quoted CSV cell fails closed instead of reaching AI", async () => {
    const source = [
      "name,notes",
      'Acme,"line1',
      ...Array.from({ length: 24 }, (_, index) => `line${index + 2}`),
      'line26 SECRET-123"'
    ].join("\n");
    const harness = createHarness(source);

    await harness.context.runGenerate({ preventDefault() {} });

    assert.equal(harness.generatePayloads.length, 0);
    assert.match(harness.errors.at(-1), /CSVとして検出/u);
    assert.equal(harness.els.aiMemoInput.value.includes("SECRET-123"), true);
  });

  await test("CSV after a long plain-text preamble still fails closed", async () => {
    const source = [
      ...Array.from({ length: 20 }, (_, index) => `preamble ${index + 1}`),
      "name,password",
      "Acme,TOPSECRET-123"
    ].join("\n");
    const harness = createHarness(source);

    await harness.context.runGenerate({ preventDefault() {} });

    assert.equal(harness.generatePayloads.length, 0);
    assert.match(harness.errors.at(-1), /CSVとして検出/u);
    assert.equal(harness.els.aiMemoInput.value.includes("TOPSECRET-123"), true);
  });

  await test("a pasted CSV with no importable rows stays editable", async () => {
    const source = "企業名,選考区分\nA社,判定できない区分";
    const harness = createHarness(source);

    await harness.context.runGenerate({ preventDefault() {} });

    assert.equal(harness.generatePayloads.length, 0);
    assert.match(harness.errors.at(-1), /企業名と選考区分/u);
    assert.equal(harness.els.aiMemoInput.value, source);
    assert.equal(harness.state.aiCsvCards.length, 0);
  });

  await test("ordinary TXT uses only the redacted payload", async () => {
    const harness = createHarness([
      "会社名：TXT社",
      "マイページID：PRIVATE-ID-999",
      "連絡先：test@example.com",
      "締切：2026-08-01"
    ].join("\n"));

    await harness.context.runGenerate({ preventDefault() {} });

    assert.equal(harness.generatePayloads.length, 1);
    assert.doesNotMatch(harness.generatePayloads[0], /PRIVATE-ID-999|test@example\.com/u);
    assert.equal(harness.state.aiCards[0].companyName, "TXT社");
    assert.equal(harness.state.aiCards[0].mypageId, "PRIVATE-ID-999");
    assert.match(harness.notices.at(-1), /端末内だけでカード案へ追加/u);
    assert.deepEqual(harness.errors.filter(Boolean), []);
  });

  await test("TXT IDs are not guessed onto a different company", async () => {
    const harness = createHarness([
      "会社名：別会社株式会社",
      "マイページID：DO-NOT-MISASSIGN",
      "締切：2026-08-01"
    ].join("\n"));

    await harness.context.runGenerate({ preventDefault() {} });

    assert.doesNotMatch(harness.generatePayloads[0], /DO-NOT-MISASSIGN/u);
    assert.equal(harness.state.aiCards[0].companyName, "TXT社");
    assert.equal(harness.state.aiCards[0].mypageId || "", "");
    assert.doesNotMatch(JSON.stringify(harness.state.aiCards), /DO-NOT-MISASSIGN/u);
    assert.match(harness.notices.at(-1), /自動追加しませんでした/u);
  });

  await test("local TXT IDs never overwrite CSV IDs or guess across multiple tracks", async () => {
    const harness = createHarness("");
    const conflict = harness.context.mergeLocalMemoIdsForTest([
      { companyName: "A社", trackType: "本選考", mypageId: "CSV-ID" }
    ], {
      records: [{ companyName: "A社", trackType: "", mypageId: "TXT-ID" }],
      unresolvedCount: 0
    });
    assert.equal(conflict.cards[0].mypageId, "CSV-ID");
    assert.equal(conflict.conflictCount, 1);
    assert.deepEqual(Array.from(conflict.cards[0]._importConflicts), ["mypageId"]);

    const ambiguous = harness.context.mergeLocalMemoIdsForTest([
      { companyName: "A社", trackType: "本選考", mypageId: "" },
      { companyName: "A社", trackType: "インターン", mypageId: "" }
    ], {
      records: [{ companyName: "A社", trackType: "", mypageId: "AMBIGUOUS-ID" }],
      unresolvedCount: 0
    });
    assert.equal(ambiguous.unresolvedCount, 1);
    assert.equal(ambiguous.cards.some((card) => card.mypageId), false);
  });

  await test("reselecting CSV removes old file TXT but keeps separately appended text", async () => {
    const harness = createHarness("");
    assert.equal(harness.context.preserveManualMemoTextForTest("読込TXT\n\n手入力メモ", "読込TXT"), "手入力メモ");
    assert.equal(harness.context.preserveManualMemoTextForTest("読込TXT\n手入力メモ", "読込TXT"), "手入力メモ");
    assert.equal(harness.context.preserveManualMemoTextForTest("読込TXT", "読込TXT"), "");
    assert.equal(harness.context.preserveManualMemoTextForTest("手入力だけ", ""), "手入力だけ");
    assert.equal(harness.context.preserveManualMemoTextForTest("読込TXT（修正済み）", "読込TXT"), "読込TXT（修正済み）");
    assert.equal(harness.context.preserveManualMemoTextForTest("完全に書き直したメモ", "読込TXT"), "完全に書き直したメモ");
  });

  console.log("11 import flow tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
