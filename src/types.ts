// Shared domain + navigation types for the Reherza app.
import type { NavigatorScreenParams } from '@react-navigation/native';

// ── API domain objects (shapes from the backend API reference) ─────────

export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
  /** Billing handled by an operator (testing cohort): no self-serve upgrade paths. */
  billingLocked?: boolean;
}

export interface ParsedLine {
  speaker: string;
  text: string;
  lineIndex: number;
  type?: string;
  role?: 'user' | 'ai';
  emotion?: string;
  intensity?: number;
  spoken?: boolean;
  confidence?: number;
  /** Stage direction; never spoken, passed to TTS / the analyzer as context. */
  action?: string;
  note?: string;
  deliveryNote?: string;
  audioTags?: string[];
}

export type PlayableLine = ParsedLine & { mine: boolean };

export type ParseStatus = 'processing' | 'ready' | 'failed';

export interface Project {
  id: string;
  userId: string;
  title: string;
  rawScript?: string;
  parsedLines: ParsedLine[];
  speakers: string[];
  selectedCharacter?: string | null;
  selectedCharacters?: string[];
  parseSource?: string;
  parseModel?: string;
  parsedAt?: string | null;
  parseStatus: ParseStatus;
  parseError?: string | null;
  /** e.g. AI_CREDITS_EXHAUSTED — see lib/format isAllowanceFailure. */
  parseErrorCode?: string | null;
  parseStartedAt?: string | null;
  /** 'library' = a Reherza Library scene: free to rehearse, read-only lines. */
  origin?: 'user' | 'library';
  sessionCount?: number;
  lastSessionAt?: string | null;
  createdAt: string;
  updatedAt: string;
  reused?: boolean;
}

export interface DemoScene {
  slug: string;
  title: string;
  genre?: string;
  difficulty?: string;
  synopsis?: string;
  characterCount: number;
  lineCount: number;
  estimatedDuration?: string;
}

export interface Voice {
  voiceId: string;
  name: string;
  description?: string;
  gender?: string;
  accent?: string;
}

export interface VoiceAssignment {
  id: string;
  projectId: string;
  speaker: string;
  voiceId: string;
  voiceName: string;
}

export interface TtsResult {
  audioBase64: string;
  mimeType: string;
  mock?: boolean;
  cached?: boolean;
}

export interface TranscriptResult {
  transcript: string;
  confidence?: number;
  attestation?: string;
}

/** The audio-scorable delivery parameter matrix (0-100 each; null = not assessable). */
export interface DeliveryScores {
  paceRhythm: number | null;
  pitchIntonation: number | null;
  volumeProjection: number | null;
  toneTimbre: number | null;
  articulation: number | null;
  subtextDelivery: number | null;
  authenticity: number | null;
  reactivity: number | null;
  intentionClarity: number | null;
  givenCircumstances: number | null;
  memorization: number | null;
}

export interface DeliveryAnalysis {
  intendedEmotion: string;
  deliveredEmotion: string;
  scores?: DeliveryScores;
  overall?: number;
  coachNote: string;
  strengths?: string[];
  improvements?: Array<{ area: string; note: string; tryThis: string }>;
  retakeFocus?: string;
  attestation?: string;
  /** legacy shape */
  emotionMatch?: number;
  clarity?: number;
  pace?: string;
  pronunciationNotes?: string[];
}

// One performed user line. The client sends placeholders for the scored
// fields; the server recomputes them on the session PATCH.
export interface LineResult {
  lineIndex: number;
  speaker: string;
  expected: string;
  spoken: string;
  analyzed: boolean;
  accuracy: number;
  confidence?: number;
  durationMs?: number;
  longPauses?: number;
  timeToFirstSpeechMs?: number;
  transcriptAttestation?: string;
  missingWords?: string[];
  extraWords?: string[];
  repeatedWords?: string[];
  changedWords?: Array<{ from: string; to: string }>;
  fillerWords?: Array<{ word: string; count: number }>;
  fillerCount?: number;
  wpm?: number;
  lowConfidenceWords?: string[];
  issues?: string[];
  delivery?: DeliveryAnalysis;
}

export interface RecordingClip {
  lineIndex: number;
  speaker: string;
  role: 'user' | 'ai';
  text: string;
  objectPath: string;
  mimeType: string;
}

export interface SessionCoaching {
  summary: string;
  focusAreas: Array<{ area: string; note: string; drill: string }>;
  encouragement: string;
  sceneScores?: {
    emotionalArc: number | null;
    characterConsistency: number | null;
    arcNote: string;
    consistencyNote: string;
  };
}

export interface DeliveryMatrix {
  parameters: Array<{ key: keyof DeliveryScores; label: string; category: string; value: number | null; assessedLines: number }>;
  categories: Array<{ category: string; value: number | null; parameters: DeliveryMatrix['parameters'] }>;
  overall: number | null;
  analyzedCount: number;
}

export type AnalysisSkippedReason = 'limit' | 'declined' | 'budget';

export interface SessionFeedback {
  linesCompleted: number;
  totalLines: number;
  redoCount: number;
  durationSeconds: number;
  /** Null when the analysis was withheld (declined / allowance / budget). */
  confidenceScore: number | null;
  notes: string;
  version?: number;
  analyzedLines?: number;
  lines?: LineResult[];
  metrics?: Record<string, number>;
  scores?: Partial<Record<'accuracy' | 'memorization' | 'pacing' | 'fluency' | 'confidence' | 'completion', number>>;
  coaching?: { summary?: string; strengths?: string[]; improvements?: string[]; practicePlan?: string };
  sessionCoaching?: SessionCoaching;
  weakLineIndices?: number[];
  recording?: { clips: RecordingClip[] };
  deliveryMatrix?: DeliveryMatrix;
  analysisSkipped?: boolean;
  analysisSkippedReason?: AnalysisSkippedReason;
}

export interface Session {
  id: string;
  projectId: string;
  userId: string;
  completedLines: number;
  redoCount: number;
  duration: number;
  feedback: SessionFeedback;
  createdAt: string;
}

export interface UsageInfo {
  costMicrosUsed: number;
  costLimitMicros: number;
  charsUsed: number;
  charLimit: number;
  analysesUsed: number;
  analysisLimit: number | null;
  exceeded: boolean;
  analysesExceeded: boolean;
  isMasterAdmin: boolean;
  charsExceeded?: boolean;
  creditsRemainingMilli?: number;
  // Credits are the unit the user reads; never derive them from the char fields.
  creditsUsedMilli?: number;
  creditLimitMilli?: number;
  purchasedMilli?: number;
  creditsExhausted?: boolean;
}

export interface Plan {
  id: string;
  name: string;
  priceAmount: number;
  currency: string;
  billingPeriod: 'month' | 'year' | string;
  voiceCharacterLimit?: number;
  analysisLimit?: number | null;
  features?: string[];
  purchasable?: boolean;
}

export interface Subscription {
  plan: string;
  planId: string;
  status: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  autoAnalyze?: boolean;
  planDetails?: Plan | null;
}

export interface SelfTape {
  id: string;
  projectId: string;
  objectPath: string;
  mimeType: string;
  durationMs: number;
  watermarkBurnedIn: boolean;
  createdAt: string;
}

/** Extra purchased credits (bought on the web). Milli-credits: 1000 = one credit. */
export interface CreditStatus {
  enabled: boolean;
  validityDays: number;
  balance: { milli: number; chars: number; credits: number; expiresSoonestAt: string | null };
}

export type FeedbackFeature =
  | 'script_import'
  | 'rehearsal_room'
  | 'ai_scene_partner'
  | 'delivery_analysis'
  | 'self_tapes'
  | 'session_results';

export type FeedbackUseAgain = 'definitely' | 'probably' | 'not_sure' | 'probably_not' | 'definitely_not';

export interface FeedbackEligibility {
  /** Admin kill switch: when false, hide the prompt and the manual entry. */
  enabled: boolean;
  hasSubmitted: boolean;
  shouldPrompt: boolean;
  features: FeedbackFeature[];
}

export interface FeedbackBody {
  ratings: Partial<Record<FeedbackFeature, number>>;
  /** Per-section follow-ups: two Yes/No answers and an optional comment. */
  followups?: Partial<Record<FeedbackFeature, { q1?: 'yes' | 'no'; q2?: 'yes' | 'no'; comment?: string }>>;
  liked?: string;
  frustrations?: string;
  useAgain?: FeedbackUseAgain;
  /** "prompt" is once per user; "manual" is unlimited. */
  source?: 'prompt' | 'manual';
}

export interface HistoryEntry {
  kind: 'rehearsal' | 'selftape';
  id: string;
  projectId: string;
  createdAt: string;
  durationSeconds: number;
  /** False for a rehearsal whose audio was never saved or was deleted. */
  hasRecording: boolean;
  confidenceScore: number | null;
  completedLines: number | null;
  mimeType: string | null;
  thumbnailUrl: string | null;
}

export interface HistoryScript {
  projectId: string;
  title: string;
  /** False when the script itself is gone. */
  projectExists: boolean;
  lastActivityAt: string;
  rehearsalCount: number;
  selftapeCount: number;
  thumbnailUrl: string | null;
}

export interface HistoryResponse {
  scripts: HistoryScript[];
  totalRehearsals: number;
  totalSelftapes: number;
}

export interface HistoryDetail {
  projectId: string;
  title: string;
  rehearsalCount: number;
  selftapeCount: number;
  entries: HistoryEntry[];
}

export interface UploadTicket {
  uploadURL: string;
  objectPath: string;
  metadata?: { name: string; size: number; contentType: string };
}

// ── Navigation ──────────────────────────────────────────────────────────

export type TabParamList = {
  Home: undefined;
  Library: undefined;
  History: undefined;
  Settings: undefined;
};

export type RootStackParamList = {
  SignIn: undefined;
  CreateAccount: undefined;
  /** `destination` is Cognito's masked delivery target, e.g. "a***@e***.com". */
  VerifyEmail: { destination?: string } | undefined;
  /** `email` pre-fills the request step when arriving from Sign In. */
  ResetPassword: { email?: string } | undefined;
  /** Opens one legal document. Each is reached directly — by its own link in
   *  the signup consent line, or its own row in Profile — so there is no index. */
  Legal: { docId: string };
  Main: NavigatorScreenParams<TabParamList> | undefined;
  NewScript: undefined;
  ScriptDetail: { id: string };
  ScriptEditor: { id: string };
  /** `focus` = original line indices of the weak lines to re-run (focus mode). */
  RehearsalRoom: { id: string; focus?: number[] };
  SessionResults: { projectId: string; sessionId: string };
  /** `countdown` (seconds, 0 = off) comes from the Self tape sheet. */
  Studio: { id?: string; countdown?: number } | undefined;
  TakeReview: { id?: string; uri: string; durationMs: number };
  Billing: undefined;
  /** The web's /history/:id — one script's rehearsals and self-tapes. */
  HistoryScript: { id: string };
  /** `source: 'prompt'` when opened from the once-per-user prompt. */
  Feedback: { source?: 'prompt' | 'manual' } | undefined;
  Contact: undefined;
};
