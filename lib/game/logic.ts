import type { Card, GameState, Player } from "./types";
import { WINNING_CARD_COUNT } from "@/lib/config";

export const PLAYER_COLORS = [
  "#ef4444", // red
  "#3b82f6", // blue
  "#22c55e", // green
  "#eab308", // yellow
  "#a855f7", // purple
  "#ec4899", // pink
  "#f97316", // orange
  "#14b8a6", // teal
];

export function insertSorted(timeline: Card[], card: Card): Card[] {
  const next = [...timeline, card];
  next.sort((a, b) => a.year - b.year);
  return next;
}

// Is placing `year` into gap `index` (0..timeline.length) chronologically valid?
// Valid when it sits between its neighbours; equal years are allowed either side.
export function isPlacementCorrect(
  timeline: Card[],
  index: number,
  year: number,
): boolean {
  const left = index > 0 ? timeline[index - 1].year : -Infinity;
  const right = index < timeline.length ? timeline[index].year : Infinity;
  return left <= year && year <= right;
}

// Light fuzzy match so "The Beatles" vs "beatles" etc. doesn't fail a correct guess.
export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, "") // drop "(Remastered 2009)" etc.
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function titleArtistMatches(
  card: Card,
  guessTitle: string,
  guessArtist: string,
): boolean {
  const t = normalizeText(card.title);
  const a = normalizeText(card.artists);
  const gt = normalizeText(guessTitle);
  const ga = normalizeText(guessArtist);
  const titleOk = t.includes(gt) || gt.includes(t);
  const artistOk = a.includes(ga) || ga.includes(a);
  return Boolean(gt) && Boolean(ga) && titleOk && artistOk;
}

export function makePlayer(
  id: string,
  name: string,
  isHost: boolean,
  colorIndex: number,
  startingTokens: number,
): Player {
  return {
    id,
    name,
    color: PLAYER_COLORS[colorIndex % PLAYER_COLORS.length],
    tokens: startingTokens,
    isHost,
    timeline: [],
    connected: true,
  };
}

export function hasWon(player: Player): boolean {
  return player.timeline.length >= WINNING_CARD_COUNT;
}

export function playerById(state: GameState, id: string): Player | undefined {
  return state.players.find((p) => p.id === id);
}

export function activePlayer(state: GameState): Player | undefined {
  if (!state.round) return undefined;
  return playerById(state, state.round.activePlayerId);
}

// Advance to the next connected player and set up a fresh round token.
export function nextTurnPointer(state: GameState): number {
  const n = state.turnOrder.length;
  let p = state.turnPointer;
  for (let i = 0; i < n; i++) {
    p = (p + 1) % n;
    const candidate = playerById(state, state.turnOrder[p]);
    if (candidate?.connected) return p;
  }
  return state.turnPointer;
}
