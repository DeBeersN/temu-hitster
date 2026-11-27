// Stable per-browser player id, so a refresh keeps your seat.
const KEY = "hitster.playerId";

export function getPlayerId(): string {
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
  }
  return id;
}
