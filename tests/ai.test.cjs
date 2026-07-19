const assert = require("node:assert/strict");
const ai = require("../ai.js");

function testRedaction() {
  const source = [
    "企業名: 株式会社サンプル",
    "氏名: 山田 太郎",
    "メール: taro.yamada@example.com",
    "電話: 090-1234-5678",
    "住所: 東京都新宿区1-2-3",
    "郵便番号: 160-0022",
    "マイページID: candidate12345",
    "応募者番号: AB12345678",
    "パスワード: secret-9876",
    "マイページ: https://example.com/login?token=abc123",
    "7/25 ES締切。8/2 一次面接。"
  ].join("\n");
  const result = ai.redactSensitiveMemo(source);

  for (const secret of [
    "山田 太郎", "taro.yamada@example.com", "090-1234-5678", "東京都新宿区1-2-3", "160-0022",
    "candidate12345", "AB12345678", "secret-9876", "https://example.com/login?token=abc123"
  ]) {
    assert.equal(result.text.includes(secret), false, `${secret} should be redacted`);
  }
  assert.match(result.text, /株式会社サンプル/);
  assert.match(result.text, /ES締切/);
  assert.ok(result.total >= 8);
}

function testRequestUsesOnlyProvidedRedactedText() {
  const source = "氏名: 山田太郎\n企業名: 株式会社サンプル\nID: candidate12345";
  const redacted = ai.redactSensitiveMemo(source);
  const request = ai.buildRequest(redacted.text, "2026-07-18");
  const serialized = JSON.stringify(request);

  assert.equal(serialized.includes("山田太郎"), false);
  assert.equal(serialized.includes("candidate12345"), false);
  assert.match(serialized, /株式会社サンプル/);
  assert.equal(request.stream, false);
  assert.equal(request.temperature, 0);
  assert.equal(request.response_format.type, "json_schema");
  assert.ok(request.response_format.json_schema.properties.cards.items.required.includes("esItems"));
  assert.match(request.messages[0].content, /複数の質問を1つ/);
}

function testProviderResponseParsing() {
  const payload = {
    result: {
      choices: [{
        message: {
          content: JSON.stringify({
            cards: [{
              companyName: "株式会社サンプル",
              industry: "IT",
              trackType: "本選考",
              status: "気になる",
              deadline: "2026-07-25",
              eventDate: "",
              eventType: "ES締切",
              priority: "未定",
              esItems: [
                {
                  question: "志望動機を教えてください。",
                  variants: [{ label: "400字", answer: "顧客課題を技術で解決したいからです。" }]
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
  const cards = ai.parseProviderCards(payload);
  assert.equal(cards.length, 1);
  assert.equal(cards[0].companyName, "株式会社サンプル");
  assert.equal(cards[0].deadline, "2026-07-25");
  assert.equal(cards[0].esItems.length, 2);
  assert.equal(cards[0].esItems[0].question, "志望動機を教えてください。");
  assert.equal(cards[0].esItems[0].variants[0].label, "400字");
  assert.equal(cards[0].esItems[1].variants[0].answer, "研究活動で改善を重ねました。");
}

function testCardValidation() {
  const cards = ai.sanitizeCards([
    {
      companyName: "  株式会社テスト  ",
      industry: "IT・通信",
      trackType: "危険な値",
      status: "勝手な値",
      deadline: "2026-02-30",
      eventDate: "2026-08-02",
      eventType: "面接",
      priority: "最高",
      esItems: [
        {
          question: "[IDを非表示] 志望動機",
          variants: [
            { label: "400字", answer: "[メールを非表示] 顧客課題を解決したい" },
            { label: "", answer: "" }
          ]
        }
      ],
      esContent: "[IDを非表示] 志望動機",
      interviewNotes: "逆質問",
      memo: "<script>alert(1)</script>",
      mypageId: "should-not-pass"
    },
    { companyName: "", memo: "企業名なし" }
  ]);

  assert.equal(cards.length, 1);
  assert.equal(cards[0].companyName, "株式会社テスト");
  assert.equal(cards[0].trackType, "本選考");
  assert.equal(cards[0].status, "気になる");
  assert.equal(cards[0].deadline, "");
  assert.equal(cards[0].eventDate, "2026-08-02");
  assert.equal(cards[0].priority, "未定");
  assert.equal(cards[0].esContent, "志望動機");
  assert.equal(cards[0].esItems.length, 1);
  assert.equal(cards[0].esItems[0].question, "志望動機");
  assert.equal(cards[0].esItems[0].variants.length, 1);
  assert.equal(cards[0].esItems[0].variants[0].answer, "顧客課題を解決したい");
  assert.equal("mypageId" in cards[0], false);
}

testRedaction();
testRequestUsesOnlyProvidedRedactedText();
testProviderResponseParsing();
testCardValidation();
console.log("AI privacy and validation tests passed");
