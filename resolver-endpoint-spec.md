# `/resolve` — server-side song resolution endpoint spec

For whoever is implementing this on the NAS side (the service that already
has `/request`, `/queue`, `/queue/{id}` DELETE). This is a new endpoint to
add alongside those, not a replacement for them — `/request` and `/queue`
stay exactly as they are today; the manual "send this free-text request"
flow still uses them.

## Why

Tap-to-play against a self-hosted MusicBrainz setup used to be (in an
earlier, now-scrapped version of this) a client-side dance: the app decided
which downloader to use, checked a locally-stored "is it connected" flag
before even trying, sent a free-text request, separately asked the server to
rescan, separately forced the app's own library resync, then polled the
app's own sync state hoping it eventually agreed the track had landed. That
produced real bugs — duplicate requests racing each other for the same file,
and a "nothing is connected" dead end caused by nothing more than a wiped
local flag on a fresh install — and, on top of the bugs, a pile of app-side
decision logic that had no business being there.

The rebuilt version is one idempotent call: the app asks "do you have this,
or go get it," acts on whatever the server says, and asks again on an
interval if the answer is "still working." All matching, deduplication, and
waiting happen here, server-side. The app makes no decisions about *how* a
song gets found — it only asks, waits, and plays.

## Endpoint

```
POST /resolve
Authorization: Bearer <apiKey>
Content-Type: application/json
```

### Request body

```json
{
  "title": "Rumour Has It",
  "artist": "Adele",
  "mbid": "0d7a7e6c-...",   // optional — MusicBrainz recording id, when known
  "isrc": "GBARL1100230"    // optional — when known
}
```

`title` and `artist` are always present. `mbid` and `isrc` are omitted
entirely (not sent as `null`) when the app doesn't have them — treat a
missing field as "unknown," not as "explicitly empty."

### Response — one of three shapes

**Already in the library:**

```json
{ "status": "ready", "songId": "abc123" }
```

`songId` is whatever id the media server (Navidrome) uses for the track —
the same id the app would get back from a `search3` call, since the app
resolves this id against its own player the same way it resolves any other
Navidrome track.

**Nothing yet, but now in flight (either just started, or an existing job for
the same track was found and reused):**

```json
{ "status": "pending", "jobId": "job-789", "progress": 42 }
```

`progress` is 0–100, best-effort — if there's no meaningful progress signal
for the current stage (e.g. still searching), `0` is fine.

**Nothing findable:**

```json
{ "status": "failed", "reason": "not_found" }
```

`reason` is a short machine string for logs; the app shows a generic "couldn't
find it" toast regardless of the exact value, so this doesn't need a fixed
enum — just something short and stable.

## Required behavior

1. **Check the media server first, live.** Do a `search3`-equivalent lookup
   against Navidrome for `title`/`artist` (and `isrc`/`mbid` if the server's
   index supports matching on those) before touching the acquisition
   pipeline at all. If it's already there, answer `ready` immediately — no
   job, no queue entry, nothing started.

2. **Deduplicate in-flight work.** Before starting a new acquisition job,
   check whether a job for the same *normalized* `(title, artist)` pair is
   already running (case-insensitive, whitespace-trimmed). If one exists,
   return `pending` with **that job's** `jobId` and current progress — do
   not start a second job. This is the fix for the duplicate-download bug:
   two calls to `/resolve` for the same song, however close together, must
   always converge on one job.

3. **Otherwise, start acquisition: slskd first, YouTube if that fails.** Try
   slskd's own search/download first; only fall back to a YouTube
   search+download if slskd genuinely finds nothing. Return `pending` with
   the new job's id and `0` progress.

4. **On total failure, record it rather than just answering `failed`.** When
   neither slskd nor YouTube can find the track, don't just return
   `{status: "failed"}` and forget about it — keep a record (a "couldn't
   find this" list, keyed by the same normalized `(title, artist)` pair used
   for dedup) so the song can be rechecked later rather than silently
   retried from scratch, in full, every single time someone taps it again.
   What "rechecked later" means is up to whatever's simplest to build first
   — a periodic sweep, a manual review list, a cooldown before the next
   `/resolve` call for that pair is allowed to actually retry rather than
   immediately re-answering `failed` from the record — any of these satisfy
   the requirement; the point is that a `failed` result becomes a fact the
   server remembers, not a dead end the app has to swallow and never speak
   of again.

5. **Idempotent and cheap to poll.** The app calls this every ~12 seconds
   while a job is pending, for up to 3 minutes. Each call should be fast
   (the Navidrome check plus an in-memory/DB lookup of active jobs — no new
   slskd search or YouTube request on a call that finds an existing job).

6. **Auth.** Same `Authorization: Bearer <apiKey>` as every other endpoint on
   this service. No new credential, no new settings screen field.

## What calls this, app-side

A single settings connection (server URL + API key, Settings → Connections)
and a single call site behind it: tapping a song the library doesn't already
have, whenever a self-hosted MusicBrainz server is configured. No downloader
picker, no per-provider "is it connected" gate blocking the attempt before
it's even tried — the app always calls `/resolve` and reports back whatever
it says, including a real failure from a real attempt, rather than
pre-emptively refusing to ask.
