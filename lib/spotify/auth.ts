// Spotify Authorization Code flow with PKCE — runs entirely in the browser,
// no client secret. Only the host ever goes through this.
import {
  SPOTIFY_CLIENT_ID,
  SPOTIFY_REDIRECT_URI,
  SPOTIFY_SCOPES,
} from "@/lib/config";

const TOKEN_KEY = "hitster.spotify.tokens";
const VERIFIER_KEY = "hitster.spotify.verifier";
const AUTH_URL = "https://accounts.spotify.com/authorize";
const TOKEN_URL = "https://accounts.spotify.com/api/token";

interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // epoch ms
}

function base64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomVerifier(): string {
  const bytes = new Uint8Array(64);
  crypto.getRandomValues(bytes);
  return base64url(bytes);
}

async function challengeFromVerifier(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return base64url(new Uint8Array(digest));
}

export async function beginLogin(): Promise<void> {
  const verifier = randomVerifier();
  localStorage.setItem(VERIFIER_KEY, verifier);
  const challenge = await challengeFromVerifier(verifier);
  const params = new URLSearchParams({
    client_id: SPOTIFY_CLIENT_ID,
    response_type: "code",
    redirect_uri: SPOTIFY_REDIRECT_URI,
    code_challenge_method: "S256",
    code_challenge: challenge,
    scope: SPOTIFY_SCOPES,
    show_dialog: "true", // force the consent screen so all scopes are (re)granted
  });
  // Full-page redirect to Spotify's external auth page — not internal nav.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.href = `${AUTH_URL}?${params.toString()}`;
}

function store(tokens: StoredTokens) {
  localStorage.setItem(TOKEN_KEY, JSON.stringify(tokens));
}

function load(): StoredTokens | null {
  const raw = localStorage.getItem(TOKEN_KEY);
  return raw ? (JSON.parse(raw) as StoredTokens) : null;
}

export function logout() {
  localStorage.removeItem(TOKEN_KEY);
}

export async function completeLogin(code: string): Promise<void> {
  const verifier = localStorage.getItem(VERIFIER_KEY);
  if (!verifier) throw new Error("Missing PKCE verifier — restart the login.");
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: SPOTIFY_REDIRECT_URI,
    client_id: SPOTIFY_CLIENT_ID,
    code_verifier: verifier,
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${await res.text()}`);
  const json = await res.json();
  store({
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  });
  localStorage.removeItem(VERIFIER_KEY);
}

async function refresh(tokens: StoredTokens): Promise<StoredTokens> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: tokens.refreshToken,
    client_id: SPOTIFY_CLIENT_ID,
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`Token refresh failed: ${await res.text()}`);
  const json = await res.json();
  const next: StoredTokens = {
    accessToken: json.access_token,
    // Spotify may or may not return a new refresh token.
    refreshToken: json.refresh_token ?? tokens.refreshToken,
    expiresAt: Date.now() + json.expires_in * 1000,
  };
  store(next);
  return next;
}

export function isAuthed(): boolean {
  return load() !== null;
}

// Always hand back a valid access token, refreshing ~1 min before expiry.
export async function getAccessToken(): Promise<string> {
  let tokens = load();
  if (!tokens) throw new Error("Not connected to Spotify.");
  if (Date.now() > tokens.expiresAt - 60_000) {
    tokens = await refresh(tokens);
  }
  return tokens.accessToken;
}
