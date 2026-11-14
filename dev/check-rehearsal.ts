// One runnable check for the rehearsal helpers: `node dev/check-rehearsal.ts`.
import assert from 'node:assert/strict';
import { buildSequence, feedEndpointer, feedLevel, findRedoStep, lineCoverage, LineTurn, newEndpointer, newLevelGate, silenceWindowMs, tokens, volumeToDb, wordDiff, sceneWindow } from '../src/lib/rehearsal.ts';
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

assert.equal(silenceWindowMs(700, 1440, 1000, { contentSignal: true, coverage: 0.5 }), 1000, 'recognition alive → patient');
assert.equal(silenceWindowMs(1200, 1440, 1000, { contentSignal: true, coverage: 0.5 }), 1000, 'web: recognition alive overrides mostly-spoken');
assert.equal(silenceWindowMs(100, 1440, 1000, { lineComplete: true }), 500, 'line heard through → snappy');
assert.equal(silenceWindowMs(100, 1440, 1000, { coverage: 0.3 }), 1000, 'some words heard → not the give-up window');

let e = newEndpointer();
for (let t = 0; t < 1500; t += 100) e = feedEndpointer(e, true, 100, t, 1440);
assert.equal(e.done, false);
for (let t = 1500; t < 2100; t += 100) e = feedEndpointer(e, false, 100, t, 1440);
assert.equal(e.done, true, 'ends after 500 ms of silence once mostly spoken');
assert.equal(e.longPauses, 0);
let q = newEndpointer();
for (let t = 0; t < 1000; t += 100) q = feedEndpointer(q, false, 100, t, 1440);
assert.equal(q.done, false, 'silence before any speech never ends the turn');

// Level gate: learns the room, follows a noise change, has hysteresis.
let g = newLevelGate();
for (let t = 0; t < 1000; t += 100) g = feedLevel(g, -55, t);
assert.equal(g.speaking, false, 'room noise is not speech');
g = feedLevel(g, -20, 1000);
assert.equal(g.speaking, true, 'a clear rise is speech');
g = feedLevel(g, -45, 1100);
assert.equal(g.speaking, true, 'hysteresis: a dip between words stays speech');
g = feedLevel(g, -55, 1200);
assert.equal(g.speaking, false, 'back at the floor is silence');
for (let t = 1300; t < 6000; t += 100) g = feedLevel(g, -30, t);
assert.equal(g.speaking, false, 'a louder room becomes the new floor');
assert.equal(feedLevel(g, -160, 6000).speaking, false, 'no-data frames are silence');
// A jittery source (Android recognizer volume): rare deep dips don't drag the
// floor down, so ordinary noise doesn't read as speech.
let j = newLevelGate();
for (let t = 0; t < 5000; t += 100) j = feedLevel(j, t % 1500 === 0 ? -60 : -48 + (t % 300) / 100, t);
assert.equal(j.speaking, false, 'jittery noise with occasional dips is not speech');
j = feedLevel(j, -20, 5000);
assert.equal(j.speaking, true, 'speech still clears it');
assert.equal(Math.round(volumeToDb(10)), 0);
assert.equal(Math.round(volumeToDb(-2)), -60);

// A whole turn, the web's way: a line heard through ends 500 ms after you stop.
const run = (text: string, transcript: string, speakMs: number, withSpeech: boolean) => {
  const gate = { current: newLevelGate() };
  const turn = new LineTurn(text, 360 * tokens(text).length, 1000, gate);
  let t = 0;
  for (; t < 800; t += 100) turn.level(-55, t);           // room before the line
  for (; t < 800 + speakMs; t += 100) {
    turn.level(t % 300 === 0 ? -40 : -15, t);             // speech with dips between words
    if (withSpeech) turn.transcript(transcript.split(' ').slice(0, Math.ceil(((t - 800) / speakMs) * transcript.split(' ').length)).join(' '));
  }
  const stoppedAt = t;
  for (; t < stoppedAt + 12000; t += 100) if (turn.level(-55, t)) return t - stoppedAt;
  return -1;
};
const line = "I told you I'd be back before midnight.";
assert.ok(run(line, "i told you i'd be back before midnight", 2500, true) <= 600, 'said through → ~500 ms');
assert.ok(run(line, 'i told you', 900, true) >= 900 && run(line, 'i told you', 900, true) <= 1100, 'half said, recognition alive → patient 1 s');
assert.ok(run(line, '', 300, false) >= 9900, 'barely started → waits up to 10 s');
assert.equal(lineCoverage('I said I would be back by midnight', tokens(line)), 4 / 8);
assert.equal(lineCoverage('i’d be', tokens("I'd be")), 1, 'curly apostrophes match');
{
  const turn = new LineTurn('one two three four five', 1800, 1000, { current: newLevelGate() });
  turn.transcript('one two three');
  turn.transcript('four five');           // a segment reset drops the earlier words
  assert.equal(turn.coverage, 1, 'coverage keeps every word heard this turn');
  assert.equal(turn.lineComplete, true);
}

const d = wordDiff("I thought you weren't coming.", "I thought you weren't gonna come");
assert.deepEqual(d.words.map((w) => w.status), ['matched', 'matched', 'matched', 'matched', 'changed']);
assert.deepEqual(d.extras, ['gonna']);
assert.deepEqual(wordDiff('And no — I did.', 'and no i did').words.map((w) => w.status), ['matched', 'matched', 'matched', 'matched', 'matched']);
assert.equal(sceneWindow(lines, 2, -1), 'AI: one two three four\nME: one two three four');

console.log('rehearsal helpers ok');
