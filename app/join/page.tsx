"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/app/components/ui";
import { loadGame, saveGame } from "@/lib/game/rooms";
import { getPlayerId } from "@/lib/game/identity";
import { makePlayer } from "@/lib/game/logic";
import { STARTING_TOKENS } from "@/lib/config";

export default function JoinPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const c = new URLSearchParams(window.location.search).get("code");
    if (c) setCode(c.toUpperCase());
  }, []);

  async function handleJoin() {
    setError(null);
    const roomCode = code.trim().toUpperCase();
    const playerName = name.trim();
    if (roomCode.length < 3 || !playerName) {
      setError("Enter a room code and your name.");
      return;
    }
    setBusy(true);
    try {
      const game = await loadGame(roomCode);
      if (!game) throw new Error("No game with that code.");
      if (game.status !== "lobby") throw new Error("That game has already started.");
      const id = getPlayerId();
      if (!game.players.some((p) => p.id === id)) {
        game.players.push(
          makePlayer(id, playerName, false, game.players.length, STARTING_TOKENS),
        );
        await saveGame(game);
      }
      router.replace(`/play?code=${roomCode}`);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
      setBusy(false);
    }
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-3xl font-black">Join a game</h1>
      <div className="w-full max-w-xs space-y-3">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="ROOM CODE"
          maxLength={6}
          className="w-full rounded-xl bg-white/10 px-4 py-3 text-center text-2xl font-black tracking-widest uppercase outline-none focus:ring-2 focus:ring-accent"
        />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          maxLength={20}
          className="w-full rounded-xl bg-white/10 px-4 py-3 text-lg outline-none focus:ring-2 focus:ring-accent"
        />
        <Button className="w-full" onClick={handleJoin} disabled={busy}>
          {busy ? "Joining…" : "Join"}
        </Button>
        {error && <p className="text-center text-sm text-red-400">{error}</p>}
      </div>
    </main>
  );
}
