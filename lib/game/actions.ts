// Host-side state transitions. The host is the single source of truth: it holds
// the full deck privately (so years don't leak over the wire) and is the only
// peer that reveals, scores, and advances turns.
import type { Card, Challenge, GameState } from "./types";
import {
  insertSorted,
  isPlacementCorrect,
  hasWon,
  nextTurnPointer,
  playerById,
  titleArtistMatches,
} from "./logic";

// --- private deck storage (host device only) ---
const deckKey = (code: string) => `hitster.deck.${code}`;

export function saveDeck(code: string, cards: Card[]): void {
  localStorage.setItem(deckKey(code), JSON.stringify(cards));
}

export function loadDeckMap(code: string): Map<string, Card> {
  const raw = localStorage.getItem(deckKey(code));
  const cards: Card[] = raw ? JSON.parse(raw) : [];
  return new Map(cards.map((c) => [c.token, c]));
}

export function cardForToken(deck: Map<string, Card>, token: string): Card {
  const c = deck.get(token);
  if (!c) throw new Error("Unknown card token — deck out of sync.");
  return c;
}

// --- transitions (mutate a draft copy; callers persist the result) ---

function clone(state: GameState): GameState {
  return structuredClone(state);
}

function drawToken(state: GameState): string | null {
  if (state.drawIndex >= state.deckTokens.length) return null;
  const t = state.deckTokens[state.drawIndex];
  state.drawIndex += 1;
  return t;
}

function beginRound(state: GameState): GameState {
  const token = drawToken(state);
  if (!token) {
    // Ran out of songs — whoever has the most cards wins.
    const leader = [...state.players].sort(
      (a, b) => b.timeline.length - a.timeline.length,
    )[0];
    state.status = "finished";
    state.winnerId = leader?.id ?? null;
    state.round = null;
    return state;
  }
  state.round = {
    activePlayerId: state.turnOrder[state.turnPointer],
    token,
    phase: "listening",
    proposedIndex: null,
    bettingTitleArtist: false,
    guessTitle: "",
    guessArtist: "",
    challenges: [],
    reveal: null,
  };
  return state;
}

export function startGame(input: GameState, deck: Map<string, Card>): GameState {
  const state = clone(input);
  // Shuffle turn order.
  const order = state.players.map((p) => p.id);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  state.turnOrder = order;
  state.turnPointer = 0;

  // Deal one revealed starter card to each player.
  for (const p of state.players) {
    const token = drawToken(state);
    if (!token) break;
    p.timeline = [deck.get(token)!];
  }

  state.status = "playing";
  return beginRound(state);
}

// Active player hears the song, then locks the gap they want (0..timeline.length).
// If betting a token to name the song, they also type a title + artist guess.
export function lockPlacement(
  input: GameState,
  playerId: string,
  index: number,
  bet: { title: string; artist: string } | null,
): GameState {
  const state = clone(input);
  if (!state.round || state.round.activePlayerId !== playerId) return state;
  state.round.proposedIndex = index;
  state.round.bettingTitleArtist = bet !== null;
  state.round.guessTitle = bet?.title ?? "";
  state.round.guessArtist = bet?.artist ?? "";
  state.round.phase = "challenging";
  return state;
}

// A non-active player spends a token to contest the placement, proposing a gap
// on their OWN timeline. One challenge per player per round.
export function submitChallenge(
  input: GameState,
  playerId: string,
  index: number,
): GameState {
  const state = clone(input);
  const round = state.round;
  if (!round || round.phase !== "challenging") return state;
  if (playerId === round.activePlayerId) return state;
  if (round.challenges.some((c) => c.playerId === playerId)) return state;
  const p = playerById(state, playerId);
  if (!p || p.tokens < 1) return state;
  p.tokens -= 1;
  round.challenges.push({ playerId, index });
  return state;
}

// Who ends up with the card, given a year? Active player keeps it if right;
// otherwise the first correct challenger (in turn order after the active
// player) steals it. Reads timelines but does NOT mutate them — so it can be
// re-run after a year override.
function resolveOutcome(
  state: GameState,
  proposedIndex: number,
  challenges: Challenge[],
  activeId: string,
  year: number,
): { correct: boolean; keptBy: string | null; stolen: boolean } {
  const active = playerById(state, activeId);
  if (!active) return { correct: false, keptBy: null, stolen: false };
  const correct = isPlacementCorrect(active.timeline, proposedIndex, year);
  if (correct) return { correct, keptBy: active.id, stolen: false };

  const order = state.turnOrder;
  const activePos = order.indexOf(activeId);
  const dist = (pid: string) =>
    (order.indexOf(pid) - activePos + order.length) % order.length;
  const ranked = [...challenges].sort((a, b) => dist(a.playerId) - dist(b.playerId));
  for (const ch of ranked) {
    const chP = playerById(state, ch.playerId);
    if (chP && isPlacementCorrect(chP.timeline, ch.index, year)) {
      return { correct, keptBy: chP.id, stolen: true };
    }
  }
  return { correct, keptBy: null, stolen: false };
}

// Host flips the year. Computes the outcome but does NOT yet touch timelines,
// so the host can still override a wrong release year before committing.
export function computeReveal(
  input: GameState,
  deck: Map<string, Card>,
): GameState {
  const state = clone(input);
  const round = state.round;
  if (!round || round.phase !== "challenging" || round.proposedIndex === null) {
    return state;
  }
  const card = cardForToken(deck, round.token);
  const { correct, keptBy, stolen } = resolveOutcome(
    state,
    round.proposedIndex,
    round.challenges,
    round.activePlayerId,
    card.year,
  );
  const named =
    round.bettingTitleArtist &&
    titleArtistMatches(card, round.guessTitle, round.guessArtist);
  round.reveal = { card, correct, titleArtistCorrect: named, keptBy, stolen, committed: false };
  round.phase = "resolved";
  return state;
}

// Host corrects a wrong release year (re-releases/compilations lie). Recomputes
// the outcome from the corrected year before anything is committed.
export function adjustYear(input: GameState, newYear: number): GameState {
  const state = clone(input);
  const round = state.round;
  if (!round?.reveal || round.reveal.committed || round.proposedIndex === null) {
    return state;
  }
  round.reveal.card.year = newYear;
  const { correct, keptBy, stolen } = resolveOutcome(
    state,
    round.proposedIndex,
    round.challenges,
    round.activePlayerId,
    newYear,
  );
  round.reveal.correct = correct;
  round.reveal.keptBy = keptBy;
  round.reveal.stolen = stolen;
  return state;
}

// Apply the (possibly year-corrected) outcome to timelines and tokens, then
// advance to the next turn.
export function commitAndNext(input: GameState): GameState {
  const state = clone(input);
  const round = state.round;
  if (round?.reveal && !round.reveal.committed) {
    const r = round.reveal;
    const active = playerById(state, round.activePlayerId);
    // Naming the song is a no-risk bonus: +1 token if right, nothing if wrong.
    if (active && round.bettingTitleArtist && r.titleArtistCorrect) {
      active.tokens += 1;
    }
    if (r.keptBy) {
      const keeper = playerById(state, r.keptBy);
      if (keeper) {
        keeper.timeline = insertSorted(keeper.timeline, r.card);
        r.committed = true;
        if (hasWon(keeper)) {
          state.status = "finished";
          state.winnerId = keeper.id;
          return state;
        }
      }
    }
    r.committed = true;
  }
  if (state.status === "finished") return state;
  state.turnPointer = nextTurnPointer(state);
  return beginRound(state);
}

export function setConnected(
  input: GameState,
  playerId: string,
  connected: boolean,
): GameState {
  const state = clone(input);
  const p = playerById(state, playerId);
  if (p) p.connected = connected;
  return state;
}
