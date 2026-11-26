import { supabase } from "@/lib/supabase/client";
import type { GameState } from "./types";

// Ambiguous letters/numbers removed so codes are easy to read aloud.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateCode(len = 4): string {
  let s = "";
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  for (const b of bytes) s += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return s;
}

export async function createGame(state: GameState): Promise<void> {
  const { error } = await supabase.from("games").insert({ code: state.code, state });
  if (error) throw new Error(`Could not create room: ${error.message}`);
}

export async function loadGame(code: string): Promise<GameState | null> {
  const { data, error } = await supabase
    .from("games")
    .select("state")
    .eq("code", code)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.state as GameState) ?? null;
}

export async function saveGame(state: GameState): Promise<void> {
  const { error } = await supabase
    .from("games")
    .update({ state })
    .eq("code", state.code);
  if (error) throw new Error(`Could not sync game: ${error.message}`);
}

// Subscribe to row changes for a room. Returns an unsubscribe fn.
export function subscribeGame(
  code: string,
  onChange: (state: GameState) => void,
): () => void {
  const channel = supabase
    .channel(`game:${code}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "games", filter: `code=eq.${code}` },
      (payload) => {
        const next = (payload.new as { state?: GameState })?.state;
        if (next) onChange(next);
      },
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}
