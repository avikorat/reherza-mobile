// ── Legal documents ──────────────────────────────────────────────────────────
// The set of documents a NEW account must accept.
//
// This registry mirrors LEGAL_DOCUMENTS in frontend/src/content/legal.ts and
// REQUIRED_LEGAL_DOCUMENTS in backend/src/lib/legal.ts. All THREE are compared
// on every signup — the server rejects a submission whose versions don't match
// with a 422 — so **bump all three in the same change** or nobody can create an
// account from this app.
//
// Only the ids and versions live here. The document TEXT is not copied into
// this repo: it is served from the website and read in a WebView (see
// LegalScreen). A third transcription of ~900 lines of legal prose would drift
// from the approved wording on the first revision that missed this repo, and
// acceptance only ever happens during signup, which is online anyway.
//
// ADDING A DOCUMENT: add the id, title, version and web path here, add the same
// id/version to the frontend registry and the backend's required set, and ship
// a page for it on the site. No migration — acceptances are rows, not columns.

export interface LegalDocument {
  /** Stable key stored in the database. Never rename one of these. */
  id: string;
  title: string;
  /** Path on the website, appended to WEB_URL to build the reader URL. */
  path: string;
  version: string;
  /** One line shown under the title in the list. */
  blurb: string;
}

export const LEGAL_DOCUMENTS: readonly LegalDocument[] = [
  {
    id: 'eula',
    title: 'End User License Agreement',
    path: '/eula',
    version: '1.1',
    blurb: 'The terms you agree to when using Reherza.',
  },
  {
    id: 'privacy',
    title: 'Privacy Policy',
    path: '/privacy',
    version: '1.2',
    blurb: 'What we collect, why, and how long we keep it.',
  },
  {
    id: 'community',
    title: 'Community Guidelines',
    path: '/community-guidelines',
    version: '1.0',
    blurb: 'What belongs in the Playhouse, and what does not.',
  },
  {
    id: 'refund',
    title: 'Refund, Cancellation & Credit Policy',
    path: '/refund-policy',
    version: '1.1',
    blurb: 'Cancelling, refunds, and how voice credits work.',
  },
] as const;

/** `{ eula: '1.1', privacy: '1.2', … }` — the payload both signup routes expect. */
export function acceptedVersions(): Record<string, string> {
  return Object.fromEntries(LEGAL_DOCUMENTS.map((d) => [d.id, d.version]));
}

/**
 * The server's 422 body when a submission is missing or stale. Shaped by
 * `legalRequiredBody()` in backend/src/lib/legal.ts. Surfaced to the user as a
 * prompt to update the app rather than a raw error, since a mismatch means this
 * registry is behind the server's.
 */
export interface LegalRequiredBody {
  error?: string;
  missing?: string[];
  outdated?: { document: string; accepted: string; required: string }[];
}
