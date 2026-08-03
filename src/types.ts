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
}

export interface LineResult {
  lineIndex: number;
  speaker: string;
  expected: string;
  spoken: string | null;
  analyzed: boolean;
  accuracy: number | null;
}

export interface SessionFeedback {
  linesCompleted: number;
  totalLines: number;
  redoCount: number;
  durationSeconds: number;
  confidenceScore: number;
  notes: string;
  lines?: LineResult[];
  metrics?: Record<string, number>;
  scores?: Record<string, number>;
  coaching?: { summary?: string; strengths?: string[]; improvements?: string[]; practicePlan?: string };
  analysisSkipped?: boolean;
  analysisSkippedReason?: string;
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
  VerifyEmail: undefined;
  ResetPassword: undefined;
  Main: NavigatorScreenParams<TabParamList> | undefined;
  NewScript: undefined;
  Parsing: { id: string };
  ScriptDetail: { id: string };
  ScriptEditor: { id: string };
  RehearsalRoom: { id: string };
  SessionResults: { projectId: string; title?: string; feedback: SessionFeedback };
  Studio: { id?: string } | undefined;
  TakeReview: { id?: string; uri: string; durationMs: number };
  Billing: undefined;
};
