// Every backend call the app makes, grouped by feature.
// See the API reference: all paths are relative to `${API_URL}` (…/api).
import { api, ApiError } from './client';
import { API_URL } from '../config';
import type {
  CreditStatus,
  DeliveryAnalysis,
  FeedbackBody,
  FeedbackEligibility,
  HistoryDetail,
  HistoryResponse,
  DemoScene,
  ParsedLine,
  PlayableLine,
  Project,
  SelfTape,
  Session,
  SessionCoaching,
  SessionFeedback,
  Subscription,
  TranscriptResult,
  TtsResult,
  UploadTicket,
  UsageInfo,
  User,
  Voice,
  VoiceAssignment,
} from '../types';

export { api, ApiError, loadToken, setToken, getToken } from './client';

interface AuthResponse {
  user: User;
  token: string;
}

// ── Auth ────────────────────────────────────────────────────────────────
export const Auth = {
  signupStatus: () => api<{ open: boolean }>('/auth/signup-status'),
  // `acceptedLegal` is REQUIRED by the server: both this route and a first-time
  // cognito-sync return 422 without a complete, current set. See src/legal.ts.
  register: (name: string, email: string, password: string, acceptedLegal: Record<string, string>) =>
    api<AuthResponse>('/auth/register', {
      method: 'POST',
      body: { name, email, password, acceptedLegal },
    }),
  login: (email: string, password: string) =>
    api<AuthResponse>('/auth/login', { method: 'POST', body: { email, password } }),
  // The same gate applies to a first-time Google/Apple sign-in, which has no
  // form — the server enforces it at account creation, not in the UI.
  cognitoSync: (idToken: string, acceptedLegal: Record<string, string>) =>
    api<AuthResponse>('/auth/cognito-sync', { method: 'POST', body: { idToken, acceptedLegal } }),
  logout: () => api<{ message: string }>('/auth/logout', { method: 'POST' }),
  me: () => api<User>('/auth/me'),
  deleteAccount: () => api<{ message: string }>('/auth/account', { method: 'DELETE' }),
};

// When signups are closed the app offers this instead of an account.
export const Waitlist = {
  join: (email: string) =>
    api<{ message: string; alreadyJoined: boolean }>('/waitlist', { method: 'POST', body: { email, source: 'mobile' } }),
};

export const Contact = {
  send: (body: { name: string; email: string; message: string }) =>
    api<{ message: string }>('/contact', { method: 'POST', body: { ...body, source: 'mobile' } }),
};

// ── Projects / scripts ─────────────────────────────────────────────────
export const Projects = {
  list: () => api<Project[]>('/projects'),
  get: (id: string) => api<Project>(`/projects/${id}`),
  create: (title: string, rawScript: string) =>
    api<Project>('/projects', { method: 'POST', body: { title, rawScript } }),
  importText: (title: string, rawScript: string) =>
    api<Project>('/scripts/import', { method: 'POST', body: { title, rawScript } }),
  importFile: (title: string, filename: string, dataBase64: string, forceVision = false) =>
    api<Project>('/scripts/import', {
      method: 'POST',
      body: { title, filename, dataBase64, forceVision },
      timeout: 120000,
    }),
  uploadLimits: () => api<{ maxPages: number; maxWords: number }>('/scripts/upload-limits'),
  /** Model-free: what importing this costs, and whether the user can afford it. */
  preflight: (body: { rawScript: string } | { filename: string; dataBase64: string }) =>
    api<{ requiredMilli: number; remainingMilli: number; pages?: number; allowed: boolean; reused?: boolean }>(
      '/scripts/preflight',
      { method: 'POST', body, timeout: 120000 }
    ),
  /** Text out of a file without creating a project (may escalate a scan to vision). */
  extract: (filename: string, dataBase64: string, forceVision = false) =>
    api<{ text: string }>('/scripts/extract', {
      method: 'POST',
      body: { filename, dataBase64, forceVision },
      timeout: 120000,
    }),
  /** Aborts an in-progress parse and deletes the script. */
  cancelParse: (id: string) => api<{ cancelled: true }>(`/projects/${id}/cancel-parse`, { method: 'POST' }),
  /** What the next change to this script's lines or role costs. `milli` 0 = free. */
  editPrice: (id: string) => api<{ milli: number; voiced: boolean }>(`/projects/${id}/edit-price`),
  update: (id: string, patch: Partial<Project>) =>
    api<Project>(`/projects/${id}`, { method: 'PATCH', body: patch }),
  reprocess: (id: string) => api<Project>(`/projects/${id}/reprocess`, { method: 'POST' }),
  deleteLine: (id: string, lineIndex: number) =>
    api<Project>(`/projects/${id}/lines/${lineIndex}`, { method: 'DELETE' }),
  // One request for the whole selection: the server renumbers after each
  // delete, and refuses (409) if `expectedTotal` no longer matches.
  bulkDeleteLines: (id: string, lineIndexes: number[], expectedTotal?: number) =>
    api<Project>(`/projects/${id}/lines/bulk-delete`, { method: 'POST', body: { lineIndexes, expectedTotal } }),
  remove: (id: string) => api<{ message: string }>(`/projects/${id}`, { method: 'DELETE' }),
  /** What the next delivery analysis of this script costs. `milli` 0 = free. */
  analysisPrice: (id: string) =>
    api<{ milli: number; analysesUsed: number; freeAnalysesPerScript: number }>(`/projects/${id}/analysis-price`),
};

// ── Playhouse demo scenes ──────────────────────────────────────────────
export const DemoScenes = {
  list: () => api<DemoScene[]>('/demo-scenes'),
  instantiate: (slug: string) =>
    api<Project>(`/demo-scenes/${slug}/instantiate`, { method: 'POST' }),
};

// ── Voices & TTS ───────────────────────────────────────────────────────
export const Voices = {
  available: () => api<Voice[]>('/voices/available'),
  forProject: (projectId: string) => api<VoiceAssignment[]>(`/projects/${projectId}/voices`),
  /** What re-voicing this speaker costs. `milli` 0 = free. */
  changePrice: (projectId: string, speaker: string) =>
    api<{ milli: number; isFirstPick: boolean; currentVoiceId: string | null }>(
      `/projects/${projectId}/voices/change-price?speaker=${encodeURIComponent(speaker)}`
    ),
  assign: (projectId: string, speaker: string, voiceId: string, voiceName: string) =>
    api<VoiceAssignment>(`/projects/${projectId}/voices`, {
      method: 'POST',
      body: { speaker, voiceId, voiceName },
    }),
};

export interface TtsParams {
  text: string;
  voiceId: string;
  profile?: 'baseline' | 'enhanced';
  speaker?: string;
  sceneTitle?: string;
  projectId?: string;
  /** "SPEAKER: text" of the neighbouring lines in the performance sequence. */
  contextBefore?: string;
  contextAfter?: string;
  /** "action; deliveryNote" — never spoken, steers the read. */
  action?: string;
  emotion?: string;
  intensity?: number;
  audioTags?: string[];
}

export type PrepLine = Omit<TtsParams, 'profile' | 'sceneTitle' | 'projectId'>;

export interface PrepBatch {
  profile: 'baseline' | 'enhanced';
  sceneTitle: string;
  projectId: string;
  lines: PrepLine[];
}

export interface PregenerateResult {
  ready: boolean;
  total: number;
  generated: number;
  cached: number;
  remaining?: number;
  /** Edited lines that can't get a new voice while out of credits. */
  withheld?: number;
  code?: string;
  requiredCharacters?: number;
  remainingCharacters?: number;
}

export interface PreflightResult {
  allowed: boolean;
  code?: string;
  error?: string;
  billingLocked?: boolean;
}

export const Tts = {
  speak: (params: TtsParams) => api<TtsResult>('/tts', { method: 'POST', body: params, timeout: 90000 }),
  // An early warning, not the gate: anything but an explicit
  // `insufficient_voice_allowance` refusal resolves as allowed.
  preflight: async (body: PrepBatch): Promise<PreflightResult> => {
    try {
      return await api<PreflightResult>('/tts/preflight', { method: 'POST', body });
    } catch (e) {
      const data = e instanceof ApiError ? (e.body as PreflightResult | null) : null;
      if (data?.code === 'insufficient_voice_allowance') return { ...data, allowed: false };
      return { allowed: true };
    }
  },
  // Answers within ~22 s; a `ready: false` + `preparation_in_progress` reply
  // means "call again with the same body".
  pregenerate: (body: PrepBatch) =>
    api<PregenerateResult>('/tts/pregenerate', { method: 'POST', body, timeout: 120000 }),
};

// ── Rehearsal sessions ─────────────────────────────────────────────────
export interface SessionPatch {
  completedLines?: number;
  redoCount?: number;
  duration?: number;
  feedback?: SessionFeedback;
}

export const Sessions = {
  list: (projectId: string) => api<Session[]>(`/projects/${projectId}/sessions`),
  create: (projectId: string) => api<Session>(`/projects/${projectId}/sessions`, { method: 'POST' }),
  get: (projectId: string, sessionId: string) =>
    api<Session>(`/projects/${projectId}/sessions/${sessionId}`),
  update: (projectId: string, sessionId: string, patch: SessionPatch) =>
    api<Session>(`/projects/${projectId}/sessions/${sessionId}`, { method: 'PATCH', body: patch }),
  /** Deletes the saved audio only; the score and stats stay. */
  deleteRecording: (projectId: string, sessionId: string) =>
    api<Session>(`/projects/${projectId}/sessions/${sessionId}/recording`, { method: 'DELETE' }),
  // Idempotent: frozen into the session's feedback on first success.
  coachSummary: (projectId: string, sessionId: string) =>
    api<SessionCoaching>(`/projects/${projectId}/sessions/${sessionId}/coach-summary`, {
      method: 'POST',
      timeout: 90000,
    }),
};

// ── Speech ─────────────────────────────────────────────────────────────
export interface AnalyzeDeliveryBody {
  audioBase64: string;
  mimeType: string;
  /** One UUID per rehearsal pass — every line shares it so the pass costs one credit. */
  analysisId: string;
  sessionId?: string;
  projectId?: string;
  lineIndex: number;
  expected: string;
  speaker: string;
  sceneTitle?: string;
  emotion?: string;
  intensity?: number;
  action?: string;
  deliveryNote?: string;
  contextBefore?: string;
  contextAfter?: string;
  measured?: { transcript?: string; asrConfidence?: number; durationMs?: number; longPauses?: number; timeToFirstSpeechMs?: number };
}

export const Speech = {
  transcribe: (body: { audioBase64: string; mimeType: string; sessionId?: string; lineIndex?: number; expected?: string }) =>
    api<TranscriptResult>('/transcribe', { method: 'POST', body, timeout: 90000 }),
  analyzeDelivery: (body: AnalyzeDeliveryBody) =>
    api<DeliveryAnalysis>('/analyze-delivery', { method: 'POST', body, timeout: 120000 }),
};

// ── Usage & billing ────────────────────────────────────────────────────
export const Usage = {
  me: () => api<UsageInfo>('/usage/me'),
};

export const Dashboard = {
  summary: () =>
    api<{ totalProjects: number; totalSessions: number; totalLinesRehearsed: number; recentProjects: Project[] }>(
      '/dashboard/summary'
    ),
};

export const History = {
  list: () => api<HistoryResponse>('/history'),
  forProject: (projectId: string) => api<HistoryDetail>(`/history/${projectId}`),
};

// Read-only on purpose. Plans, credit packs and card changes are bought on the
// web with Stripe; selling digital goods in-app without Apple IAP / Google Play
// Billing breaks App Store 3.1.1 and Play's payments policy, and so does linking
// out to buy. The Stripe purchase routes (checkout, credits/checkout, portal,
// change-plan, setup-intent, invoices/:id/pay, customer/address, …) are
// therefore not called from this app. Cancelling is not a purchase, so it stays.
export const Billing = {
  subscription: () => api<Subscription | null>('/billing/subscription'),
  credits: () => api<CreditStatus>('/billing/credits'),
  cancel: (atPeriodEnd = true) =>
    api<{ ok: boolean }>('/billing/subscription/cancel', { method: 'POST', body: { atPeriodEnd } }),
};

// ── Product feedback ───────────────────────────────────────────────────
export const Feedback = {
  eligibility: () => api<FeedbackEligibility>('/feedback/eligibility'),
  submit: (body: FeedbackBody) =>
    api<{ message: string; duplicate: boolean }>('/feedback', { method: 'POST', body }),
  /** The user closed the prompt; the server answers 204 regardless. */
  dismiss: () => api<null>('/feedback/dismiss', { method: 'POST' }).catch(() => null),
  draft: () => api<{ draft: (FeedbackBody & { step: number }) | null }>('/feedback/draft'),
  saveDraft: (body: FeedbackBody & { step: number }) => api<null>('/feedback/draft', { method: 'PUT', body }),
  clearDraft: () => api<null>('/feedback/draft', { method: 'DELETE' }),
};

// ── Self-tapes & storage ───────────────────────────────────────────────
export const SelfTapes = {
  list: (projectId: string) => api<SelfTape[]>(`/projects/${projectId}/selftapes`),
  create: (
    projectId: string,
    body: { objectPath: string; mimeType: string; durationMs: number; watermarkBurnedIn: boolean }
  ) => api<SelfTape>(`/projects/${projectId}/selftapes`, { method: 'POST', body }),
  downloadUrl: (projectId: string, takeId: string) =>
    api<{ url: string; expiresInSec: number }>(
      `/projects/${projectId}/selftapes/${takeId}/download-url`
    ),
  remove: (projectId: string, takeId: string) =>
    api<{ message: string }>(`/projects/${projectId}/selftapes/${takeId}`, { method: 'DELETE' }),
};

export const Storage = {
  requestUploadUrl: (name: string, size: number, contentType: string) =>
    api<UploadTicket>('/storage/uploads/request-url', {
      method: 'POST',
      body: { name, size, contentType },
    }),
  /** Streams a private object (owner ACL) — send the bearer token with it. */
  objectUrl: (objectPath: string) => `${API_URL}/storage/objects/${objectPath.replace(/^\/objects\//, '')}`,
  /** Unauthenticated public assets (e.g. Playhouse artwork). */
  publicUrl: (filePath: string) => `${API_URL}/storage/public-objects/${filePath.replace(/^\//, '')}`,
};

// ── Helpers shared by screens ──────────────────────────────────────────

// Which characters does the user play in this project?
export function myCharacters(project: Project | null | undefined): string[] {
  if (project?.selectedCharacters?.length) return project.selectedCharacters;
  if (project?.selectedCharacter) return [project.selectedCharacter];
  return [];
}

// Who performs a line — the web's `roleOf`: an explicit per-line role set in
// the editor wins; otherwise the line is yours when its speaker is a character
// you chose. The editor and the rehearsal room both go through this.
export function isMine(line: ParsedLine, project: Project | null | undefined): boolean {
  if (line.role) return line.role === 'user';
  return myCharacters(project).includes(line.speaker);
}

// The dialogue lines of a project, each tagged with `mine`.
export function playableLines(project: Project | null | undefined): PlayableLine[] {
  return (project?.parsedLines || [])
    .filter((l: ParsedLine) => (l.type ? l.type === 'dialogue' : true) && l.spoken !== false)
    .map((l: ParsedLine) => ({ ...l, mine: isMine(l, project) }));
}
