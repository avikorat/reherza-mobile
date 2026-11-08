// Display rules shared with the web client, kept to the same behaviour so the
// two never disagree about a title, a credit figure or a line count.
// Sources: frontend lib/format-title.ts, lib/script-lines.ts, lib/error-codes.ts,
// api-client/credits.ts, components/ParseProgressBar.tsx.

const SCRIPT_EXTENSIONS = /\.(pdf|fdx|txt|docx?|rtf|fountain|md|pages)$/i;

/** "my_sides-v2.pdf" → "My Sides V 2". */
export function formatScriptTitle(raw: string | null | undefined): string {
  let s = (raw || '').trim();
  if (!s) return 'Untitled';
  s = s
    .replace(SCRIPT_EXTENSIONS, '')
    .replace(/[_+.\-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/([a-zA-Z])(\d)/g, '$1 $2')
    .replace(/(\d)([a-zA-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return 'Untitled';
  return s
    .split(' ')
    .map((w) => {
      if (/[A-Z]/.test(w) && /^[A-Z0-9]{2,4}$/.test(w)) return w;
      if (/^\d+$/.test(w)) return w;
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(' ');
}

type LineLike = { speaker?: string | null; text?: string | null; type?: string | null; spoken?: boolean | null };

export const isSpokenDialogue = (l: LineLike | null | undefined): boolean =>
  !!l && (l.type ?? 'dialogue') === 'dialogue' && l.spoken !== false && !!l.speaker?.trim() && !!l.text?.trim();

export const spokenDialogueCount = (lines: readonly LineLike[] | null | undefined): number =>
  (lines ?? []).filter(isSpokenDialogue).length;

export const isAllowanceFailure = (code: string | null | undefined): boolean =>
  code === 'AI_CREDITS_EXHAUSTED' || code === 'INSUFFICIENT_SCRIPT_ALLOWANCE';

/** Credits are stored as thousandths. "6", "5.75", "0.25" — floored, never rounded up. */
export function formatCredits(milli: number | undefined): string {
  const credits = (milli ?? 0) / 1000;
  const floored = Math.floor(Math.abs(credits) * 100) / 100;
  return (credits < 0 ? -floored : floored).toFixed(2).replace(/\.?0+$/, '') || '0';
}

export function creditsLabel(milli: number | undefined): string {
  const t = formatCredits(milli);
  return `${t} ${t === '1' ? 'credit' : 'credits'}`;
}

// Parse progress is an estimate anchored to when the parse started, so the
// dashboard tile and the script page always show the same figure.
const TAU_MS = 35_000;
const STAGES = [
  { at: 0, label: 'Reading your script' },
  { at: 25, label: 'Detecting characters' },
  { at: 50, label: 'Splitting dialogue into lines' },
  { at: 75, label: 'Polishing and double-checking' },
];

export const parseProgressPercent = (startedAtMs: number, nowMs: number): number =>
  Math.min(95, 95 * (1 - Math.exp(-Math.max(0, nowMs - startedAtMs) / TAU_MS)));

export function parseProgressStage(pct: number): string {
  let label = STAGES[0].label;
  for (const s of STAGES) if (pct >= s.at) label = s.label;
  return label;
}

/** A typed phone number → E.164, or null. A bare 10-digit number is read as
 *  US, matching the web form's default country. */
export function toE164(raw: string): string | null {
  const t = raw.trim();
  const digits = t.replace(/[^\d]/g, '');
  const e164 = t.startsWith('+') || digits.length !== 10 ? `+${digits}` : `+1${digits}`;
  return /^\+[1-9]\d{7,14}$/.test(e164) ? e164 : null;
}
