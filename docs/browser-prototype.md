# Plex browser prototype

> **Status:** `ACTIVE` · Local browser application · See ADR-002.

The browser client uses Plex Media Server for its library and per-user playback
state. It owns series/season navigation, visible parent links, keyboard focus,
and progress updates without replacing the page. This is independent of the
physical TV installation recorded in ADR-001.

## Run and connect

Node.js 22.9 or newer is required. Run `npm start`, then open
`http://127.0.0.1:4317`. Runtime startup does not need `npm install` because the
gateway has no third-party runtime packages.

Without Plex credentials the application opens a **clearly labeled demo**.
Its catalog is synthetic; its original 18-second test video contains no actual
episode footage. Demo progress is kept in gateway memory, survives browser
reloads, and resets when that process restarts.

Use the connection dialog to enter the Plex server's HTTP(S) base URL and the
token of the Plex user whose catalog and watch state should be used. The token
is sent to the local gateway and cleared from the form; it is never stored in
the browser. The connection lasts until disconnect or gateway restart.

Alternatively, copy `.env.example` to `.env`, set `PLEX_SERVER_URL` and
`PLEX_TOKEN` locally, and restart the gateway. `.env` is ignored. Never paste
tokens into issues, screenshots or commits. The official explanation of a Plex
token is [Finding an authentication token](https://support.plex.tv/articles/204059436-finding-an-authentication-token-x-plex-token/).

The URL must point to the server, for example `http://192.0.2.10:32400`, rather
than `app.plex.tv`. The local process uses one Plex identity at a time. This
prototype has no public hosting or multi-user access control; keep it on
loopback. Successful local connection is not proof of TV playback support.

## Navigation and catalog identity

Library → series → seasons → episodes are separate views. Breadcrumb ancestors
and the explicit parent button work even when a season is opened directly.
Browser Back/Forward preserve navigation; returning from playback preserves
the current season rather than opening a fresh library page.

Native TV libraries use the show's and episode's Plex identifiers. Other Videos
libraries (Plex movie type with the Personal Media agent) receive a local folder
hierarchy under ADR-004. Series/season parents have opaque `fs_` identifiers;
every playable item retains its original numeric Plex ratingKey. Timeline and
watched requests never use a virtual identifier. Ordinary movie libraries are
not included in this series view.

Folder grouping recognizes existing series/season paths and season/episode
markers such as `Season 1`, `Temporada 1`, `S01` and `S01E02`, including season
release folders. Content without a clear match remains in separate groups.
This is presentation in our client; it does not create metadata on Plex. The
source files and existing folders are not renamed or moved. File paths are used
only inside the gateway and are not returned to the browser. Catalog structure
is cached for 60 seconds; watch state is reread from Plex instead of trusting
that cache. Acknowledged changes have a maximum 10-second guard against delayed
Plex persistence, after which the server's read state remains authoritative.

## Playback state

The player reports its position periodically and whenever playback is paused
or stopped. Reports are serialized so a late periodic update cannot overwrite
the final stopped position. Watched/unwatched actions use the server's
timeline state operations. Returning from the player refreshes episode data
in place. Event notifications and focus/visibility reconciliation update the
visible state after changes elsewhere without a document reload.

The server remains authoritative for the user's resume position and watched
state. A failed save must remain visible and retryable instead of presenting
unconfirmed progress as synchronized. The prototype serves one identity; it
does not implement Plex Home profile switching or cloud watch-history sync.
Each playback captures its connection generation and session identifier so an
old tab cannot write progress into a newly connected server. Closing the player
waits for the final save; finishing a video returns to the same season. Closing
the entire browser or losing power is best effort: the last periodic/paused
position is the recovery point if the final network request cannot complete.

An interrupted player can recover without a document reload. A playing video
that stops advancing for 12 seconds, a 20-second metadata load timeout, or a
fatal media error can trigger up to two automatic recovery attempts; **Retomar reprodução**
offers an explicit retry when needed. The client saves the captured position,
requests a new media session, retires the previous session without a stale
timeline write, and restores the position and playback intent. Failure stays
visible. This can recover a broken playback session, but does not establish the
cause of the owner's intermittent Plex Web stalls or repair an offline server,
network outage, failed transcoder or unsupported codec.

## Player scope

The native browser player is the starting point. A pinned local hls.js 1.7.4
bundle adds HLS playback through Media Source Extensions in Chrome/Brave. Its
Apache-2.0 license and upstream notices are in `public/vendor/hls-LICENSE.txt`
and `NOTICE`; `node tools/vendor-hls.mjs --check` checks package provenance. MP4 media compatible with the
browser can be served directly with HTTP range requests. The gateway can
request compatible Plex playback for media that requires conversion. Media,
artwork and segment requests use local routes, with Plex credentials only on
the server side. No authenticated Plex URL is returned to the browser.

Actual HEVC/MKV playback, HLS support, HDR, multichannel audio, subtitle
selection and transcode behavior must be checked with real files and clients.
The prototype chooses the first media version and uses either compatible
MP4/H.264 audio or HLS H.264/AAC stereo at up to 1080p/12 Mbps. It does not yet
offer audio/subtitle/version selectors or HDR passthrough guarantees. Active
HLS sessions are stopped on normal player close or disconnect. Catalog queries
are bounded at 20,000 items with an explicit error rather than silent truncation;
cross-client polling covers the last 12 visited seasons every 10 seconds.
The prototype is not a claim of feature parity with official Plex players.
Playback on webOS 4, 6 and 25 remains separate device acceptance work.

## Verification

```bash
npm ci --ignore-scripts
npm test
npx playwright install chromium
npm run test:browser
```

Unit and HTTP integration tests exercise the local adapter with a fake Plex
server. Browser checks exercise navigation, playback and state updates against
the synthetic demo and a Plex-shaped HTTP fixture, including MP4 and decoded
HLS segments. Browser acceptance must verify persistence by leaving and
reopening the season, not merely by inspecting a temporary progress label.

Before claiming real acceptance, connect the owner's server, confirm that one
series contains its seasons and episodes, play a known file, stop and reopen
it at the saved position, and verify watched state from a second client.

## Sources and assets

The [official Plex API](https://developer.plex.tv/pms/) documents metadata,
timeline reporting and server notifications. Authentication and streaming stay
behind the local gateway. Interface SVGs and the synthetic video are authored
for this project; no third-party poster collection is embedded. Regenerate the
tracked video with `tools/generate-demo-video.sh` if ffmpeg is available.
