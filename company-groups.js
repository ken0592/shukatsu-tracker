(function (global) {
  "use strict";
  const tracks = ["夏インターン", "冬インターン", "早期選考", "本選考"];
  function key(entry) {
    return String(entry?.companyName || "").normalize("NFKC").toLowerCase().replace(/[\s　]+/gu, "");
  }
  function group(entries) {
    const groups = new Map();
    for (const entry of entries) {
      const identity = key(entry) || `id:${entry.id}`;
      if (!groups.has(identity)) groups.set(identity, { key: identity, companyName: entry.companyName, entries: [] });
      groups.get(identity).entries.push(entry);
    }
    return [...groups.values()];
  }
  function branches(entries, source) {
    return entries.filter((entry) => !entry.deletedAt && key(entry) === key(source))
      .sort((a, b) => (tracks.indexOf(a.trackType) < 0 ? 9 : tracks.indexOf(a.trackType))
        - (tracks.indexOf(b.trackType) < 0 ? 9 : tracks.indexOf(b.trackType)));
  }
  function restorableBranches(entries, source) {
    return entries.filter(entry => entry.deletedAt && key(entry) === key(source)
      && !entries.some(other => !other.deletedAt && key(other) === key(source) && other.trackType === entry.trackType));
  }
  function availableTracks(entries, source) {
    // Trashed selections still occupy the database's unique company/type key.
    const occupied = new Set(entries.filter((entry) => key(entry) === key(source)).map((entry) => entry.trackType));
    return tracks.filter((track) => !occupied.has(track));
  }
  function branchDraft(source, track, id, now) {
    if (!tracks.includes(track)) return null;
    return { id, companyName: source.companyName, industry: source.industry, officialUrl: source.officialUrl,
      logoUrl: source.logoUrl, mypageUrl: source.mypageUrl, mypageId: source.mypageId, priority: source.priority,
      trackType: track, status: "応募予定", esItems: [], esContent: "", interviewNotes: "", memo: "",
      deadline: "", eventDate: "", eventType: "", createdAt: now, updatedAt: now, deletedAt: "" };
  }
  function canMoveToSummer(entries, source) {
    return source && !source.deletedAt && source.trackType === "インターン"
      && !entries.some((entry) => entry.id !== source.id && key(entry) === key(source) && entry.trackType === "夏インターン");
  }
  const api = { tracks, key, group, branches, restorableBranches, availableTracks, branchDraft, canMoveToSummer };
  global.SHUKATSU_GROUPS = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
