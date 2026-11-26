# Hitster — your listening history

A mobile-web (PWA) clone of the music timeline party game **Hitster**, where the deck
is built from *your* Spotify listening history. Hear a song, guess where it slots into
your timeline by release year, first to 10 cards wins.

- **One host** = the DJ. Connects Spotify (Premium), builds the deck, controls playback,
  reveals years, advances turns. Only the host logs into Spotify.
- **Players** join on their own phones with a room code and manage their own timeline.
- Sync is via **Supabase Realtime**; playback via **Spotify** (full tracks, Premium).

## One-time setup (~10 min)

### 1. Spotify app
1. Go to <https://developer.spotify.com/dashboard> → **Create app**.
2. Add Redirect URI **exactly**: `http://127.0.0.1:3000/callback`
   (Spotify no longer allows `http://localhost` — it must be the `127.0.0.1` loopback.)
3. Copy the **Client ID**.

### 2. Supabase project
1. Create a project at <https://supabase.com>.
2. **SQL Editor → New query** → paste & run [`lib/db/schema.sql`](lib/db/schema.sql).
3. **Project Settings → API** → copy the **Project URL** and the **anon public** key.

### 3. Env
```bash
cp .env.local.example .env.local
# then fill in the four values
```

## Run

```bash
npm install
npm run dev
# open http://127.0.0.1:3000  (use 127.0.0.1, not localhost, to match the redirect URI)
```

> Default dev port is 3000. If you change it, update the Spotify redirect URI and
> `NEXT_PUBLIC_SPOTIFY_REDIRECT_URI` to match.

## Playing on phones (same network)

The host + players need to reach the dev server. Easiest route: run `npm run dev`,
then expose it with a tunnel (e.g. `npx localtunnel --port 3000` or ngrok), and set the
Spotify redirect URI + `NEXT_PUBLIC_SPOTIFY_REDIRECT_URI` to the tunnel's HTTPS URL.
The Web Playback SDK and PWA install both want HTTPS anyway.

## How playback works (important)

The Spotify **Web Playback SDK does not run in mobile browsers**. So:

- **On a phone host:** open the **Spotify app** on any device on the account. It appears
  under "choose where songs play"; pick it. The app is remote-controlled via Spotify Connect.
- **On a laptop host:** you can also "Use this tab" to play in-browser.

Either way the host account must be **Premium** (Connect playback control is Premium-only).

### ⚠️ iOS quirk: don't play on the *same* iPhone you're hosting from

If you host on an iPhone **and** try to use that same iPhone's Spotify app as the speaker,
playback only works for one turn at a time — you have to foreground Spotify and hit play
before every song.

**Why:** when a track stops and Safari is in the foreground, iOS *suspends* the Spotify app
in the background, and **a suspended iOS app cannot be woken to start audio by a remote
Connect command**. This is an Apple platform restriction, not a bug — it can't be coded
around. (Once a device is already playing, Connect can control it; it just can't cold-start
a backgrounded iOS app.)

**The fix — make the speaker a different device than the game console:**

- Host the game on the **iPhone** (QR, DJ controls)
- Set the playback device to **anything that isn't the host iPhone**: a laptop/desktop
  running Spotify, a second phone with Spotify open, or an Alexa/Sonos/speaker with Spotify.
  Those don't suspend, so playback is reliable every turn.
- Tap Play on the phone → the other device plays. (Also just sounds better than a phone
  speaker at a party.)

Short version: **phone = game console, separate device = stereo.** A single iPhone doing
both will need babysitting; splitting them "just works."

## Game flow

1. Host: connect Spotify → build deck → pick a playback device → **Create room**.
2. Players: open `/join`, enter the room code + a name.
3. Host: **Start game** (needs ≥2 players). Everyone gets one starter card.
4. Each turn: host hits **Play**; the active player listens and taps the gap in *their*
   timeline, optionally betting a token to name the title + artist.
5. **Challenge window**: other players can spend a token to contest the placement,
   proposing where the song goes on *their own* timeline.
6. Host hits **Reveal**. If the active player is right they keep the card; if they're
   wrong, the first correct challenger (in turn order) steals it.
7. Wrong release year? The host can nudge it ±1 on the reveal screen before committing —
   the outcome recomputes. First to 10 cards wins.

## Implemented game mechanics

- Timeline placement scored by release year (equal years allowed on either boundary).
- **Name-that-tune** token bet: type the title + artist; auto-judged with a fuzzy matcher
  (strips "(Remastered …)" etc.). Right = +1 token, wrong = −1.
- **Challenge / steal**: spend a token to contest; first correct challenger steals a
  wrongly-placed card.
- **Host year override** on reveal, to fix bad `release_date` values.

## Known rough edges / next steps

- **Release-year accuracy**: uses `album.release_date` (earliest album we find per track).
  Re-releases/compilations can still report a wrong year — the host override is the
  manual escape hatch, but it's ±1 at a time.
- **Race conditions**: writes are last-write-wins on a single Supabase row. Fine for a
  same-room party; would need funnelling through the host for anything bigger.
- **Deck tuning**: the top-artists catalogue pull is capped (8 artists × 4 albums × 3
  tracks) to stay under Spotify rate limits. Bump in `lib/spotify/api.ts` if you want a
  deeper deck.
