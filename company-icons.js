(function (global) {
  "use strict";
  const sharedRecruitingHosts = ["mynavi.jp", "rikunabi.com", "axol.jp", "i-web.jpn.com", "i-webs.jp", "e2r.jp", "snar.jp", "sonar-ats.jp", "hrmos.co", "jobcan.jp", "talent-p.net", "r-personal.com", "cloud-recruiting.net"];

  function companyKey(value) {
    return typeof value === "string" ? value.normalize("NFKC").toLowerCase()
      .replace(/株式会社|有限会社|合同会社|\(株\)|\(有\)/gu, "")
      .replace(/\b(?:incorporated|corporation|limited|co\.?\s*,?\s*ltd\.?|inc\.?|corp\.?)\b/giu, "")
      .replace(/[\s・.,，。()（）]+/gu, "") : "";
  }

  function publicSite(value) {
    if (typeof value !== "string") return "";
    try {
      const url = new URL(value);
      const host = url.hostname.toLowerCase();
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.port
        || !host.includes(".") || !/^[a-z0-9.-]+$/u.test(host) || host.includes("..")
        || /^(?:\d{1,3}\.){3}\d{1,3}$/u.test(host)
        || /(?:^|\.)(?:localhost|local|internal|home|lan|test|invalid)$/u.test(host)) return "";
      return `https://${host}/`;
    } catch { return ""; }
  }

  function domainHint(value) {
    const site = publicSite(value);
    if (!site) return "";
    const host = new URL(site).hostname.replace(/^www\./u, "");
    return sharedRecruitingHosts.some((shared) => host === shared || host.endsWith(`.${shared}`)) ? "" : host;
  }

  function matchesDomain(website, hint) {
    const host = domainHint(website);
    return Boolean(host && hint && (host === hint || hint.endsWith(`.${host}`) || host.endsWith(`.${hint}`)));
  }

  function recruitingTenant(value) {
    const site = publicSite(value);
    if (!site) return "";
    const url = new URL(value);
    const host = new URL(site).hostname;
    let slug = "";
    if (host === "hrmos.co") slug = url.pathname.match(/^\/pages\/([a-z0-9_-]+)(?:\/|$)/iu)?.[1] || "";
    if (host === "job.axol.jp") slug = url.pathname.match(/^\/[a-z]{1,4}\/[sc]\/([a-z0-9_-]+)(?:\/|$)/iu)?.[1] || "";
    slug = slug.replace(/[_-]\d{2,4}$/u, "").toLowerCase();
    return /^[a-z][a-z0-9-]{2,30}$/u.test(slug) ? slug : "";
  }

  function makeCandidates(entities, name, hint = "", tenant = "") {
    const key = companyKey(name);
    const candidates = [];
    for (const entity of Object.values(entities || {}).slice(0, 5)) {
      if (!entity || !/^Q\d+$/u.test(entity.id || "")) continue;
      const names = [entity.labels?.ja?.value, entity.labels?.en?.value,
        ...(entity.aliases?.ja || []).map((item) => item.value), ...(entity.aliases?.en || []).map((item) => item.value)].filter((item) => typeof item === "string");
      const description = String(entity.descriptions?.ja?.value || entity.descriptions?.en?.value || "");
      if (description && !/企業|会社|法人|メーカー|銀行|証券|信用|保険|出版|大学|学校|協会|機構|財団|研究所|機関|自治体|病院|company|corporation|manufacturer|bank|university|business|firm|agency|organization|institution|conglomerate|publisher|studio|retailer|cooperative|hospital/iu.test(description)) continue;
      const websites = (entity.claims?.P856 || []).filter((claim) => claim.rank !== "deprecated")
        .map((claim) => publicSite(claim.mainsnak?.datavalue?.value)).filter(Boolean);
      websites.sort((a, b) => Number(matchesDomain(b, hint)) - Number(matchesDomain(a, hint))
        || Number(new URL(b).hostname.endsWith(".jp")) - Number(new URL(a).hostname.endsWith(".jp")));
      const website = websites[0];
      if (!website || !domainHint(website)) continue;
      candidates.push({ id: entity.id, name: (names[0] || name).slice(0, 120),
        description: description.slice(0, 180),
        website, source: `https://www.wikidata.org/wiki/${entity.id}`,
        exact: Boolean(key && names.some((label) => companyKey(label) === key)),
        domainMatch: matchesDomain(website, hint) || Boolean(tenant && new URL(website).hostname.split(".").includes(tenant)) });
    }
    candidates.sort((a, b) => Number(b.domainMatch) - Number(a.domainMatch) || Number(b.exact) - Number(a.exact));
    const unique = candidates.filter((item, index) => candidates.findIndex((other) => other.website === item.website) === index).slice(0, 3);
    const matching = unique.filter((item) => item.exact || item.domainMatch);
    const strong = unique.filter((item) => item.exact && item.domainMatch);
    const automatic = strong.length === 1 ? strong[0] : matching.length === 1 && (!hint || matching[0].domainMatch) ? matching[0] : null;
    return { candidates: unique, automaticId: automatic?.id || "" };
  }

  function iconSources(website) {
    const site = publicSite(website);
    return site ? ["favicon.ico", "favicon.svg", "apple-touch-icon.png"].map((file) => site + file) : [];
  }

  async function lookupCandidates(entry, signal) {
    const name = entry.companyName.trim();
    const official = publicSite(entry.officialUrl);
    if (official) return { candidates: [{ id: "official", name, website: official, source: official, description: "登録した公式サイト" }], automaticId: "official" };
    const response = await fetch("/api/company-icons", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, hint: domainHint(entry.mypageUrl), tenant: recruitingTenant(entry.mypageUrl) }), signal });
    if (!response.ok) {
      const error = new Error(response.status === 429 ? "検索が混み合っています。少し待って再度お試しください。" : "今は検索できません。公式サイトURLを入れるか、あとで再度お試しください。");
      error.stopBatch = response.status === 429;
      throw error;
    }
    return response.json();
  }

  function probeIcon(url, signal) {
    return new Promise((resolve) => {
      if (signal.aborted) return resolve("");
      const img = new Image();
      const finish = (value) => {
        clearTimeout(timer); signal.removeEventListener("abort", abort);
        img.onload = img.onerror = null; img.removeAttribute("src"); resolve(value);
      };
      const abort = () => finish("");
      const timer = setTimeout(abort, 5000);
      signal.addEventListener("abort", abort, { once: true });
      img.referrerPolicy = "no-referrer";
      img.onload = () => finish(img.naturalWidth ? url : "");
      img.onerror = abort;
      img.src = url;
    });
  }

  async function findAutomaticIcon(entry, { signal }) {
    if (companyKey(entry.companyName).length < 2 || Array.from(entry.companyName).length > 120) return "";
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    const timer = setTimeout(abort, 30000);
    try {
      const result = await lookupCandidates(entry, controller.signal);
      const candidate = result.candidates?.find((item) => item.id === result.automaticId);
      for (const url of iconSources(candidate?.website)) {
        controller.signal.throwIfAborted();
        if (await probeIcon(url, controller.signal)) return url;
      }
      controller.signal.throwIfAborted();
      return "";
    } finally {
      clearTimeout(timer); signal.removeEventListener("abort", abort);
    }
  }

  function needsIcon(entry) { return Boolean(entry && !entry.deletedAt && !String(entry.logoUrl || "").trim()); }
  function iconSearchKey(entry) { return JSON.stringify([entry.companyName, entry.officialUrl || "", entry.mypageUrl || ""]); }

  async function fillMissingIcons({ entries, getEntry, save, signal, onProgress = () => {}, findIcon = findAutomaticIcon }) {
    const targets = entries.filter(needsIcon).map((entry) => ({ id: entry.id, key: iconSearchKey(entry) }));
    const progress = { total: targets.length, completed: 0, saved: 0, missing: 0, skipped: 0, failed: 0, currentName: "", stopped: false, reason: "" };
    const cache = new Map();
    for (const target of targets) {
      if (signal.aborted) break;
      const entry = getEntry(target.id);
      progress.currentName = entry?.companyName || "";
      onProgress({ ...progress });
      try {
        if (!needsIcon(entry) || iconSearchKey(entry) !== target.key) { progress.skipped++; continue; }
        let url = cache.get(target.key);
        if (url === undefined) {
          url = await findIcon(entry, { signal });
          if (signal.aborted) break;
          cache.set(target.key, url);
        }
        const latest = getEntry(target.id);
        if (!needsIcon(latest) || iconSearchKey(latest) !== target.key) { progress.skipped++; continue; }
        if (!url) progress.missing++;
        else if (await save(latest, url) === "saved") progress.saved++;
        else progress.skipped++;
      } catch (error) {
        if (signal.aborted) break;
        progress.failed++;
        if (error.stopBatch) { progress.stopped = true; progress.reason = error.message; break; }
      } finally {
        if (!signal.aborted) progress.completed++;
        onProgress({ ...progress });
      }
    }
    progress.stopped ||= signal.aborted;
    progress.currentName = "";
    onProgress({ ...progress });
    return progress;
  }

  function createPicker({ form, panel, button }) {
    const nameInput = form.elements.companyName;
    const mypageInput = form.elements.mypageUrl;
    const officialInput = form.elements.officialUrl;
    const logoInput = form.elements.logoUrl;
    let timer, controller, version = 0, automaticLogo = "";
    const cache = new Map();
    const signature = () => JSON.stringify([nameInput.value, mypageInput.value, officialInput.value]);
    const status = (text) => { panel.textContent = text; };
    function reset() {
      clearTimeout(timer); controller?.abort(); version++; automaticLogo = "";
      status(""); button.disabled = false;
    }
    function schedule() {
      clearTimeout(timer); controller?.abort(); version++;
      if (automaticLogo && logoInput.value === automaticLogo) logoInput.value = "";
      automaticLogo = "";
      status(""); button.disabled = false;
      if (logoInput.value.trim() || companyKey(nameInput.value).length < 2) return;
      timer = setTimeout(() => search(false), 800);
    }
    async function search(force = false) {
      clearTimeout(timer); controller?.abort();
      const requestId = ++version;
      const snapshot = signature();
      const originalLogo = logoInput.value;
      const current = () => version === requestId && snapshot === signature();
      const name = nameInput.value.trim();
      if (companyKey(name).length < 2 || Array.from(name).length > 120) { status("企業名を2〜120文字で入力してください。"); return; }
      if (!force && originalLogo) return;
      button.disabled = true;
      status("企業名とURLの手がかりからアイコンを探しています…");
      controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 18000);
      try {
        const official = publicSite(officialInput.value);
        const hint = domainHint(official || mypageInput.value);
        const tenant = recruitingTenant(mypageInput.value);
        const key = JSON.stringify([name, hint, official, tenant]);
        let result = cache.get(key);
        if (!result) {
          result = await lookupCandidates({ companyName: name, officialUrl: officialInput.value, mypageUrl: mypageInput.value }, controller.signal);
          if (!current()) return;
          if (cache.size >= 30) cache.delete(cache.keys().next().value);
          cache.set(key, result);
        }
        if (!current()) return;
        panel.textContent = "";
        const message = document.createElement("p");
        message.textContent = result.candidates?.length ? "画像を確認しています。候補が違う場合は公式サイトURLを入力してください。" : "候補が見つかりませんでした。公式サイトURLがあれば、そのサイトのアイコンを探せます。";
        panel.append(message);
        for (const candidate of (Array.isArray(result.candidates) ? result.candidates : []).slice(0, 3)) {
          const sources = iconSources(candidate.website);
          if (!sources.length) continue;
          const row = document.createElement("div"); row.className = "company-icon-candidate";
          const img = document.createElement("img"); img.alt = ""; img.referrerPolicy = "no-referrer"; img.width = 32; img.height = 32;
          const info = document.createElement("div");
          const title = document.createElement("strong"); title.textContent = candidate.name;
          const domain = document.createElement("span"); domain.textContent = new URL(sources[0]).hostname;
          const description = document.createElement("span"); description.textContent = candidate.description || "";
          info.append(title, domain, description);
          const choose = document.createElement("button"); choose.type = "button"; choose.className = "secondary-button small-button"; choose.textContent = "この候補を使う"; choose.disabled = true;
          const apply = () => {
            if (!current() || !img.naturalWidth) return;
            logoInput.value = img.src; automaticLogo = img.src;
            message.textContent = "アイコンを設定しました。このまま企業情報を保存してください。";
            row.dataset.selected = "true";
          };
          choose.addEventListener("click", apply);
          let index = 0;
          img.addEventListener("load", () => {
            if (!current()) return;
            choose.disabled = false;
            if (candidate.id === result.automaticId && !originalLogo && !logoInput.value) apply();
            else if (!automaticLogo) message.textContent = "企業名・ドメインを確認して候補を選んでください。";
          });
          img.addEventListener("error", () => {
            if (!current()) return;
            if (++index < sources.length) img.src = sources[index];
            else { img.hidden = true; choose.textContent = "画像なし"; if (!automaticLogo) message.textContent = "画像が見つからない候補は設定できません。画像URLの手動指定も使えます。"; }
          });
          row.append(img, info, choose); panel.append(row); img.src = sources[0];
        }
        if (result.candidates?.length && !official) {
          const source = document.createElement("a"); source.href = "https://www.wikidata.org/"; source.target = "_blank"; source.rel = "noopener noreferrer"; source.textContent = "企業情報: Wikidata"; panel.append(source);
        }
      } catch (error) {
        if (current()) status(error.name === "AbortError" ? "検索に時間がかかっています。あとで再度お試しください。" : error.message);
      } finally {
        clearTimeout(timeout); if (current()) button.disabled = false;
      }
    }
    for (const input of [nameInput, mypageInput, officialInput]) input.addEventListener("input", schedule);
    logoInput.addEventListener("input", () => { clearTimeout(timer); controller?.abort(); version++; automaticLogo = ""; status(""); button.disabled = false; });
    button.addEventListener("click", () => search(true));
    return { reset, schedule };
  }

  global.SHUKATSU_ICONS = { companyKey, publicSite, domainHint, recruitingTenant, matchesDomain, makeCandidates, iconSources, createPicker, needsIcon, findAutomaticIcon, fillMissingIcons };
  if (typeof module !== "undefined" && module.exports) module.exports = global.SHUKATSU_ICONS;
})(typeof window !== "undefined" ? window : globalThis);
