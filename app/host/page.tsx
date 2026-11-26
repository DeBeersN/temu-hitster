"use client";
import { useCallback, useEffect, useState } from "react";
import {
  Button,
  Panel,
  PlacementPreview,
  QrCode,
  SongCard,
  Timeline,
} from "@/app/components/ui";
import { beginLogin, isAuthed, logout } from "@/lib/spotify/auth";
import { buildDeck, getProfile, type DeckProgress, type SpotifyProfile } from "@/lib/spotify/api";
import {
  fadeAndPause,
  getDevices,
  initWebPlayer,
  playUri,
  type Device,
} from "@/lib/spotify/playback";

// The Web Playback SDK ("Use this tab") doesn't work in mobile browsers and
// creates a phantom device that silently hijacks playback — hide it there.
const IS_MOBILE =
  typeof navigator !== "undefined" &&
  /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
import { getPlayerId } from "@/lib/game/identity";
import { generateCode, createGame, saveGame } from "@/lib/game/rooms";
import { useGame } from "@/lib/game/useGame";
import {
  adjustYear,
  commitAndNext,
  computeReveal,
  loadDeckMap,
  saveDeck,
  startGame,
} from "@/lib/game/actions";
import { playerById } from "@/lib/game/logic";
import type { Card, GameState } from "@/lib/game/types";
import { WINNING_CARD_COUNT } from "@/lib/config";

const HOST_ROOM_KEY = "hitster.host.room";

export default function HostPage() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [profile, setProfile] = useState<SpotifyProfile | null>(null);
  const [deck, setDeck] = useState<Card[] | null>(null);
  const [progress, setProgress] = useState<DeckProgress | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [playBusy, setPlayBusy] = useState(false);

  const game = useGame(code);

  useEffect(() => {
    const ok = isAuthed();
    setAuthed(ok);
    if (ok) getProfile().then(setProfile).catch((e) => setError(String(e)));
    // Resume an in-progress room after a refresh / screen-lock (deck is still
    // in localStorage under hitster.deck.<code>).
    const savedRoom = localStorage.getItem(HOST_ROOM_KEY);
    if (savedRoom) setCode(savedRoom);
  }, []);

  function closeRoom() {
    localStorage.removeItem(HOST_ROOM_KEY);
    setCode(null);
  }

  const refreshDevices = useCallback(async () => {
    // Drop our own (possibly dead) web-SDK device so it can't hijack playback.
    const d = (await getDevices()).filter((x) => !x.name.includes("Hitster"));
    setDevices(d);
    const active = d.find((x) => x.is_active) ?? d[0];
    if (active && !deviceId) setDeviceId(active.id);
  }, [deviceId]);

  useEffect(() => {
    if (authed) refreshDevices();
  }, [authed, refreshDevices]);

  async function handleBuildDeck() {
    setError(null);
    try {
      const d = await buildDeck({ market: profile?.country }, setProgress);
      if (d.length < WINNING_CARD_COUNT * 2) {
        setError(
          `Only ${d.length} songs found — that's a thin deck. You may want more listening history.`,
        );
      }
      setDeck(d);
    } catch (e) {
      setError(String(e));
    }
  }

  async function useBrowserAsDevice() {
    const id = await initWebPlayer();
    if (id) {
      await refreshDevices();
      setDeviceId(id);
    } else {
      setError("This browser can't host playback (mobile browsers can't). Open the Spotify app instead and pick it as the device.");
    }
  }

  async function handleCreateRoom() {
    if (!deck) return;
    setError(null);
    try {
      const newCode = generateCode();
      // Fresh shuffle each room, so hosting again doesn't replay the same order.
      const tokens = deck.map((c) => c.token);
      for (let i = tokens.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [tokens[i], tokens[j]] = [tokens[j], tokens[i]];
      }
      const state: GameState = {
        code: newCode,
        status: "lobby",
        hostId: getPlayerId(),
        players: [],
        deckTokens: tokens,
        drawIndex: 0,
        turnOrder: [],
        turnPointer: 0,
        round: null,
        winnerId: null,
        createdAt: Date.now(),
      };
      saveDeck(newCode, deck);
      await createGame(state);
      localStorage.setItem(HOST_ROOM_KEY, newCode);
      setCode(newCode);
    } catch (e) {
      setError(String(e));
    }
  }

  // --- DJ actions (host is authoritative, holds the deck) ---
  async function dj(fn: (g: GameState, deck: Map<string, Card>) => GameState) {
    if (!game || !code) return;
    try {
      const next = fn(game, loadDeckMap(code));
      await saveGame(next);
    } catch (e) {
      setError(String(e));
    }
  }

  async function playMystery() {
    if (!game?.round || !code || !deviceId) {
      setError(!deviceId ? "Pick a playback device first." : null);
      return;
    }
    setPlayBusy(true);
    setError(null);
    try {
      // Start directly on the chosen device — passing device_id activates it,
      // no separate transfer needed (an extra transfer can bounce playback to
      // the wrong device and grey out the Spotify app).
      const card = loadDeckMap(code).get(game.round.token);
      if (card) await playUri(deviceId, card.uri);
      setPlaying(true);
    } catch (e) {
      setError(String(e));
    } finally {
      setPlayBusy(false);
    }
  }

  async function pauseMystery() {
    if (!deviceId) return;
    setPlayBusy(true);
    try {
      await fadeAndPause(deviceId);
      setPlaying(false);
    } catch (e) {
      setError(String(e));
    } finally {
      setPlayBusy(false);
    }
  }

  // Reveal stops the music first, then flips the year.
  async function revealMystery() {
    if (deviceId && playing) {
      try {
        await fadeAndPause(deviceId);
      } catch {
        /* reveal anyway */
      }
    }
    setPlaying(false);
    await dj((g, d) => computeReveal(g, d));
  }

  // ----- render -----
  if (authed === null) {
    return <Centered>Loading…</Centered>;
  }

  if (!authed) {
    return (
      <Centered>
        <div className="max-w-sm space-y-6 text-center">
          <h1 className="text-3xl font-black">Host a game</h1>
          <p className="text-white/60">
            Connect your Spotify (Premium) account. Your listening history becomes the
            deck, and this device becomes the DJ.
          </p>
          <Button onClick={() => beginLogin()}>Connect Spotify</Button>
          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>
      </Centered>
    );
  }

  // In a running game → DJ board.
  if (code && game && game.status !== "lobby") {
    return (
      <DjBoard
        game={game}
        onPlay={playMystery}
        onPause={pauseMystery}
        onReveal={revealMystery}
        onAdjustYear={(y) => dj((g) => adjustYear(g, y))}
        onNext={() => dj((g) => commitAndNext(g))}
        onClose={closeRoom}
        playing={playing}
        playBusy={playBusy}
        error={error}
      />
    );
  }

  // Lobby (room created, waiting for players).
  if (code && game && game.status === "lobby") {
    const joinUrl = `${window.location.origin}/join?code=${code}`;
    return (
      <div className="mx-auto w-full max-w-md space-y-6 p-6">
        <h1 className="text-center text-2xl font-black">Lobby</h1>
        <Panel className="flex flex-col items-center text-center">
          <div className="text-sm text-white/50">Scan to join</div>
          <div className="my-3 bg-white p-2 rounded-xl">
            <QrCode value={joinUrl} />
          </div>
          <div className="text-sm text-white/50">or enter code</div>
          <div className="text-5xl font-black tracking-widest">{code}</div>
          <div className="mt-2 break-all text-xs text-white/40">{joinUrl}</div>
        </Panel>
        <div>
          <div className="mb-2 text-sm text-white/50">
            Players ({game.players.length})
          </div>
          <div className="space-y-2">
            {game.players.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2"
              >
                <span className="h-3 w-3 rounded-full" style={{ background: p.color }} />
                {p.name}
              </div>
            ))}
            {game.players.length === 0 && (
              <p className="text-sm text-white/40">Waiting for players to join…</p>
            )}
          </div>
        </div>
        <PlaybackPicker
          devices={devices}
          deviceId={deviceId}
          onPick={setDeviceId}
          onRefresh={refreshDevices}
          onUseBrowser={useBrowserAsDevice}
        />
        <Button
          className="w-full"
          disabled={game.players.length < 1 || !deviceId}
          onClick={() => dj((g, d) => startGame(g, d))}
        >
          {game.players.length < 1
            ? "Waiting for a player to join"
            : !deviceId
              ? "Pick a playback device"
              : "Start game"}
        </Button>
        <button onClick={closeRoom} className="w-full text-center text-xs text-white/40 underline">
          close room
        </button>
        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>
    );
  }

  // Setup: build deck + pick device + create room.
  const notPremium = profile && profile.product !== "premium";
  return (
    <div className="mx-auto w-full max-w-md space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black">Set up your game</h1>
        <button onClick={() => { logout(); setAuthed(false); }} className="text-xs text-white/40 underline">
          disconnect
        </button>
      </div>

      {profile && (
        <Panel className="flex items-center gap-3">
          <span className="text-sm">
            Signed in as <strong>{profile.display_name ?? profile.id}</strong>
          </span>
        </Panel>
      )}
      {notPremium && (
        <p className="rounded-lg bg-yellow-500/10 p-3 text-sm text-yellow-300">
          Heads up: this account isn&apos;t Premium, so full-track playback won&apos;t
          work. You can still set up a game, but you&apos;ll need a Premium device to play
          songs.
        </p>
      )}

      <Panel className="space-y-3">
        <div className="font-semibold">1. Build your deck</div>
        {deck ? (
          <p className="text-sm text-accent">✓ {deck.length} songs ready</p>
        ) : (
          <>
            <Button className="w-full" onClick={handleBuildDeck} disabled={!!progress && progress.stage !== "Deck ready"}>
              {progress ? progress.stage : "Build my deck from Spotify"}
            </Button>
            {progress && (
              <p className="text-xs text-white/50">
                {progress.stage} — {progress.count} songs so far
              </p>
            )}
          </>
        )}
      </Panel>

      <Panel className="space-y-3">
        <div className="font-semibold">2. Choose where songs play</div>
        <PlaybackPicker
          devices={devices}
          deviceId={deviceId}
          onPick={setDeviceId}
          onRefresh={refreshDevices}
          onUseBrowser={useBrowserAsDevice}
        />
      </Panel>

      <Button className="w-full" disabled={!deck} onClick={handleCreateRoom}>
        Create room
      </Button>
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}

function PlaybackPicker({
  devices,
  deviceId,
  onPick,
  onRefresh,
  onUseBrowser,
}: {
  devices: Device[];
  deviceId: string | null;
  onPick: (id: string) => void;
  onRefresh: () => void;
  onUseBrowser: () => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs text-white/50">
        {IS_MOBILE
          ? "Open the Spotify app on this phone and play a song for a second so it appears here, then pick it. Keep the Spotify app running in the background while you play."
          : "Open the Spotify app on this (or any) device so it shows up here, then pick it. On a laptop you can also play in this tab."}
      </p>
      <div className="space-y-2">
        {devices.map((d) => (
          <button
            key={d.id}
            onClick={() => onPick(d.id)}
            className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${
              deviceId === d.id ? "bg-accent/20 ring-1 ring-accent" : "bg-white/5"
            }`}
          >
            <span>{d.name}</span>
            <span className="text-xs text-white/40">{d.type}</span>
          </button>
        ))}
        {devices.length === 0 && (
          <p className="text-sm text-white/40">No devices found yet.</p>
        )}
      </div>
      <div className="flex gap-2">
        <Button variant="ghost" className="flex-1 text-sm" onClick={onRefresh}>
          Refresh devices
        </Button>
        {!IS_MOBILE && (
          <Button variant="ghost" className="flex-1 text-sm" onClick={onUseBrowser}>
            Use this tab
          </Button>
        )}
      </div>
    </div>
  );
}

function DjBoard({
  game,
  onPlay,
  onPause,
  onReveal,
  onAdjustYear,
  onNext,
  onClose,
  playing,
  playBusy,
  error,
}: {
  game: GameState;
  onPlay: () => void;
  onPause: () => void;
  onReveal: () => void;
  onAdjustYear: (year: number) => void;
  onNext: () => void;
  onClose: () => void;
  playing: boolean;
  playBusy: boolean;
  error: string | null;
}) {
  if (game.status === "finished") {
    const winner = game.winnerId ? playerById(game, game.winnerId) : null;
    return (
      <Centered>
        <div className="space-y-4 text-center">
          <div className="text-5xl">🏆</div>
          <h1 className="text-3xl font-black">{winner?.name ?? "Someone"} wins!</h1>
          <p className="text-white/60">First to {WINNING_CARD_COUNT} cards.</p>
          <Button onClick={onClose}>New game</Button>
        </div>
      </Centered>
    );
  }

  const round = game.round;
  const active = round ? playerById(game, round.activePlayerId) : null;
  const reveal = round?.reveal ?? null;

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 p-4">
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs tracking-widest text-white/40">
          room {game.code}
        </span>
        <button onClick={onClose} className="text-xs text-white/40 underline">
          close room
        </button>
      </div>
      <div className="text-center">
        <div className="text-xs uppercase tracking-wider text-white/40">Now playing for</div>
        <div className="text-2xl font-black" style={{ color: active?.color }}>
          {active?.name ?? "—"}
        </div>
      </div>

      <Panel className="flex flex-col items-center gap-3">
        {reveal ? (
          <>
            <SongCard card={reveal.card} />
            {(() => {
              const keeper = reveal.keptBy ? playerById(game, reveal.keptBy) : null;
              const msg = !reveal.keptBy
                ? "Wrong spot — discarded."
                : reveal.stolen
                  ? `Stolen by ${keeper?.name}!`
                  : "Correct — card kept!";
              return (
                <div
                  className={`text-lg font-bold ${reveal.keptBy ? "text-accent" : "text-red-400"}`}
                >
                  {msg}
                </div>
              );
            })()}
            {round?.bettingTitleArtist && (
              <div className="text-sm text-white/60">
                Named the song:{" "}
                {reveal.titleArtistCorrect ? "nailed it (+1 token) 🪙" : "not quite"}
              </div>
            )}
            {/* Year override — album.release_date lies on re-releases/compilations. */}
            <YearOverride key={round?.token} year={reveal.card.year} onSet={onAdjustYear} />
            <Button onClick={onNext}>Next turn →</Button>
          </>
        ) : (
          <>
            <div className="text-6xl">{playing ? "🔊" : "🎵"}</div>
            <div className="flex gap-2">
              <Button onClick={onPlay} disabled={playBusy}>
                {playBusy && !playing ? "…" : "▶ Play"}
              </Button>
              <Button variant="ghost" onClick={onPause} disabled={playBusy || !playing}>
                ⏸ Pause
              </Button>
            </div>
            <div className="text-xs text-white/50">
              {playBusy ? "working…" : playing ? "♪ Playing" : "Paused"}
            </div>
            {/* Show where the active player locked the card, so it can be contested. */}
            {round?.phase === "challenging" && round.proposedIndex !== null && active && (
              <div className="w-full space-y-1">
                <div className="text-center text-xs text-white/50">
                  {active.name} placed it here — players can challenge, then reveal:
                </div>
                <PlacementPreview cards={active.timeline} index={round.proposedIndex} />
              </div>
            )}
            {round?.phase === "challenging" && (round?.challenges.length ?? 0) > 0 && (
              <div className="text-xs text-yellow-300">
                {round.challenges.length} challenge
                {round.challenges.length === 1 ? "" : "s"} in 🔥
              </div>
            )}
            <Button
              variant="ghost"
              disabled={round?.phase !== "challenging"}
              onClick={onReveal}
            >
              {round?.phase === "challenging"
                ? `Reveal ${active?.name}'s guess`
                : "Waiting for placement…"}
            </Button>
          </>
        )}
      </Panel>

      <div className="space-y-3">
        {game.players.map((p) => (
          <div key={p.id}>
            <div className="mb-1 flex items-center gap-2 text-sm">
              <span className="h-3 w-3 rounded-full" style={{ background: p.color }} />
              <span className="font-semibold">{p.name}</span>
              <span className="text-white/40">
                {p.timeline.length}/{WINNING_CARD_COUNT} · {p.tokens}🪙
              </span>
            </div>
            <Timeline cards={p.timeline} />
          </div>
        ))}
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}

// Direct year entry for when album.release_date is wrong (re-releases etc.).
function YearOverride({ year, onSet }: { year: number; onSet: (y: number) => void }) {
  const [val, setVal] = useState(String(year));
  const commit = () => {
    const n = parseInt(val, 10);
    if (Number.isFinite(n) && n !== year) onSet(n);
  };
  return (
    <div className="flex items-center gap-2 text-sm text-white/60">
      <span>Actual year:</span>
      <input
        type="number"
        inputMode="numeric"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={commit}
        className="w-20 rounded bg-white/10 px-2 py-1 text-center text-white outline-none focus:ring-2 focus:ring-accent"
      />
      <Button variant="ghost" className="px-3 py-1 text-sm" onClick={commit}>
        Fix
      </Button>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex flex-1 items-center justify-center p-6">{children}</main>
  );
}
