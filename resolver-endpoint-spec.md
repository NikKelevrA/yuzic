# `/resolve` — YT Fallback endpoint spec

For whoever is implementing this on the NAS side (the YT Fallback service
that already has `/request`, `/queue`, `/queue/{id}` DELETE). This is a new
endpoint to add alongside those, not a replacement for them — `/request` and
`/queue` stay exactly as they are today; the Get sheet's manual "send this
free-text request" flow still uses them.

## Why

The app used to acquire-and-play a song with a client-side dance: pick a
downloader, send it a free-text Get, separately ask the media server to scan,
separately force the app's own library resync, then poll the app's own sync
state hoping it eventually agreed the track had landed. That produced two
real bugs: duplicate Gets racing for the same file because nothing
server-side deduplicated identical requests, and a wait tied to the app's own
sync — which could lag, go stale, or just never re-fire — rather than to the
one thing that actually knows whether the file exists: the server.

`/resolve` replaces all of that client-side orchestration with one idempotent
call: "do you have this, or go get it." The app now asks this, acts on
whatever it says, and asks again on an interval if the answer is "still
working." All matching, deduplication, and waiting move here, server-side.

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
   already running (case-insensitive, whitespace-trimmed — the same kind of
   normalization the existing `/request` → `/queue` pipeline already does
   for matching, since `directoryName.ts` and `canonicalize.ts` on this side
   already solve a version of this problem). If one exists, return `pending`
   with **that job's** `jobId` and current progress — do not start a second
   job. This is the actual fix for the duplicate-download bug: two calls to
   `/resolve` for the same song, however close together, must always
   converge on one job.

3. **Otherwise, start acquisition.** Run the existing internal chain — slskd
   first, YouTube fallback if slskd finds nothing — exactly as `/request`
   already does today. Return `pending` with the new job's id and `0`
   progress.

4. **Idempotent and cheap to poll.** The app calls this every ~12 seconds
   while a job is pending, for up to 3 minutes. Each call should be fast
   (the Navidrome check plus an in-memory/DB lookup of active jobs — no new
   slskd search or YouTube request on a call that finds an existing job).

5. **Auth.** Same `Authorization: Bearer <apiKey>` as every other endpoint on
   this service. No new credential, no new settings screen field.

## What already calls this

`src/providers/integration/ytfallback/index.ts` — the `resolve()` function —
and `src/features/downloaders/useAcquireAndPlaySong.ts`, which is the hook
behind "tap a search result and have it start playing." Both are already
built and shipped app-side, written against exactly this contract. Once this
endpoint exists on the NAS, that flow works end-to-end with no further app
changes needed.
