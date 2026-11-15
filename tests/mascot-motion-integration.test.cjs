"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");

function extractMascotDefault() {
  const match = appSource.match(/^const defaultMascotImage = (["'`])([^\n]*?)\1;$/m);
  assert.ok(match, "Expected app.js to declare defaultMascotImage as a string");
  return { declaration: match[0], source: match[2] };
}

function extractFunction(source, name) {
  const start = source.search(new RegExp(`(?:async )?function ${name}\\(`));
  assert.notEqual(start, -1, `Expected app.js to declare ${name}()`);
  const rest = source.slice(start);
  const next = rest.slice(1).search(/\n(?:async )?function /);
  return next === -1 ? rest : rest.slice(0, next + 1);
}

function mascotMotionHarness(extra = {}) {
  const events = [];
  const hosts = [0, 1].map(() => ({
    dispatchEvent(event) { events.push({ host: this, event }); return true; }
  }));
  const functions = ["getMascotImageSrc", "playMascotMotion", "showCelebration", "closeCelebration", "openMascotHelp"]
    .filter(name => appSource.includes(`function ${name}(`))
    .map(name => extractFunction(appSource, name));
  const context = {
    mascotState: { celebrationTimer: 1, didDrag: false },
    state: { aiReturnAfterCelebration: false, aiCards: [] },
    events,
    CustomEvent: class CustomEvent { constructor(type, options) { this.type = type; this.bubbles = false; Object.assign(this, options); } },
    document: {
      querySelectorAll(selector) {
        assert.equal(selector, "[data-mascot-motion]");
        return hosts;
      },
      body: { classList: { add() {}, remove() {} } }
    },
    window: { clearTimeout() {}, setTimeout() { return 1; } },
    els: {},
    ...extra
  };
  vm.createContext(context);
  vm.runInContext(`${extractMascotDefault().declaration}\n${functions.join("\n")}`, context);
  return { context, hosts, events };
}

test("all seasons and celebration moods retain the approved 2.5D artwork", () => {
  const { context } = mascotMotionHarness();
  const expected = extractMascotDefault().source;
  for (const mood of ["normal", "angry", "celebrate", "encourage", "unknown"]) {
    assert.equal(context.getMascotImageSrc(mood), expected);
  }
  const artwork = path.resolve(root, expected);
  const image = fs.readFileSync(artwork);
  assert.deepEqual([...image.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], "the default art must be a PNG");
  assert.ok(image.readUInt32BE(16) > 0 && image.readUInt32BE(20) > 0, "the default PNG must have valid dimensions");
});

test("mascot motion dispatch reaches both app hosts for each supported gesture", () => {
  const { context, hosts, events } = mascotMotionHarness();
  for (const action of ["greet", "celebrate", "encourage", "idle"]) {
    context.playMascotMotion(action);
  }
  assert.equal(events.length, 8);
  for (const action of ["greet", "celebrate", "encourage", "idle"]) {
    const deliveries = events.filter(({ event }) => event.detail.action === action);
    assert.equal(deliveries.length, 2);
    assert.ok(hosts.every(host => deliveries.some(delivery => delivery.host === host)));
    assert.ok(deliveries.every(({ event }) => event.type === "mascot:motion" && event.bubbles === false));
  }
});

test("opening chat greets; success and rejection celebrate with matching gestures; closing stops the gesture", () => {
  const h = mascotMotionHarness({
    setMascotImage() {},
    renderCelebrationTitle() {},
    createConfetti() {},
    showMascotBubble() {},
    setMascotVelocity() {},
    showToast() {},
    openAiImportDialog() {}
  });
  const { context, events } = h;
  const classList = () => {
    const names = new Set();
    return {
      add(name) { names.add(name); },
      remove(name) { names.delete(name); },
      toggle(name, force) {
        if (force) names.add(name);
        else names.delete(name);
        return Boolean(force);
      },
      contains(name) { return names.has(name); }
    };
  };
  context.els = {
    mascotHelpPanel: { hidden: true }, mascot: { setAttribute() {}, classList: classList() },
    mascotHelpInput: { focus() {} }, celebrationEyebrow: { textContent: "" },
    celebrationTitle: { innerHTML: "" }, celebrationMessage: { textContent: "" },
    celebrationOverlay: { hidden: true, classList: classList() },
    celebrationConfetti: { textContent: "" }
  };
  context.state = { aiReturnAfterCelebration: false, aiCards: [] };

  context.openMascotHelp();
  assert.equal(context.els.mascotHelpPanel.hidden, false);
  assert.deepEqual(events.map(({ event }) => event.detail.action), ["greet", "greet"]);

  context.showCelebration({ companyName: "テスト社" }, {
    mood: "normal", title: "通過！", message: "おめでとう", bubble: "やった！"
  });
  assert.equal(context.els.celebrationOverlay.hidden, false);
  assert.deepEqual(events.slice(-2).map(({ event }) => event.detail.action), ["celebrate", "celebrate"]);
  assert.equal(context.els.celebrationOverlay.classList.contains("is-rejection"), false);

  context.showCelebration({ companyName: "テスト社" }, {
    mood: "angry", title: "次へ！", message: "休んでいこう", bubble: "大丈夫"
  });
  assert.deepEqual(events.slice(-2).map(({ event }) => event.detail.action), ["encourage", "encourage"]);
  assert.equal(context.els.celebrationOverlay.classList.contains("is-rejection"), true);

  context.closeCelebration();
  assert.equal(context.els.celebrationOverlay.hidden, true);
  assert.deepEqual(events.slice(-2).map(({ event }) => event.detail.action), ["idle", "idle"]);
});

test("drag still moves and saves the mascot after renderer canvas is added", () => {
  const saves = [];
  const handlers = ["handleMascotPointerDown", "handleMascotPointerMove", "handleMascotPointerUp"]
    .map(name => extractFunction(appSource, name));
  const classNames = new Set();
  const host = {
    style: {},
    getBoundingClientRect() { return { left: 40, top: 50, width: 96, height: 113 }; },
    classList: {
      add(name) { classNames.add(name); },
      remove(name) { classNames.delete(name); },
      toggle() {}
    },
    setPointerCapture() {}, hasPointerCapture() { return true; }, releasePointerCapture() {}
  };
  const context = {
    els: { mascot: host },
    mascotState: { x: 28, y: 140, vx: 0.075, isDragging: false, didDrag: false },
    getMascotBounds: () => ({ minX: 10, minY: 74, maxX: 300, maxY: 500 }),
    clampNumber(value, min, max) { return Math.min(max, Math.max(min, value)); },
    applyMascotPosition() {},
    saveMascotPosition() { saves.push([context.mascotState.x, context.mascotState.y]); },
    Math, Set
  };
  vm.createContext(context);
  vm.runInContext(handlers.join("\n"), context);
  const event = (values = {}) => ({
    pointerType: "mouse", button: 0, pointerId: 7, clientX: 50, clientY: 60,
    preventDefault() {}, ...values
  });

  context.handleMascotPointerDown(event());
  assert.equal(context.mascotState.isDragging, true);
  context.handleMascotPointerMove(event({ clientX: 72, clientY: 84 }));
  assert.equal(context.mascotState.didDrag, true, "the click listener must suppress the post-drag click");
  assert.deepEqual([context.mascotState.x, context.mascotState.y], [62, 74]);
  assert.ok(classNames.has("is-dragging"));
  context.handleMascotPointerUp(event());
  assert.equal(context.mascotState.isDragging, false);
  assert.equal(saves.length, 1);
  assert.deepEqual(saves[0], [62, 74]);
  assert.ok(!classNames.has("is-dragging"));
});

test("service-worker install precaches every new mascot module, renderer dependency, and artwork", async () => {
  const source = fs.readFileSync(path.join(root, "service-worker.js"), "utf8");
  const listeners = {};
  let precached;
  const context = vm.createContext({
    self: {
      addEventListener(name, callback) { listeners[name] = callback; },
      skipWaiting() {}
    },
    caches: {
      open: async () => ({ addAll: async assets => { precached = assets; } })
    }
  });
  vm.runInContext(source, context);
  let install;
  listeners.install({ waitUntil(promise) { install = promise; } });
  await install;

  for (const asset of [
    "./assets/mascot-2-5d.png",
    "./mascot-motion.js",
    "./mascot-rig.js",
    "./mascot-blink.js",
    "./assets/mascot-blink-closed.png",
    "./vendor/three.module.min.js"
  ]) {
    assert.ok(precached.includes(asset), `${asset} must be available offline`);
    assert.ok(fs.existsSync(path.join(root, asset.slice(2))), `${asset} must exist at deploy time`);
  }
});
