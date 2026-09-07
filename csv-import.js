(function setupCsvImport(root, factory) {
  "use strict";

  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.SHUKATSU_CSV = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCsvImportApi() {
  "use strict";

  const delimiters = [",", "\t", ";"];
  const defaultLimits = Object.freeze({
    maxInputChars: 2_000_000,
    maxRows: 10_000,
    maxColumns: 200,
    maxFieldChars: 100_000
  });
  const trackTypes = ["インターン", "夏インターン", "冬インターン", "早期選考", "本選考", "説明会", "面談", "OB/OG訪問"];
  const statuses = [
    "気になる", "応募予定", "応募済み", "ES提出済み", "Webテスト", "一次面接", "二次面接", "最終面接",
    "結果待ち", "選考通過", "インターン選考通過", "インターン参加決定", "内定", "落選", "辞退", "参加済み", "選考中", "採用", "不採用"
  ];
  const eventTypes = ["", "ES締切", "Webテスト", "面接", "説明会", "面談", "インターン", "その他"];
  const priorities = ["高", "中", "低", "未定"];
  const cardFields = [
    "companyName", "industry", "mypageId", "officialUrl", "logoUrl", "trackType", "status", "deadline",
    "eventDate", "eventType", "priority", "mypageUrl", "esContent", "interviewNotes", "memo"
  ];
  const narrativeFields = new Set(["esContent", "interviewNotes", "memo"]);
  const aliases = {
    companyName: ["企業名", "会社名", "社名", "企業", "company", "company name", "companyname"],
    industry: ["系統", "業界", "業種", "industry", "business category", "sector"],
    trackType: ["選考区分", "選考種別", "応募区分", "選考タイプ", "採用区分", "コース", "track", "track type", "tracktype"],
    selectionFormat: ["選考形式", "選考方法", "実施形式", "開催形式", "selection format", "selectionformat"],
    status: ["ステータス", "状態", "選考状況", "応募状況", "進捗", "status"],
    deadline: ["締切", "締切日", "締め切り", "締め切り日", "応募締切", "応募締切日", "es締切", "es締切日", "deadline", "due date", "duedate"],
    eventDate: ["次の予定日", "次回予定日", "予定日", "面接日", "イベント日", "event date", "eventdate", "next event date", "nexteventdate"],
    eventType: ["予定種別", "予定種類", "次回予定種別", "イベント種別", "event type", "eventtype"],
    priority: ["志望度", "優先度", "重要度", "priority"],
    mypageId: ["マイページid", "mypage id", "mypageid", "ログインid", "応募者id", "id"],
    officialUrl: ["公式url", "企業url", "公式サイト", "企業サイト", "会社url", "official url", "officialurl", "website", "company website"],
    genericUrl: ["url"],
    logoUrl: ["ロゴurl", "アイコンurl", "logo url", "logourl", "icon url", "iconurl"],
    mypageUrl: ["マイページurl", "ログインurl", "応募者ページurl", "esリンク", "es url", "eslink", "mypage url", "mypageurl", "login url", "loginurl"],
    internStart: ["インターン開始", "インターン開始日", "インターン初日", "intern start", "internstart"],
    internEnd: ["インターン終了", "インターン終了日", "インターン最終日", "intern end", "internend"],
    internDays: ["日数", "インターン日数", "実施日数", "期間日数", "duration days", "durationdays"],
    esContent: ["es", "es内容", "es回答", "エントリーシート", "エントリーシート回答", "es content", "escontent"],
    interviewNotes: ["面接メモ", "面接対策", "面接記録", "interview notes", "interviewnotes"],
    memo: ["メモ", "備考", "ノート", "自由記入", "memo", "note", "notes", "remarks"]
  };
  const aliasLookup = new Map();
  Object.entries(aliases).forEach(([field, names]) => {
    names.forEach((name) => aliasLookup.set(normalizeHeaderKey(name), field));
  });

  class CsvImportError extends Error {
    constructor(code, message, details = {}) {
      super(message);
      this.name = "CsvImportError";
      this.code = code;
      Object.assign(this, details);
    }
  }

  function stripBom(value) {
    const text = String(value == null ? "" : value);
    return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  }

  function resolveLimits(options = {}) {
    return {
      maxInputChars: positiveInteger(options.maxInputChars, defaultLimits.maxInputChars),
      maxRows: positiveInteger(options.maxRows, defaultLimits.maxRows),
      maxColumns: positiveInteger(options.maxColumns, defaultLimits.maxColumns),
      maxFieldChars: positiveInteger(options.maxFieldChars, defaultLimits.maxFieldChars)
    };
  }

  function positiveInteger(value, fallback) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
  }

  function detectDelimiter(value) {
    const text = stripBom(value);
    const records = scanDelimiterCounts(text, 30);
    if (!records.length) return ",";

    let bestDelimiter = ",";
    let bestScore = -1;
    delimiters.forEach((delimiter) => {
      const counts = records.map((record) => record[delimiter]).filter((count) => Number.isFinite(count));
      const first = counts[0] || 0;
      const positive = counts.filter((count) => count > 0);
      const frequencies = new Map();
      positive.forEach((count) => frequencies.set(count, (frequencies.get(count) || 0) + 1));
      const consistency = Math.max(0, ...frequencies.values());
      const total = positive.reduce((sum, count) => sum + count, 0);
      const score = (first > 0 ? 100_000 : 0) + consistency * 1_000 + first * 100 + positive.length * 10 + total;
      if (score > bestScore) {
        bestScore = score;
        bestDelimiter = delimiter;
      }
    });
    return bestDelimiter;
  }

  function looksLikeCsv(value) {
    const text = stripBom(value);
    const nonEmptyLines = text.split(/\r?\n/u).filter((line) => line.trim()).slice(0, 20);
    if (!nonEmptyLines.length) return false;
    const separatorDirective = nonEmptyLines[0].match(/^\s*sep=(,|;|\t)\s*$/iu);
    const candidateLines = separatorDirective ? nonEmptyLines.slice(1) : nonEmptyLines;
    const requestedDelimiter = separatorDirective?.[1] || "";
    const limits = resolveLimits({
      maxInputChars: 20_000,
      maxRows: 2,
      maxColumns: 200,
      maxFieldChars: 2_000
    });

    const hasRecognizedHeader = candidateLines.some((line) => {
      const delimiter = requestedDelimiter || detectDelimiter(line);
      if (!line.includes(delimiter)) return false;
      try {
        const rows = parseRows(line, delimiter, limits);
        const header = rows[0] || [];
        if (header.length < 2) return false;
        const inspected = header.map(inspectHeader);
        const recognizedFields = inspected.filter((column) => column.field).length;
        return inspected.some((column) => column.field === "companyName" || column.sensitiveReason)
          || recognizedFields >= 2;
      } catch {
        const normalizedCells = line
          .split(delimiter)
          .map((cell) => normalizeHeaderKey(String(cell).replace(/^\s*"+|"+\s*$/gu, "")));
        const recognizedCells = normalizedCells.filter((cell) => aliasLookup.has(cell)).length;
        return normalizedCells.some((cell) => (
          ["企業名", "会社名", "社名", "company", "companyname"].includes(cell)
          || sensitiveHeaderReason(cell)
        )) || recognizedCells >= 2;
      }
    });
    if (hasRecognizedHeader) return true;

    const possibleDelimiters = requestedDelimiter ? [requestedDelimiter] : delimiters;
    const structuralSample = Array.from(text).slice(0, 20_000).join("");
    const logicalRecords = scanDelimiterCounts(structuralSample, 20_000);
    return logicalRecords.length >= 2 && possibleDelimiters.some((delimiter) => (
      logicalRecords.some((record) => record[delimiter] > 0)
    ));
  }

  function scanDelimiterCounts(text, maxRecords) {
    const records = [];
    let counts = createDelimiterCounts();
    let inQuotes = false;
    let hasContent = false;

    const pushRecord = () => {
      if (hasContent || Object.values(counts).some((count) => count > 0)) records.push(counts);
      counts = createDelimiterCounts();
      hasContent = false;
    };

    for (let index = 0; index < text.length && records.length < maxRecords; index += 1) {
      const character = text[index];
      if (character === '"') {
        if (inQuotes && text[index + 1] === '"') {
          index += 1;
          hasContent = true;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }
      if (!inQuotes && delimiters.includes(character)) counts[character] += 1;
      if (!inQuotes && (character === "\n" || character === "\r")) {
        if (character === "\r" && text[index + 1] === "\n") index += 1;
        pushRecord();
        continue;
      }
      if (!/\s/u.test(character)) hasContent = true;
    }
    if (records.length < maxRecords) pushRecord();
    return records;
  }

  function createDelimiterCounts() {
    return { ",": 0, "\t": 0, ";": 0 };
  }

  function parseDelimited(value, options = {}) {
    let text = stripBom(value);
    const limits = resolveLimits(options);
    if (text.length > limits.maxInputChars) {
      throw new CsvImportError("INPUT_TOO_LARGE", `CSVは${limits.maxInputChars.toLocaleString("ja-JP")}文字以内にしてください。`);
    }
    text = text.replace(/^(?:[ \t]*\r?\n)+/u, "");
    const separatorDirective = text.match(/^sep=(,|;|\t)\r?\n/iu);
    if (separatorDirective) text = text.slice(separatorDirective[0].length);
    const requestedDelimiter = typeof options === "string" ? options : options.delimiter;
    const delimiter = requestedDelimiter && requestedDelimiter !== "auto"
      ? requestedDelimiter
      : separatorDirective?.[1] || detectDelimiter(text);
    if (!delimiters.includes(delimiter)) {
      throw new CsvImportError("INVALID_DELIMITER", "区切り文字はカンマ、タブ、セミコロンのいずれかを指定してください。");
    }
    return { delimiter, rows: parseRows(text, delimiter, limits) };
  }

  function parseRows(text, delimiter, limits) {
    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;
    let afterQuote = false;
    let lineNumber = 1;

    const append = (character) => {
      field += character;
      if (field.length > limits.maxFieldChars) {
        throw new CsvImportError("FIELD_TOO_LARGE", `CSVの${lineNumber}行目に長すぎる項目があります。`, { lineNumber });
      }
    };
    const pushField = () => {
      if (row.length >= limits.maxColumns) {
        throw new CsvImportError("TOO_MANY_COLUMNS", `CSVは${limits.maxColumns}列以内にしてください。`, { lineNumber });
      }
      row.push(field);
      field = "";
      afterQuote = false;
    };
    const pushRow = () => {
      pushField();
      if (row.some((cell) => String(cell).trim())) {
        if (rows.length >= limits.maxRows) {
          throw new CsvImportError("TOO_MANY_ROWS", `CSVは${limits.maxRows.toLocaleString("ja-JP")}行以内にしてください。`, { lineNumber });
        }
        rows.push(row);
      }
      row = [];
    };

    for (let index = 0; index < text.length; index += 1) {
      const character = text[index];
      if (inQuotes) {
        if (character === '"') {
          if (text[index + 1] === '"') {
            append('"');
            index += 1;
          } else {
            inQuotes = false;
            afterQuote = true;
          }
        } else if (character === "\r" || character === "\n") {
          if (character === "\r" && text[index + 1] === "\n") index += 1;
          append("\n");
          lineNumber += 1;
        } else {
          append(character);
        }
        continue;
      }

      if (afterQuote) {
        if (character === delimiter) {
          pushField();
        } else if (character === "\r" || character === "\n") {
          if (character === "\r" && text[index + 1] === "\n") index += 1;
          pushRow();
          lineNumber += 1;
        } else if (!/[ \f\v]/u.test(character)) {
          throw new CsvImportError("INVALID_QUOTE", `CSVの${lineNumber}行目で引用符の後に不正な文字があります。`, { lineNumber });
        }
        continue;
      }

      if (character === delimiter) {
        pushField();
      } else if (character === "\r" || character === "\n") {
        if (character === "\r" && text[index + 1] === "\n") index += 1;
        pushRow();
        lineNumber += 1;
      } else if (character === '"') {
        if (field.length) {
          throw new CsvImportError("INVALID_QUOTE", `CSVの${lineNumber}行目に閉じられていない引用符があります。`, { lineNumber });
        }
        inQuotes = true;
      } else {
        append(character);
      }
    }

    if (inQuotes) {
      throw new CsvImportError("UNCLOSED_QUOTE", `CSVの${lineNumber}行目までに閉じられていない引用符があります。`, { lineNumber });
    }
    if (field.length || row.length || afterQuote) pushRow();
    return rows;
  }

  function normalizeHeaderKey(value) {
    return cleanSingleLine(value, 200)
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[\s_\-‐‑–—/\\・.：:（）()\[\]【】*＊]+/gu, "")
      .replace(/(?:必須|required|任意|optional)$/iu, "");
  }

  function inspectHeader(header, index) {
    const normalized = normalizeHeaderKey(header);
    const sensitiveReason = sensitiveHeaderReason(normalized);
    return {
      index,
      header: cleanSingleLine(header, 200),
      normalized,
      field: sensitiveReason ? "" : aliasLookup.get(normalized) || "",
      sensitiveReason
    };
  }

  function sensitiveHeaderReason(normalizedHeader) {
    if (!normalizedHeader) return "";
    const shortPasswordLike = /^(?:pass|pw|pin|パス|合言葉|マイページ(?:pass|pw|pin)|ログイン(?:pass|pw|pin))$/iu.test(normalizedHeader);
    const passwordLike = shortPasswordLike || /(?:password|passwd|pwd|passcode|passphrase|パスワード|暗証番号|秘密鍵|合言葉|secret|token|apikey|apiキー|アクセスキー|認証コード|確認コード|authorization|credential|認証情報|ログイン情報)/iu.test(normalizedHeader);
    const locationLike = /(?:manager|management|location|storage|store|vault|保存|保管|管理|格納|置き場|場所|保管先)/iu.test(normalizedHeader);
    if (passwordLike && locationLike) return "password-location";
    if (passwordLike) return "password";
    if (/^(?:認証情報保管先|ログイン情報保管先|credentialvault|credentiallocation)$/iu.test(normalizedHeader)) return "password-location";
    return "";
  }

  function importCsv(value, options = {}) {
    const parsed = parseDelimited(value, options);
    if (!parsed.rows.length) throw new CsvImportError("EMPTY_CSV", "CSVに見出し行がありません。");
    const headers = parsed.rows[0].map((header) => cleanSingleLine(header, 200));
    const inspected = headers.map(inspectHeader);
    const seenHeaders = new Map();
    inspected.forEach((column) => {
      if (!column.normalized) return;
      if (seenHeaders.has(column.normalized)) {
        throw new CsvImportError("DUPLICATE_HEADER", `同じ列名「${column.header}」が複数あります。列名を一意にしてください。`, {
          header: column.header,
          indexes: [seenHeaders.get(column.normalized), column.index]
        });
      }
      seenHeaders.set(column.normalized, column.index);
    });
    const companyColumns = inspected.filter((column) => column.field === "companyName");
    if (!companyColumns.length) {
      throw new CsvImportError("MISSING_COMPANY_HEADER", "「企業名」「会社名」「社名」のいずれかの列が必要です。");
    }

    const fieldColumns = new Map();
    inspected.forEach((column) => {
      if (!column.field) return;
      if (!fieldColumns.has(column.field)) fieldColumns.set(column.field, []);
      fieldColumns.get(column.field).push(column.index);
    });

    const hasExplicitTrackColumn = (fieldColumns.get("trackType") || []).length > 0;
    const rowCards = [];
    const skippedRows = [];
    const ignoredUnsafeUrls = [];
    const invalidValues = [];
    const maskedSecretValues = [];
    parsed.rows.slice(1).forEach((row, rowIndex) => {
      const rowNumber = rowIndex + 2;
      const card = rowToCard(row, fieldColumns, { hasExplicitTrackColumn });
      if (!card.companyName) {
        skippedRows.push({ rowNumber, reason: "missing-company-name" });
        return;
      }
      if (card._unrecognizedTrack) {
        skippedRows.push({ rowNumber, reason: "unrecognized-track" });
        return;
      }
      if (card._unsafeUrlFields.length) {
        ignoredUnsafeUrls.push({ rowNumber, fields: [...card._unsafeUrlFields] });
      }
      if (card._invalidValueFields.length) {
        invalidValues.push({ rowNumber, fields: [...card._invalidValueFields] });
      }
      if (card._maskedSecretFields.length) {
        maskedSecretValues.push({ rowNumber, fields: [...card._maskedSecretFields] });
      }
      const { _unrecognizedTrack, _unsafeUrlFields, _invalidValueFields, _maskedSecretFields, ...importableCard } = card;
      rowCards.push({ card: importableCard, rowNumber });
    });
    const mergedRows = options.mergeDuplicates === false
      ? { cards: rowCards.map(({ card }) => card), duplicateRows: [], mergeConflicts: [] }
      : mergeDuplicateRows(rowCards);
    const cards = mergedRows.cards.map((card) => ({
      ...card,
      status: card.status || "気になる",
      priority: card.priority || "未定"
    }));

    const ignoredSensitiveColumns = inspected
      .filter((column) => column.sensitiveReason)
      .map((column) => ({ index: column.index, header: column.header, reason: column.sensitiveReason }));
    const ignoredColumns = inspected
      .filter((column) => !column.field && !column.sensitiveReason && column.header)
      .map((column) => ({ index: column.index, header: column.header }));
    const safeText = cards.map(toSafeAiRecord).filter(Boolean).join("\n");

    return {
      delimiter: parsed.delimiter,
      headers,
      cards,
      safeText,
      ignoredSensitiveColumns,
      ignoredColumns,
      skippedRows,
      ignoredUnsafeUrls,
      invalidValues,
      maskedSecretValues,
      duplicateRows: mergedRows.duplicateRows,
      mergeConflicts: mergedRows.mergeConflicts,
      dataRowCount: parsed.rows.length - 1
    };
  }

  function rowToCard(row, fieldColumns, context = {}) {
    const valueFor = (field) => {
      const values = (fieldColumns.get(field) || [])
        .map((index) => cleanText(row[index], fieldLimit(field)))
        .filter(Boolean);
      if (narrativeFields.has(field)) return joinUnique(values);
      return values[0] || "";
    };

    const internStart = valueFor("internStart");
    const internEnd = valueFor("internEnd");
    const internDays = valueFor("internDays");
    const deadline = valueFor("deadline");
    const rawEventDate = valueFor("eventDate");
    const officialUrl = valueFor("officialUrl");
    const genericUrl = valueFor("genericUrl");
    const logoUrl = valueFor("logoUrl");
    const mypageUrl = valueFor("mypageUrl");
    const normalizedInternStart = normalizeDate(internStart);
    const normalizedInternEnd = normalizeDate(internEnd);
    const normalizedInternDays = normalizeInternDays(internDays);
    const normalizedDeadline = normalizeDate(deadline);
    const normalizedEventDate = normalizeDate(rawEventDate);
    const normalizedOfficialUrl = normalizeHttpUrl(officialUrl);
    const normalizedGenericUrl = normalizeHttpUrl(genericUrl);
    const normalizedLogoUrl = normalizeHttpUrl(logoUrl);
    const normalizedMypageUrl = normalizeHttpUrl(mypageUrl);
    const hasInternValues = Boolean(normalizedInternStart || normalizedInternEnd || normalizedInternDays);
    const internSchedule = hasInternValues
      ? `インターン日程: ${[
          normalizedInternStart || "開始日未入力",
          normalizedInternEnd ? `〜${normalizedInternEnd}` : "",
          normalizedInternDays ? `（${normalizedInternDays}）` : ""
        ].join("")}`
      : "";
    const selectionFormat = cleanSingleLine(valueFor("selectionFormat"), 120);
    const extraMemo = [
      internSchedule,
      selectionFormat ? `選考形式: ${selectionFormat}` : ""
    ].filter(Boolean);
    const explicitTrack = valueFor("trackType");
    const normalizedExplicitTrack = normalizeRecognizedTrackType(explicitTrack);
    const rawStatus = valueFor("status");
    const normalizedStatus = normalizeRecognizedStatus(rawStatus);
    const genericUrlIsMypage = normalizedGenericUrl && isLikelyMypageUrl(normalizedGenericUrl);
    const resolvedOfficialUrl = normalizedOfficialUrl || (!genericUrlIsMypage ? normalizedGenericUrl : "");
    const resolvedMypageUrl = normalizedMypageUrl || (genericUrlIsMypage ? normalizedGenericUrl : "");
    const eventDate = normalizedInternStart || normalizedEventDate;
    const eventType = normalizedInternStart ? "インターン" : normalizeEventType(valueFor("eventType"));
    const unsafeUrlFields = [
      officialUrl && !normalizedOfficialUrl ? "officialUrl" : "",
      genericUrl && !normalizedGenericUrl ? "genericUrl" : "",
      logoUrl && !normalizedLogoUrl ? "logoUrl" : "",
      mypageUrl && !normalizedMypageUrl ? "mypageUrl" : ""
    ].filter(Boolean);
    const invalidValueFields = [
      deadline && !normalizedDeadline ? "deadline" : "",
      internStart && !normalizedInternStart ? "internStart" : "",
      internEnd && !normalizedInternEnd ? "internEnd" : "",
      internDays && !normalizedInternDays ? "internDays" : "",
      rawEventDate && !normalizedEventDate ? "eventDate" : "",
      rawStatus && !normalizedStatus ? "status" : ""
    ].filter(Boolean);
    const rawEsContent = cleanText(valueFor("esContent"), 6000);
    const rawInterviewNotes = cleanText(valueFor("interviewNotes"), 6000);
    const rawMemo = cleanText(joinUnique([valueFor("memo"), ...extraMemo]), 6000);
    const rawCompanyName = cleanSingleLine(valueFor("companyName"), 120);
    const rawIndustry = cleanSingleLine(valueFor("industry"), 120);
    const rawMypageId = cleanSingleLine(valueFor("mypageId"), 240);
    const maskedEsContent = maskImportedSecrets(rawEsContent, 6000);
    const maskedInterviewNotes = maskImportedSecrets(rawInterviewNotes, 6000);
    const maskedMemo = maskImportedSecrets(rawMemo, 6000);
    const maskedCompanyName = cleanSingleLine(maskImportedSecrets(rawCompanyName, 120), 120);
    const maskedIndustry = cleanSingleLine(maskImportedSecrets(rawIndustry, 120), 120);
    const maskedMypageIdValue = cleanSingleLine(maskImportedSecrets(rawMypageId, 240), 240);
    const maskedMypageId = rawMypageId === maskedMypageIdValue ? rawMypageId : "";
    const maskedSecretFields = [
      rawCompanyName !== maskedCompanyName ? "companyName" : "",
      rawIndustry !== maskedIndustry ? "industry" : "",
      rawMypageId !== maskedMypageIdValue ? "mypageId" : "",
      rawEsContent !== maskedEsContent ? "esContent" : "",
      rawInterviewNotes !== maskedInterviewNotes ? "interviewNotes" : "",
      rawMemo !== maskedMemo ? "memo" : ""
    ].filter(Boolean);

    return {
      companyName: maskedCompanyName,
      industry: maskedIndustry,
      mypageId: maskedMypageId,
      officialUrl: resolvedOfficialUrl,
      logoUrl: normalizedLogoUrl,
      trackType: context.hasExplicitTrackColumn && explicitTrack
        ? normalizedExplicitTrack
        : hasInternValues ? "インターン" : normalizeTrackType(explicitTrack),
      status: normalizedStatus,
      deadline: normalizedDeadline,
      eventDate,
      eventType,
      priority: valueFor("priority") ? normalizePriority(valueFor("priority")) : "",
      mypageUrl: resolvedMypageUrl,
      esContent: maskedEsContent,
      esItems: [],
      interviewNotes: maskedInterviewNotes,
      memo: maskedMemo,
      _unrecognizedTrack: Boolean(context.hasExplicitTrackColumn && explicitTrack && !normalizedExplicitTrack),
      _unsafeUrlFields: unsafeUrlFields,
      _invalidValueFields: invalidValueFields,
      _maskedSecretFields: maskedSecretFields
    };
  }

  function fieldLimit(field) {
    if (["esContent", "interviewNotes", "memo"].includes(field)) return 6000;
    if (["officialUrl", "genericUrl", "logoUrl", "mypageUrl"].includes(field)) return 2048;
    if (field === "mypageId") return 240;
    return 120;
  }

  function cleanText(value, maxLength) {
    const text = String(value == null ? "" : value)
      .replace(/\r\n?/gu, "\n")
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu, "")
      .replace(/[\u200B-\u200D\u2060\u202A-\u202E\u2066-\u2069]/gu, "")
      .normalize("NFC")
      .trim();
    return Array.from(text).slice(0, maxLength).join("");
  }

  function cleanSingleLine(value, maxLength) {
    return cleanText(value, maxLength).replace(/\s*\n\s*/gu, " ").trim();
  }

  function joinUnique(values) {
    const seen = new Set();
    return values.filter((value) => {
      const key = normalizeExactKey(value);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    }).join("\n");
  }

  function maskImportedSecrets(value, maxLength = 6000) {
    return cleanText(value, maxLength)
      .replace(
        /-----BEGIN [^-\r\n]{0,40}PRIVATE KEY-----[\s\S]*?(?:-----END [^-\r\n]{0,40}PRIVATE KEY-----|$)/giu,
        "[秘密鍵を非表示]"
      )
      .replace(/https?:\/\/[^\s<>{}\[\]"']+/giu, (candidate) => {
        try {
          return urlHasSensitiveMaterial(new URL(candidate)) ? "[認証情報を含むURLを非表示]" : candidate;
        } catch {
          return candidate;
        }
      })
      .replace(/(?<![@A-Z0-9._-])(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})(?::\d{1,5})?(?:\/|\?)[^\s<>{}\[\]"']*/giu, (candidate) => {
        try {
          return urlHasSensitiveMaterial(new URL(`https://${candidate}`)) ? "[認証情報を含むURLを非表示]" : candidate;
        } catch {
          return candidate;
        }
      })
      .replace(
        /((?:パスワード|password|passcode|passwd|pwd|暗証番号|\bPW\b|合言葉|passphrase|秘密鍵)(?:\s*(?:[：:=]|は|\bis\b)\s*|\s+))([^\r\n;；]+)/giu,
        (_match, label) => `${label}[パスワードを非表示]`
      )
      .replace(
        /((?:認証コード|確認コード|アクセスキー|API\s*キー|API\s*key|secret|token)\s*[：:=]\s*)([^\s,、;；]+)/giu,
        (_match, label) => `${label}[識別コードを非表示]`
      )
      .replace(
        /((?:authorization\s*[:=]\s*)?(?:bearer|basic)\s+)([^\s,、;；]+)/giu,
        (_match, label) => `${label}[認証トークンを非表示]`
      )
      .replace(/\b(?:eyJ[A-Za-z0-9_-]+\.){2}[A-Za-z0-9_-]+\b/gu, "[認証トークンを非表示]")
      .replace(/\b(?:sk|ghp|github_pat|xox[baprs])[-_][A-Z0-9_-]{12,}\b/giu, "[識別コードを非表示]");
  }

  function normalizeHttpUrl(value) {
    const text = cleanSingleLine(value, 2048).normalize("NFKC");
    if (!text) return "";
    try {
      const inferredHttps = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})(?::\d{1,5})?(?:[/?].*)?$/iu.test(text);
      const url = new URL(inferredHttps ? `https://${text}` : text);
      if (!["http:", "https:"].includes(url.protocol) || urlHasSensitiveMaterial(url)) return "";
      return url.href;
    } catch {
      return "";
    }
  }

  function urlHasSensitiveMaterial(url) {
    if (url.username || url.password || url.hash) return true;
    const hasSecretQuery = [...url.searchParams.keys()].some((key) => {
      const normalized = normalizeHeaderKey(key);
      return /^(?:password|passwd|pwd|pass|pw|token|accesstoken|refreshtoken|idtoken|apikey|key|secret|clientsecret|credential|credentials|session|sessionid|auth|authorization|code|jwt|signature|sig|ticket|sso|magic|magiclink|invite|invitation|reset|resetpassword|verify|verification|nonce|state|oauth|relaystate|samlrequest|samlresponse|xamzsignature|xgoogsignature)$/iu.test(normalized);
    });
    const hasOpaqueQueryValue = [...url.searchParams.values()].some((queryValue) => (
      /^(?:eyJ[A-Za-z0-9_-]+\.){2}[A-Za-z0-9_-]+$/u.test(queryValue)
      || (/^[A-Za-z0-9._~-]{48,}$/u.test(queryValue) && /[A-Za-z]/u.test(queryValue) && /\d/u.test(queryValue))
    ));
    let decodedPath = url.pathname;
    try {
      decodedPath = decodeURIComponent(url.pathname);
    } catch {
      return true;
    }
    const hasSecretPath = /\/(?:magic(?:-?link)?|invite|invitation|reset(?:-?password)?|verify|verification|token|session|sso)\/[A-Za-z0-9._~-]{8,}(?:\/|$)/iu.test(decodedPath);
    return hasSecretQuery || hasOpaqueQueryValue || hasSecretPath;
  }

  function isLikelyMypageUrl(value) {
    try {
      const url = new URL(value);
      const hostname = url.hostname.toLowerCase();
      let pathname = url.pathname.toLowerCase();
      try {
        pathname = decodeURIComponent(pathname);
      } catch {
        return false;
      }
      return /(?:^|\.)(?:snar\.jp|axol\.jp|i-web\.jpn\.com)$/iu.test(hostname)
        || /(?:^|[.-])mypage(?:[.-]|$)/iu.test(hostname)
        || /\/(?:mypage|applicant|candidate|login|portal|entry)(?:\/|$)/iu.test(pathname);
    } catch {
      return false;
    }
  }

  function normalizeDate(value) {
    const text = cleanSingleLine(value, 40).normalize("NFKC");
    if (!text) return "";
    const match = text.match(/^(\d{4})\s*(?:[-/.]|年)\s*(\d{1,2})\s*(?:[-/.]|月)\s*(\d{1,2})\s*日?(?:[T\s].*)?$/u);
    if (!match) return "";
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return "";
    return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  function normalizeInternDays(value) {
    const text = cleanSingleLine(value, 40).normalize("NFKC");
    if (!text) return "";
    if (text === "半日") return text;
    const match = text.match(/^(\d{1,3})\s*(?:日|days?)?$/iu);
    if (!match) return "";
    const days = Number(match[1]);
    return days >= 1 && days <= 366 ? `${days}日` : "";
  }

  function normalizeRecognizedTrackType(value) {
    const text = cleanSingleLine(value, 120).normalize("NFKC");
    if (trackTypes.includes(text)) return text;
    if (/ob\s*\/\s*og/iu.test(text)) return "OB/OG訪問";
    if (/早期/u.test(text)) return "早期選考";
    if (/(?:夏(?:季)?|サマー|summer)\s*(?:の)?\s*(?:インターン|intern)/iu.test(text)) return "夏インターン";
    if (/(?:冬(?:季)?|ウィンター|winter)\s*(?:の)?\s*(?:インターン|intern)/iu.test(text)) return "冬インターン";
    if (/インターン|intern/iu.test(text)) return "インターン";
    if (/説明会|セミナー/u.test(text)) return "説明会";
    if (/面談/u.test(text)) return "面談";
    if (/^(?:本選考|通常選考|新卒(?:採用|選考)?|選考)$/u.test(text)) return "本選考";
    return "";
  }

  function normalizeTrackType(value) {
    return normalizeRecognizedTrackType(value) || "本選考";
  }

  function normalizeRecognizedStatus(value) {
    const text = cleanSingleLine(value, 120).normalize("NFKC");
    if (statuses.includes(text)) return text;
    const compact = text.replace(/\s+/gu, "").toLowerCase();
    const statusAliases = {
      検討中: "気になる",
      未応募: "応募予定",
      エントリー済み: "応募済み",
      es済み: "ES提出済み",
      提出済み: "ES提出済み",
      es提出: "ES提出済み",
      内々定: "内定",
      不合格: "落選",
      rejected: "落選",
      offer: "内定"
    };
    return statusAliases[compact] || "";
  }

  function normalizeStatus(value) {
    return normalizeRecognizedStatus(value) || "気になる";
  }

  function normalizeEventType(value) {
    const text = cleanSingleLine(value, 120).normalize("NFKC");
    if (eventTypes.includes(text)) return text;
    if (/web\s*テスト|適性検査/iu.test(text)) return "Webテスト";
    if (/es|エントリーシート/iu.test(text)) return "ES締切";
    if (/面接/u.test(text)) return "面接";
    if (/説明会|セミナー/u.test(text)) return "説明会";
    if (/面談/u.test(text)) return "面談";
    if (/インターン/u.test(text)) return "インターン";
    return text ? "その他" : "";
  }

  function normalizePriority(value) {
    const text = cleanSingleLine(value, 120).normalize("NFKC");
    if (priorities.includes(text)) return text;
    if (/^(?:高い?|第一志望|1|a)$/iu.test(text)) return "高";
    if (/^(?:中|普通|2|b)$/iu.test(text)) return "中";
    if (/^(?:低い?|3|c)$/iu.test(text)) return "低";
    return "未定";
  }

  function toSafeAiRecord(card) {
    if (!card?.companyName) return "";
    const safe = {
      companyName: redactAiNarrative(cleanSingleLine(card.companyName, 120)),
      industry: redactAiNarrative(cleanSingleLine(card.industry, 120)),
      trackType: normalizeTrackType(card.trackType),
      status: normalizeStatus(card.status),
      deadline: normalizeDate(card.deadline),
      eventDate: normalizeDate(card.eventDate),
      eventType: normalizeEventType(card.eventType),
      priority: normalizePriority(card.priority)
    };
    const interviewNotes = redactAiNarrative(card.interviewNotes);
    const memo = redactAiNarrative(card.memo);
    if (interviewNotes) safe.interviewNotes = interviewNotes;
    if (memo) safe.memo = memo;
    Object.keys(safe).forEach((key) => {
      if (safe[key] === "") delete safe[key];
    });
    return JSON.stringify(safe);
  }

  function redactAiNarrative(value) {
    return maskImportedSecrets(value, 6000)
      .replace(/(?:ES\s*(?:リンク|URL)|(?:マイページ\s*|ログイン\s*)?(?:ID|URL))\s*[：:]\s*[^\s,，;；]+/giu, "[非表示]")
      .replace(/(?:https?|ftp):\/\/[^\s<>{}\[\]"']+/giu, "[URL非表示]")
      .replace(/\bwww\.[^\s<>{}\[\]"']+/giu, "[URL非表示]")
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu, "[メール非表示]")
      .replace(/(?:\+?81[-\s]?)?(?:0\d{1,4}[-\s]?\d{1,4}[-\s]?\d{3,4})/gu, "[電話番号非表示]")
      .trim();
  }

  function normalizeExactKey(value) {
    return String(value || "").normalize("NFKC").toLowerCase().replace(/\s+/gu, "").trim();
  }

  function cardIdentityKey(card) {
    const company = normalizeExactKey(card?.companyName);
    if (!company) return "";
    return `${company}\u0000${normalizeTrackType(card?.trackType)}`;
  }

  function mergeDuplicateRows(rowCards) {
    const cards = [];
    const indexes = new Map();
    const duplicateRows = [];
    const mergeConflicts = [];

    rowCards.forEach(({ card, rowNumber }) => {
      const identityKey = cardIdentityKey(card);
      if (!identityKey || !indexes.has(identityKey)) {
        if (identityKey) indexes.set(identityKey, cards.length);
        cards.push({ ...card, esItems: cloneValue(card.esItems) });
        return;
      }

      const target = cards[indexes.get(identityKey)];
      duplicateRows.push({ rowNumber, companyName: card.companyName, trackType: card.trackType });
      mergeCardValues(target, card, rowNumber, mergeConflicts);
    });
    return { cards, duplicateRows, mergeConflicts };
  }

  function mergeCardValues(target, incoming, rowNumber, conflicts) {
    cardFields.forEach((field) => {
      if (["companyName", "trackType"].includes(field) || isMissing(incoming[field])) return;
      if (narrativeFields.has(field)) {
        target[field] = mergeUniqueNarrative(target[field], incoming[field], fieldLimit(field));
        return;
      }
      if (isMissing(target[field])) {
        target[field] = cloneValue(incoming[field]);
        return;
      }
      if (normalizeComparable(target[field]) !== normalizeComparable(incoming[field])) {
        conflicts.push({
          rowNumber,
          companyName: target.companyName,
          trackType: target.trackType,
          field,
          existingValue: target[field],
          incomingValue: incoming[field]
        });
      }
    });
    if (isMissing(target.esItems) && !isMissing(incoming.esItems)) target.esItems = cloneValue(incoming.esItems);
  }

  function normalizeComparable(value) {
    if (typeof value === "string") return value.normalize("NFKC").trim().toLowerCase();
    return JSON.stringify(value);
  }

  function mergeUniqueNarrative(first, second, maxLength) {
    const parts = [first, second]
      .flatMap((value) => String(value || "").split(/\n+/u))
      .map((value) => value.trim())
      .filter(Boolean);
    return cleanText(joinUnique(parts), maxLength);
  }

  function mergeMissingOnly(baseCard = {}, incomingCard = {}) {
    const merged = { ...baseCard };
    cardFields.forEach((field) => {
      if (isMissing(merged[field]) && !isMissing(incomingCard[field])) merged[field] = cloneValue(incomingCard[field]);
    });
    if (isMissing(merged.esItems) && !isMissing(incomingCard.esItems)) merged.esItems = cloneValue(incomingCard.esItems);
    return merged;
  }

  function isMissing(value) {
    if (value == null) return true;
    if (typeof value === "string") return !value.trim();
    if (Array.isArray(value)) return value.length === 0;
    return false;
  }

  function cloneValue(value) {
    if (Array.isArray(value)) return value.map((item) => (item && typeof item === "object" ? { ...item } : item));
    return value;
  }

  function mergeUniqueOnly(existingCards = [], incomingCards = []) {
    const cards = Array.isArray(existingCards) ? existingCards.map((card) => ({ ...card })) : [];
    const keys = new Set(cards.map(cardIdentityKey).filter(Boolean));
    const added = [];
    const duplicates = [];

    (Array.isArray(incomingCards) ? incomingCards : []).forEach((card) => {
      const key = cardIdentityKey(card);
      if (!key || keys.has(key)) {
        duplicates.push(card);
        return;
      }
      keys.add(key);
      const copy = { ...card };
      cards.push(copy);
      added.push(copy);
    });
    return { cards, added, duplicates };
  }

  return Object.freeze({
    CsvImportError,
    delimiters: [...delimiters],
    stripBom,
    detectDelimiter,
    looksLikeCsv,
    parseDelimited,
    parseCsv: parseDelimited,
    importCsv,
    importCsvCards: importCsv,
    normalizeHeaderKey,
    normalizeDate,
    normalizeHttpUrl,
    normalizeTrackType,
    cardIdentityKey,
    mergeMissingOnly,
    mergeUniqueOnly,
    toSafeAiRecord
  });
});
