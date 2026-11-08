// Run: node dev/check-format.ts — the display rules shared with the web.
import assert from 'node:assert/strict';
import { creditsLabel, formatCredits, formatScriptTitle, parseProgressPercent, parseProgressStage, spokenDialogueCount, toE164 } from '../src/lib/format.ts';

assert.equal(formatScriptTitle('BCPE_CHARLIE_Sides_9.pdf'), 'BCPE Charlie Sides 9');
assert.equal(formatScriptTitle('openingNight-act2.docx'), 'Opening Night Act 2');
assert.equal(formatScriptTitle('  '), 'Untitled');
assert.equal(formatCredits(5750), '5.75');
assert.equal(formatCredits(999), '0.99'); // floored, never rounded up
assert.equal(formatCredits(0), '0');
assert.equal(creditsLabel(1000), '1 credit');
assert.equal(creditsLabel(250), '0.25 credits');
assert.equal(spokenDialogueCount([{ speaker: 'A', text: 'hi' }, { speaker: 'A', text: 'x', type: 'action' }, { speaker: '', text: 'y' }, { speaker: 'B', text: 'z', spoken: false }]), 1);
assert.equal(parseProgressPercent(0, 0), 0);
assert.ok(parseProgressPercent(0, 10 * 60_000) <= 95);
assert.equal(parseProgressStage(60), 'Splitting dialogue into lines');
assert.equal(toE164('(415) 555-0123'), '+14155550123');
assert.equal(toE164('+44 20 7946 0958'), '+442079460958');
assert.equal(toE164('12'), null);
console.log('format helpers ok');
