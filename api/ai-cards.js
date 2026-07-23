"use strict";

const ai = require("../ai.js");

const SUPABASE_URL = process.env.SUPABASE_URL || "https://fqsacoijtxgzsnvluecy.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || "sb_publishable_49ZKBFL3sb9DeJhPt5EXrg_YKvAsptw";
const CLOUDFLARE_MODEL = process.env.CLOUDFLARE_AI_MODEL || "@cf/qwen/qwen3-30b-a3b-fp8";

module.exports = async function handler(request, response) {
  response.setHeader("Cache-Control", "no-store, max-age=0");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  response.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");

  if (request.method === "GET") {
    return response.status(200).json({
      ready: Boolean(process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_AI_TOKEN),
      loginRequired: true
    });
  }

  if (request.method !== "POST") {
    response.setHeader("Allow", "GET, POST");
    return response.status(405).json({ error: "この操作には対応していません。" });
  }

  const contentType = String(request.headers?.["content-type"] || "");
  if (!/^application\/json(?:\s*;|$)/iu.test(contentType)) {
    return response.status(415).json({ error: "JSON形式で送信してください。" });
  }
  const contentLength = Number(request.headers?.["content-length"] || 0);
  if (Number.isFinite(contentLength) && contentLength > 64 * 1024) {
    return response.status(413).json({ error: "送信内容が大きすぎます。" });
  }

  if (!process.env.CLOUDFLARE_ACCOUNT_ID || !process.env.CLOUDFLARE_AI_TOKEN) {
    return response.status(503).json({ error: "公開AIはただいま準備中です。" });
  }

  const accessToken = readBearerToken(request.headers.authorization);
  if (!accessToken) return response.status(401).json({ error: "ログインし直してから、もう一度お試しください。" });

  const user = await authenticateUser(accessToken);
  if (!user) return response.status(401).json({ error: "ログインし直してから、もう一度お試しください。" });

  const payload = readPayload(request.body);
  if (!payload) return response.status(400).json({ error: "JSON形式の送信内容を確認してください。" });
  const task = payload.task || (typeof payload.memo === "string" ? "cards" : "");
  if (!new Set(["cards", "faq"]).has(task)) {
    return response.status(400).json({ error: "AIの処理種類を確認してください。" });
  }

  const inputName = task === "faq" ? "question" : "memo";
  const maxLength = task === "faq" ? ai.maxFaqChars : ai.maxMemoChars;
  const input = typeof payload[inputName] === "string" ? payload[inputName].trim() : "";
  if (!input) {
    return response.status(400).json({ error: task === "faq" ? "FAQへの質問を入力してください。" : "整理するメモを入力してください。" });
  }
  let normalizedInput;
  try {
    normalizedInput = ai.normalizeMemoText(input);
  } catch (error) {
    return response.status(400).json({ error: String(error?.message || "テキスト形式を確認してください。") });
  }
  if (ai.countCharacters(normalizedInput) > maxLength) {
    const label = task === "faq" ? "質問" : "メモ";
    return response.status(413).json({ error: `${label}は${maxLength.toLocaleString("ja-JP")}文字以内にしてください。途中で切らず、内容を分けてお試しください。` });
  }

  // ブラウザ側の処理を信用せず、サーバーでも必ず同じ伏せ字処理を行う。
  const protectedInput = ai.redactSensitiveMemo(normalizedInput, maxLength);
  if (!protectedInput.text.trim()) {
    return response.status(400).json({ error: "個人情報を隠すと、AIが回答できる文章が残りませんでした。" });
  }
  if (task === "cards") {
    const candidateCount = ai.countMemoCardCandidates(protectedInput.text);
    if (candidateCount > ai.maxCards) {
      return response.status(422).json({
        error: `AIに送る会社・選考候補が${candidateCount}件あります。一度に整理できるのは${ai.maxCards}件までのため、内容を分けてお試しください。`
      });
    }
  }

  const quota = await consumeDailyQuota(accessToken);
  if (quota.status === "unavailable") {
    return response.status(503).json({ error: "利用回数の保護機能を準備中です。" });
  }
  if (!quota.isAllowed) {
    response.setHeader("Retry-After", String(secondsUntilJstTomorrow()));
    return response.status(429).json({ error: "本日の無料利用回数に達しました。明日もう一度お試しください。" });
  }

  const providerRequest = task === "faq"
    ? ai.buildFaqRequest(protectedInput.text)
    : ai.buildRequest(protectedInput.text);
  const providerResponse = await runCloudflareAi(providerRequest);
  if (!providerResponse.ok) {
    const providerFailure = await safeJson(providerResponse);
    console.error("Cloudflare AI request failed", {
      status: providerResponse.status,
      codes: Array.isArray(providerFailure?.errors)
        ? providerFailure.errors.map((error) => error?.code).filter(Boolean).slice(0, 3)
        : []
    });
    if (providerResponse.status === 429) {
      response.setHeader("Retry-After", "60");
      return response.status(429).json({ error: "AIが混み合っています。少し待ってからもう一度お試しください。" });
    }
    return response.status(502).json({ error: "AIの応答に失敗しました。少し待ってからもう一度お試しください。" });
  }

  const providerPayload = await safeJson(providerResponse);
  if (task === "faq") {
    const answer = ai.parseProviderFaq(providerPayload);
    if (!answer) return response.status(422).json({ error: "AI FAQの回答を作れませんでした。質問を言い換えてお試しください。" });
    return response.status(200).json({
      answer,
      remainingToday: quota.remaining,
      serverRedactions: protectedInput.total
    });
  }

  const cards = ai.parseProviderCards(providerPayload);
  if (!cards.length) {
    return response.status(422).json({ error: "企業カードを作れませんでした。企業名と予定を含めて、もう一度お試しください。" });
  }

  return response.status(200).json({
    cards,
    remainingToday: quota.remaining,
    serverRedactions: protectedInput.total
  });
};

function readBearerToken(value) {
  const match = String(value || "").match(/^Bearer\s+([^\s]+)$/i);
  return match && match[1].length <= 4096 ? match[1] : "";
}

function readPayload(body) {
  let payload = body;
  if (typeof payload === "string") {
    try {
      payload = JSON.parse(payload);
    } catch {
      return null;
    }
  }
  return payload && typeof payload === "object" && !Array.isArray(payload) ? payload : null;
}

async function authenticateUser(accessToken) {
  try {
    const result = await fetchWithTimeout(`${SUPABASE_URL}/auth/v1/user`, {
      method: "GET",
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${accessToken}`
      }
    }, 5000);
    if (!result.ok) return null;
    const user = await result.json();
    return user?.id && user?.email_confirmed_at ? { id: String(user.id) } : null;
  } catch {
    return null;
  }
}

async function consumeDailyQuota(accessToken) {
  try {
    const result = await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/rpc/consume_ai_quota`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: "{}"
    }, 5000);
    if (!result.ok) return { status: "unavailable", isAllowed: false, remaining: 0 };
    const payload = await result.json();
    const row = Array.isArray(payload) ? payload[0] : payload;
    return {
      status: "ok",
      isAllowed: row?.is_allowed === true,
      remaining: Math.max(0, Number(row?.remaining || 0))
    };
  } catch {
    return { status: "unavailable", isAllowed: false, remaining: 0 };
  }
}

async function runCloudflareAi(requestBody) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(process.env.CLOUDFLARE_ACCOUNT_ID)}/ai/run/${CLOUDFLARE_MODEL}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);

  try {
    return await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.CLOUDFLARE_AI_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });
  } catch {
    return { ok: false, status: 502 };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function secondsUntilJstTomorrow(now = new Date()) {
  const shifted = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const nextMidnightUtc = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate() + 1
  ) - 9 * 60 * 60 * 1000;
  return Math.max(1, Math.ceil((nextMidnightUtc - now.getTime()) / 1000));
}

async function safeJson(result) {
  try {
    return await result.json();
  } catch {
    return {};
  }
}
