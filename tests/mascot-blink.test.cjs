const test = require('node:test');
const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const path = require('node:path');

async function loadBlinkModule() {
  const file = path.resolve(__dirname, '..', 'mascot-blink.js');
  const source = await readFile(file, 'utf8');
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}

const sequence = values => {
  let index = 0;
  const random = () => values[index++] ?? 0.5;
  random.calls = () => index;
  return random;
};

test('closed-eye companion shares the source canvas so eye patches stay aligned', async () => {
  const assets = path.resolve(__dirname, '..', 'assets');
  const [open, closed] = await Promise.all(['mascot-2-5d.png', 'mascot-blink-closed.png']
    .map(name => readFile(path.join(assets, name))));
  assert.deepEqual([...closed.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(closed.readUInt32BE(16), open.readUInt32BE(16));
  assert.equal(closed.readUInt32BE(20), open.readUInt32BE(20));
});

test('blink shape eases closed, holds briefly, and returns open', async () => {
  const { blinkAmountAt } = await loadBlinkModule();
  assert.equal(blinkAmountAt(-1), 0);
  assert.equal(blinkAmountAt(0), 0);
  assert.ok(blinkAmountAt(0.0325) > 0.45 && blinkAmountAt(0.0325) < 0.55);
  assert.equal(blinkAmountAt(0.065), 1);
  assert.equal(blinkAmountAt(0.0775), 1);
  assert.ok(blinkAmountAt(0.1475) > 0.45 && blinkAmountAt(0.1475) < 0.55);
  assert.equal(blinkAmountAt(0.205), 0);
  assert.equal(blinkAmountAt(Infinity), 0);
});

test('primary blink starts 4–7 seconds after creation and stays within range', async () => {
  const { createBlinkTimeline } = await loadBlinkModule();
  const random = sequence([0, 0.5, 0]);
  const timeline = createBlinkTimeline(random); // first blink at 4s
  assert.equal(timeline.sample(3.999), 0);
  assert.equal(timeline.sample(4), 0);
  assert.ok(timeline.sample(4.0325) > 0.45);
  assert.equal(timeline.sample(4.065), 1);
  assert.equal(timeline.sample(4.205), 0);
  assert.equal(timeline.sample(10), 0);
});

test('occasional double blink begins 280–400ms after the first blink ends', async () => {
  const { createBlinkTimeline } = await loadBlinkModule();
  const random = sequence([0, 0, 0.5, 0.5]); // start=4, double, gap=340ms, next interval=5.5
  const timeline = createBlinkTimeline(random);
  timeline.sample(4.01);
  assert.equal(timeline.sample(4.544), 0);
  assert.ok(timeline.sample(4.546) > 0); // 4 + .205 + .34
  assert.equal(timeline.sample(4.611), 1);
  assert.equal(timeline.sample(4.751), 0);
});

test('long jumps skip missed blinks with bounded random consumption', async () => {
  const { createBlinkTimeline } = await loadBlinkModule();
  const random = sequence([0, 0.2]);
  const timeline = createBlinkTimeline(random);
  assert.equal(timeline.sample(1_000_000), 0);
  assert.equal(random.calls(), 2); // creation plus one future interval only
  assert.equal(timeline.sample(1_000_004.59), 0);
  assert.ok(timeline.sample(1_000_004.61) > 0); // a future blink still runs
  assert.equal(random.calls(), 4);
});

test('reset suppresses an immediate blink after visibility resumes', async () => {
  const { createBlinkTimeline } = await loadBlinkModule();
  const random = sequence([0, 0.5, 0]);
  const timeline = createBlinkTimeline(random);
  timeline.sample(4.02);
  timeline.reset(500);
  assert.equal(timeline.sample(500), 0);
  assert.equal(timeline.sample(505.49), 0);
  assert.ok(timeline.sample(505.51) > 0);
});
