// Pure helpers for the rehearsal room — a port of the web's RehearsalRoom
// turn logic, lib/endpointing.ts, lib/prep-lines.ts and lib/analysis.ts
// (wordDiff). No React Native imports, so `node dev/check-rehearsal.ts` can
// exercise it.
import type { DeliveryScores, ParsedLine, PlayableLine } from '../types';
import type { PrepLine } from '../api';

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

// ── Endpointing: a port of the web's lib/endpointing.ts ──────────────────
// Silence is always measured from the audio level. Speech recognition only
// changes how much trailing silence ends the turn: a line heard through ends
// fast, a half-said line gets patience, a barely-started one up to 10 s.
const LINE_COMPLETE_MS = 500;
const MOSTLY_SPOKEN_RATIO = 0.75;
const MOSTLY_SPOKEN_FLOOR_MS = 500;
const MIN_SPOKEN_RATIO = 0.4;
const MIN_SPOKEN_FLOOR_MS = 400;
const MIN_COVERAGE = 0.3;
const GIVE_UP_SILENCE_MS = 10000;
/** The web's patience on phones: Rehearsal 1000 ms, Self-Tape 2000 ms. */
export const PATIENT_MS = 1000;
export const STUDIO_PATIENT_MS = 2000;
/** Share of the line's words heard that counts as "said through". */
export const LINE_COMPLETE_COVERAGE = 0.8;
export const LONG_PAUSE_MS = 1500;

export interface LineSignal {
  /** Recognition is running and has produced results for this line. */
  contentSignal?: boolean;
  /** Coverage has reached LINE_COMPLETE_COVERAGE at some point this line. */
  lineComplete?: boolean;
  coverage?: number;
}

/** How much trailing silence ends the turn (the web's silenceWindow). */
export function silenceWindowMs(speechMs: number, expected: number, patientMs = PATIENT_MS, sig: LineSignal = {}): number {
  if (sig.lineComplete) return LINE_COMPLETE_MS;
  if (expected > 0) {
    const covered = (sig.coverage ?? 0) >= MIN_COVERAGE;
    const spoke = speechMs >= Math.max(MIN_SPOKEN_FLOOR_MS, expected * MIN_SPOKEN_RATIO);
    if (!covered && !spoke) return GIVE_UP_SILENCE_MS;
  }
  if (sig.contentSignal) return patientMs;
  return expected > 0 && speechMs >= expected * MOSTLY_SPOKEN_RATIO && speechMs >= MOSTLY_SPOKEN_FLOOR_MS ? LINE_COMPLETE_MS : patientMs;
}

/** The web's tokenizer, plus curly apostrophes folded so "I’d" meets "I'd". */
export const tokens = (s: string): string[] =>
  s.toLowerCase().replace(/[’‘]/g, "'").replace(/[^a-z0-9\s']/gi, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);

/** Share of the line's words present anywhere in the transcript (order-free, as on the web). */
export function lineCoverage(transcript: string, expectedWords: string[]): number {
  if (!expectedWords.length) return 0;
  const heard = new Set(tokens(transcript));
  return expectedWords.filter((w) => heard.has(w)).length / expectedWords.length;
}

// ── Level gate: is the actor making sound right now? ──
// The web decides this with a VAD over true RMS. Native gets one level per
// ~100 ms whose scale differs by phone and source (Android's recorder meter
// is a peak, the recognizer's volume is its own scale), so a fixed dB
// threshold misfires: noise reads as speech and the turn never ends. The gate
// is relative to the room instead: the noise floor is a low percentile of the
// last few seconds (robust to one-off dips, which a plain minimum is not, and
// speech always has gaps within that window), speech is a clear rise above
// it, with on/off hysteresis like the web VAD's 0.5 / 0.35.
// ponytail: fixed margins; tune GATE_ON/OFF_DB per device class if needed.
const GATE_ON_DB = 14;
const GATE_OFF_DB = 9;
const FLOOR_WINDOW_MS = 4000;
const FLOOR_PERCENTILE = 0.1;
const FLOOR_CAP_DB = -40;   // until the room has been heard, assume a quiet one
const FLOOR_WARMUP_MS = 1000;
const NO_SIGNAL_DB = -100;  // -160 = no data (first poll, silenced capture)

export interface LevelGate { history: Array<{ t: number; db: number }>; floor: number; speaking: boolean }
export const newLevelGate = (): LevelGate => ({ history: [], floor: FLOOR_CAP_DB, speaking: false });

export function feedLevel(g: LevelGate, db: number, now: number): LevelGate {
  if (db <= NO_SIGNAL_DB) return { ...g, speaking: false };
  const history = [...g.history.filter((h) => now - h.t <= FLOOR_WINDOW_MS), { t: now, db }];
  const sorted = history.map((h) => h.db).sort((a, b) => a - b);
  const quietest = sorted[Math.floor((sorted.length - 1) * FLOOR_PERCENTILE)];
  const warm = now - history[0].t >= FLOOR_WARMUP_MS;
  const floor = warm ? quietest : Math.min(FLOOR_CAP_DB, quietest);
  const speaking = db - floor >= (g.speaking ? GATE_OFF_DB : GATE_ON_DB);
  return { history, floor, speaking };
}

/** The recognizer's volume event (-2…10, linear over -60…0 dB) back to dB. */
export const volumeToDb = (v: number): number => ((v + 2) / 12) * 60 - 60;

export interface Endpointer {
  speechMs: number;
  silenceMs: number;
  longPauses: number;
  firstSpeechAt: number | null;
  lastSpeechAt: number | null;
  /** The silence window last applied, for debugging. */
  windowMs: number;
  /** True once, when trailing silence crosses the window after speech. */
  done: boolean;
}

export const newEndpointer = (): Endpointer => ({
  speechMs: 0, silenceMs: 0, longPauses: 0, firstSpeechAt: null, lastSpeechAt: null, windowMs: 0, done: false,
});

/** Feed one frame. `dt` = ms since the previous frame. */
export function feedEndpointer(
  e: Endpointer, speaking: boolean, dt: number, now: number, expected: number,
  patientMs = PATIENT_MS, sig: LineSignal = {}
): Endpointer {
  if (e.done) return e;
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
    n.windowMs = silenceWindowMs(n.speechMs, expected, patientMs, sig);
    if (n.silenceMs >= n.windowMs) n.done = true;
  }
  return n;
}

/**
 * One user turn: level frames and recognition results in, "done" out. Both
 * screens drive this; only where their level and transcript come from differs.
 */
export class LineTurn {
  ep = newEndpointer();
  coverage = 0;
  lineComplete = false;
  contentSignal = false;
  /** Any sound or any recognized word this turn. */
  heard = false;
  /** Any real level frame at all; a silenced capture only ever reports -160. */
  hadSignal = false;
  private words: string[];
  /** Every word recognized this turn: a recognizer revision or a segment
   *  reset can't un-hear one. */
  private heardWords = new Set<string>();
  private expected: number;
  private patientMs: number;
  private gate: { current: LevelGate };
  private last = 0;
  constructor(text: string, expected: number, patientMs: number, gate: { current: LevelGate }) {
    this.words = tokens(text);
    this.expected = expected;
    this.patientMs = patientMs;
    this.gate = gate;
  }
  /** A level frame in dB. Returns true once, when the turn has ended. */
  level(db: number, now: number): boolean {
    const was = this.ep.done;
    const dt = this.last ? Math.min(now - this.last, 400) : 100;
    this.last = now;
    if (db > NO_SIGNAL_DB) this.hadSignal = true;
    this.gate.current = feedLevel(this.gate.current, db, now);
    if (this.gate.current.speaking) this.heard = true;
    this.ep = feedEndpointer(this.ep, this.gate.current.speaking, dt, now, this.expected, this.patientMs, {
      contentSignal: this.contentSignal, lineComplete: this.lineComplete, coverage: this.coverage > 0 ? this.coverage : undefined,
    });
    return !was && this.ep.done;
  }
  transcript(text: string) {
    this.contentSignal = true;
    if (text.trim()) this.heard = true;
    for (const w of tokens(text)) this.heardWords.add(w);
    this.coverage = this.words.length ? this.words.filter((w) => this.heardWords.has(w)).length / this.words.length : 0;
    if (this.coverage >= LINE_COMPLETE_COVERAGE) this.lineComplete = true;
  }
  /** Recognition stopped: fall back to the time-only rule, as the web does. */
  speechLost() { this.contentSignal = false; }
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

// The web's buildPrepLines: the AI-spoken lines of a scene, each with its
// neighbours as context, in the shape /tts/preflight and /tts/pregenerate take.
export function buildPrepLines(
  ordered: ParsedLine[],
  isAi: (line: ParsedLine) => boolean,
  voiceOf: (speaker: string) => string
): PrepLine[] {
  const out: PrepLine[] = [];
  ordered.forEach((line, i) => {
    if (!isAi(line)) return;
    const prev = ordered[i - 1];
    const next = ordered[i + 1];
    out.push({
      text: line.text,
      voiceId: voiceOf(line.speaker),
      speaker: line.speaker,
      contextBefore: prev ? `${prev.speaker}: ${prev.text}` : undefined,
      contextAfter: next ? `${next.speaker}: ${next.text}` : undefined,
      action: [line.action, line.deliveryNote].filter((v) => v?.trim()).join('; ') || undefined,
      emotion: line.emotion,
      intensity: line.intensity,
      audioTags: line.audioTags,
    });
  });
  return out;
}
