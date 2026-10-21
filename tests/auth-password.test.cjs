"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8");
const plain = (value) => JSON.parse(JSON.stringify(value));

function functionSource(name) {
  const start = source.search(new RegExp(`(?:async )?function ${name}\\(`));
  assert.ok(start >= 0, `${name} exists`);
  const tail = source.slice(start);
  const next = tail.slice(1).search(/\n(?:async )?function /);
  assert.ok(next > 0, `${name} has a following function`);
  return tail.slice(0, next + 1);
}

function harness(password) {
  const messages = [];
  const calls = [];
  const context = vm.createContext({
    els: {
      authEmailInput: { value: " user@example.com " },
      authPasswordInput: { value: password }
    },
    setAuthMessage: (message) => messages.push(message),
    setAuthBusy() {},
    highlightSignInButton() {},
    showToast() {},
    supabaseClient: {
      auth: {
        signInWithPassword: async (credentials) => { calls.push(["signInWithPassword", credentials]); return { error: null }; },
        signUp: async (credentials) => { calls.push(["signUp", credentials]); return { data: { session: null }, error: null }; }
      }
    }
  });
  vm.runInContext(functionSource("getAuthCredentials"), context);
  vm.runInContext(functionSource("handleSignIn"), context);
  vm.runInContext(functionSource("handleSignUp"), context);
  return { context, messages, calls };
}

test("新規登録は8文字未満を認証APIへ送らない", async () => {
  const h = harness("1234567");
  await h.context.handleSignUp();
  assert.deepEqual(plain(h.calls), []);
  assert.equal(h.messages.at(-1), "パスワードは8文字以上にしてください。");
});

test("新規登録は8文字をそのまま送信し、前後の空白をパスワードから除かない", async () => {
  const password = " 123456 ";
  const h = harness(password);
  await h.context.handleSignUp();
  assert.deepEqual(plain(h.calls), [["signUp", { email: "user@example.com", password }]]);
});

test("既存の6文字・7文字パスワードはログインでき、短すぎる入力は拒否する", async () => {
  for (const password of ["123456", "1234567"]) {
    const h = harness(password);
    await h.context.handleSignIn();
    assert.deepEqual(plain(h.calls), [["signInWithPassword", { email: "user@example.com", password }]]);
  }

  const short = harness("12345");
  await short.context.handleSignIn();
  assert.deepEqual(plain(short.calls), []);
  assert.equal(short.messages.at(-1), "パスワードは6文字以上にしてください。");

  for (const action of ["handleSignIn", "handleSignUp"]) {
    const empty = harness("");
    await empty.context[action]();
    assert.deepEqual(plain(empty.calls), []);
    assert.equal(empty.messages.at(-1), "メールアドレスとパスワードを入力してください。");
  }
});
