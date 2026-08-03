import * as SecureStore from 'expo-secure-store';
import { API_URL } from '../config';

// The JWT lives in the platform keystore (iOS Keychain / Android Keystore)
// via expo-secure-store — never in plaintext storage.
const TOKEN_KEY = 'reherza.token';
let authToken: string | null = null;

export async function loadToken(): Promise<string | null> {
  authToken = await SecureStore.getItemAsync(TOKEN_KEY);
  return authToken;
}

export async function setToken(token: string | null): Promise<void> {
  authToken = token;
  if (token) await SecureStore.setItemAsync(TOKEN_KEY, token);
  else await SecureStore.deleteItemAsync(TOKEN_KEY);
}

export function getToken(): string | null {
  return authToken;
}

export class ApiError extends Error {
  status: number; // 0 = network failure
  body: unknown;

  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  timeout?: number;
}

// Core fetch wrapper. Throws ApiError on any non-2xx or network failure so
// screens can branch on `err.status` (401 → sign out, 402 → Billing, …).
export async function api<T = unknown>(
  path: string,
  { method = 'GET', body, timeout = 60000 }: RequestOptions = {}
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    throw new ApiError(0, "Can't reach the Reherza server. Check your connection.", null);
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const serverMessage =
      data && typeof data === 'object' && 'error' in data
        ? String((data as { error: unknown }).error)
        : null;
    const message =
      serverMessage ||
      (res.status === 429
        ? 'Too many requests — give it a moment.'
        : `Request failed (${res.status})`);
    throw new ApiError(res.status, message, data);
  }
  return data as T;
}
