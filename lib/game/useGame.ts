"use client";
import { useEffect, useState } from "react";
import { loadGame, subscribeGame } from "./rooms";
import type { GameState } from "./types";

// Subscribe to a room and keep the latest GameState in React state.
export function useGame(code: string | null): GameState | null {
  const [state, setState] = useState<GameState | null>(null);
  useEffect(() => {
    if (!code) return;
    let active = true;
    loadGame(code).then((s) => {
      if (active && s) setState(s);
    });
    const unsub = subscribeGame(code, (s) => {
      if (active) setState(s);
    });
    return () => {
      active = false;
      unsub();
    };
  }, [code]);
  return state;
}

// Read a query param on the client without tripping Next's prerender rules.
export function useQueryParam(key: string): string | null {
  const [value, setValue] = useState<string | null>(null);
  useEffect(() => {
    setValue(new URLSearchParams(window.location.search).get(key));
  }, [key]);
  return value;
}
