# Yuzic Architecture Rewrite Implementation Plan

> **For Hermes:** Use subagent-driven development to implement this plan task-by-task. Every phase requires an implementation agent, a spec-compliance reviewer, and a code-quality reviewer. Do not merge app PRs automatically; Zack reviews/merges the final app cutover. Engine work may be delivered independently under the standing yuzic-engine authority.

**Goal:** Replace Yuzic's partially unified, stitched architecture with one coherent domain model, typed provider capabilities, single-owner state, thin feature screens, and explicit app/engine boundaries—then delete the superseded code rather than retaining migration paths, compatibility shims, or parallel implementations.

**Architecture:** Pure domain types and policies live under `src/domain`; protocol implementations live under `src/providers`; feature-owned queries, use-cases, state, and screens live together under `src/features`; Expo routes only bind parameters to feature screens. Server adapters remain required core providers, optional integrations remain optional providers, and both expose callable typed capabilities through one broker. Enrichment is pull-based, field-specific, ordered, attributed, cached per capability, and never persisted back into canonical server entities.

**Tech stack:** React Native, Expo Router, TypeScript, Redux Toolkit + redux-persist for small durable client state, TanStack Query + MMKV persistence for server/catalog data, Expo SecureStore for credentials, Jest/React Native Testing Library, Maestro, yuzic-engine native Swift/Kotlin/TypeScript.

---

## 1. Authorization and non-negotiable rewrite rules

This document is a plan only. It does not authorize implementation or alter source files.

When implementation is authorized:

1. Preserve Zack's current uncommitted Settings work before creating any worktree. The current dirty files are:
   - `src/locales/en.json`
   - `src/locales/fr.json`
   - `src/locales/ja.json`
   - `src/locales/zh.json`
   - `src/screens/settings/components/SettingsSourceList.tsx`
   - `src/screens/settings/components/SettingsSourceList.test.tsx`
   - `src/screens/settings/homeSections/index.tsx`
   - `src/screens/settings/homeSections/index.test.tsx`
2. Run the three canonical gates against that exact tree. Commit it to a named baseline branch only after it is green.
3. Create `rewrite/main` and a dedicated worktree from that commit. Keep the normal `dev` worktree as the side-by-side control build.
4. Do not introduce `src/v2`, legacy/v2 route trees, runtime compatibility adapters, dual reads, fallback selectors, state migrations, or old-key importers. The rewrite branch itself is the isolation boundary.
5. Each phase replaces and deletes its old path in the same phase. No phase is complete while both implementations remain callable.
6. Do not change `package.json.version` during architecture work.
7. Do not open the final `rewrite/main -> dev` PR until every parity row and device gate is green.

## 2. Target source layout

```text
src/
  app/                         Expo route files only
  domain/
    entities/                  Artist, Album, Song, Playlist, refs
    identity/                  LocalId, provenance, external ids, matching
    library/                   LibraryState and pure presence policies
    playback/                  ContentKind, sink and scrobble state machines
  providers/
    contracts/                 ServerAdapter, IntegrationProvider, CapabilityMap
    registry/                  provider descriptors and capability broker
    server/
      navidrome/
      media-browser/           shared Jellyfin/Emby protocol
      plex/
      local/
    integration/
      deezer/
      musicbrainz/
      lastfm/
      listenbrainz/
      lrclib/
      audiomuse/
      lidarr/
      slskd/
      soulsync/
  state/
    store.ts
    persistence.ts
    credentials.ts
  features/
    artist/
    album/
    song/
    playlist/
    library/
    search/
    home/
    settings/
    acquisition/
    offline/
    playback/
    scrobbling/
  components/                  genuinely shared visual primitives only
```

`src/api`, `src/hooks`, `src/contexts`, `src/screens`, and `src/utils/redux` are transitional locations to empty and delete. A file remains there only until its owning phase moves or replaces it.

## 3. Core architectural invariants

### Domain

- Exactly one public entity type per kind: `Artist`, `Album`, `Song`, `Playlist`.
- No `ExternalArtist`, `ExternalAlbum`, `ExternalSong`, `*Base` parallel domain hierarchy, or `localX/externalX` prop pairs.
- `LocalId`, `provenance`, `externalIds`, and `libraryState` are required on every entity.
- Identity is immutable and provenance-derived. Matching is fallible and produces a relation; matching never changes identity.
- Provider-specific payloads stop at provider mappers. They never leak into domain or screen props.
- `ContentKind` is required. Synthetic playable content remains explicit rather than masquerading through optional defaults.
- Canonical entities remain small. Optional detail collections are references or separately queried resources, not a god object containing every possible provider payload.

### Providers and capabilities

- Server adapters and optional integrations remain distinct discriminated provider kinds because one is required core and the other is optional.
- They share presentation/auth metadata and expose capabilities through one typed `CapabilityMap`.
- Capability values are callable implementations, never `unknown` markers.
- No reflective `serverAdapterSlots`, AudioMuse special function, or hand-built Connections list.
- Feature code asks for a capability, not a provider name.
- Provider-name literals are legal only inside that provider implementation and the registry declaration.
- Connection state answers “can Yuzic call it?” Feature policy answers “may this feature call it?” The capability broker requires both.

### Enrichment

- Artist, album, lyrics, similarity, and discovery resolution remain separate capabilities with separate cost/cache policy.
- Enrichment is pull-triggered by the feature needing it; loading an entity never fans out to every provider.
- Fallback chains are ordered and first-hit-wins unless a feature explicitly declares blending.
- Resolved fields carry `{ value, sourceId }` provenance in a read-time `Resolved<T>` result.
- Enrichment never mutates or persists into the base server entity.
- Disabling a provider restores the server-only view by query invalidation, with no cleanup/migration step.
- Cover Art Archive accepts release/release-group identity only; it is not an artist-image provider.

### State and persistence

Each fact has one owner:

| Fact | Owner | Durable storage |
|---|---|---|
| Server catalog/resources | TanStack Query | Query MMKV cache |
| Playback resume state | Playback Redux slice | Redux MMKV |
| Running playback queue | yuzic-engine | Native engine; JS read mirror only |
| Settings/policies | Feature-owned Redux slices | Redux MMKV |
| Wants | Wants slice | Redux MMKV |
| Acquisition queue snapshot | Acquisition query/context | Query cache only |
| Offline download jobs/files | Offline slice + filesystem service | Redux MMKV + filesystem |
| Credentials/tokens/passwords | Secure credential store | Expo SecureStore |
| Ephemeral screen state | Component/view-model | None |

- Catalog collections are not dual-written into Query and Redux.
- React Context is dependency injection/lifecycle only, not a second state store.
- No module-level observable stores when Query or Redux already owns the fact.
- A new MMKV namespace is used at cutover. No legacy keys are read. Users re-authenticate/re-sync; the old namespace remains untouched for rollback.

### Playback

- yuzic-engine owns the native queue, audio session, DSP, cache, lock-screen, car, and background behavior.
- The app owns a narrower `PlayerBackend` anti-corruption contract.
- One converter constructs protected playable resources for phone, lock screen, CarPlay/Android Auto, and future watch/TV consumers.
- Redux stores resumable identity/position, not a competing live queue.
- JS shadow state is explicitly a synchronous read mirror and is replaced from native state on queue-change events.
- Sink ownership remains an explicit mutually exclusive state machine. It is not a generic composable capability.
- Android and iOS expose honest capability parity: implement missing methods or make absence explicit and hide unsupported controls; never silently swallow a platform stub.

### UI

- Route files parse typed params and render one feature screen.
- Feature screens consume one view model/entity, never parallel local/external values.
- Screens render decisions; pure use-cases make them.
- Shared entity actions are generated by one action registry and one sheet shell.
- No production diagnostic panel.

## 4. Delivery topology

- Baseline: verified commit containing Zack's current Settings work.
- Integration branch/worktree: `rewrite/main` at `../yuzic-rewrite`.
- Phase branches: `rewrite/01-gates`, `rewrite/02-domain`, etc., each targeting `rewrite/main`.
- `dev` remains the old control and can receive emergency release work independently.
- No architecture phase merges to `dev` individually. The app rewrite reaches `dev` once, through the final cutover PR, after full parity verification.
- yuzic-engine changes use separate engine branches/PRs/releases. The app pins a verified published engine revision/version only after engine parity is green.
- Every phase commit is independently green on lint, typecheck, and affected tests.

## 5. Rewrite parity matrix

Create `.hermes/rewrite-parity.json` on `rewrite/main` during implementation, generated/validated by a script rather than maintained as free-form prose. Rows cover:

- Every required `ServerAdapter` operation.
- Every optional capability.
- Every Expo route.
- Every persisted setting/policy.
- Every playback backend method and engine platform implementation.
- Every offline/acquisition lifecycle state.
- Every supported server/integration.

Each row records:

```ts
interface ParityRow {
  id: string;
  owner: string;
  legacyEvidence: string;
  replacementEvidence: string;
  unit: 'pending' | 'pass';
  integration: 'pending' | 'pass';
  ios: 'na' | 'pending' | 'pass';
  android: 'na' | 'pending' | 'pass';
  negativeControl: 'pending' | 'pass';
}
```

A validator fails on missing, duplicate, or pending rows before final cutover. This is temporary rewrite bookkeeping and is deleted when the rewrite lands; shipped architecture truth belongs in `docs/architecture.md` and `docs/integrations.md`.

---

# Phase 0 — Preserve the real baseline

### Task 0.1: Verify and preserve Zack's Settings work

**Files:** No source changes; current dirty tree listed in §1.

1. Run `npm ci` if the installed tree does not match `package-lock.json`.
2. Run:
   ```bash
   npm run lint
   npx tsc --noEmit
   npx jest --ci
   ```
3. Expected: lint 0 errors, TypeScript exit 0, Jest all suites green. Record exact counts in the rewrite handoff.
4. Review `git diff` and confirm only Zack's Settings work is present.
5. Commit it on a named baseline branch; do not squash it into architecture work.
6. Create `rewrite/main` and the isolated worktree from that exact commit.

### Task 0.2: Capture measurable baseline

**Create:**
- `tools/architecture/measure.mjs`
- `.hermes/rewrite-parity.json`

Measure and write machine-readable results for:

- test count and coverage,
- TS/TSX file and LOC count,
- circular imports,
- unused exports,
- non-test `as any` / `as unknown as`,
- provider-name branches outside provider folders,
- files over 400 lines,
- route inventory,
- current adapter/capability inventory.

Run the measurement twice and require identical output. Commit the script and baseline artifact.

---

# Phase 1 — Install architecture gates before moving code

### Task 1.1: Add dependency and dead-code gates

**Modify:**
- `package.json`
- `package-lock.json`
- `.github/workflows/pr-checks.yml`

**Create:**
- `.madgerc.json`
- `tools/architecture/check-unused.mjs`
- `tools/architecture/check-provider-branches.mjs`
- `tools/architecture/check-file-shape.mjs`

1. Add/configure `madge` with the real TS path aliases; prove the two known cycles fail the gate.
2. Add `ts-prune` with a reviewed baseline allowlist; new entries fail, allowlist may only shrink.
3. Ban production `console.log`, `as any`, unjustified double casts, and provider-name switches outside provider/registry directories.
4. Add a file-shape signal: orchestration/context/slice files over 250 lines and general source files over 400 lines fail unless a narrowly reviewed allowlist entry explains why. This is a guardrail, not proof of architecture.
5. Add Jest coverage, measure current baseline, and set thresholds at the measured values so coverage cannot drop.
6. Run each gate against an intentional violation and confirm it fails; delete the violation.
7. Run the clean tree and confirm all gates pass.

### Task 1.2: Remove immediate dead/production-debug code

**Delete after verifying no consumer:**
- `src/api/emby/auth/getMusicLibraries.ts`
- `src/api/jellyfin/auth/getMusicLibraries.ts`
- dead constants identified by the baseline (`SLEEP_TIMER_INCREMENTS`, `HOME_TARGET_ALBUMS`)

**Delete or move to engine development tooling:**
- `src/screens/settings/player/EngineSmokeTest.tsx`
- its unconditional render in `src/screens/settings/player/index.tsx`

**Modify:**
- `src/hooks/useDlnaDiscovery.ts` — replace debug logs with the designated logger and add a proper `react-native-udp.d.ts` rather than `@ts-ignore`.

Write behavior tests where deletion could change reachable UI. Run full gates and commit.

---

# Phase 2 — Replace the domain model completely

### Task 2.1: Create the domain kernel

**Create:**
- `src/domain/entities/EntityCore.ts`
- `src/domain/entities/Artist.ts`
- `src/domain/entities/Album.ts`
- `src/domain/entities/Song.ts`
- `src/domain/entities/Playlist.ts`
- `src/domain/entities/EntityRef.ts`
- `src/domain/identity/LocalId.ts`
- `src/domain/identity/Provenance.ts`
- `src/domain/identity/ExternalIds.ts`
- `src/domain/identity/matching.ts`
- `src/domain/library/LibraryState.ts`
- corresponding `*.test.ts`

Target core:

```ts
export interface EntityCore {
  localId: LocalId;
  nativeId: string;
  provenance: Provenance;
  externalIds: ExternalIds;
  libraryState: LibraryState;
}

export interface Artist extends EntityCore {
  name: string;
  cover: CoverSource;
  biography?: string;
  tags: string[];
  albumIds: LocalId[];
}
```

`Album`, `Song`, and `Playlist` use stable references for related entities and optional separately loaded detail lists. Do not embed provider response types.

Tests must prove:

- no entity can be constructed without required core fields,
- same provenance input yields stable identity,
- distinct origins never produce the same `LocalId`,
- matching does not mutate or merge identity,
- artist/album/song matching covers MBID/ISRC and conservative normalized fallback,
- `LibraryState` precedence is exhaustive,
- `contentKind` is required.

### Task 2.2: Add one mapper per provider boundary

**Create under each provider:** `mapArtist.ts`, `mapAlbum.ts`, `mapSong.ts`, `mapPlaylist.ts` only where supported.

Inputs are raw protocol DTOs; outputs are complete domain entities. Mapping requires a `Provenance` argument and calls `makeLocalId` centrally. Add fixture tests for Navidrome, MediaBrowser, Plex, Local, Deezer, and MusicBrainz.

Do not create a universal mapper that understands every protocol.

### Task 2.3: Cut every adapter and fixture to the new domain

Update all server and external-provider construction sites. Let required fields make incomplete object literals fail compilation. Replace the four unsafe production partial-track casts with explicit `TrackRef`/`PlayableRef` types.

### Task 2.4: Delete the old entity hierarchy

**Delete symbols/files after consumers move:**

- `ExternalArtistBase`, `ExternalArtist`
- `ExternalAlbumBase`, `ExternalAlbum`
- `ExternalSong`
- migration-era optional `localId?`, `externalIds?`, `libraryState?`
- old duplicate `EntityId`, `LibraryState`, and `libraryMatch` locations

Acceptance grep: zero references to old external entity names and zero `localArtist`/`externalArtist` prop pairs. Run full gates and commit.

---

# Phase 3 — Build one typed provider and capability system

### Task 3.1: Define callable capability contracts

**Create:**
- `src/providers/contracts/CapabilityMap.ts`
- `src/providers/contracts/Provider.ts`
- `src/providers/contracts/ServerAdapter.ts`
- `src/providers/contracts/IntegrationProvider.ts`
- `src/providers/contracts/Auth.ts`
- `src/providers/contracts/Presentation.ts`

Use a mapped contract rather than `SlotImpl = unknown`:

```ts
export interface CapabilityMap {
  'artist.enrich': ArtistEnrichmentCapability;
  'album.enrich': AlbumEnrichmentCapability;
  'acquisition.track': TrackAcquisitionCapability;
  'acquisition.album': AlbumAcquisitionCapability;
  'similarity.songs': SongSimilarityCapability;
  'similarity.artists': ArtistSimilarityCapability;
  'discovery.shelf': DiscoveryShelfCapability;
  'playlist.generate': PlaylistGenerateCapability;
  lyrics: LyricsCapability;
  scrobble: ScrobbleCapability;
  preview: PreviewCapability;
}

export type Capabilities = Partial<CapabilityMap>;
```

Do not include deferred capabilities with `never`; add a capability only with its first real consumer.

### Task 3.2: Define the provider broker

**Create:**
- `src/providers/registry/providers.ts`
- `src/providers/registry/capabilityBroker.ts`
- tests

The registry returns a discriminated union of server and integration providers. The broker filters by capability presence, connection health, active-server scope, and typed feature policy. It never invokes providers during enumeration.

Test positive and negative controls: connected+enabled appears, disconnected or disabled does not, and reading an entity triggers zero provider calls.

> **Amended (2026-09-14).** The broker shipped narrower than written here. See §8.1.

### Task 3.3: Move all providers into the registry

Represent Navidrome, Jellyfin, Emby, Plex, Local, Deezer, MusicBrainz, Last.fm, ListenBrainz, LRCLIB, AudioMuse, Lidarr, slskd, and SoulSync through provider declarations. Reuse the shared MediaBrowser protocol implementation for Jellyfin/Emby.

Each declaration supplies:

- stable id and kind,
- label/icon/presentation metadata,
- auth descriptor,
- connection test,
- callable capabilities,
- supported configuration schema.

Connections and feature screens must consume this metadata rather than maintain duplicate labels/assets.

### Task 3.4: Delete the decorative and special-case layers

**Delete:**
- `src/features/integrations/types.ts`
- `src/features/integrations/capabilityRegistry.ts`
- their tests
- AudioMuse-specific slot assembly
- reflective `serverAdapterSlots`
- separate source/downloader capability marker maps after their executable implementations move

Acceptance: no `SlotImpl`, no `moduleFillsSlot`, no provider-name branching in feature code, and capability consumers call the broker-returned typed implementation. Run full gates and commit.

---

# Phase 4 — Establish single-owner state and secure persistence

### Task 4.1: Make TanStack Query the sole catalog store

**Replace/delete:**
- `src/contexts/LibraryContext.tsx`
- `src/utils/redux/slices/libraryAlbumsSlice.ts`
- `libraryArtistsSlice.ts`
- `libraryPlaylistsSlice.ts`
- `libraryTracksSlice.ts`
- `libraryStarredSlice.ts`
- catalog portions of `librarySlice.ts`
- associated selectors/persist configs

Refactor catalog hooks to read persisted Query data directly. Offline mode reads the same cache and reports freshness/degraded state; it does not fall back to Redux.

Add cold-start/offline tests using a persisted query fixture: populate, restart provider, disable network, render cached catalog, verify no Redux catalog copy exists.

### Task 4.2: Replace `useSync` with a catalog coordinator

**Create:**
- `src/features/library/catalogQueries.ts`
- `src/features/library/catalogSync.ts`
- `src/features/library/useCatalogSyncStatus.ts`

Use Query fetch status/mutations for dedupe and progress. Delete module globals `activeSyncServerId` and `syncListeners`. Preserve app-start, foreground, server-switch, post-acquisition, and manual triggers through one coordinator.

### Task 4.3: Split the Settings junk drawer by feature

**Create feature-owned slices:**
- `features/settings/appearance/state.ts`
- `features/settings/home/state.ts`
- `features/settings/search/state.ts`
- `features/settings/metadata/state.ts`
- `features/settings/lyrics/state.ts`
- `features/settings/scrobbling/state.ts`
- `features/settings/playback/state.ts`
- `features/settings/sync/state.ts`

Move fields from `settingsSlice.ts` once, then delete the original slice and selectors. Use closed ID unions/tuples; no `Record<string, boolean>` for a closed provider set. Delete `librarySortOrder`, `serverScrobbleEnabled`, duplicate `deezerSearchEnabled`, and every read-time compatibility fallback.

Because this is a clean namespace cutover, do not write migrations.

### Task 4.4: Move credentials out of MMKV

**Create:**
- `src/state/credentials.ts`
- provider credential schemas

Store passwords, API keys, tokens, and mTLS material in SecureStore under provider/server identity. Redux stores non-secret connection metadata and credential references only.

Tests serialize every persisted Redux slice and assert known secret fields/values are absent. Do not inspect source text in tests.

### Task 4.5: Create clean persistence namespaces

Use distinct MMKV instances for Query and Redux and a new rewrite version namespace. Rename misleading `queryStorage`; remove AsyncStorage dependency if live usage reaches zero. Preserve the old namespace untouched for rollback, but never read it from the rewritten app.

Run cold-start rehydrate tests and commit.

---

# Phase 5 — Centralize entity resolution without eager joins

### Task 5.1: Create per-kind repository/query entry points

**Create:**
- `src/features/artist/artistRepository.ts`
- `src/features/album/albumRepository.ts`
- `src/features/song/songRepository.ts`
- `src/features/playlist/playlistRepository.ts`

Each accepts typed identity, asks exactly one origin provider for the base entity, and relates it to library presence through matching. It returns one canonical entity.

### Task 5.2: Create attributed field resolution

**Create:**
- `src/domain/entities/ResolvedField.ts`
- `src/features/artist/resolveArtistDetails.ts`
- `src/features/album/resolveAlbumDetails.ts`
- `src/features/lyrics/resolveLyrics.ts`

```ts
export interface ResolvedField<T> {
  value: T;
  sourceId: ProviderId;
}

export interface ResolvedArtist {
  entity: Artist;
  biography?: ResolvedField<string>;
  tags?: ResolvedField<string[]>;
  cover: ResolvedField<CoverSource>;
}
```

Server values are first and authoritative. External providers are tried in user order only for missing fields. Query keys include identity, capability, and ordered policy. Cache policy belongs to each capability query.

Tests must prove first-hit behavior, zero calls after a server hit, zero calls when disabled, no calls to later providers after a hit, source attribution, and restoration after policy change.

### Task 5.3: Correct metadata provider responsibilities

- Last.fm artist enrichment returns biography and tags; both are consumed or the unused field is removed from its capability.
- Deezer artist enrichment may provide artist image/details.
- Cover Art Archive moves exclusively to `album.enrich`, requiring release/release-group MBID.
- Remove artist-MBID-to-release-group probing.
- Server-provided artwork always wins.

Add real HTTP-boundary fixture tests, including CAA release vs release-group URLs and a negative artist MBID case.

---

# Phase 6 — Replace dual-path screens with thin feature screens

### Task 6.1: Artist vertical cutover

**Create:**
- `src/features/artist/useArtistScreenModel.ts`
- `src/features/artist/ArtistScreen.tsx`
- focused section components under the feature

Route params -> one screen model -> one `ResolvedArtist`. Move similar-provider grouping, discography classification, counts, play actions, and enrichment resolution out of render components.

**Delete after replacement:**
- `useExternalArtist`
- `BioSectionResolver`
- `PopularOnDeezerSectionResolver`
- duplicate local/external meta rows
- direct provider hooks in artist content
- screen-level `localArtist ?? externalArtist` expressions

The screen must not refetch albums/tracks in both Header and Content.

### Task 6.2: Album vertical cutover

Create one album screen model and one screen. Preserve the real preview/full-playback distinction as a typed playback availability/state decision, not as `LocalAlbumBody` vs `ExternalAlbumBody` type identity.

**Delete:**
- `useExternalAlbum`
- `LocalAlbumBody.tsx`
- `ExternalAlbumBody.tsx`
- duplicated local/external prop plumbing

Behavior tests cover full server tracks, preview-only tracks, unavailable tracks, Get/Want, and library match.

### Task 6.3: Song and Playlist cutover

Move song/playlist detail, identity, generated playlist, and external availability onto canonical models. Give Playlist the same required identity/provenance/library-state contract.

### Task 6.4: Replace four options sheets with one entity-action system

**Create:**
- `src/features/entity-actions/actionRegistry.ts`
- `src/features/entity-actions/useEntityActions.ts`
- `src/features/entity-actions/EntityOptionsSheet.tsx`

Entity-kind modules contribute declarative actions; shared behavior owns star, want, Get, share, offline download, and playlist operations.

**Delete:** the duplicated orchestration in `SongOptions.tsx`, `AlbumOptions.tsx`, `ArtistOptions.tsx`, and `PlaylistOptions.tsx`; retain only small type-specific action declarations.

### Task 6.5: Decompose Search

**Create:**
- `src/features/search/useSearchScreenModel.ts`
- `searchPolicy.ts`
- `searchHistory.ts`
- type-specific result renderers

Delete provider-specific legs and duplicated external/local rendering. Preserve the explicit Library XOR Other Sources state machine and provenance. Target `SearchScreen.tsx` under 250 lines.

Run feature tests, full gates, and commit.

---

# Phase 7 — Rebuild playback orchestration around the app/engine contract

### Task 7.1: Verify engine truth before changing the app

In `yuzic-engine`:

1. Fetch and compare local HEAD, `origin/main`, published package, and app-installed package.
2. Run `Tools/parity.py`; record exact missing/signature mismatches.
3. Verify protected audio and artwork headers through both native platforms.
4. Enumerate direct app imports/calls that bypass `PlayerBackend`.

Do not design against the stale local engine checkout.

### Task 7.2: Create one playable-resource conversion boundary

**Create:**
- `src/features/playback/playableResource.ts`
- `src/features/playback/engineBoundary.ts`

One conversion path owns URI, request headers, artwork URI/headers, duration, identity, and content kind for phone queue, browse tree, lock screen, and vehicle surfaces.

Delete/reduce duplicate conversion in:
- `buildTrackItem.ts`
- `useCarPlayBrowseTree.ts`
- `createEngineBackend.ts`
- `engineBackend.ts`

Rename fossil `toRntpProgress` to contract-accurate terminology.

### Task 7.3: Complete the app-owned `PlayerBackend`

Add every app-required operation, including per-resource eviction. No app feature may import yuzic-engine directly. Add contract tests run against a fake backend and the real engine adapter.

### Task 7.4: Make queue ownership explicit

On native `queueChange`, replace the JS mirror from native queue/index rather than trusting duplicated splice math. Redux persists resumable IDs/index/position only. Server queue remains an optional mirror/sink.

Run old/new control experiments for insert, remove before active, move active, clear, restore, background track change, and server mirror.

### Task 7.5: Decompose `PlayingContext.tsx`

**Create:**
- `PlaybackCoordinator.ts`
- `queueController.ts`
- `transportController.ts`
- `playbackEvents.ts`
- `autoplayCoordinator.ts`
- `bookmarkCoordinator.ts`
- `PlaybackProvider.tsx`

The coordinator subscribes to engine events and dispatches store/actions. React context exposes a stable command API and selectors only. Remove parallel React `useState` copies of Redux playback facts and stale-closure ref mirrors whose only purpose was supporting the monolith.

Target provider under 200 lines; each controller has one responsibility and pure tests where possible.

> **Amended (2026-09-14).** Done with a different file layout. See §8.2.

### Task 7.6: Move scrobbling provider mechanics out of playback UI

`useScrobbling` becomes a session policy/coordinator. Server adapters implement their required start/progress/stop/forwarding semantics. The player emits neutral playback events. Preserve per-destination exclusivity and offline replay.

No generic hook may contain Jellyfin/Emby/Navidrome reasoning.

Run full playback unit tests and on-device iOS/Android tests before commit.

---

# Phase 8 — Make yuzic-engine a complete product boundary

### Task 8.1: Eliminate silent platform gaps

In `yuzic-engine`, for every `AudioEngine` method:

- implement it on iOS and Android, or
- expose platform capability absence to the app and prevent the control/action from appearing.

No silent swallowed stub is acceptable. Desired gate: `Tools/parity.py` reports zero unexplained gaps and compares signatures.

### Task 8.2: Complete protected browse artwork

Extend `BrowseNode` to carry artwork headers and implement them in CarPlay/Android Auto browse rendering. Add an authenticated fixture that returns 401 without exact headers; verify negative and positive controls.

### Task 8.3: Publish and pin exact engine output

Run engine unit/native tests, package it, inspect the tarball, publish under the engine's release procedure, install clean into an empty project, then update the app dependency. Verify app lockfile and installed package resolve to the published implementation.

Do not use a floating caret during rewrite verification; pin the exact engine version or immutable commit selected for cutover.

---

# Phase 9 — Rebuild acquisition and offline ownership

### Task 9.1: Keep intent, command, job, and arrival distinct

Preserve these explicit concepts:

- Want: save-only intent.
- Get: user command choosing an acquisition provider.
- Acquisition job: remote downloader work.
- Arrival: catalog presence after sync.
- Offline download: local copy of already-owned server media.

Do not unify them into one overloaded “download” state.

### Task 9.2: Make one acquisition queue owner

Rewrite `DownloadersQueueContext` as a feature query/coordinator exposing complete queue snapshots and derived per-item progress. Replace and delete:

- `src/screens/settings/downloaders/useDownloaderQueue.ts`
- polling in `src/hooks/useExternalAlbumStatus.ts`
- duplicate queue Query keys/poll intervals

Exactly one network poll per downloader/server feeds counts, cards, progress, completion, rescan, and sync triggers.

### Task 9.3: Replace the offline download god context

**Create:**
- `src/features/offline/state.ts`
- `filesystem.ts`
- `jobRunner.ts`
- `networkPolicy.ts`
- `OfflineProvider.tsx`

Move jobs, resumables, collections, progress, Wi-Fi gating, and file resolution into one persisted slice plus filesystem service. Context supplies lifecycle/dependencies only.

**Delete:**
- raw-key `localDownloadStore.ts`
- React `useState` mirror of persisted jobs
- `LEGACY_TEMP_DOWNLOAD_DIR`
- `cleanupLegacyTempDownloads`
- every old download/transcode migration path

Test crash/restart resume, cancellation, deletion+engine eviction, Wi-Fi gating, and corrupt partial cleanup.

> **Amended (2026-09-14).** Done as a store with its own persistence rather than a Redux slice. See §8.3.

### Task 9.4: Preserve local files as a server provider

Local import remains synchronous/private and does not enter acquisition arrival or server sync machinery. Test repeat import, duplicate handling, and playback resource creation through the same domain/player contracts.

---

# Phase 10 — Rebuild Settings and Connections from runtime truth

### Task 10.1: Define typed feature policy schemas

Each feature owns a typed policy and a small presentation descriptor. Avoid a universal dynamic settings value bag. Closed source orders use typed IDs and validated reorder functions.

A visible control must have a behavior-level test proving downstream output changes—not merely that Redux received an action.

### Task 10.2: Generate Connections from provider declarations

Connections enumerates manageable providers from the registry and displays:

- provider icon/presentation,
- account vs service grouping,
- connection health text,
- capability summary,
- detail route.

The active music server retains its dedicated server/account surface, but uses the same provider presentation metadata. Server avatar remains server-provided identity imagery; product logos come from provider descriptors.

Delete hand-listed ListenBrainz/AudioMuse/downloader rows and orphaned integration routes.

### Task 10.3: Rebuild feature settings

Metadata, Lyrics, Search, Scrobbling, Home, Playback, Appearance, Sync, Downloads, and discovery screens bind to their feature policies. Remove provider-owned feature toggles that duplicate feature settings.

Required tests include:

- Metadata source order changes resolver call order.
- Search provider toggle changes external search plan.
- Scrobble route changes actual destination calls and keeps at-most-one route.
- Playback quality changes the generated resource request.
- Crossfade/EQ settings either invoke a supported engine method or are absent.
- Home shelf visibility/order changes the computed layout.
- Every enabled/disabled case has a negative control.

> **Amended (2026-09-14).** Metadata and Search no longer have settings screens of their own. See §8.4.

### Task 10.4: Delete old settings infrastructure

Delete `settingsSlice.ts`, `settingsSelectors.ts`, orphaned Deezer/MusicBrainz/Last.fm routes, compatibility fallbacks, unused actions, and duplicated labels/source lists after all consumers move.

Run route reachability tests for every remaining settings route.

---

# Phase 11 — Structural convergence and deletion sweep

### Task 11.1: Empty transitional architecture directories

Move or delete remaining production code under:

- `src/api`
- `src/hooks`
- `src/contexts`
- `src/screens`
- `src/utils/redux`

Keep a location only when its responsibility matches the final layout; do not retain barrels solely to preserve old import paths. Update all imports directly.

### Task 11.2: Resolve cycles and unused exports

Run:

```bash
npx madge --circular --extensions ts,tsx src
npx ts-prune -p tsconfig.json
```

Expected: zero cycles; zero unexplained unused production exports. Specifically eliminate the Home layout cycle and old Album/Song type cycle.

### Task 11.3: Remove provider and unsafe-cast residue

Expected checks:

- zero provider-name branches outside provider implementations/registry,
- zero production `as any`,
- zero unjustified production double casts,
- zero production `console.log`,
- zero local/external entity pairs,
- zero duplicate catalog stores,
- zero provider-specific hooks imported by screens,
- zero user-facing diagnostic panels.

Review the nine tests that mock same-directory internals. Keep a mock only if that module is the genuine I/O/native boundary; otherwise rewrite the test around behavior. Do not add tests that read source files.

### Task 11.4: Rewrite documentation to describe only shipped truth

**Rewrite/update:**
- `docs/architecture.md`
- `docs/integrations.md`
- `CONTRIBUTING.md`
- `AGENTS.md`

Remove migration-era wording, stale “stubbed” Wants claims, old Settings paths, stale release-number instructions, and aspirational architecture not present in runtime. Include ownership tables and extension recipes for a server, integration, entity field, setting, playback method, and synced resource.

---

# Phase 12 — Whole-product parity and real-service verification

### Task 12.1: Run canonical static/unit gates

```bash
npm ci
npm run lint
npx tsc --noEmit
npx jest --ci --coverage
npm run architecture:check
```

Expected: all green, coverage at or above baseline, zero architecture gate violations.

### Task 12.2: Real provider matrix

Use deterministic fixture libraries and real instances where refusal behavior matters:

- Navidrome
- Jellyfin/Emby shared MediaBrowser path
- Plex, including Basic-auth audio/artwork
- Local files
- Deezer/MusicBrainz/Last.fm metadata
- ListenBrainz direct scrobbling
- LRCLIB
- AudioMuse
- Lidarr/slskd/SoulSync

For each, verify positive and negative auth, empty/missing data, pagination, missing artwork, offline/unreachable behavior, and source disablement.

### Task 12.3: Side-by-side control build

Run old `dev` and rewritten build against the same seeded services. Compare:

- catalog counts and IDs,
- artist/album/song/playlist rendering,
- search scope and provenance,
- fallback/enrichment call traces,
- queue mutation and restore,
- scrobble timestamps/destinations,
- acquisition progress and arrival,
- offline restart/resume,
- protected images/audio.

Every intended divergence must be written into the parity matrix; unexplained divergence blocks cutover.

### Task 12.4: Visual and device gates

Run Maestro:

```bash
npm run test:e2e
npm run test:e2e:onboarding
```

Then verify on real iOS and Android hardware:

- foreground/background playback,
- lock-screen controls/artwork,
- queue edits and restore,
- crossfade/EQ/cache behavior,
- downloads and filesystem restart,
- CarPlay/Android Auto browse/playback where available,
- server switching and offline recovery,
- Settings effects and provider images.

Capture and show the key Settings, Connections, artist, album, search, downloads, and player screens to Zack before completion.

---

# Phase 13 — Final cutover and cleanup

### Task 13.1: Prove the branch contains no rewrite scaffolding

Delete:

- `.hermes/rewrite-parity.json`
- temporary audit allowlists that reached zero
- temporary feature flags/harnesses, if any were used locally
- stale plan-specific comments/TODOs

Re-run all gates from a clean install and clean build artifacts.

### Task 13.2: Open the app cutover PR

Open `rewrite/main -> dev` only after:

- the complete parity matrix was green before its deletion,
- all static/unit/E2E/device gates passed,
- no version field changed,
- exact engine dependency is published and verified,
- final diff contains the new architecture and deletion of superseded code.

The PR body must state plainly:

- this is a clean storage/auth reset,
- users must reconnect/re-sync/re-download/re-import as applicable,
- no legacy state is read,
- old storage remains untouched for rollback,
- this PR does not release because package version is unchanged.

Do not merge the app PR; Zack performs that review/merge.

### Task 13.3: Soak on `dev`, then prepare release separately

After Zack merges:

1. Verify exact merged SHA on `dev`.
2. Build/install from `dev` on both platforms.
3. Repeat smoke, playback, auth, and offline gates.
4. Observe for a defined soak period.
5. Prepare a separate version-bump release PR only with Zack's explicit approval.
6. After release, verify iOS and Android jobs/stores independently and confirm actual build numbers.

## 6. Rollback

- Before final merge: rollback is abandoning `rewrite/main`; `dev` remains untouched.
- After merge but before release: revert the single cutover merge on `dev`.
- After release: issue a new patch version from the last known-good source; do not move a published tag.
- Because the rewritten app uses a new storage namespace and never modifies the old one, rolling back restores the old app's prior state. State created only in the rewritten namespace is intentionally not backported.
- Engine rollback is an app dependency-pin change to a known published engine version; never rewrite a published engine tag/version.

## 7. Definition of done

The rewrite is complete only when all are true:

- One entity type per kind; no external/local parallel hierarchy.
- One typed callable capability system; no marker slots or provider special cases.
- One owner/storage mechanism per fact.
- Catalog exists only in persisted Query state.
- Credentials are absent from Redux/MMKV persistence.
- Every visible setting changes tested runtime behavior.
- Artist/album screens consume one resolved model and perform no provider orchestration.
- Metadata fields are attributed and ordered; CAA is release-only.
- One acquisition queue poller and one offline job store exist.
- `PlayingContext` and `DownloadContext` god objects are gone.
- No app feature bypasses `PlayerBackend`.
- Engine platform gaps are implemented or explicitly unavailable in UI; no silent stubs.
- Protected audio/artwork works on phone, lock screen, and vehicle browse surfaces.
- Zero cycles, unexplained unused exports, unsafe production casts, provider-name feature branches, and production debug UI/logging.
- Docs describe runtime truth rather than the intended next migration step.
- Full lint/typecheck/Jest/coverage/architecture/Maestro gates pass.
- Real-service positive and negative controls pass.
- Zack has reviewed the visible result before the final app PR is merged.

## 8. Amendments

Where the work that shipped differs from the tasks above. Each entry says what changed and why, so the difference is a decision on record rather than something only an allowlist knows about.

### 8.1 The capability broker serves five capabilities (Tasks 3.2–3.4)

`595ace68` removed seven provider declarations that only a test imported. Each re-implemented a job a feature already did at runtime, in a thinner form. It also cut `CapabilityMap` to the capabilities that have both a provider and a caller: `artist.enrich`, `album.enrich`, `lyrics`, `catalogue.album` and `catalogue.search`.

- Acquisition stays in `features/downloaders/registry.ts`.
- Scrobbling stays in the scrobble routing and the offline mutation queue.
- Queue fill and similarity stay in `features/playback/queueProviders.ts`. The choice of fill source is declared in `providers/registry/queueFillProviders.ts`.
- There is no `providers.ts` union of server and integration providers. The broker serves integrations, and the active server is reached through its adapter.

This follows the contract's own rule that a capability is added with its first consumer. The Definition of Done item "one typed callable capability system" is met in that narrower sense.

### 8.2 PlayingContext (Task 7.5)

`50847640`. `PlayingContext.tsx` is about 100 lines and composes focused hooks. The plan named a `PlaybackProvider.tsx` and a `bookmarkCoordinator.ts`. Instead:

- **One owner for playback facts.** `playbackSession.ts` holds the queue, segments, shuffle snapshot, pointer and modes. React reads it through `useSyncExternalStore`, which removes the React-state copies and the refs that mirrored them.
- **Hooks for everything else:**
  - `usePlayerSetup`
  - `usePlaybackResources`
  - `usePlaybackServices`
  - `usePlaybackEngine` (engine events, track changes, autoplay)
  - `usePlayingCommands`
  - `useRestorePersistedQueue`
  - `usePlaybackPersistenceSync`
- **Controllers unchanged.** The existing controllers keep their tests: queue, transport, shuffle, playback events, autoplay, playback coordinator and starters.
- **Bookmarks** stay in `useBookmarkManager`.
- **The provider name stays `PlayingContext`,** so its ~40 consumers and the test mocks are unchanged.
- **Where the facts live.** Playback facts live in the session, not in Redux. Redux persists only resume state.
- **Removed:** the queue-reconciliation fallback to a library map that nothing populated.
- **Verification:** on device for restore, play, skip and pause.

### 8.3 Offline downloads (Task 9.3)

`ea16b5cf`. `DownloadContext.tsx` composes `offlineStore.ts`, `offlineDownloader.ts`, `downloadProgress.ts`, `useOfflineCommands.ts` and `useOfflineLifecycle.ts`.

- **Not a Redux slice.** `offlineStore` is the single owner of tracks, collections, jobs and resumables. It persists to its own `downloads.*.v1` keys, which already sit in the rewrite's `yuzic-v2` namespace, so existing download indexes carry over without a migration.
- **Deleted:** `localDownloadStore.ts` and the React-state copy of the job list.
- **Already gone before this task:** `LEGACY_TEMP_DOWNLOAD_DIR` and its cleanup.
- **Names kept:** the provider is still `DownloadContext`, since there are ~20 consumers. `filesystem.ts`, `jobQueue.ts` (the job runner) and `networkPolicy.ts` already existed.
- **Tracks are named by `localId` throughout.** Several paths used the server id against a `localId` index. Downloaded songs streamed instead of playing from the device. A finished album reported failure. Loose downloads never showed in Library › Downloaded. Search never showed an album as fully downloaded.
- **Tests:** the store, the progress feed and the downloader have their own tests. Resume, removal and cleanup are covered by the existing tests for `resumeState`, `removal`, `restore` and `jobQueue`.
- **Verification:** on device, one download plus the restore of existing downloads.

### 8.4 Settings (Tasks 10.2–10.4)

- **Connections** is drawn from declared integrations (`77c66aff`).
- **One place for every outside service.** Settings › Online sources (`e73bd1d4`) has a card per service (Deezer, ListenBrainz, Last.fm, MusicBrainz, Cover Art Archive), with a switch per use and what that service is sent. It replaces the Metadata and Search settings screens and the orphaned Deezer, Last.fm and MusicBrainz routes.
- **One Last.fm switch** now covers bios, similar artists and playlist seeds; persist version 1 migrates the old bios entry.
- **Home settings** marks an outside tier as off and links to its card.
- **The Search filter sheet** turns sources on inline.
- **The Metadata fallback order** is no longer user-reorderable; sources resolve in the order they were turned on.
- **Route reachability** is tested by `features/settings/settingsRoutes.test.ts`.

### 8.5 AsyncStorage (Phase 4)

"Drop the unused AsyncStorage dependency" removes `@react-native-async-storage/async-storage`, which nothing imported. The query cache already persists to MMKV through TanStack's storage-agnostic persister. That commit also refreshes `ios/Podfile.lock`: `RNCAsyncStorage` is gone, and `YuzicEngine` moves from a stale 1.0.8 to the pinned 1.0.10.

CI runs `pod install` on Ruby 3.3 and is unaffected. On a machine using Homebrew's Ruby 4, `pod install` fails with "unknown keyword: quirks_mode". Ruby 4 bundles json 3, and ActiveSupport still passes that option. Run CocoaPods with json 2 activated first; no repo change is needed.

### 8.6 Still open

These remain as the overview found them. Each blocks cutover unless it is separately amended:

- the Phase 12 device and provider matrix
- Android verification of these changes
- 382 allowlisted unused exports
- behaviour-level tests for every visible setting
