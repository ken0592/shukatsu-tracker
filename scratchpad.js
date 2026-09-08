(function (global) {
  "use strict";
  const prefix = "shukatsu-tracker-scratchpad:";
  function keyFor(scope) {
    if (typeof scope !== "string" || !scope) throw new Error("Missing note owner");
    return prefix + scope;
  }
  function createStore(getStorage, locks) {
    function read(scope) {
      try {
        const raw = getStorage().getItem(keyFor(scope));
        if (raw === null) return { ok: true, raw, text: "" };
        const data = JSON.parse(raw);
        if (data?.version !== 1 || typeof data.text !== "string") throw new Error("Invalid note");
        return { ok: true, raw, text: data.text };
      } catch { return { ok: false, reason: "read" }; }
    }
    async function save(scope, text, expectedRaw) {
      const write = () => {
        const previous = read(scope);
        if (!previous.ok) return previous;
        if (previous.raw !== expectedRaw) return { ok: false, reason: "conflict" };
        try {
          const raw = JSON.stringify({ version: 1, text, updatedAt: new Date().toISOString() });
          getStorage().setItem(keyFor(scope), raw);
          return { ok: true, raw, text };
        } catch { return { ok: false, reason: "write" }; }
      };
      try {
        return locks ? await locks.request(keyFor(scope), write) : write();
      } catch { return { ok: false, reason: "write" }; }
    }
    return { read, save };
  }

  function mount() {
    const doc = global.document;
    const openButton = doc.querySelector("#openScratchpadButton");
    const panel = doc.querySelector("#scratchpadPanel");
    const input = doc.querySelector("#scratchpadInput");
    const status = doc.querySelector("#scratchpadStatus");
    const error = doc.querySelector("#scratchpadError");
    const retryButton = doc.querySelector("#retryScratchpadButton");
    const mergeButton = doc.querySelector("#mergeScratchpadButton");
    const store = createStore(() => global.localStorage, global.navigator.locks);
    const notes = new Map();
    let current = null;

    function paint(note) {
      if (note !== current || !note) return;
      input.readOnly = !note.loaded;
      panel.dataset.saveState = note.error || (note.dirty || note.busy ? "saving" : "saved");
      status.textContent = note.dirty || note.busy ? "保存中…" : "この端末に保存済み";
      if (note.error) status.textContent = "未保存";
      error.textContent = note.error === "conflict"
        ? "別の画面で更新されました。「両方を残す」でまとめて保存できます。"
        : note.error ? "保存先を読み書きできません。書いた内容はコピーやTXT保存で残せます。" : "";
      error.hidden = !note.error;
      retryButton.hidden = !note.error || note.error === "conflict";
      mergeButton.hidden = note.error !== "conflict";
    }
    function load(note) {
      const result = store.read(note.scope);
      if (result.ok) {
        Object.assign(note, { raw: result.raw, text: result.text, loaded: true, dirty: false, error: "" });
        if (note === current && input.value !== note.text) input.value = note.text;
      } else note.error = result.reason;
      paint(note);
    }
    async function save(note) {
      if (!note?.loaded || note.busy) return;
      note.busy = true;
      note.error = "";
      paint(note);
      try {
        while (note.dirty) {
          const text = note.text;
          const result = await store.save(note.scope, text, note.raw);
          if (!result.ok) { note.error = result.reason; break; }
          note.raw = result.raw;
          note.dirty = note.text !== text;
        }
      } finally { note.busy = false; paint(note); }
    }
    function close(restoreFocus = true) {
      panel.hidden = true;
      openButton.setAttribute("aria-expanded", "false");
      if (restoreFocus) openButton.focus();
    }
    function open() {
      if (!current) return;
      if (!current.dirty && !current.busy) load(current);
      panel.hidden = false;
      openButton.setAttribute("aria-expanded", "true");
      input.focus();
    }
    function setScope(scope) {
      if (scope === current?.scope) return;
      close(false);
      input.value = "";
      current = null;
      openButton.disabled = !scope;
      if (!scope) return;
      if (!notes.has(scope)) notes.set(scope, { scope, text: "", raw: null, loaded: false, dirty: false, busy: false, error: "" });
      current = notes.get(scope);
      if (!current.dirty && !current.busy) load(current);
      input.value = current.text;
      paint(current);
    }
    openButton.addEventListener("click", () => panel.hidden ? open() : close());
    doc.querySelector("#closeScratchpadButton").addEventListener("click", () => close());
    panel.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !event.isComposing) { event.preventDefault(); event.stopPropagation(); close(); }
    });
    input.addEventListener("input", () => {
      if (!current?.loaded) return;
      current.text = input.value;
      current.dirty = true;
      void save(current);
    });
    retryButton.addEventListener("click", () => {
      if (!current) return;
      if (!current.loaded) load(current);
      else void save(current);
    });
    mergeButton.addEventListener("click", () => {
      const note = current;
      if (!note || note.busy) return;
      const latest = store.read(note.scope);
      if (!latest.ok) { note.error = latest.reason; paint(note); return; }
      if (latest.text !== note.text && latest.text) {
        note.text = note.text ? latest.text + "\n\n―― この画面のメモ ――\n" + note.text : latest.text;
      }
      note.raw = latest.raw;
      note.dirty = true;
      input.value = note.text;
      void save(note);
    });
    doc.querySelector("#copyScratchpadButton").addEventListener("click", async () => {
      const note = current;
      if (!note) return;
      try {
        await global.navigator.clipboard.writeText(note.text);
        if (current === note) status.textContent = "コピーしました";
      } catch {
        if (current === note) { input.focus(); input.select(); status.textContent = "文字を選択しました。コピーしてください"; }
      }
    });
    doc.querySelector("#downloadScratchpadButton").addEventListener("click", () => {
      if (!current) return;
      const url = global.URL.createObjectURL(new Blob(["\uFEFF", current.text], { type: "text/plain;charset=utf-8" }));
      const link = doc.createElement("a");
      link.href = url;
      link.download = "自由メモ.txt";
      link.click();
      global.setTimeout(() => global.URL.revokeObjectURL(url), 1000);
    });
    global.addEventListener("storage", (event) => {
      for (const note of notes.values()) {
        if (event.key !== null && event.key !== keyFor(note.scope)) continue;
        if (note.dirty || note.busy) continue;
        if (note === current && doc.activeElement === input) {
          const latest = store.read(note.scope);
          if (latest.ok && latest.raw === note.raw) continue;
          note.dirty = true;
          note.error = "conflict";
          paint(note);
        } else load(note);
      }
    });
    global.addEventListener("beforeunload", (event) => {
      if ([...notes.values()].some(note => note.dirty || note.busy)) {
        event.preventDefault();
        event.returnValue = "";
      }
    });
    return { setScope };
  }
  const api = { createStore, keyFor, mount };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.SHUKATSU_SCRATCHPAD = api;
})(typeof window !== "undefined" ? window : globalThis);
