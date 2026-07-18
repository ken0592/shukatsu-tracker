const assert = require("node:assert/strict");
const ai = require("../ai.js");

async function main() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_AI_TOKEN;
  assert.ok(accountId, "CLOUDFLARE_ACCOUNT_ID is required");
  assert.ok(token, "CLOUDFLARE_AI_TOKEN is required");

  const memo = "株式会社サンプルテック。IT企業。本選考のES締切は2026年7月25日。志望度は高。2026年8月2日に一次面接。";
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/run/@cf/qwen/qwen3-30b-a3b-fp8`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(ai.buildRequest(memo, "2026-07-18"))
    }
  );

  const payload = await response.json();
  assert.equal(
    response.ok,
    true,
    `Cloudflare Workers AI returned ${response.status}: ${JSON.stringify(payload?.errors || [])}`
  );
  const cards = ai.parseProviderCards(payload);
  assert.equal(cards.length, 1);
  assert.match(cards[0].companyName, /サンプルテック/);
  assert.equal(cards[0].deadline, "2026-07-25");
  assert.equal(cards[0].eventDate, "2026-08-02");
  assert.ok(
    ["気になる", "応募予定", "応募済み", "選考中"].includes(cards[0].status),
    `Unexpected status: ${cards[0].status}`
  );
  assert.equal(cards[0].priority, "高");
  console.log(JSON.stringify(cards[0], null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
