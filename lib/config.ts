// Central place to read public env. Everything here is client-safe
// (PKCE needs no secret; the Supabase anon key is meant to be public).

export const SPOTIFY_CLIENT_ID = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID ?? "";
export const SPOTIFY_REDIRECT_URI =
  process.env.NEXT_PUBLIC_SPOTIFY_REDIRECT_URI ?? "http://127.0.0.1:3000/callback";

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

// Scopes: top-read for the deck, streaming + playback for full-track playback,
// read-email/private are required by the Web Playback SDK to identify the user.
export const SPOTIFY_SCOPES = [
  "user-top-read",
  "user-read-recently-played",
  "user-library-read",
  "streaming",
  "user-read-email",
  "user-read-private",
  "user-modify-playback-state",
  "user-read-playback-state",
].join(" ");

export const WINNING_CARD_COUNT = 10;
export const STARTING_TOKENS = 2;
