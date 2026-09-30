// Pure helpers for the rehearsal room — a port of the web's RehearsalRoom
// turn logic, lib/endpointing.ts, lib/prep-lines.ts and lib/analysis.ts
// (wordDiff). No React Native imports, so `node dev/check-rehearsal.ts` can
// exercise it.
import type { DeliveryScores, ParsedLine, PlayableLine } from '../types';

// ── Sequence ──────────────────────────────────────────────────────────────

/** The steps to perform, as indices into `lines`. Focus mode keeps each weak
 *  user line plus the AI line right before it (the cue). */
export function buildSequence(lines: PlayableLine[], focus?: number[]): number[] {
  const all = lines.map((_, i) => i);
  if (!focus?.length) return all;
  const want = new Set(focus);
  const keep = new Set<number>();
  lines.forEach((l, i) => {
    if (!l.mine || !want.has(l.lineIndex)) return;
    keep.add(i);
    if (i > 0 && !lines[i - 1].mine) keep.add(i - 1);
  });
  return keep.size ? [...keep].sort((a, b) => a - b) : all;
}

/** Redo walks back to the most recent user step (or stays put). */
export function findRedoStep(seq: number[], lines: PlayableLine[], step: number): number {
  for (let s = step; s >= 0; s--) if (lines[seq[s]]?.mine) return s;
  return step;
}

// ── Timing ────────────────────────────────────────────────────────────────

export const wordCount = (text: string): number => text.trim().split(/\s+/).filter(Boolean).length;

/** How long a line should take to say — the endpointing yardstick. */
export const expectedMs = (text: string): number => Math.max(800, wordCount(text) * 360);

/** Silent-read length for a mock / unvoiced AI line. */
export const estimateDuration = (text: string): number => Math.max(1200, text.length * 60);

// Web constants (lib/endpointing.ts). No SpeechRecognition on native, so the
// coverage / lineComplete branches are gone; the time-based rule remains.
const PATIENT_MS = 1000;
const MOSTLY_SPOKEN_MS = 500;
const GIVE_UP_SILENCE_MS = 10000;
const MIN_SPOKEN_FLOOR_MS = 400;
const MIN_SPOKEN_RATIO = 0.4;
const MOSTLY_SPOKEN_RATIO = 0.75;
const MOSTLY_SPOKEN_FLOOR = 500;

/** How much trailing silence ends the turn, given how much has been said. */
export function silenceWindowMs(speechMs: number, expected: number): number {
  if (expected > 0 && speechMs < Math.max(MIN_SPOKEN_FLOOR_MS, expected * MIN_SPOKEN_RATIO)) {
    return GIVE_UP_SILENCE_MS;
  }
  const mostlySpoken = speechMs >= expected * MOSTLY_SPOKEN_RATIO && speechMs >= MOSTLY_SPOKEN_FLOOR;
  return mostlySpoken ? MOSTLY_SPOKEN_MS : PATIENT_MS;
}

// Metering thresholds. expo-av reports the recorder's peak power in dBFS
// (0 = clipping, -160 = silence). Speech on a phone mic sits around -25…-5.
// ponytail: fixed threshold; add a noise-floor calibration (first 300 ms)
// if quiet rooms or loud fans misfire.
export const SPEECH_DB = -32;
export const LONG_PAUSE_MS = 1500;

export interface Endpointer {
  speechMs: number;
  silenceMs: number;
  longPauses: number;
  firstSpeechAt: number | null;
  lastSpeechAt: number | null;
  /** True once, when trailing silence crosses the window after speech. */
  done: boolean;
}

export const newEndpointer = (): Endpointer => ({
  speechMs: 0, silenceMs: 0, longPauses: 0, firstSpeechAt: null, lastSpeechAt: null, done: false,
});

/** Feed one metering sample. `dt` = ms since the previous sample. */
export function feedEndpointer(e: Endpointer, db: number, dt: number, now: number, expected: number): Endpointer {
  if (e.done) return e;
  const speaking = db >= SPEECH_DB;
  const n = { ...e };
  if (speaking) {
    n.speechMs += Math.min(dt, 250);
    n.firstSpeechAt ??= now;
    n.lastSpeechAt = now;
    n.silenceMs = 0;
  } else if (n.firstSpeechAt != null) {
    const before = n.silenceMs;
    n.silenceMs += dt;
    if (before < LONG_PAUSE_MS && n.silenceMs >= LONG_PAUSE_MS) n.longPauses += 1;
    if (n.silenceMs >= silenceWindowMs(n.speechMs, expected)) n.done = true;
  }
  return n;
}

// ── TTS payloads ──────────────────────────────────────────────────────────

const ctx = (l: ParsedLine | undefined) => (l ? `${l.speaker}: ${l.text}` : undefined);

export function ttsContext(lines: PlayableLine[], seq: number[], step: number) {
  const l = lines[seq[step]];
  return {
    text: l.text,
    speaker: l.speaker,
    contextBefore: ctx(lines[seq[step - 1]]),
    contextAfter: ctx(lines[seq[step + 1]]),
    action: [l.action, l.deliveryNote].filter((v) => v?.trim()).join('; ') || undefined,
    emotion: l.emotion,
    intensity: l.intensity,
    audioTags: l.audioTags,
  };
}

/** ≤4 spoken lines on one side of `idx`, "SPEAKER: text" joined, ≤2400 chars. */
export function sceneWindow(lines: PlayableLine[], idx: number, dir: -1 | 1): string | undefined {
  const picked: string[] = [];
  for (let i = idx + dir, n = 0; i >= 0 && i < lines.length && n < 4; i += dir, n++) {
    picked[dir < 0 ? 'unshift' : 'push'](`${lines[i].speaker}: ${lines[i].text}`);
  }
  while (picked.length && picked.join('\n').length > 2400) picked[dir < 0 ? 'shift' : 'pop']();
  return picked.length ? picked.join('\n') : undefined;
}

export const clip = (s: string | undefined, n: number) => (s && s.length > n ? s.slice(0, n) : s);

// ── Word diff (results page) ──────────────────────────────────────────────

export type WordStatus = 'matched' | 'changed' | 'missing';
export interface WordToken { text: string; status: WordStatus; spoken?: string }

const norm = (w: string) => w.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]/g, '');

export function wordDiff(expected: string, spoken: string): { words: WordToken[]; extras: string[] } {
  const exp = expected.trim().split(/\s+/).filter(Boolean);
  const spk = spoken.trim().split(/\s+/).filter(Boolean);
  const words: WordToken[] = exp.map((text) => ({ text, status: 'missing' }));
  const extras: string[] = [];
  if (!exp.length) return { words, extras: spk };
  if (!spk.length) return { words, extras };

  const a = exp.map(norm);
  const b = spk.map(norm);
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = 0; i <= n; i++) dp[i][0] = i;
  for (let j = 0; j <= m; j++) dp[0][j] = j;
  for (let i = 1; i <= n; i++)
    for (let j = 1; j <= m; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));

  let i = n, j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1] && dp[i][j] === dp[i - 1][j - 1]) {
      words[i - 1].status = 'matched'; i--; j--;
    } else if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + 1) {
      words[i - 1].status = 'changed'; words[i - 1].spoken = spk[j - 1]; i--; j--;
    } else if (j > 0 && dp[i][j] === dp[i][j - 1] + 1) {
      extras.unshift(spk[j - 1]); j--;
    } else {
      i--;
    }
  }
  // A token that is only punctuation ("—") can't be spoken; never flag it.
  for (const w of words) if (!norm(w.text)) w.status = 'matched';
  return { words, extras };
}

// ── Delivery parameter labels (results page) ──────────────────────────────

export const DELIVERY_PARAMS: Array<{ key: keyof DeliveryScores; label: string; short: string; category: string }> = [
  { key: 'paceRhythm', label: 'Pace & Rhythm', short: 'Pace', category: 'Vocal' },
  { key: 'pitchIntonation', label: 'Pitch & Intonation', short: 'Intonation', category: 'Vocal' },
  { key: 'volumeProjection', label: 'Volume & Projection', short: 'Projection', category: 'Vocal' },
  { key: 'toneTimbre', label: 'Tone & Timbre', short: 'Tone', category: 'Vocal' },
  { key: 'articulation', label: 'Articulation', short: 'Articulation', category: 'Vocal' },
  { key: 'subtextDelivery', label: 'Subtext Delivery', short: 'Subtext', category: 'Emotional & Interpretive' },
  { key: 'authenticity', label: 'Authenticity', short: 'Authenticity', category: 'Emotional & Interpretive' },
  { key: 'reactivity', label: 'Reactivity', short: 'Reactivity', category: 'Emotional & Interpretive' },
  { key: 'intentionClarity', label: 'Objective & Intention Clarity', short: 'Intention', category: 'Textual & Character' },
  { key: 'givenCircumstances', label: 'Given Circumstances', short: 'Circumstances', category: 'Textual & Character' },
  { key: 'memorization', label: 'Memorization Accuracy', short: 'Memorization', category: 'Technical' },
];

export const paramLabel = (key: string) => DELIVERY_PARAMS.find((p) => p.key === key)?.short || key;
