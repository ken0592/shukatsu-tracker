(function (global) {
  "use strict";

  const legacyPrefix = "shukatsu-tracker-company-pin:";

  function createStore({ storage = global.localStorage, read, seed, write, onChange = () => {}, onError = () => {}, keyOf } = {}) {
    let scope = null;
    let pins = new Map();
    let pending = new Map();
    let toggleFlights = new Set();
    let loaded = false;
    let refreshing = false;
    let revision = 0;
    let refreshPromise = null;
    let refreshScope = null;
    let lastRefreshError = "";

    function companyKey(entry) {
      return String((keyOf ? keyOf(entry) : entry?.companyName?.normalize?.("NFKC")?.toLowerCase().replace(/[\s　]+/gu, "")) || entry?.id || "");
    }
    function legacyKey(owner, key) {
      return legacyPrefix + JSON.stringify([owner, key]);
    }
    function getStorage() {
      try { return typeof storage === "function" ? storage() : storage; } catch { return null; }
    }
    function current(token) { return scope === token; }
    function report(error) {
      try { onError(error); } catch { /* error reporting must not break storage */ }
    }
    function changed() {
      try { onChange({ loaded, refreshing, pending: new Set([...pending.keys(), ...toggleFlights]) }); } catch (error) { report(error); }
    }
    function legacyPinned(owner, key) {
      try { return getStorage()?.getItem(legacyKey(owner, key)) === "1"; } catch { return false; }
    }
    function isPinned(key) {
      if (!pins.has(key) && !loaded && scope?.userId && legacyPinned(scope.userId, key)) return true;
      return pins.get(key) === true;
    }
    function setScope(userId, version) {
      if (scope && scope.userId === userId && scope.version === version) return;
      scope = userId ? { userId, version, identity: {} } : null;
      pins = new Map();
      pending = new Map();
      toggleFlights = new Set();
      loaded = false;
      refreshing = false;
      revision++;
      refreshPromise = null;
      refreshScope = null;
      lastRefreshError = "";
      changed();
    }
    async function refresh(entries = []) {
      const token = scope;
      if (!token || typeof read !== "function" || typeof seed !== "function") return false;
      if (refreshPromise && refreshScope === token) return refreshPromise;
      if (pending.size) return false;
      const startedAtRevision = revision;
      const wasLoadedAtStart = loaded;
      refreshing = true;
      if (!wasLoadedAtStart) changed();
      const task = (async () => {
        const wasLoaded = loaded;
        try {
          let rows = await read(token.userId);
          if (!current(token) || revision !== startedAtRevision) return false;
          const existing = new Map((rows || []).map(row => [row.company_key, Boolean(row.pinned)]));
          const legacy = new Map();
          for (const entry of entries || []) {
            if (!entry) continue;
            const key = companyKey(entry);
            if (key && legacyPinned(token.userId, key)) legacy.set(key, { key, entry });
          }
          const toSeed = [...legacy.values()].filter(item => !existing.has(item.key)).map(item => ({ company_key: item.key, pinned: true }));
          if (toSeed.length) {
            await seed(toSeed.map(row => ({ ...row, user_id: token.userId })));
            if (!current(token) || revision !== startedAtRevision) return false;
            rows = await read(token.userId);
            if (!current(token) || revision !== startedAtRevision) return false;
          }
          const nextPins = new Map((rows || []).map(row => [row.company_key, Boolean(row.pinned)]));
          if (!current(token) || revision !== startedAtRevision) return false;
          const changedValues = !samePins(pins, nextPins);
          pins = nextPins;
          loaded = true;
          lastRefreshError = "";
          for (const { key } of legacy.values()) {
            if (!nextPins.has(key)) continue;
            try { getStorage()?.removeItem(legacyKey(token.userId, key)); } catch { /* cloud remains authoritative */ }
          }
          if (!wasLoaded || changedValues) changed();
          return true;
        } catch (error) {
          if (current(token)) {
            loaded = wasLoaded;
            const signature = String(error?.message || error);
            if (signature !== lastRefreshError) { lastRefreshError = signature; report(error); }
          }
          return false;
        }
      })();
      refreshPromise = task;
      refreshScope = token;
      try { return await task; }
      finally {
        if (current(token)) {
          refreshing = false;
          if (!loaded) changed();
        }
        if (refreshPromise === task && refreshScope === token) {
          refreshPromise = null;
          refreshScope = null;
        }
      }
    }
    async function toggle(key, entries = []) {
      const token = scope;
      if (!token || !key || pending.has(key) || toggleFlights.has(key) || typeof write !== "function") return false;
      toggleFlights.add(key);
      changed();
      const operation = {};
      try {
        if (!loaded && !(await refresh(entries))) return false;
        if (!current(token) || !loaded || toggleFlights.has(key) === false) return false;
        const next = !isPinned(key);
        pending.set(key, operation);
        revision++;
        changed();
        const row = await write({ user_id: token.userId, company_key: key, pinned: next });
        if (!current(token) || pending.get(key) !== operation) return false;
        if (!row || row.company_key !== key || typeof row.pinned !== "boolean" || row.pinned !== next) {
          throw new Error("企業の固定状態を確認できませんでした。");
        }
        pins.set(key, row.pinned);
        changed();
        return true;
      } catch (error) {
        if (current(token) && pending.get(key) === operation) report(error);
        return false;
      } finally {
        if (current(token) && pending.get(key) === operation) {
          pending.delete(key);
          changed();
        }
        if (current(token) && toggleFlights.has(key)) {
          toggleFlights.delete(key);
          changed();
        }
      }
    }

    return { setScope, refresh, isPinned, isPending: key => Boolean(scope && !loaded && refreshing) || pending.has(key) || toggleFlights.has(key), toggle, companyKey };
  }

  function samePins(left, right) {
    if (left.size !== right.size) return false;
    for (const [key, value] of right) if (left.get(key) !== value) return false;
    return true;
  }

  const api = { createStore };
  global.SHUKATSU_PINS = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
