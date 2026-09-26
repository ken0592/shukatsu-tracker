"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const localCsv = require("../csv-import.js");
const localAi = require("../ai.js");

const appSource = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const start = appSource.indexOf("const importFieldLabels = {");
const end = appSource.indexOf("function renderAiCards()", start);
const backupMergeStart = appSource.indexOf("function mergeBackupEntries(");
const backupMergeEnd = appSource.indexOf("function normalizeImportedRecordId(", backupMergeStart);
assert.ok(start >= 0 && end > start, "import merge helpers must remain extractable for tests");
assert.ok(backupMergeStart >= 0 && backupMergeEnd > backupMergeStart, "backup merge helpers must remain extractable for tests");

let idCounter = 0;
function cloneEntryFieldValue(value) {
  return value && typeof value === "object" ? JSON.parse(JSON.stringify(value)) : value;
}

function normalizeEsItems(items, legacyContent = "") {
  if (Array.isArray(items) && items.length) {
    return items.map((item) => {
      const variants = Array.isArray(item.variants) && item.variants.length
        ? item.variants.map((variant) => ({
            id: variant.id || `variant-${++idCounter}`,
            label: String(variant.label || ""),
            answer: String(variant.answer || "")
          }))
        : [{ id: `variant-${++idCounter}`, label: "", answer: String(item.answer || "") }];
      return {
        id: item.id || `item-${++idCounter}`,
        question: String(item.question || ""),
        answer: variants[0].answer,
        variants,
        activeVariantId: item.activeVariantId || variants[0].id
      };
    });
  }
  const legacy = String(legacyContent || "").trim();
  return legacy ? normalizeEsItems([{ question: "", answer: legacy }]) : [];
}

function esItemsToLegacyText(items) {
  return normalizeEsItems(items).map((item) => [
    item.question ? `Q. ${item.question}` : "",
    ...item.variants.map((variant) => variant.answer)
  ].filter(Boolean).join("\n")).join("\n\n");
}

function normalizeEntry(entry = {}) {
  return {
    id: entry.id || `entry-${++idCounter}`,
    companyName: entry.companyName || "",
    industry: entry.industry || "",
    mypageId: entry.mypageId || "",
    officialUrl: entry.officialUrl || "",
    logoUrl: entry.logoUrl || "",
    trackType: entry.trackType || "本選考",
    status: entry.status || "気になる",
    deadline: entry.deadline || "",
    eventDate: entry.eventDate || "",
    eventType: entry.eventType == null ? "面接" : String(entry.eventType),
    priority: entry.priority || "未定",
    mypageUrl: entry.mypageUrl || "",
    esContent: entry.esContent || "",
    esItems: normalizeEsItems(entry.esItems, entry.esContent),
    interviewNotes: entry.interviewNotes || "",
    memo: entry.memo || "",
    createdAt: entry.createdAt || "2026-01-01T00:00:00.000Z",
    updatedAt: entry.updatedAt || "2026-01-01T00:00:00.000Z",
    sortOrder: Number.isFinite(entry.sortOrder) ? entry.sortOrder : Number.NaN,
    deletedAt: entry.deletedAt || ""
  };
}

function normalizeTemplate(template = {}) {
  return {
    id: template.id || `template-${++idCounter}`,
    kind: template.kind || "ガクチカ",
    title: template.title || "",
    body: template.body || "",
    createdAt: template.createdAt || "2026-01-01T00:00:00.000Z",
    updatedAt: template.updatedAt || "2026-01-01T00:00:00.000Z",
    sortOrder: Number.isFinite(template.sortOrder) ? template.sortOrder : Number.NaN
  };
}

const state = { entries: [], aiReviewedConflictKeys: new Set() };
function isTrashed(entry) {
  return Boolean(entry?.deletedAt);
}

const context = vm.createContext({
  localCsv,
  normalizeEntry,
  normalizeTemplate,
  normalizeEsItems,
  esItemsToLegacyText,
  cloneEntryFieldValue,
  state,
  isTrashed,
  console
});
vm.runInContext(
  `${appSource.slice(start, end)}\n${appSource.slice(backupMergeStart, backupMergeEnd)}`
    + "\nglobalThis.importHelpers = { consolidateAiImportCards, mergeImportedEntry, buildAiImportPlan, aiImportIdentityKey, aiConflictReviewKey, mergeBackupEntries, prepareBackupEntryRestore, prepareBackupTemplateRestore };",
  context
);
const helpers = context.importHelpers;

function test(name, run) {
  run();
  console.log(`ok - ${name}`);
}

test("existing scalar values stay while empty fields and unique notes are added", () => {
  const existing = normalizeEntry({
    id: "existing-1",
    companyName: "ＡＣＭＥ 株式会社",
    trackType: "インターン",
    industry: "IT",
    deadline: "2026-08-01",
    memo: "登録済みメモ",
    eventDate: "",
    eventType: "面接"
  });
  const incoming = {
    companyName: "acme株式会社",
    trackType: "インターン",
    industry: "金融",
    deadline: "2026-08-09",
    eventDate: "2026-08-20",
    eventType: "インターン",
    mypageId: "DEMO-ID",
    memo: "登録済みメモ\n新しいメモ"
  };
  const result = helpers.mergeImportedEntry(existing, incoming);
  assert.equal(result.entry.industry, "IT");
  assert.equal(result.entry.deadline, "2026-08-01");
  assert.equal(result.entry.eventDate, "2026-08-20");
  assert.equal(result.entry.eventType, "インターン");
  assert.equal(result.entry.mypageId, "DEMO-ID");
  assert.equal(result.entry.memo, "登録済みメモ\n新しいメモ");
  assert.deepEqual(Array.from(result.conflicts).sort(), ["deadline", "industry"].sort());
  assert.deepEqual(Array.from(result.conflictDetails, (detail) => detail.field).sort(), ["deadline", "industry"].sort());
  assert.equal(result.conflictDetails.find((detail) => detail.field === "deadline").incomingValue, "2026-08-09");
  assert.ok(result.hasChanges);
});

test("reimporting the same information is idempotent", () => {
  const existing = normalizeEntry({
    companyName: "A社",
    trackType: "本選考",
    mypageId: "DEMO-ID",
    memo: "同じメモ"
  });
  const result = helpers.mergeImportedEntry(existing, {
    companyName: "Ａ社",
    trackType: "本選考",
    mypageId: "DEMO-ID",
    memo: "同じメモ"
  });
  assert.equal(result.hasChanges, false);
  assert.deepEqual(Array.from(result.addedFields), []);
  assert.deepEqual(Array.from(result.conflicts), []);
});

test("ES questions and answer variants are appended once", () => {
  const existing = normalizeEntry({
    companyName: "A社",
    esItems: [{ question: "志望動機", variants: [{ label: "400字", answer: "既存回答" }] }]
  });
  const incoming = {
    companyName: "A社",
    trackType: "本選考",
    esItems: [
      { question: "志望動機", variants: [{ label: "400字", answer: "既存回答" }, { label: "200字", answer: "新回答" }] },
      { question: "強み", variants: [{ label: "", answer: "粘り強さ" }] }
    ]
  };
  const first = helpers.mergeImportedEntry(existing, incoming);
  assert.equal(first.entry.esItems.length, 2);
  assert.equal(first.entry.esItems[0].variants.length, 2);
  const second = helpers.mergeImportedEntry(first.entry, incoming);
  assert.equal(second.hasChanges, false);
  assert.equal(second.entry.esItems.length, 2);
  assert.equal(second.entry.esItems[0].variants.length, 2);
});

test("CSV and TXT candidates consolidate by normalized company and track", () => {
  const cards = helpers.consolidateAiImportCards([
    { companyName: " Ａ社 ", trackType: "インターン", deadline: "2026-08-01", memo: "CSV情報" },
    { companyName: "A社", trackType: "インターン", deadline: "2026-08-09", priority: "高", memo: "TXT情報" },
    { companyName: "A社", trackType: "本選考", deadline: "2026-09-01" }
  ]);
  assert.equal(cards.length, 2);
  assert.equal(cards[0].deadline, "2026-08-01");
  assert.equal(cards[0].priority, "高");
  assert.equal(cards[0].memo, "CSV情報\nTXT情報");
  assert.deepEqual(Array.from(cards[0]._importConflicts), ["deadline"]);
  assert.equal(cards[0]._importConflictDetails[0].field, "deadline");
  assert.equal(cards[0]._importConflictDetails[0].existingValue, "2026-08-01");
  assert.equal(cards[0]._importConflictDetails[0].incomingValue, "2026-08-09");
});

test("untrusted import image URLs and their conflicts are discarded", () => {
  const cards = helpers.consolidateAiImportCards([{
    companyName: "A社",
    trackType: "本選考",
    logoUrl: "https://tracker.example.com/pixel.png",
    _importConflicts: ["logoUrl"],
    _importConflictDetails: [{
      field: "logoUrl",
      existingValue: "https://tracker.example.com/a.png",
      incomingValue: "https://tracker.example.com/b.png"
    }]
  }]);
  assert.equal(cards[0].logoUrl, "");
  assert.deepEqual(Array.from(cards[0]._importConflicts), []);
  assert.deepEqual(Array.from(cards[0]._importConflictDetails), []);
});

test("backup cards merge by normalized company and track even when ids differ", () => {
  const current = normalizeEntry({
    id: "current-id",
    companyName: "Ａ社",
    trackType: "本選考",
    industry: "IT",
    memo: "既存メモ"
  });
  const imported = normalizeEntry({
    id: "other-device-id",
    companyName: "A社",
    trackType: "本選考",
    industry: "金融",
    mypageId: "NEW-ID",
    logoUrl: "https://tracker.example.com/pixel.png",
    memo: "新しいメモ"
  });
  const first = helpers.prepareBackupEntryRestore([current], [imported]);
  assert.equal(first.entries.length, 1);
  assert.equal(first.entries[0].id, "current-id");
  assert.equal(first.entries[0].industry, "IT");
  assert.equal(first.entries[0].mypageId, "NEW-ID");
  assert.equal(first.entries[0].memo, "既存メモ\n新しいメモ");
  assert.equal(first.entries[0].logoUrl, "");
  assert.equal(first.upserts.length, 1);

  const second = helpers.prepareBackupEntryRestore(first.entries, [imported]);
  assert.equal(second.entries.length, 1);
  assert.equal(second.upserts.length, 0);
});

test("backup merge keeps a valid 10,000-character memo and fills missing order", () => {
  const longMemo = "長".repeat(10_000);
  const result = helpers.prepareBackupEntryRestore([
    normalizeEntry({ id: "current-long", companyName: "長文社", trackType: "本選考" })
  ], [
    normalizeEntry({ id: "other-long", companyName: "長文社", trackType: "本選考", memo: longMemo, sortOrder: 7 })
  ]);
  assert.equal(result.entries.length, 1);
  assert.equal(result.entries[0].memo, longMemo);
  assert.equal(result.entries[0].sortOrder, 7);
  assert.equal(result.blockingIssues.length, 0);
  assert.equal(result.upserts.length, 1);
});

test("backup merge reports text that cannot fit without silently dropping it", () => {
  const result = helpers.prepareBackupEntryRestore([
    normalizeEntry({
      id: "current-overflow",
      companyName: "上限社",
      trackType: "本選考",
      memo: "既".repeat(60_000)
    })
  ], [
    normalizeEntry({
      id: "other-overflow",
      companyName: "上限社",
      trackType: "本選考",
      memo: "新".repeat(60_000)
    })
  ]);
  assert.equal(result.blockingIssues.length, 1);
  assert.equal(result.blockingIssues[0].field, "memo");
});

test("backup templates cannot erase an existing template with empty fields", () => {
  const existing = normalizeTemplate({
    id: "template-same",
    title: "志望動機",
    body: "既存の型",
    sortOrder: 2
  });
  const result = helpers.prepareBackupTemplateRestore([existing], [{
    id: "template-same",
    kind: "ガクチカ",
    title: "",
    body: "",
    sortOrder: 9
  }]);
  assert.equal(result.templates.length, 1);
  assert.equal(result.templates[0].title, "志望動機");
  assert.equal(result.templates[0].body, "既存の型");
  assert.equal(result.templates[0].sortOrder, 2);
  assert.equal(result.upserts.length, 0);
});

test("plans distinguish existing, unchanged, trash, ambiguity, and another track", () => {
  const base = normalizeEntry({ id: "base", companyName: "A社", trackType: "本選考", industry: "IT" });
  state.aiReviewedConflictKeys.clear();
  state.entries = [base];
  assert.equal(helpers.buildAiImportPlan({ companyName: "Ａ社", trackType: "本選考", memo: "追加" }).kind, "existing");
  assert.equal(helpers.buildAiImportPlan({ companyName: "Ａ社", trackType: "本選考", industry: "IT" }).kind, "unchanged");
  assert.equal(helpers.buildAiImportPlan({ companyName: "Ａ社", trackType: "本選考", industry: "金融" }).kind, "conflict");
  assert.equal(helpers.buildAiImportPlan({ companyName: "A社", trackType: "インターン" }).kind, "new");

  state.entries = [{ ...base, deletedAt: "2026-07-01T00:00:00.000Z" }];
  assert.equal(helpers.buildAiImportPlan({ companyName: "A社", trackType: "本選考" }).kind, "trashed");

  state.entries = [base, { ...base, id: "duplicate" }];
  assert.equal(helpers.buildAiImportPlan({ companyName: "A社", trackType: "本選考" }).kind, "ambiguous");
});

test("a reviewed conflict becomes unchanged instead of looping", () => {
  const base = normalizeEntry({ id: "base-review", companyName: "A社", trackType: "本選考", industry: "IT" });
  const card = { companyName: "Ａ社", trackType: "本選考", industry: "金融" };
  state.entries = [base];
  state.aiReviewedConflictKeys.clear();

  const firstPlan = helpers.buildAiImportPlan(card);
  assert.equal(firstPlan.kind, "conflict");
  assert.ok(firstPlan.reviewKey);
  state.aiReviewedConflictKeys.add(firstPlan.reviewKey);

  const reviewedPlan = helpers.buildAiImportPlan(card);
  assert.equal(reviewedPlan.kind, "unchanged");
  assert.equal(reviewedPlan.conflictsReviewed, true);
  assert.deepEqual(Array.from(reviewedPlan.conflicts), []);

  state.entries = [normalizeEntry({
    ...base,
    industry: "コンサル"
  })];
  assert.equal(helpers.buildAiImportPlan(card).kind, "conflict");
});

test("CSV-internal conflicts keep both values for the confirmation screen", () => {
  state.entries = [];
  state.aiReviewedConflictKeys.clear();
  const card = {
    companyName: "A社",
    trackType: "本選考",
    industry: "IT",
    _importConflicts: ["industry"],
    _importConflictDetails: [{
      field: "industry",
      existingValue: "IT",
      incomingValue: "金融",
      rowNumber: 3
    }]
  };

  const consolidated = helpers.consolidateAiImportCards([card]);
  const plan = helpers.buildAiImportPlan(consolidated[0]);
  assert.equal(plan.kind, "new");
  assert.equal(plan.conflictDetails.length, 1);
  assert.equal(plan.conflictDetails[0].existingValue, "IT");
  assert.equal(plan.conflictDetails[0].incomingValue, "金融");
  assert.ok(plan.reviewKey);

  state.entries = [normalizeEntry({
    id: "saved-alternative",
    companyName: "A社",
    trackType: "本選考",
    industry: "金融"
  })];
  state.aiReviewedConflictKeys.add(plan.reviewKey);
  const postSavePlan = helpers.buildAiImportPlan(consolidated[0]);
  assert.equal(postSavePlan.kind, "conflict");
  state.aiReviewedConflictKeys.add(postSavePlan.reviewKey);
  assert.equal(helpers.buildAiImportPlan(consolidated[0]).kind, "unchanged");
});

test("an event type without an incoming event date does not create a false update loop", () => {
  const existing = normalizeEntry({
    companyName: "A社",
    trackType: "説明会",
    eventDate: "",
    eventType: "説明会"
  });
  const result = helpers.mergeImportedEntry(existing, {
    companyName: "A社",
    trackType: "説明会",
    eventDate: "",
    eventType: "説明会"
  });
  assert.equal(result.hasChanges, false);
  assert.deepEqual(Array.from(result.addedFields), []);
});

test("text that cannot be appended within the limit keeps both choices", () => {
  const existing = normalizeEntry({
    companyName: "A社",
    trackType: "本選考",
    memo: "既存".repeat(2_000)
  });
  const incomingMemo = "取込".repeat(2_000);
  const result = helpers.mergeImportedEntry(existing, {
    companyName: "A社",
    trackType: "本選考",
    memo: incomingMemo
  });
  assert.ok(result.conflicts.includes("memo"));
  assert.equal(result.conflictDetails[0].field, "memo");
  assert.equal(result.conflictDetails[0].incomingValue, incomingMemo);
});

test("CSV and TXT fixtures combine locally and remain idempotent on an existing card", () => {
  const csvText = fs.readFileSync(path.join(__dirname, "fixtures", "import-sample.csv"), "utf8");
  const noteText = fs.readFileSync(path.join(__dirname, "fixtures", "import-note.txt"), "utf8");
  const imported = localCsv.importCsv(csvText);
  const redactedNote = localAi.redactSensitiveMemo(noteText).text;
  assert.equal(imported.cards.length, 2);
  assert.doesNotMatch(imported.safeText, /DEMO-ID|https?:\/\//u);
  assert.match(redactedNote, /サンプル夏株式会社/u);

  const combined = helpers.consolidateAiImportCards([
    ...imported.cards,
    {
      companyName: "サンプル夏株式会社",
      trackType: "インターン",
      priority: "高",
      memo: "説明会で聞いた事業内容を企業研究メモへ追加したい。"
    }
  ]);
  assert.equal(combined.length, 2);
  const summer = combined.find((card) => card.companyName === "サンプル夏株式会社");
  assert.equal(summer.priority, "高");
  assert.match(summer.memo, /インターン日程/u);
  assert.match(summer.memo, /説明会で聞いた事業内容/u);

  const existing = normalizeEntry({
    companyName: "サンプル夏株式会社",
    trackType: "インターン",
    industry: "IT"
  });
  const first = helpers.mergeImportedEntry(existing, summer);
  const second = helpers.mergeImportedEntry(first.entry, summer);
  assert.equal(first.hasChanges, true);
  assert.equal(second.hasChanges, false);
});

console.log("15 import merge tests passed");
