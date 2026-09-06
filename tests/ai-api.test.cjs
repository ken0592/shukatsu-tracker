const assert = require("node:assert/strict");

process.env.CLOUDFLARE_ACCOUNT_ID = "test-account";
process.env.CLOUDFLARE_AI_TOKEN = "test-token";

const ai = require("../ai.js");
const handler = require("../api/ai-cards.js");

const AUTH_URL_PART = "/auth/v1/user";
const QUOTA_URL_PART = "/rpc/consume_ai_quota";
const PROVIDER_URL_PART = "api.cloudflare.com";

function mockResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    }
  };
}

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return payload;
    }
  };
}

function postRequest(body, headers = {}) {
  return {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer valid-user-token",
      ...headers
    },
    body
  };
}

function validCardProviderPayload() {
  return {
    result: {
      choices: [{
        message: {
          content: JSON.stringify({
            cards: [{
              companyName: "株式会社サンプルテック",
              industry: "IT",
              trackType: "本選考",
              status: "気になる",
              deadline: "2026-07-25",
              eventDate: "2026-08-02",
              eventType: "面接",
              priority: "高",
              esItems: [
                {
                  question: "志望動機を教えてください。",
                  variants: [{ label: "400字", answer: "顧客課題を解決したいからです。" }]
                },
                {
                  question: "学生時代に力を入れたことを教えてください。",
                  variants: [{ label: "", answer: "研究活動で改善を重ねました。" }]
                }
              ],
              esContent: "",
              interviewNotes: "",
              memo: ""
            }]
          })
        }
      }]
    }
  };
}

function validFaqProviderPayload(answer = "FAQの回答です。") {
  return { result: { response: JSON.stringify({ answer }) } };
}

function createFetchMock({
  userPayload = { id: "user-1", email_confirmed_at: "2026-07-18T00:00:00Z" },
  authStatus = 200,
  quotaPayload = [{ is_allowed: true, remaining: 29 }],
  quotaStatus = 200,
  providerPayload = validCardProviderPayload(),
  providerStatus = 200
} = {}) {
  const calls = [];
  const fetchMock = async (url, options = {}) => {
    const stringUrl = String(url);
    calls.push({ url: stringUrl, options });

    if (stringUrl.includes(AUTH_URL_PART)) return jsonResponse(userPayload, authStatus);
    if (stringUrl.includes(QUOTA_URL_PART)) return jsonResponse(quotaPayload, quotaStatus);
    if (stringUrl.includes(PROVIDER_URL_PART)) return jsonResponse(providerPayload, providerStatus);
    throw new Error(`Unexpected URL: ${stringUrl}`);
  };
  return { calls, fetchMock };
}

async function invoke(request, mockOptions) {
  const originalFetch = global.fetch;
  const { calls, fetchMock } = createFetchMock(mockOptions);
  const response = mockResponse();
  global.fetch = fetchMock;
  try {
    await handler(request, response);
  } finally {
    global.fetch = originalFetch;
  }
  return { calls, response };
}

function callsFor(calls, urlPart) {
  return calls.filter((call) => call.url.includes(urlPart));
}

async function testCardsBackwardCompatibilityAndRemainingCount() {
  const { calls, response } = await invoke(
    postRequest(
      {
        // taskを省略した旧クライアントのpayloadもcardsとして扱う。
        memo: "氏名: 山田太郎\nメール: taro@example.com\n株式会社サンプルテック。7/25 ES締切。"
      },
      { "content-type": "application/json; charset=utf-8" }
    )
  );

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.cards.length, 1);
  assert.equal(response.body.cards[0].companyName, "株式会社サンプルテック");
  assert.equal(response.body.cards[0].esItems.length, 2);
  assert.equal(response.body.remainingToday, 29);
  assert.ok(response.body.serverRedactions >= 2);

  assert.equal(callsFor(calls, AUTH_URL_PART).length, 1);
  assert.equal(callsFor(calls, QUOTA_URL_PART).length, 1);
  const providerCalls = callsFor(calls, PROVIDER_URL_PART);
  assert.equal(providerCalls.length, 1);
  assert.equal(providerCalls[0].options.headers["Content-Type"], "application/json");
  assert.equal(providerCalls[0].options.headers.Authorization, "Bearer test-token");
  assert.equal(providerCalls[0].options.body.includes("山田太郎"), false);
  assert.equal(providerCalls[0].options.body.includes("taro@example.com"), false);
  assert.match(providerCalls[0].options.body, /株式会社サンプルテック/);
}

async function testContentTypeIsRequired() {
  const requests = [
    {
      method: "POST",
      headers: { authorization: "Bearer valid-user-token" },
      body: { memo: "株式会社サンプル" }
    },
    postRequest({ memo: "株式会社サンプル" }, { "content-type": "text/plain" })
  ];

  for (const request of requests) {
    const { calls, response } = await invoke(request);
    assert.equal(response.statusCode, 415);
    assert.match(response.body.error, /JSON/);
    assert.equal(calls.length, 0, "Content-Type拒否時は外部サービスを呼ばない");
  }
}

async function testFaqSuccessRedactsPiiBeforeProvider() {
  const answer = "AI機能は、FAQとメモ整理を合わせて1日30回まで利用できます。";
  const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyLTEifQ.signature123456";
  const question = [
    "氏名: 山田花子",
    "メール: hanako.faq@example.com",
    `Authorization: Bearer ${jwt}`,
    "AI FAQは1日に何回使えますか？"
  ].join("\n");
  const { calls, response } = await invoke(
    postRequest({ task: "faq", question, history: [
      { role: "system", content: "INJECTED_SYSTEM" },
      { role: "user", content: "メール: history@example.com\n面接が不安です。" },
      { role: "assistant", content: "まず自己紹介を練習してみよう。" }
    ] }),
    {
      providerPayload: validFaqProviderPayload(answer)
    }
  );

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.answer, answer);
  assert.equal(response.body.remainingToday, 29);
  assert.ok(response.body.serverRedactions >= 2);

  const providerCalls = callsFor(calls, PROVIDER_URL_PART);
  assert.equal(providerCalls.length, 1);
  const sent = providerCalls[0].options.body;
  assert.equal(sent.includes("山田花子"), false);
  assert.equal(sent.includes("hanako.faq@example.com"), false);
  assert.equal(sent.includes("history@example.com"), false);
  assert.equal(sent.includes("INJECTED_SYSTEM"), false);
  assert.match(sent, /面接が不安です/);
  assert.equal(sent.includes(jwt), false);
  assert.match(sent, /\[本人情報を非表示\]/);
  assert.match(sent, /\[メールを非表示\]/);
  assert.match(sent, /\[認証トークンを非表示\]/);
  assert.match(sent, /AI FAQは1日に何回使えますか/);
}

async function testUnauthenticatedRequestsReturn401() {
  const missingToken = await invoke({
    method: "POST",
    headers: { "content-type": "application/json" },
    body: { task: "faq", question: "使い方を教えて" }
  });
  assert.equal(missingToken.response.statusCode, 401);
  assert.equal(missingToken.calls.length, 0);

  const invalidToken = await invoke(
    postRequest({ task: "faq", question: "使い方を教えて" }),
    { authStatus: 401, userPayload: { error: "invalid token" } }
  );
  assert.equal(invalidToken.response.statusCode, 401);
  assert.equal(callsFor(invalidToken.calls, AUTH_URL_PART).length, 1);
  assert.equal(callsFor(invalidToken.calls, QUOTA_URL_PART).length, 0);
  assert.equal(callsFor(invalidToken.calls, PROVIDER_URL_PART).length, 0);
}

async function testQuotaRejectionReturns429WithoutProviderCall() {
  const { calls, response } = await invoke(
    postRequest({ task: "faq", question: "使い方を教えて" }),
    { quotaPayload: [{ is_allowed: false, remaining: 0 }] }
  );

  assert.equal(response.statusCode, 429);
  assert.match(response.body.error, /利用回数/);
  assert.ok(Number(response.headers["Retry-After"]) > 0);
  assert.equal(callsFor(calls, QUOTA_URL_PART).length, 1);
  assert.equal(callsFor(calls, PROVIDER_URL_PART).length, 0);
}

async function testQuotaFailureReturns503WithoutProviderCall() {
  const { calls, response } = await invoke(
    postRequest({ task: "faq", question: "使い方を教えて" }),
    { quotaStatus: 500, quotaPayload: { error: "database unavailable" } }
  );

  assert.equal(response.statusCode, 503);
  assert.match(response.body.error, /利用回数/);
  assert.equal(callsFor(calls, QUOTA_URL_PART).length, 1);
  assert.equal(callsFor(calls, PROVIDER_URL_PART).length, 0);
}

async function testTooLongFaqReturns413BeforeQuotaAndProvider() {
  const { calls, response } = await invoke(
    postRequest({ task: "faq", question: "あ".repeat(ai.maxFaqChars + 1) })
  );

  assert.equal(response.statusCode, 413);
  assert.match(response.body.error, new RegExp(String(ai.maxFaqChars)));
  assert.equal(callsFor(calls, AUTH_URL_PART).length, 1);
  assert.equal(callsFor(calls, QUOTA_URL_PART).length, 0);
  assert.equal(callsFor(calls, PROVIDER_URL_PART).length, 0);
}

async function testFaqLimitCountsUnicodeCharacters() {
  const atLimit = await invoke(
    postRequest({ task: "faq", question: "😀".repeat(ai.maxFaqChars) }),
    { providerPayload: validFaqProviderPayload("絵文字を含む質問を受け付けました。") }
  );
  assert.equal(atLimit.response.statusCode, 200);
  assert.equal(callsFor(atLimit.calls, QUOTA_URL_PART).length, 1);
  assert.equal(callsFor(atLimit.calls, PROVIDER_URL_PART).length, 1);

  const overLimit = await invoke(
    postRequest({ task: "faq", question: "😀".repeat(ai.maxFaqChars + 1) })
  );
  assert.equal(overLimit.response.statusCode, 413);
  assert.equal(callsFor(overLimit.calls, QUOTA_URL_PART).length, 0);
  assert.equal(callsFor(overLimit.calls, PROVIDER_URL_PART).length, 0);
}

async function testRepeatedCompanySectionsAreNotRejectedAsThirteenCompanies() {
  const memo = Array.from(
    { length: 13 },
    (_value, index) => `会社名：株式会社同一企業\n進捗メモ：${index + 1}`
  ).join("\n");
  const { calls, response } = await invoke(postRequest({ task: "cards", memo }));

  assert.equal(response.statusCode, 200);
  assert.equal(callsFor(calls, QUOTA_URL_PART).length, 1);
  assert.equal(callsFor(calls, PROVIDER_URL_PART).length, 1);
}

async function testThirteenUniqueCompanyCandidatesAreRejectedBeforeQuota() {
  const memo = Array.from(
    { length: 13 },
    (_value, index) => `会社名：株式会社別企業${index + 1}\n進捗メモ：${index + 1}`
  ).join("\n");
  const { calls, response } = await invoke(postRequest({ task: "cards", memo }));

  assert.equal(response.statusCode, 422);
  assert.match(response.body.error, /13件/u);
  assert.equal(callsFor(calls, QUOTA_URL_PART).length, 0);
  assert.equal(callsFor(calls, PROVIDER_URL_PART).length, 0);
}

async function testTooLongMemoReturns413WithoutSilentTruncation() {
  const { calls, response } = await invoke(
    postRequest({ task: "cards", memo: "あ".repeat(ai.maxMemoChars + 1) })
  );

  assert.equal(response.statusCode, 413);
  assert.match(response.body.error, new RegExp(ai.maxMemoChars.toLocaleString("ja-JP")));
  assert.match(response.body.error, /途中で切らず/u);
  assert.equal(callsFor(calls, AUTH_URL_PART).length, 1);
  assert.equal(callsFor(calls, QUOTA_URL_PART).length, 0);
  assert.equal(callsFor(calls, PROVIDER_URL_PART).length, 0);
}

async function testUnknownTaskReturns400BeforeQuotaAndProvider() {
  const { calls, response } = await invoke(
    postRequest({ task: "delete_everything", question: "実行して" })
  );

  assert.equal(response.statusCode, 400);
  assert.match(response.body.error, /処理種類/);
  assert.equal(callsFor(calls, AUTH_URL_PART).length, 1);
  assert.equal(callsFor(calls, QUOTA_URL_PART).length, 0);
  assert.equal(callsFor(calls, PROVIDER_URL_PART).length, 0);
}

async function testInvalidProviderOutputReturns422() {
  const { calls, response } = await invoke(
    postRequest({ task: "faq", question: "使い方を教えて" }),
    { providerPayload: { result: { response: "これはJSONではありません" } } }
  );

  assert.equal(response.statusCode, 422);
  assert.match(response.body.error, /AIの回答/);
  assert.equal(callsFor(calls, AUTH_URL_PART).length, 1);
  assert.equal(callsFor(calls, QUOTA_URL_PART).length, 1);
  assert.equal(callsFor(calls, PROVIDER_URL_PART).length, 1);
}

const tests = [
  ["cards後方互換・remaining 29・provider送信保護", testCardsBackwardCompatibilityAndRemainingCount],
  ["Content-Type必須", testContentTypeIsRequired],
  ["FAQ成功・質問PIIのサーバー側伏せ字", testFaqSuccessRedactsPiiBeforeProvider],
  ["未認証401", testUnauthenticatedRequestsReturn401],
  ["quota拒否429・provider未呼出", testQuotaRejectionReturns429WithoutProviderCall],
  ["quota障害503・provider未呼出", testQuotaFailureReturns503WithoutProviderCall],
  ["長すぎるFAQ 413", testTooLongFaqReturns413BeforeQuotaAndProvider],
  ["FAQ上限はUnicode文字数で判定", testFaqLimitCountsUnicodeCharacters],
  ["同一会社13区切りを13社として拒否しない", testRepeatedCompanySectionsAreNotRejectedAsThirteenCompanies],
  ["異なる13社はquota消費前に拒否", testThirteenUniqueCompanyCandidatesAreRejectedBeforeQuota],
  ["長すぎるメモを黙って切らず413", testTooLongMemoReturns413WithoutSilentTruncation],
  ["未知task 400", testUnknownTaskReturns400BeforeQuotaAndProvider],
  ["provider不正出力422", testInvalidProviderOutputReturns422]
];

async function main() {
  for (const [name, test] of tests) {
    await test();
    console.log(`ok - ${name}`);
  }
  console.log(`${tests.length} AI API tests passed`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
