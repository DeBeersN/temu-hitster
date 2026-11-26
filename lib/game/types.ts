// A song card. `year` is the release year we test placement against.
export interface Card {
  token: string; // opaque id used in shared state (never leaks year until reveal)
  trackId: string; // spotify track id
  uri: string; // spotify:track:... (host uses this to play)
  title: string;
  artists: string;
  year: number;
  image?: string;
}

export interface Player {
  id: string;
  name: string;
  color: string;
  tokens: number;
  isHost: boolean;
  timeline: Card[]; // always kept sorted ascending by year
  connected: boolean;
}

export type RoundPhase =
  | "listening" // song playing, active player hasn't locked a slot yet
  | "challenging" // active locked; others may spend a token to steal
  | "resolved"; // year shown, scored — waiting to commit + advance

// A challenger spends a token to claim the active player is wrong, proposing
// where the card goes on *their own* timeline.
export interface Challenge {
  playerId: string;
  index: number; // gap on the challenger's timeline: 0..timeline.length
}

export interface Round {
  activePlayerId: string;
  token: string; // the mystery card (year hidden from everyone but the host)
  phase: RoundPhase;
  proposedIndex: number | null; // active player's chosen gap: 0..timeline.length
  // Active player can bet a token to also name the exact title + artist.
  bettingTitleArtist: boolean;
  guessTitle: string;
  guessArtist: string;
  challenges: Challenge[];
  reveal: {
    card: Card; // full info, now safe to share
    correct: boolean; // was the ACTIVE player's placement correct
    titleArtistCorrect: boolean;
    keptBy: string | null; // who ends up with the card (active, a stealer, or none)
    stolen: boolean; // true if a challenger stole it
    committed: boolean; // has the outcome been applied to timelines yet
  } | null;
}

export type GameStatus = "lobby" | "playing" | "finished";

export interface GameState {
  code: string;
  status: GameStatus;
  hostId: string;
  players: Player[];
  deckTokens: string[]; // shuffled token ids only — no card data over the wire
  drawIndex: number; // how many tokens consumed so far
  turnOrder: string[]; // player ids in turn order
  turnPointer: number;
  round: Round | null;
  winnerId: string | null;
  createdAt: number;
}
