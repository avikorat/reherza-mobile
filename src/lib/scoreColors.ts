// ─── Score colour ramp ────────────────────────────────────────────────────────
// A port of the web's `@/lib/score-colors.ts`. The single source of truth for
// turning a 0-100 score into a colour and a label, so a score of 82 can never
// show one band's colour next to another band's label.
//
// The COLOURS are not defined here — `scoreText` / `scoreFill` read the
// `score*` tokens off the active theme. To change what "fair" looks like, edit
// src/theme.ts, not this file.
//
// Two rules keep the ramp readable and keep it from colliding with the UI:
//   1. The ramp is monotonic and contains NO blue. `accent` is the app's
//      interactive colour; a score bar sharing it invites taps on a bar that
//      does nothing. Conversely, ramp colours never appear as chrome.
//   2. Text values are the AA-passing (darker) steps; fills need 3:1 rather
//      than 4.5:1 and are brighter. They are not interchangeable.

import { palette, type Theme } from '../theme';

export type ScoreBand = 'excellent' | 'good' | 'fair' | 'poor';

/** Canonical band thresholds. Everything score-shaped derives from these. */
export const SCORE_THRESHOLDS = { excellent: 85, good: 70, fair: 50 } as const;

export function scoreBand(v: number): ScoreBand {
  if (v >= SCORE_THRESHOLDS.excellent) return 'excellent';
  if (v >= SCORE_THRESHOLDS.good) return 'good';
  if (v >= SCORE_THRESHOLDS.fair) return 'fair';
  return 'poor';
}

/** Text colour for a score — the readable step of the band's hue. */
export function scoreText(theme: Theme, v: number): string {
  switch (scoreBand(v)) {
    case 'excellent': return theme.scoreExcellent;
    case 'good': return theme.scoreGood;
    case 'fair': return theme.scoreFair;
    case 'poor': return theme.scorePoor;
  }
}

/** Bar/dot/pill fill for a score — the brighter step of the band's hue. */
export function scoreFill(v: number): string {
  switch (scoreBand(v)) {
    case 'excellent': return palette.green;
    case 'good': return palette.lime;
    case 'fair': return palette.amber;
    case 'poor': return palette.rose;
  }
}

/** Human label for a headline score readout. */
export function scoreLabel(v: number): string {
  switch (scoreBand(v)) {
    case 'excellent': return 'Excellent';
    case 'good': return 'Good';
    case 'fair': return 'Fair';
    case 'poor': return 'Keep going';
  }
}
