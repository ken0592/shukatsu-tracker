"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const csv = require("../csv-import.js");

function test(name, run) {
  try {
    run();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test("RFC4180 quotes, commas, embedded CRLF, escaped quotes, BOM, and blank rows", () => {
  const source = '\uFEFF"会社名","メモ"\r\n"ACME, Inc.","1行目\r\n2行目の""引用"""\r\n\r\n';
  const parsed = csv.parseDelimited(source);
  assert.equal(parsed.delimiter, ",");
  assert.deepEqual(parsed.rows, [
    ["会社名", "メモ"],
    ["ACME, Inc.", '1行目\n2行目の"引用"']
  ]);
});

test("tab and semicolon delimiters are detected outside quoted fields", () => {
  const tab = csv.parseCsv("企業名\t業界\tメモ\nA社\tIT\tカンマ,あり");
  assert.equal(tab.delimiter, "\t");
  assert.equal(tab.rows[1][2], "カンマ,あり");

  const semicolon = csv.parseCsv('会社名;業界;メモ\r\n"B, Inc.";メーカー;"a;b"');
  assert.equal(semicolon.delimiter, ";");
  assert.deepEqual(semicolon.rows[1], ["B, Inc.", "メーカー", "a;b"]);
});

test("Excel sep directive is accepted without becoming a header row", () => {
  const result = csv.importCsv("sep=;\r\n企業名;系統;締め切り\r\nA社;IT;2026/08/01");
  assert.equal(result.delimiter, ";");
  assert.equal(result.cards.length, 1);
  assert.equal(result.cards[0].companyName, "A社");
  assert.equal(result.cards[0].industry, "IT");
  assert.equal(result.cards[0].deadline, "2026-08-01");
});

test("CSV content is recognized even when the filename extension is not CSV", () => {
  assert.equal(csv.looksLikeCsv("企業名,マイページID,パスワード\nA社,USER-1,SECRET"), true);
  assert.equal(csv.looksLikeCsv("\n\n企業名,締切\nA社,2026-08-01"), true);
  assert.equal(csv.looksLikeCsv("ID,Password\nUSER-1,SECRET"), true);
  assert.equal(csv.looksLikeCsv("name,account\nAcme,SECRET-123"), true);
  assert.equal(csv.looksLikeCsv("name,account,notes\nAcme,SECRET-123"), true);
  assert.equal(csv.looksLikeCsv("name,account\nAcme,SECRET-123,extra"), true);
  assert.equal(csv.looksLikeCsv("name,account\nSECRET-123"), true);
  assert.equal(csv.looksLikeCsv("label\tvalue\naccount\tSECRET-123"), true);
  assert.equal(csv.looksLikeCsv("説明行です\n会社名\t締切\nA社\t2026-08-01"), true);
  assert.equal(csv.looksLikeCsv("sep=;\n会社名;締切\nA社;2026-08-01"), true);
  assert.equal(csv.looksLikeCsv("会社名: A社\n締切: 2026-08-01"), false);
  assert.equal(csv.looksLikeCsv("普通の文章,途中にカンマがある"), false);
  const multilineSecret = [
    "name,notes",
    'Acme,"line1',
    ...Array.from({ length: 24 }, (_, index) => `line${index + 2}`),
    'line26 SECRET-123"'
  ].join("\n");
  assert.equal(csv.looksLikeCsv(multilineSecret), true);
  assert.equal(csv.looksLikeCsv(`name,notes\n${"😀".repeat(10_000)},SECRET-123`), true);
  const delayedCsv = [
    ...Array.from({ length: 20 }, (_, index) => `preamble ${index + 1}`),
    "name,password",
    "Acme,TOPSECRET-123"
  ].join("\n");
  assert.equal(csv.looksLikeCsv(delayedCsv), true);
});

test("Japanese header aliases create current-model card candidates", () => {
  const source = [
    "企業名,業種,選考種別,選考状況,応募締切日,次回予定日,予定種類,志望度,面接メモ,備考",
    '株式会社テスト,IT,早期,エントリー済み,2026/08/03,2026年8月10日,一次面接,第一志望,"質問を準備","要確認"'
  ].join("\r\n");
  const result = csv.importCsv(source);
  assert.equal(result.cards.length, 1);
  assert.deepEqual(result.cards[0], {
    companyName: "株式会社テスト",
    industry: "IT",
    mypageId: "",
    officialUrl: "",
    logoUrl: "",
    trackType: "早期選考",
    status: "応募済み",
    deadline: "2026-08-03",
    eventDate: "2026-08-10",
    eventType: "面接",
    priority: "高",
    mypageUrl: "",
    esContent: "",
    esItems: [],
    interviewNotes: "質問を準備",
    memo: "要確認"
  });
  assert.match(result.safeText, /株式会社テスト/u);
  assert.match(result.safeText, /2026-08-03/u);
});

test("password columns are reported and never stored or sent to AI", () => {
  const source = [
    "会社名,マイページID,公式URL,マイページURL,ESリンク,メモ,パスワード,パスワード管理場所",
    "安全株式会社,USER-9988,https://corp.example/,https://mypage.example/,https://es.example/,通常メモ,secret-PASS-123,1Password"
  ].join("\n");
  const result = csv.importCsv(source);
  assert.equal(result.cards[0].mypageId, "USER-9988");
  assert.equal(result.cards[0].officialUrl, "https://corp.example/");
  assert.equal(result.cards[0].mypageUrl, "https://mypage.example/");
  assert.deepEqual(result.ignoredSensitiveColumns, [
    { index: 6, header: "パスワード", reason: "password" },
    { index: 7, header: "パスワード管理場所", reason: "password-location" }
  ]);
  assert.equal(Object.hasOwn(result.cards[0], "password"), false);
  assert.equal(result.safeText.includes("secret-PASS-123"), false);
  assert.equal(result.safeText.includes("1Password"), false);
  assert.equal(result.safeText.includes("USER-9988"), false);
  assert.equal(result.safeText.includes("https://"), false);
  assert.equal(result.safeText.includes("es.example"), false);
  assert.deepEqual(result.ignoredColumns, []);
});

test("passwords and authentication material inside narrative cells are masked before cards are created", () => {
  const source = [
    "会社名,業界,マイページID,ES内容,面接メモ,メモ",
    "安全株式会社,IT,,,,",
    '安全株式会社,"パスワード DUMMY-INDUSTRY-PASS","PW DUMMY-ID-PASS","Password is DUMMY-ES-PASS,DUMMY-ES-TAIL","Authorization: Bearer DUMMY_AUTH_TOKEN_123","ログイン https://user:DUMMY-URL-PASS@example.com/private scheme.example/?token=DUMMY-SCHEME-TOKEN eyJabc.eyJdef.abc123"'
  ].join("\n");
  const result = csv.importCsv(source);
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /DUMMY-INDUSTRY-PASS|DUMMY-ID-PASS|DUMMY-ES-PASS|DUMMY-ES-TAIL|DUMMY_AUTH_TOKEN_123|DUMMY-URL-PASS|DUMMY-SCHEME-TOKEN|eyJabc/u);
  assert.equal(result.cards[0].industry, "IT");
  assert.equal(result.cards[0].mypageId, "");
  assert.match(result.cards[0].esContent, /\[パスワードを非表示\]/u);
  assert.match(result.cards[0].interviewNotes, /\[認証トークンを非表示\]/u);
  assert.match(result.cards[0].memo, /\[認証情報を含むURLを非表示\]/u);
  assert.deepEqual(result.maskedSecretValues, [{
    rowNumber: 3,
    fields: ["industry", "mypageId", "esContent", "interviewNotes", "memo"]
  }]);
  assert.equal(result.mergeConflicts[0].field, "industry");
  assert.match(result.mergeConflicts[0].incomingValue, /\[パスワードを非表示\]/u);
});

test("required header markers and short password aliases are normalized safely", () => {
  const result = csv.importCsv("企業名（必須）,PW,PIN,Passcode,API Key,業界（任意）\nA社,top-secret,pin-secret,code-secret,key-secret,IT");
  assert.equal(result.cards[0].companyName, "A社");
  assert.equal(result.cards[0].industry, "IT");
  assert.deepEqual(result.ignoredSensitiveColumns, [
    { index: 1, header: "PW", reason: "password" },
    { index: 2, header: "PIN", reason: "password" },
    { index: 3, header: "Passcode", reason: "password" },
    { index: 4, header: "API Key", reason: "password" }
  ]);
  assert.doesNotMatch(JSON.stringify(result), /top-secret|pin-secret|code-secret|key-secret/u);
});

test("AI text redacts links and identifiers repeated inside notes", () => {
  const source = [
    "社名,面接メモ,備考",
    'A社,"連絡先 test@example.com 090-1234-5678","マイページID: ABC-999 https://private.example/path"'
  ].join("\n");
  const result = csv.importCsv(source);
  assert.match(result.cards[0].memo, /ABC-999/u);
  assert.doesNotMatch(result.safeText, /ABC-999|private\.example|test@example\.com|090-1234-5678/u);
  assert.match(result.safeText, /\[非表示\]|\[URL非表示\]/u);
});

test("AI text never carries a URL hidden in a non-URL field", () => {
  const result = csv.importCsv("会社名,業界\nhttps://private.example/,https://industry.example/");
  assert.equal(result.cards[0].companyName, "https://private.example/");
  assert.doesNotMatch(result.safeText, /https?:\/\//u);
  assert.match(result.safeText, /\[URL非表示\]/u);
});

test("missing company rows and empty lines are skipped without importing secrets", () => {
  const source = "会社名,業界,Password\n,IT,hidden\n\nB社,金融,dont-save\n";
  const result = csv.importCsv(source);
  assert.equal(result.dataRowCount, 2);
  assert.deepEqual(result.skippedRows, [{ rowNumber: 2, reason: "missing-company-name" }]);
  assert.equal(result.cards.length, 1);
  assert.equal(result.safeText.includes("dont-save"), false);
});

test("only http and https URLs are accepted on cards", () => {
  const source = [
    "会社名,公式サイト,マイページURL,ロゴURL",
    "A社,javascript:alert(1),file:///secret.svg,data:image/svg+xml;base64,AAAA"
  ].join("\n");
  const result = csv.importCsv(source);
  assert.equal(result.cards[0].officialUrl, "");
  assert.equal(result.cards[0].mypageUrl, "");
  assert.equal(result.cards[0].logoUrl, "");
});

test("userinfo and secret-bearing URL queries or fragments are rejected", () => {
  const source = [
    "会社名,URL,マイページURL,ロゴURL",
    "A社,https://user:pass@example.com/,https://example.com/?token=secret,https://example.com/logo.png#access_token=secret",
    "B社,https://example.com/company?utm_source=csv,https://example.com/mypage?company=2,https://example.com/logo.png",
    "C社,https://example.com/?ticket=secret,https://example.com/sso?SAMLResponse=secret,https://example.com/magic/AbCdEf1234567890",
    "D社,https://example.com/company#about,https://example.com/reset/AbCdEf1234567890,https://example.com/logo.png?image=eyJabc.eyJdef.ghi"
  ].join("\n");
  const result = csv.importCsv(source);
  assert.equal(result.cards[0].officialUrl, "");
  assert.equal(result.cards[0].mypageUrl, "");
  assert.equal(result.cards[0].logoUrl, "");
  assert.equal(result.cards[1].officialUrl, "https://example.com/company?utm_source=csv");
  assert.equal(result.cards[1].mypageUrl, "https://example.com/mypage?company=2");
  assert.equal(result.cards[1].logoUrl, "https://example.com/logo.png");
  assert.equal(result.cards[2].officialUrl, "");
  assert.equal(result.cards[2].mypageUrl, "");
  assert.equal(result.cards[2].logoUrl, "");
  assert.equal(result.cards[3].officialUrl, "");
  assert.equal(result.cards[3].mypageUrl, "");
  assert.equal(result.cards[3].logoUrl, "");
  assert.equal(result.ignoredUnsafeUrls.length, 3);
  assert.equal(result.ignoredUnsafeUrls.reduce((sum, item) => sum + item.fields.length, 0), 9);
});

test("internship-specific columns map to dates, links, track, and safe memo lines", () => {
  const source = [
    "会社名,系統,締め切り,インターン開始,インターン終了,日数,ESリンク,マイページID,パスワード管理場所,URL",
    "夏株式会社,IT,2026/08/01,2026/08/20,2026/08/22,3日,https://entry.example/es,MP-7788,Bitwarden,https://summer.example/"
  ].join("\r\n");
  const result = csv.importCsv(source);
  const card = result.cards[0];
  assert.equal(card.industry, "IT");
  assert.equal(card.trackType, "インターン");
  assert.equal(card.deadline, "2026-08-01");
  assert.equal(card.eventDate, "2026-08-20");
  assert.equal(card.eventType, "インターン");
  assert.equal(card.mypageUrl, "https://entry.example/es");
  assert.equal(card.mypageId, "MP-7788");
  assert.equal(card.officialUrl, "https://summer.example/");
  assert.equal(card.memo, "インターン日程: 2026-08-20〜2026-08-22（3日）");
  assert.deepEqual(result.ignoredSensitiveColumns, [
    { index: 8, header: "パスワード管理場所", reason: "password-location" }
  ]);
  assert.doesNotMatch(result.safeText, /MP-7788|Bitwarden|https?:\/\//u);
});

test("an explicit selection track wins over internship-column inference", () => {
  const result = csv.importCsv("会社名,選考区分,インターン開始\nA社,本選考,2026-09-01");
  assert.equal(result.cards[0].trackType, "本選考");
  assert.equal(result.cards[0].eventDate, "2026-09-01");
  assert.equal(result.cards[0].eventType, "インターン");
});

test("unknown explicit tracks are skipped instead of becoming main selection", () => {
  const result = csv.importCsv([
    "会社名,選考区分,締切",
    "A社,採用イベント,2026-08-01",
    "B社,通常選考,2026-08-02",
    "C社,internship,2026-08-03"
  ].join("\n"));
  assert.deepEqual(result.skippedRows, [{ rowNumber: 2, reason: "unrecognized-track" }]);
  assert.deepEqual(result.cards.map((card) => [card.companyName, card.trackType]), [
    ["B社", "本選考"],
    ["C社", "インターン"]
  ]);
});

test("invalid internship values are reported without inventing an internship", () => {
  const result = csv.importCsv([
    "会社名,インターン開始,インターン終了,日数,予定日,予定種別,締切",
    "A社,2026-02-30,2026-13-01,0,2026-09-10,面接,2026-02-29"
  ].join("\n"));
  const card = result.cards[0];
  assert.equal(card.trackType, "本選考");
  assert.equal(card.eventDate, "2026-09-10");
  assert.equal(card.eventType, "面接");
  assert.equal(card.deadline, "");
  assert.equal(card.memo, "");
  assert.deepEqual(result.invalidValues, [{
    rowNumber: 2,
    fields: ["deadline", "internStart", "internEnd", "internDays"]
  }]);
});

test("a blank explicit track cell still uses internship-column inference", () => {
  const result = csv.importCsv("会社名,選考区分,インターン開始\nA社,,2026-09-01");
  assert.equal(result.cards[0].trackType, "インターン");
});

test("internship columns infer the internship track when no track header exists", () => {
  const result = csv.importCsv("会社名,インターン開始,インターン終了,日数\nA社,2026-09-01,2026-09-02,2");
  assert.equal(result.cards[0].trackType, "インターン");
  assert.equal(result.cards[0].memo, "インターン日程: 2026-09-01〜2026-09-02（2日）");
});

test("blank internship cells do not turn every row in a mixed sheet into an internship", () => {
  const source = [
    "企業名,系統,締め切り,インターン開始,インターン終了,日数,ESリンク,マイページID,パスワード管理場所,URL,選考形式,状態,優先度,残り日,メモ",
    "NRI,コンサル,2026-05-26,2026-08-03,2026-08-07,5,,DEMO-1,保管アプリ,web.jpn.com/2028/applicant/top,オンライン,気になる,高,-65,初回",
    "NRI,コンサル,2026-05-26,2026-08-17,2026-08-21,5,,,,,対面,気になる,高,-65,追加",
    "NTTdata,,2026-06-11,,,,,DEMO-2,保管アプリ,https://nttdata.snar.jp/mypage/index.aspx,Web,提出済み,中,-49,",
    "IBM,,2026-06-15,,,,,,,,,,,,"
  ].join("\n");
  const result = csv.importCsv(source);

  assert.equal(result.cards.length, 3);
  const nri = result.cards.find((card) => card.companyName === "NRI");
  const ntt = result.cards.find((card) => card.companyName === "NTTdata");
  const ibm = result.cards.find((card) => card.companyName === "IBM");
  assert.equal(nri.trackType, "インターン");
  assert.match(nri.memo, /インターン日程: 2026-08-03〜2026-08-07（5日）/u);
  assert.match(nri.memo, /インターン日程: 2026-08-17〜2026-08-21（5日）/u);
  assert.match(nri.memo, /選考形式: オンライン/u);
  assert.match(nri.memo, /選考形式: 対面/u);
  assert.equal(nri.mypageUrl, "https://web.jpn.com/2028/applicant/top");
  assert.equal(nri.officialUrl, "");
  assert.equal(ntt.trackType, "本選考");
  assert.equal(ntt.status, "ES提出済み");
  assert.equal(ntt.mypageUrl, "https://nttdata.snar.jp/mypage/index.aspx");
  assert.equal(ntt.officialUrl, "");
  assert.equal(ibm.trackType, "本選考");
  assert.deepEqual(result.ignoredSensitiveColumns, [
    { index: 8, header: "パスワード管理場所", reason: "password-location" }
  ]);
  assert.deepEqual(result.ignoredColumns, [{ index: 13, header: "残り日" }]);
  assert.deepEqual(result.skippedRows, []);
  assert.equal(result.duplicateRows.length, 1);
  assert.equal(result.mergeConflicts[0].field, "eventDate");
  assert.doesNotMatch(JSON.stringify(result), /保管アプリ/u);
});

test("scheme-less public URLs are upgraded to HTTPS but incomplete hosts stay rejected", () => {
  const result = csv.importCsv([
    "企業名,URL",
    "A社,web.jpn.com/2028/applicant/top",
    "B社,ge2028/applicant/top",
    "C社,example.com/company"
  ].join("\n"));
  assert.equal(result.cards[0].mypageUrl, "https://web.jpn.com/2028/applicant/top");
  assert.equal(result.cards[0].officialUrl, "");
  assert.equal(result.cards[1].mypageUrl, "");
  assert.equal(result.cards[1].officialUrl, "");
  assert.equal(result.cards[2].officialUrl, "https://example.com/company");
  assert.deepEqual(result.ignoredUnsafeUrls, [{ rowNumber: 3, fields: ["genericUrl"] }]);
});

test("unknown statuses default visibly and are reported for review", () => {
  const result = csv.importCsv("企業名,状態\nA社,ち");
  assert.equal(result.cards[0].status, "気になる");
  assert.deepEqual(result.invalidValues, [{ rowNumber: 2, fields: ["status"] }]);
});

test("duplicate rows fill missing values, join unique notes, and report conflicts", () => {
  const source = [
    "会社名,選考区分,業界,締切,メモ",
    "A社,本選考,,,最初のメモ",
    "Ａ社,本選考,IT,2026-08-01,追加メモ",
    "A社,本選考,金融,2026-08-01,追加メモ"
  ].join("\n");
  const result = csv.importCsv(source);
  assert.equal(result.cards.length, 1);
  assert.equal(result.cards[0].industry, "IT");
  assert.equal(result.cards[0].deadline, "2026-08-01");
  assert.equal(result.cards[0].memo, "最初のメモ\n追加メモ");
  assert.deepEqual(result.duplicateRows.map((item) => item.rowNumber), [3, 4]);
  assert.equal(result.mergeConflicts.length, 1);
  assert.equal(result.mergeConflicts[0].field, "industry");
  assert.equal(result.mergeConflicts[0].existingValue, "IT");
  assert.equal(result.mergeConflicts[0].incomingValue, "金融");
});

test("duplicate rows fill status and priority that were truly blank", () => {
  const result = csv.importCsv([
    "会社名,選考区分,選考状況,志望度",
    "A社,本選考,,",
    "A社,本選考,応募済み,高"
  ].join("\n"));
  assert.equal(result.cards.length, 1);
  assert.equal(result.cards[0].status, "応募済み");
  assert.equal(result.cards[0].priority, "高");
  assert.deepEqual(result.mergeConflicts, []);

  const explicitDefault = csv.importCsv([
    "会社名,選考区分,選考状況",
    "B社,本選考,気になる",
    "B社,本選考,応募済み"
  ].join("\n"));
  assert.equal(explicitDefault.cards[0].status, "気になる");
  assert.equal(explicitDefault.mergeConflicts.length, 1);
});

test("malformed quoted fields and a missing company header fail clearly", () => {
  assert.throws(
    () => csv.parseCsv('会社名,メモ\nA社,"未完'),
    (error) => error instanceof csv.CsvImportError && error.code === "UNCLOSED_QUOTE"
  );
  assert.throws(
    () => csv.importCsv("業界,メモ\nIT,なし"),
    (error) => error instanceof csv.CsvImportError && error.code === "MISSING_COMPANY_HEADER"
  );
  assert.throws(
    () => csv.importCsv("会社名,メモ,メモ\nA社,one,two"),
    (error) => error instanceof csv.CsvImportError && error.code === "DUPLICATE_HEADER"
  );
});

test("identity keys normalize width, case, whitespace, and preserve track identity", () => {
  const first = csv.cardIdentityKey({ companyName: " ＡＣＭＥ Inc. ", trackType: "本選考" });
  const same = csv.cardIdentityKey({ companyName: "acmeinc.", trackType: "" });
  const differentTrack = csv.cardIdentityKey({ companyName: "ACME Inc.", trackType: "インターン" });
  assert.equal(first, same);
  assert.notEqual(first, differentTrack);
  assert.equal(csv.cardIdentityKey({ companyName: "", trackType: "本選考" }), "");
});

test("missing-only merge never overwrites populated values", () => {
  const merged = csv.mergeMissingOnly(
    { companyName: "A社", trackType: "本選考", industry: "IT", memo: "", officialUrl: "" },
    { companyName: "別名", trackType: "インターン", industry: "金融", memo: "追記", officialUrl: "https://a.example/" }
  );
  assert.equal(merged.companyName, "A社");
  assert.equal(merged.trackType, "本選考");
  assert.equal(merged.industry, "IT");
  assert.equal(merged.memo, "追記");
  assert.equal(merged.officialUrl, "https://a.example/");
});

test("unique-only merge adds only new company and track identities", () => {
  const existing = [{ companyName: "Ａ社", trackType: "本選考" }];
  const incoming = [
    { companyName: " A社 ", trackType: "本選考" },
    { companyName: "A社", trackType: "インターン" },
    { companyName: "B社", trackType: "本選考" },
    { companyName: "", trackType: "本選考" }
  ];
  const result = csv.mergeUniqueOnly(existing, incoming);
  assert.equal(result.cards.length, 3);
  assert.equal(result.added.length, 2);
  assert.equal(result.duplicates.length, 2);
});

test("browser global build is available without CommonJS", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "csv-import.js"), "utf8");
  const browserGlobal = {};
  vm.runInNewContext(source, { globalThis: browserGlobal, URL });
  assert.equal(typeof browserGlobal.SHUKATSU_CSV?.parseCsv, "function");
  assert.equal(browserGlobal.SHUKATSU_CSV.detectDelimiter("会社名\t業界\nA社\tIT"), "\t");
});

console.log("29 CSV import tests passed");
