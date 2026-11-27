// Playback control. Two paths, because the Web Playback SDK does NOT officially
// work in mobile browsers:
//   1. Connect control (works everywhere incl. mobile): the host keeps the real
//      Spotify app open as a device; we remote-control it via the Web API.
//   2. In-app SDK device (desktop browsers only): plays inside this tab.
// Either way the host needs Spotify Premium.
import { getAccessToken } from "./auth";

const API = "https://api.spotify.com/v1";

async function req(path: string, method: string, body?: unknown): Promise<Response> {
  const token = await getAccessToken();
  return fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

export interface Device {
  id: string;
  name: string;
  type: string;
  is_active: boolean;
}

export async function getDevices(): Promise<Device[]> {
  const res = await req("/me/player/devices", "GET");
  if (!res.ok) return [];
  const json = (await res.json()) as { devices: Device[] };
  return json.devices ?? [];
}

export async function transferTo(deviceId: string): Promise<void> {
  await req("/me/player", "PUT", { device_ids: [deviceId], play: false });
}

export async function playUri(deviceId: string, uri: string): Promise<void> {
  const res = await req(
    `/me/player/play?device_id=${encodeURIComponent(deviceId)}`,
    "PUT",
    { uris: [uri] },
  );
  if (!res.ok && res.status !== 204) {
    throw new Error(`play failed (${res.status}) — is the Spotify app open and Premium?`);
  }
}

export async function pause(deviceId: string): Promise<void> {
  await req(`/me/player/pause?device_id=${encodeURIComponent(deviceId)}`, "PUT");
}

export async function resume(deviceId: string): Promise<void> {
  await req(`/me/player/play?device_id=${encodeURIComponent(deviceId)}`, "PUT");
}

export async function setVolume(percent: number, deviceId?: string): Promise<void> {
  const q = deviceId ? `&device_id=${encodeURIComponent(deviceId)}` : "";
  await req(`/me/player/volume?volume_percent=${Math.round(percent)}${q}`, "PUT");
}

// Ramp volume down over ~0.8s, then pause, then restore volume for next time.
// Some Connect devices don't support volume control — fall back to a hard pause.
export async function fadeAndPause(deviceId: string): Promise<void> {
  try {
    for (const v of [60, 40, 20, 5]) {
      await setVolume(v, deviceId);
      await new Promise((r) => setTimeout(r, 180));
    }
  } catch {
    /* device doesn't support volume — just pause */
  }
  await pause(deviceId);
  try {
    await setVolume(80, deviceId);
  } catch {
    /* ignore */
  }
}

// --- Optional in-app device via the Web Playback SDK (desktop browsers) ---

let sdkLoaded: Promise<void> | null = null;

function loadSdk(): Promise<void> {
  if (sdkLoaded) return sdkLoaded;
  sdkLoaded = new Promise((resolve) => {
    if (typeof window === "undefined") return;
    window.onSpotifyWebPlaybackSDKReady = () => resolve();
    const script = document.createElement("script");
    script.src = "https://sdk.scdn.co/spotify-player.js";
    script.async = true;
    document.body.appendChild(script);
  });
  return sdkLoaded;
}

let webDeviceId: string | null = null;

// Resolves with the in-app device id, or null if the SDK can't run here (mobile).
export async function initWebPlayer(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  try {
    await loadSdk();
    const player = new window.Spotify.Player({
      name: "Hitster (this tab)",
      getOAuthToken: (cb) => {
        getAccessToken().then(cb);
      },
      volume: 0.8,
    });
    const ready = new Promise<string | null>((resolve) => {
      player.addListener("ready", ({ device_id }) => {
        webDeviceId = device_id;
        resolve(device_id);
      });
      player.addListener("initialization_error", () => resolve(null));
      player.addListener("account_error", () => resolve(null));
      // Mobile browsers never fire "ready" — bail after a few seconds.
      setTimeout(() => resolve(webDeviceId), 5000);
    });
    const ok = await player.connect();
    if (!ok) return null;
    return await ready;
  } catch {
    return null;
  }
}
