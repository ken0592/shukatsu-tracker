(function (global) {
  "use strict";

  const templateMergeFields = Object.freeze([
    Object.freeze({ key: "kind", label: "型の種類" }),
    Object.freeze({ key: "title", label: "タイトル" }),
    Object.freeze({ key: "body", label: "本文", type: "long" }),
    Object.freeze({ key: "sortOrder", label: "並び順", type: "order" })
  ]);

  function fieldEquals(field, left, right) {
    if (field.key === "sortOrder") {
      const leftOrder = Number.isFinite(left) ? left : null;
      const rightOrder = Number.isFinite(right) ? right : null;
      return leftOrder === rightOrder;
    }
    return String(left ?? "") === String(right ?? "");
  }

  // Callers supply normalized records and keep the fetched latest timestamp for CAS.
  // A missing latest record is a deletion; it must never become an implicit insert.
  function mergeTemplateVersions(base, draft, latest) {
    for (const record of [base, draft, latest]) {
      if (!record || typeof record !== "object" || Array.isArray(record)) {
        throw new TypeError("ESの型の3つのバージョンが必要です。");
      }
    }
    if (base.id !== draft.id || base.id !== latest.id) {
      throw new TypeError("異なるESの型は統合できません。");
    }

    const template = { ...latest };
    const conflicts = [];
    for (const field of templateMergeFields) {
      const draftChanged = !fieldEquals(field, draft[field.key], base[field.key]);
      const latestChanged = !fieldEquals(field, latest[field.key], base[field.key]);
      if (draftChanged && latestChanged && !fieldEquals(field, draft[field.key], latest[field.key])) {
        conflicts.push(field);
      } else if (draftChanged) {
        template[field.key] = draft[field.key];
      }
    }
    return { template, conflicts };
  }

  const api = Object.freeze({ templateMergeFields, mergeTemplateVersions });
  global.SHUKATSU_TEMPLATE_CONFLICTS = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
