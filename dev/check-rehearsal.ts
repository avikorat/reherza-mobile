// One runnable check for the rehearsal helpers: `node dev/check-rehearsal.ts`.
import assert from 'node:assert/strict';
import { buildSequence, feedEndpointer, findRedoStep, newEndpointer, silenceWindowMs, wordDiff, sceneWindow } from '../src/lib/rehearsal.ts';
import type { PlayableLine } from '../src/types.ts';

const L = (i: number, mine: boolean, text = 'one two three four'): PlayableLine =>
  ({ lineIndex: i, speaker: mine ? 'ME' : 'AI', text, mine });
const lines = [L(0, false), L(1, true), L(2, false), L(3, true), L(4, false)];

assert.deepEqual(buildSequence(lines), [0, 1, 2, 3, 4]);
assert.deepEqual(buildSequence(lines, [3]), [2, 3], 'focus keeps the cue line');
assert.deepEqual(buildSequence(lines, [99]), [0, 1, 2, 3, 4], 'bad focus falls back');
assert.equal(findRedoStep([0, 1, 2, 3, 4], lines, 2), 1);
assert.equal(findRedoStep([0, 1, 2, 3, 4], lines, 0), 0);

assert.equal(silenceWindowMs(100, 1440), 10000, 'barely spoken → give up window');
assert.equal(silenceWindowMs(700, 1440), 1000, 'partly spoken → patient');
assert.equal(silenceWindowMs(1200, 1440), 500, 'mostly spoken → quick');

let e = newEndpointer();
for (let t = 0; t < 1500; t += 100) e = feedEndpointer(e, -10, 100, t, 1440);
assert.equal(e.done, false);
for (let t = 1500; t < 2100; t += 100) e = feedEndpointer(e, -60, 100, t, 1440);
assert.equal(e.done, true, 'ends after 500 ms of silence once mostly spoken');
assert.equal(e.longPauses, 0);
let q = newEndpointer();
for (let t = 0; t < 1000; t += 100) q = feedEndpointer(q, -60, 100, t, 1440);
assert.equal(q.done, false, 'silence before any speech never ends the turn');

const d = wordDiff("I thought you weren't coming.", "I thought you weren't gonna come");
assert.deepEqual(d.words.map((w) => w.status), ['matched', 'matched', 'matched', 'matched', 'changed']);
assert.deepEqual(d.extras, ['gonna']);
assert.deepEqual(wordDiff('And no — I did.', 'and no i did').words.map((w) => w.status), ['matched', 'matched', 'matched', 'matched', 'matched']);
assert.equal(sceneWindow(lines, 2, -1), 'AI: one two three four\nME: one two three four');
console.log('rehearsal helpers ok');
