"use strict";

const ai = require("../ai.js");

const SUPABASE_URL = process.env.SUPABASE_URL || "https://fqsacoijtxgzsnvluecy.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || "sb_publishable_49ZKBFL3sb9DeJhPt5EXrg_YKvAsptw";
const CLOUDFLARE_MODEL = process.env.CLOUDFLARE_AI_MODEL || "@cf/qwen/qwen3-30b-a3b-fp8";

module.exports = async function handler(request, response) {
  response.setHeader("Cache-Control", "no-store, max-age=0");
  response.setHeader("X-Content-Type-Options", "nosniff");

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

  if (!process.env.CLOUDFLARE_ACCOUNT_ID || !process.env.CLOUDFLARE_AI_TOKEN) {
    return response.status(503).json({ error: "公開AIはただいま準備中です。" });
  }

  const accessToken = readBearerToken(request.headers.authorization);
  if (!accessToken) return response.status(401).json({ error: "ログインし直してから、もう一度お試しください。" });

  const user = await authenticateUser(accessToken);
  if (!user) return response.status(401).json({ error: "ログインし直してから、もう一度お試しください。" });

  const memo = readMemo(request.body);
  if (!memo) return response.status(400).json({ error: "整理するメモを入力してください。" });
  if (memo.length > ai.maxMemoChars) {
    return response.status(413).json({ error: `メモは${ai.maxMemoChars.toLocaleString("ja-JP")}文字以内にしてください。` });
  }

  // ブラウザ側の処理を信用せず、サーバーでも必ず同じ伏せ字処理を行う。
  const protectedMemo = ai.redactSensitiveMemo(memo);
  if (!protectedMemo.text.trim()) {
    return response.status(400).json({ error: "個人情報を隠すと、整理できる文章が残りませんでした。" });
  }

  const quota = await consumeDailyQuota(accessToken);
  if (quota.status === "unavailable") {
    return response.status(503).json({ error: "利用回数の保護機能を準備中です。" });
  }
  if (!quota.isAllowed) {
    return response.status(429).json({ error: "本日の無料利用回数に達しました。明日もう一度お試しください。" });
  }

  const providerResponse = await runCloudflareAi(protectedMemo.text);
  if (!providerResponse.ok) {
    if (providerResponse.status === 429) {
      return response.status(429).json({ error: "本日のAI無料枠を使い切りました。明日もう一度お試しください。" });
    }
    return response.status(502).json({ error: "AIの整理に失敗しました。少し待ってからもう一度お試しください。" });
  }

  const providerPayload = await safeJson(providerResponse);
  const cards = ai.parseProviderCards(providerPayload);
  if (!cards.length) {
    return response.status(422).json({ error: "企業カードを作れませんでした。企業名と予定を含めて、もう一度お試しください。" });
  }

  return response.status(200).json({
    cards,
    remainingToday: quota.remaining,
    serverRedactions: protectedMemo.total
  });
};

function readBearerToken(value) {
  const match = String(value || "").match(/^Bearer\s+([^\s]+)$/i);
  return match ? match[1] : "";
}

function readMemo(body) {
  let payload = body;
  if (typeof payload === "string") {
    try {
      payload = JSON.parse(payload);
    } catch {
      return "";
    }
  }
  return typeof payload?.memo === "string" ? payload.memo.trim() : "";
}

async function authenticateUser(accessToken) {
  try {
    const result = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      method: "GET",
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${accessToken}`
      }
    });
    if (!result.ok) return null;
    const user = await result.json();
    return user?.id && user?.email_confirmed_at ? { id: String(user.id) } : null;
  } catch {
    return null;
  }
}

async function consumeDailyQuota(accessToken) {
  try {
    const result = await fetch(`${SUPABASE_URL}/rest/v1/rpc/consume_ai_quota`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: "{}"
    });
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

async function runCloudflareAi(protectedMemo) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(process.env.CLOUDFLARE_ACCOUNT_ID)}/ai/run/${CLOUDFLARE_MODEL}`;
  const requestBody = ai.buildRequest(protectedMemo);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 55000);

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

async function safeJson(result) {
  try {
    return await result.json();
  } catch {
    return {};
  }
}
