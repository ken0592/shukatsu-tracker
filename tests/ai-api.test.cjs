const assert = require("node:assert/strict");

process.env.CLOUDFLARE_ACCOUNT_ID = "test-account";
process.env.CLOUDFLARE_AI_TOKEN = "test-token";

const handler = require("../api/ai-cards.js");

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

async function testProtectedPublicApi() {
  const calls = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).includes("/auth/v1/user")) {
      return jsonResponse({ id: "user-1", email_confirmed_at: "2026-07-18T00:00:00Z" });
    }
    if (String(url).includes("/rpc/consume_ai_quota")) return jsonResponse([{ is_allowed: true, remaining: 9 }]);
    if (String(url).includes("api.cloudflare.com")) {
      return jsonResponse({
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
                  esContent: "",
                  interviewNotes: "",
                  memo: ""
                }]
              })
            }
          }]
        }
      });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  try {
    const response = mockResponse();
    await handler({
      method: "POST",
      headers: { authorization: "Bearer valid-user-token" },
      body: {
        memo: "氏名: 山田太郎\nメール: taro@example.com\n株式会社サンプルテック。7/25 ES締切。"
      }
    }, response);

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.cards.length, 1);
    assert.equal(response.body.remainingToday, 9);

    const providerCall = calls.find((call) => call.url.includes("api.cloudflare.com"));
    assert.ok(providerCall, "Cloudflare AI should be called");
    const sent = providerCall.options.body;
    assert.equal(sent.includes("山田太郎"), false);
    assert.equal(sent.includes("taro@example.com"), false);
    assert.match(sent, /株式会社サンプルテック/);
  } finally {
    global.fetch = originalFetch;
  }
}

testProtectedPublicApi()
  .then(() => console.log("AI public API protection test passed"))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
