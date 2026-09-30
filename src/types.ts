// Shared domain + navigation types for the Reherza app.
import type { NavigatorScreenParams } from '@react-navigation/native';

// ── API domain objects (shapes from the backend API reference) ─────────

export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
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

export interface UploadTicket {
  uploadURL: string;
  objectPath: string;
  metadata?: { name: string; size: number; contentType: string };
}

// ── Navigation ──────────────────────────────────────────────────────────

export type TabParamList = {
  Home: undefined;
  Playhouse: undefined;
  Rehearse: undefined;
  Profile: undefined;
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
  Parsing: { id: string };
  ScriptDetail: { id: string };
  ScriptEditor: { id: string };
  /** `focus` = original line indices of the weak lines to re-run (focus mode). */
  RehearsalRoom: { id: string; focus?: number[] };
  SessionResults: { projectId: string; sessionId: string };
  Studio: { id?: string } | undefined;
  TakeReview: { id?: string; uri: string; durationMs: number };
  Billing: undefined;
};
