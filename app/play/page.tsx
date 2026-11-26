"use client";
import { useState } from "react";
import { Button, Panel, PlacementPreview, SongCard, Timeline } from "@/app/components/ui";
import { useGame, useQueryParam } from "@/lib/game/useGame";
import { getPlayerId } from "@/lib/game/identity";
import { playerById } from "@/lib/game/logic";
import { lockPlacement, submitChallenge } from "@/lib/game/actions";
import { saveGame } from "@/lib/game/rooms";
import { WINNING_CARD_COUNT } from "@/lib/config";

export default function PlayPage() {
  const code = useQueryParam("code");
  const game = useGame(code);
  const [selectedGap, setSelectedGap] = useState<number | null>(null);
  const [betting, setBetting] = useState(false);
  const [guessTitle, setGuessTitle] = useState("");
  const [guessArtist, setGuessArtist] = useState("");
  const [challengeGap, setChallengeGap] = useState<number | null>(null);
  const [challengeOpen, setChallengeOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!game) {
    return <Centered>Connecting to the game…</Centered>;
  }

  const myId = typeof window !== "undefined" ? getPlayerId() : "";
  const me = playerById(game, myId);

  if (!me) {
    return (
      <Centered>
        <div className="text-center">
          <p>You&apos;re not in this game.</p>
          <a href={`/join?code=${code ?? ""}`} className="text-accent underline">
            Join it
          </a>
        </div>
      </Centered>
    );
  }

  if (game.status === "lobby") {
    return (
      <Centered>
        <div className="space-y-2 text-center">
          <div className="text-xl font-bold">You&apos;re in, {me.name}!</div>
          <p className="text-white/50">Waiting for the host to start…</p>
        </div>
      </Centered>
    );
  }

  if (game.status === "finished") {
    const winner = game.winnerId ? playerById(game, game.winnerId) : null;
    const iWon = winner?.id === myId;
    return (
      <Centered>
        <div className="space-y-3 text-center">
          <div className="text-5xl">{iWon ? "🎉" : "🏁"}</div>
          <div className="text-2xl font-black">
            {iWon ? "You win!" : `${winner?.name ?? "Someone"} wins`}
          </div>
        </div>
      </Centered>
    );
  }

  const round = game.round;
  const isMyTurn = round?.activePlayerId === myId;
  const active = round ? playerById(game, round.activePlayerId) : null;
  const locked = round?.phase === "challenging" || round?.phase === "resolved";
  const alreadyChallenged = !!round?.challenges.some((c) => c.playerId === myId);
  const canChallenge =
    !!round &&
    round.phase === "challenging" &&
    !isMyTurn &&
    !round.reveal &&
    me.tokens > 0 &&
    !alreadyChallenged;

  async function lockIn() {
    if (!game || selectedGap === null || !round) return;
    try {
      const bet = betting ? { title: guessTitle, artist: guessArtist } : null;
      const next = lockPlacement(game, myId, selectedGap, bet);
      await saveGame(next);
    } catch (e) {
      setError(String(e));
    }
  }

  async function challenge() {
    if (!game || challengeGap === null) return;
    try {
      const next = submitChallenge(game, myId, challengeGap);
      await saveGame(next);
      setChallengeOpen(false);
      setChallengeGap(null);
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <div className="mx-auto w-full max-w-xl space-y-4 p-4">
      <div className="flex items-center justify-between text-sm">
        <span className="font-bold" style={{ color: me.color }}>
          {me.name}
        </span>
        <span className="text-white/50">
          {me.timeline.length}/{WINNING_CARD_COUNT} cards · {me.tokens}🪙
        </span>
      </div>

      {isMyTurn && !locked ? (
        <Panel className="space-y-4">
          <div className="text-center">
            <div className="text-lg font-bold">Your turn!</div>
            <p className="text-sm text-white/60">
              Listen to the song, then tap the gap where you think it belongs by year.
            </p>
          </div>
          <Timeline
            cards={me.timeline}
            placing
            selectedIndex={selectedGap}
            onSelectGap={setSelectedGap}
          />
          {(
            <div className="space-y-2 rounded-lg bg-white/5 p-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={betting}
                  onChange={(e) => setBetting(e.target.checked)}
                />
                Know it? Name the title + artist for a bonus 🪙 (free — no penalty)
              </label>
              {betting && (
                <div className="grid grid-cols-2 gap-2">
                  <input
                    value={guessTitle}
                    onChange={(e) => setGuessTitle(e.target.value)}
                    placeholder="Song title"
                    className="rounded bg-white/10 px-3 py-2 text-sm outline-none"
                  />
                  <input
                    value={guessArtist}
                    onChange={(e) => setGuessArtist(e.target.value)}
                    placeholder="Artist"
                    className="rounded bg-white/10 px-3 py-2 text-sm outline-none"
                  />
                </div>
              )}
            </div>
          )}
          <Button className="w-full" disabled={selectedGap === null} onClick={lockIn}>
            {selectedGap === null ? "Pick a spot" : "Lock it in"}
          </Button>
        </Panel>
      ) : round?.reveal ? (
        <Panel className="space-y-3 text-center">
          <div className="text-sm text-white/50">{active?.name} placed:</div>
          <div className="flex justify-center">
            <SongCard card={round.reveal.card} />
          </div>
          {(() => {
            const keeper = round.reveal.keptBy
              ? playerById(game, round.reveal.keptBy)
              : null;
            const msg = !round.reveal.keptBy
              ? "Wrong spot — discarded."
              : round.reveal.stolen
                ? `Stolen by ${keeper?.name}!`
                : "Correct!";
            return (
              <div className={round.reveal.keptBy ? "text-accent" : "text-red-400"}>
                {msg}
              </div>
            );
          })()}
        </Panel>
      ) : isMyTurn && locked ? (
        <Panel className="space-y-2 text-center">
          <p className="text-white/60">Locked in — waiting for the DJ to reveal.</p>
          {(round?.challenges.length ?? 0) > 0 && (
            <p className="text-xs text-yellow-300">
              Careful — {round!.challenges.length} player
              {round!.challenges.length === 1 ? "" : "s"} challenged your placement.
            </p>
          )}
        </Panel>
      ) : canChallenge || challengeOpen ? (
        <Panel className="space-y-3">
          <div className="text-center">
            <div className="font-bold">
              Think{" "}
              <span style={{ color: active?.color }}>{active?.name}</span> is wrong?
            </div>
            <p className="text-sm text-white/60">
              Spend a token to steal: place the song on <em>your</em> timeline. If
              they&apos;re wrong and you&apos;re right, the card&apos;s yours.
            </p>
          </div>
          {round && round.proposedIndex !== null && active && (
            <div className="space-y-1">
              <div className="text-center text-xs text-white/50">
                {active.name} placed it here:
              </div>
              <PlacementPreview cards={active.timeline} index={round.proposedIndex} />
            </div>
          )}
          {challengeOpen ? (
            <>
              <Timeline
                cards={me.timeline}
                placing
                selectedIndex={challengeGap}
                onSelectGap={setChallengeGap}
              />
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  className="flex-1"
                  onClick={() => {
                    setChallengeOpen(false);
                    setChallengeGap(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1"
                  disabled={challengeGap === null}
                  onClick={challenge}
                >
                  Steal (−1🪙)
                </Button>
              </div>
            </>
          ) : (
            <Button className="w-full" variant="ghost" onClick={() => setChallengeOpen(true)}>
              Challenge ({me.tokens}🪙)
            </Button>
          )}
        </Panel>
      ) : (
        <Panel className="space-y-2 text-center">
          <p className="text-white/60">
            <span style={{ color: active?.color }} className="font-bold">
              {active?.name}
            </span>{" "}
            {round?.phase === "challenging" ? "placed a card here:" : "is placing a song…"}
          </p>
          {round?.phase === "challenging" && round.proposedIndex !== null && active && (
            <PlacementPreview cards={active.timeline} index={round.proposedIndex} />
          )}
          {alreadyChallenged && (
            <p className="text-xs text-yellow-300">Your challenge is locked in 🔥</p>
          )}
        </Panel>
      )}

      {/* Everyone's timelines, yours first. */}
      <div className="space-y-3">
        {[me, ...game.players.filter((p) => p.id !== myId)].map((p) => (
          <div key={p.id}>
            <div className="mb-1 flex items-center gap-2 text-sm">
              <span className="h-3 w-3 rounded-full" style={{ background: p.color }} />
              <span className="font-semibold">
                {p.id === myId ? "You" : p.name}
              </span>
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

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex flex-1 items-center justify-center p-6">{children}</main>
  );
}
