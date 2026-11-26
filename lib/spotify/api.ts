import { getAccessToken } from "./auth";
import type { Card } from "@/lib/game/types";

const API = "https://api.spotify.com/v1";

async function api<T>(path: string, attempt = 0): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 429) {
    const retry = Number(res.headers.get("Retry-After") ?? "1");
    // Bail instead of hanging forever when Spotify is hard rate-limiting.
    if (attempt >= 2 || retry > 8) {
      throw new Error(`Spotify rate-limited (${path})`);
    }
    await new Promise((r) => setTimeout(r, (retry + 0.5) * 1000));
    return api<T>(path, attempt + 1);
  }
  if (!res.ok) {
    let detail = "";
    try {
      detail = await res.text();
    } catch {
      /* ignore */
    }
    throw new Error(`Spotify ${path} → ${res.status}${detail ? `: ${detail}` : ""}`);
  }
  return (await res.json()) as T;
}

// --- minimal shapes of the bits we use ---
interface SpotifyImage {
  url: string;
}
interface SpotifyAlbum {
  id: string;
  name: string;
  release_date: string;
  album_type: string;
  images: SpotifyImage[];
}
interface SpotifyTrack {
  id: string;
  uri: string;
  name: string;
  artists: { name: string; id: string }[];
  album: SpotifyAlbum;
  is_playable?: boolean;
}

// A card plus the artist/album ids behind it, so we can genre-filter and keep
// the deck diverse (no single album or artist flooding it) before shipping.
interface Candidate {
  card: Card;
  artistIds: string[];
  albumId: string;
}

// Keep sleep/study/lo-fi content out of the deck — it has no "release year"
// anyone could guess and it's a mood-killer. We match two signals:
// telltale text in the title/artist/album, and Spotify genres on the artist.
const BLOCKED_PHRASES = [
  "rain sound", "rainstorm", "rainfall", "thunderstorm", "heavy rain",
  "white noise", "pink noise", "brown noise", "static noise",
  "nature sound", "ocean sound", "ocean wave", "forest sound", "bird sound",
  "for sleep", "for sleeping", "deep sleep", "sleep sound", "sleep music",
  "sleepy time", "baby sleep", "fall asleep", "bedtime",
  "study music", "study beats", "focus music", "focus beats",
  "lofi", "lo-fi", "lo fi", "chillhop",
  "meditation", "meditate", "mindfulness", "guided relaxation",
  "relaxation", "calming sound", "soothing sound", "spa music", "massage music",
  "asmr", "binaural", "isochronic",
  "fireplace", "crackling fire", "campfire sound",
  "8 hour", "10 hour", "12 hour", "hours of",
  "womb sound", "fan sound", "hair dryer", "vacuum sound", "insomnia",
];
const BLOCKED_GENRES = [
  "sleep", "white noise", "lo-fi", "lofi", "chillhop", "meditation",
  "binaural", "environmental", "asmr", "study beats", "healing", "nature noise",
];

function textIsBlocked(title: string, artists: string, album: string): boolean {
  const hay = `${title} ${artists} ${album}`.toLowerCase();
  return BLOCKED_PHRASES.some((p) => hay.includes(p));
}

function yearOf(releaseDate: string): number {
  return parseInt(releaseDate.slice(0, 4), 10);
}

function toCandidate(
  track: SpotifyTrack,
  image: string | undefined,
  year: number,
): Candidate {
  return {
    card: {
      token: crypto.randomUUID(),
      trackId: track.id,
      uri: track.uri,
      title: track.name,
      artists: track.artists.map((a) => a.name).join(", "),
      year,
      image,
    },
    artistIds: track.artists.map((a) => a.id).filter(Boolean),
    albumId: track.album?.id ?? "",
  };
}

// Batch-fetch artist genres (up to 50 ids per call) to spot sleep/lo-fi artists.
async function fetchArtistGenres(ids: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    try {
      const data = await api<{ artists: { id: string; genres: string[] }[] }>(
        `/artists?ids=${chunk.join(",")}`,
      );
      for (const a of data.artists ?? []) map.set(a.id, a.genres ?? []);
    } catch {
      /* a failed genre lookup just means those artists aren't genre-filtered */
    }
  }
  return map;
}

export interface SpotifyProfile {
  id: string;
  display_name: string | null;
  product: string; // "premium" | "free" | ...
  country?: string; // market code, needed for artist top-tracks
  images: SpotifyImage[];
}

export async function getProfile(): Promise<SpotifyProfile> {
  return api<SpotifyProfile>("/me");
}

function trackToCandidate(t: SpotifyTrack): Candidate | null {
  if (!t?.id || !t.album?.release_date) return null;
  // Compilations/greatest-hits report the reissue year, not the song's. Skip
  // them — the track usually survives via its original album (earliest-year dedup).
  if (t.album.album_type === "compilation") return null;
  if (textIsBlocked(t.name, t.artists.map((a) => a.name).join(" "), t.album.name)) {
    return null;
  }
  return toCandidate(
    t,
    t.album.images?.[2]?.url ?? t.album.images?.[0]?.url,
    yearOf(t.album.release_date),
  );
}

async function topTracks(range: string): Promise<Candidate[]> {
  const data = await api<{ items: SpotifyTrack[] }>(
    `/me/top/tracks?time_range=${range}&limit=50`,
  );
  return data.items.map(trackToCandidate).filter((c): c is Candidate => c !== null);
}

// The host's actively-saved library — the best source of "real music they chose".
async function savedTracks(pages = 2): Promise<Candidate[]> {
  const out: Candidate[] = [];
  for (let p = 0; p < pages; p++) {
    const data = await api<{ items: { track: SpotifyTrack }[] }>(
      `/me/tracks?limit=50&offset=${p * 50}`,
    );
    if (!data.items?.length) break;
    for (const it of data.items) {
      const c = trackToCandidate(it.track);
      if (c) out.push(c);
    }
  }
  return out;
}

// The last 50 plays. Spotify caps this hard — there's no "full history" endpoint.
async function recentlyPlayed(): Promise<Candidate[]> {
  const data = await api<{ items: { track: SpotifyTrack }[] }>(
    "/me/player/recently-played?limit=50",
  );
  const out: Candidate[] = [];
  for (const it of data.items ?? []) {
    const c = trackToCandidate(it.track);
    if (c) out.push(c);
  }
  return out;
}

async function topArtistIds(range: string, limit: number): Promise<string[]> {
  const data = await api<{ items: { id: string }[] }>(
    `/me/top/artists?time_range=${range}&limit=${limit}`,
  );
  return data.items.map((a) => a.id);
}

// An artist's biggest hits in a single call — hugely cheaper than digging
// album-by-album (which rate-limited and hung the deck build).
async function artistTopTracks(
  artistId: string,
  market: string,
): Promise<Candidate[]> {
  const data = await api<{ tracks: SpotifyTrack[] }>(
    `/artists/${artistId}/top-tracks?market=${market}`,
  );
  return (data.tracks ?? [])
    .map(trackToCandidate)
    .filter((c): c is Candidate => c !== null);
}

export interface DeckProgress {
  stage: string;
  count: number;
}

// Build a card pool from the host's listening history. Top tracks give the
// familiar hits; top artists' back-catalogue widens the year spread so the
// timeline game actually has some tension.
export async function buildDeck(
  opts: {
    artists?: number;
    market?: string;
    maxPerAlbum?: number;
    maxPerArtist?: number;
  } = {},
  onProgress?: (p: DeckProgress) => void,
): Promise<Card[]> {
  const artistCount = opts.artists ?? 20;
  const market = opts.market || "US";

  const byTrackId = new Map<string, Candidate>();
  const add = (cands: Candidate[]) => {
    for (const c of cands) {
      const existing = byTrackId.get(c.card.trackId);
      // Keep the earliest year we've seen for a track (closest to original release).
      if (!existing || c.card.year < existing.card.year) {
        byTrackId.set(c.card.trackId, c);
      }
    }
  };

  onProgress?.({ stage: "Reading your top tracks", count: 0 });
  for (const range of ["long_term", "medium_term", "short_term"]) {
    try {
      add(await topTracks(range));
    } catch {
      /* one range failing shouldn't sink the deck */
    }
    onProgress?.({ stage: "Reading your top tracks", count: byTrackId.size });
  }

  onProgress?.({ stage: "Reading your saved songs", count: byTrackId.size });
  try {
    add(await savedTracks(4));
  } catch {
    /* library may be empty or unauthorised */
  }

  onProgress?.({ stage: "Reading recently played", count: byTrackId.size });
  try {
    add(await recentlyPlayed());
  } catch {
    /* recently-played may be unavailable */
  }
  console.log(`[hitster] after top + saved + recent tracks: ${byTrackId.size}`);

  // Distinct artists across two time ranges — more artists = more catalogue.
  const artistIdSet = new Set<string>();
  for (const range of ["long_term", "medium_term"]) {
    try {
      for (const id of await topArtistIds(range, artistCount)) artistIdSet.add(id);
    } catch {
      /* skip a failed range */
    }
  }
  const artistIds = [...artistIdSet].slice(0, artistCount);
  for (let i = 0; i < artistIds.length; i++) {
    onProgress?.({
      stage: `Pulling top artists' hits (${i + 1}/${artistIds.length})`,
      count: byTrackId.size,
    });
    try {
      add(await artistTopTracks(artistIds[i], market));
    } catch {
      // One flaky/rate-limited artist shouldn't sink the whole deck.
    }
  }

  let candidates = [...byTrackId.values()].filter((c) =>
    Number.isFinite(c.card.year),
  );
  console.log(`[hitster] candidates before genre filter: ${candidates.length}`);

  // Genre filter: drop tracks whose primary artist is a sleep/lo-fi/noise act.
  onProgress?.({ stage: "Filtering out sleep & lo-fi", count: candidates.length });
  const uniqueArtistIds = [...new Set(candidates.flatMap((c) => c.artistIds))];
  const genresById = await fetchArtistGenres(uniqueArtistIds);
  const artistBlocked = (id: string) =>
    (genresById.get(id) ?? []).some((g) =>
      BLOCKED_GENRES.some((b) => g.toLowerCase().includes(b)),
    );
  candidates = candidates.filter((c) => {
    const primary = c.artistIds[0];
    return !primary || !artistBlocked(primary);
  });
  console.log(`[hitster] deck after genre filter: ${candidates.length}`);

  // Shuffle (Fisher–Yates) FIRST, so the diversity caps below keep a random
  // subset of each album/artist rather than always the earliest ones.
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }

  // Diversity caps: no single album or artist should flood the deck, so songs
  // from the same record don't keep turning up back-to-back.
  const maxPerAlbum = opts.maxPerAlbum ?? 2;
  const maxPerArtist = opts.maxPerArtist ?? 8;
  const perAlbum = new Map<string, number>();
  const perArtist = new Map<string, number>();
  const deck: Card[] = [];
  for (const c of candidates) {
    const a = c.albumId;
    const ar = c.artistIds[0] ?? "";
    if (a && (perAlbum.get(a) ?? 0) >= maxPerAlbum) continue;
    if (ar && (perArtist.get(ar) ?? 0) >= maxPerArtist) continue;
    perAlbum.set(a, (perAlbum.get(a) ?? 0) + 1);
    perArtist.set(ar, (perArtist.get(ar) ?? 0) + 1);
    deck.push(c.card);
  }
  console.log(`[hitster] deck after diversity caps: ${deck.length}`);

  onProgress?.({ stage: "Deck ready", count: deck.length });
  return deck;
}
