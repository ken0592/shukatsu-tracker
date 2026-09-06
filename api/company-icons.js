"use strict";
const icons = require("../company-icons.js");
const cache = new Map();
const pending = new Map();
let coolingUntil = 0;
const userAgent = "ShukatsuTracker/1.0 (https://github.com/ken0592/shukatsu-tracker)";

async function wikidata(parameters) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6500);
  try {
    const response = await fetch(`https://www.wikidata.org/w/api.php?${new URLSearchParams({ format: "json", ...parameters })}`, {
      headers: { "User-Agent": userAgent, Accept: "application/json" }, signal: controller.signal, redirect: "error"
    });
    if (response.status === 429) coolingUntil = Date.now() + Math.min(300, Math.max(60, Number(response.headers.get("Retry-After")) || 60)) * 1000;
    if (!response.ok) throw new Error("upstream unavailable");
    const value = await response.json();
    if (value.error) throw new Error("upstream error");
    return value;
  } finally { clearTimeout(timer); }
}

async function findEntities(name) {
  const key = icons.companyKey(name);
  const saved = cache.get(key);
  if (saved && saved.expires > Date.now()) return saved.entities;
  if (pending.has(key)) return pending.get(key);
  if (pending.size >= 2 || coolingUntil > Date.now()) throw new Error("busy");
  const work = (async () => {
    const search = await wikidata({ action: "wbsearchentities", search: name.replace(/株式会社|有限会社|合同会社/gu, "").trim(), language: "ja", uselang: "ja", limit: "5", type: "item" });
    const ids = (Array.isArray(search.search) ? search.search : []).map((item) => item.id).filter((id) => /^Q\d+$/u.test(id)).slice(0, 5);
    const data = ids.length ? await wikidata({ action: "wbgetentities", ids: ids.join("|"), props: "claims|labels|aliases|descriptions", languages: "ja|en" }) : { entities: {} };
    if (!data.entities || typeof data.entities !== "object" || Array.isArray(data.entities)) throw new Error("invalid result");
    if (cache.size >= 200) cache.delete(cache.keys().next().value);
    cache.set(key, { entities: data.entities, expires: Date.now() + 3600000 });
    return data.entities;
  })();
  pending.set(key, work);
  try { return await work; } finally { pending.delete(key); }
}

module.exports = async function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  if (request.method !== "POST") { response.setHeader("Allow", "POST"); return response.status(405).json({ error: "POSTで送信してください。" }); }
  if (!/^application\/json(?:\s*;|$)/iu.test(request.headers?.["content-type"] || "")) return response.status(415).json({ error: "JSONで送信してください。" });
  let body = request.body;
  if (typeof body === "string") {
    if (body.length > 2000) return response.status(413).json({ error: "送信内容が長すぎます。" });
    try { body = JSON.parse(body); } catch { return response.status(400).json({ error: "送信内容を確認してください。" }); }
  }
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (Array.from(name).length > 120 || icons.companyKey(name).length < 2 || /[\u0000-\u001f\u007f@/:]/u.test(name)) return response.status(400).json({ error: "企業名を確認してください。" });
  // URL全体・パス・クエリは受け取らず、公開ドメインだけを照合する。
  const rawHint = typeof body?.hint === "string" ? body.hint : "";
  const hint = rawHint.length <= 253 && /^[a-z0-9.-]*$/iu.test(rawHint) ? icons.domainHint(`https://${rawHint}`) : "";
  const tenant = typeof body?.tenant === "string" && /^[a-z][a-z0-9-]{2,30}$/u.test(body.tenant) ? body.tenant : "";
  try {
    const entities = await findEntities(name);
    return response.status(200).json(icons.makeCandidates(entities, name, hint, tenant));
  } catch (error) {
    if (error.message === "busy" || coolingUntil > Date.now()) { response.setHeader("Retry-After", "60"); return response.status(429).json({ error: "検索が混み合っています。" }); }
    return response.status(502).json({ error: "企業情報を取得できませんでした。" });
  }
};
