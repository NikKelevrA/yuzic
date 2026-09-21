/* global Buffer, __dirname -- a Node script, outside the app's lint environment */
/**
 * A fake Jellyfin, just real enough for Yuzic to connect, sync, play, and be
 * asked questions about what it synced. For local measurement only.
 *
 *   TARGET_MB=60 node tools/mock-jellyfin/server.js
 *
 * Listens on 8097; from the Android emulator that is http://10.0.2.2:8097, and
 * any username and password sign in. TARGET_MB sizes the library (60 is
 * 89,878 tracks, 8,171 albums, 4,085 artists). FILLER_BYTES pads every track
 * DTO without changing what the app keeps.
 *
 * Streams are real audio, a quiet tone as long as the track claims to be, so
 * playback can be measured rather than only failed. To make streams fail the
 * way a captive portal or a broken proxy does (a 200 that is not audio), list
 * song ids in `poison.txt` beside this file, or `*` for all of them. It is read
 * on every request, so no restart is needed, and it is git-ignored.
 *
 * Only `Items` and `Artists` requests are logged in full; anything the mock
 * does not otherwise answer is logged as UNMATCHED, because a request that
 * quietly fell through to an empty listing once hid for an hour that no stream
 * request was reaching this server at all.
 *
 * It started as one number: pad /Items to TARGET_MB so the catalog fetch comes
 * back the size a ~50,000 track library does, which is all #266 needed — that
 * crash happens in React Native's Android networking layer, below JS.
 *
 * That version answered every request with the same track objects, so albums
 * carried song ids, `AlbumId` pointed at nothing, and `ParentId` was ignored:
 * an album screen asked for its eleven tracks and got the whole 60 MB library
 * back. Fine for a crash repro, useless for checking a join — an empty track
 * list looked like a bug in the app when it was a bug in here.
 *
 * So the catalog is relational now. Tracks belong to albums, albums to
 * artists, and the id in a relationship is one the matching endpoint will
 * actually return.
 */
const http = require('http');

const PORT = 8097;
const TARGET_MB = Number(process.env.TARGET_MB || 60);
const TRACK_COUNT = Math.round((TARGET_MB * 1024 * 1024) / 700); // ~700 B/track, measured
// Scaled off the track count so the shape of the catalog stays the same at
// every size: about eleven tracks an album, two albums an artist.
const ALBUM_COUNT = Math.max(1, Math.round(TRACK_COUNT / 11));
const ARTIST_COUNT = Math.max(1, Math.round(TRACK_COUNT / 22));
const PLAYLIST_COUNT = 12;
/**
 * Bytes of ignored payload added to every track DTO.
 *
 * The mapper never reads it, so entity count and entity size are unchanged and
 * only the response gets bigger. That separates "memory that scales with what
 * the server sent" from "memory that scales with what we kept".
 */
const FILLER_BYTES = Number(process.env.FILLER_BYTES || 0);
const FILLER = FILLER_BYTES > 0 ? 'f'.repeat(FILLER_BYTES) : null;

const GENRES = ['Alternative Rock', 'Indie', 'Electronic', 'Jazz'];
/** Every track's length. Jellyfin counts in 100 ns ticks. */
const TRACK_SECONDS = 243;

const albumId = (i) => `album-${i}-ef56ab78`;
const artistId = (i) => `artist-${i}-9ab31c04`;
const songId = (i) => `song-${i}-0f4c2a1b9c`;
const playlistId = (i) => `playlist-${i}-77d0e912`;

const artistName = (i) => `Some Artist Name ${i}`;
const albumTitle = (i) => `An Album Title Of Ordinary Length ${i}`;

/** The index embedded in an id, whatever kind it is. */
const indexOf = (id) => {
  const match = /-(\d+)-/.exec(id ?? '');
  return match ? Number(match[1]) : null;
};

const artistRef = (i) => ({ Id: artistId(i), Name: artistName(i) });

const track = (i) => {
  const album = i % ALBUM_COUNT;
  const artist = album % ARTIST_COUNT;
  return {
    Id: songId(i),
    Name: `A Reasonably Long Track Title ${i}`,
    Type: 'Audio',
    ArtistItems: [artistRef(artist)],
    AlbumArtist: artistName(artist),
    Album: albumTitle(album),
    AlbumId: albumId(album),
    AlbumPrimaryImageTag: `tag-${album}-abcdef0123456789`,
    RunTimeTicks: TRACK_SECONDS * 10_000_000,
    ProductionYear: 1998 + (album % 26),
    DateCreated: '2024-06-17T12:00:00.0000000Z',
    // Track number within its album: the nth time this album comes round.
    IndexNumber: Math.floor(i / ALBUM_COUNT) + 1,
    ParentIndexNumber: 1,
    Genres: [GENRES[album % GENRES.length], 'Indie'],
    UserData: { PlayCount: i % 37, IsFavorite: false, LastPlayedDate: '2025-09-01T00:00:00.0000000Z' },
    ...(FILLER ? { Filler: FILLER } : {}),
    MediaSources: [
      {
        Id: `ms-${i}`,
        Path: `/music/Artist ${artist}/Album ${album}/${Math.floor(i / ALBUM_COUNT) + 1} Track.flac`,
        Container: 'flac',
        Bitrate: 960000,
      },
    ],
  };
};

const album = (i) => {
  const artist = i % ARTIST_COUNT;
  return {
    Id: albumId(i),
    Name: albumTitle(i),
    Type: 'MusicAlbum',
    AlbumArtist: artistName(artist),
    ArtistItems: [artistRef(artist)],
    Artists: [artistName(artist)],
    AlbumArtists: [artistRef(artist)],
    ProductionYear: 1998 + (i % 26),
    PremiereDate: `${1998 + (i % 26)}-03-04T00:00:00.0000000Z`,
    DateCreated: '2024-06-17T12:00:00.0000000Z',
    Genres: [GENRES[i % GENRES.length], 'Indie'],
    ImageTags: { Primary: `tag-${i}-abcdef0123456789` },
    // How many times this album comes round in the track list.
    ChildCount: Math.ceil((TRACK_COUNT - i) / ALBUM_COUNT),
    UserData: { IsFavorite: false },
  };
};

const artist = (i) => ({
  Id: artistId(i),
  Name: artistName(i),
  Type: 'MusicArtist',
  Genres: [GENRES[i % GENRES.length]],
  Overview: `Some Artist Name ${i} has been making records since 1998.`,
  DateCreated: '2024-06-17T12:00:00.0000000Z',
  ImageTags: { Primary: `tag-artist-${i}-abcdef0123456789` },
  UserData: { IsFavorite: false },
});

const playlist = (i) => ({
  Id: playlistId(i),
  Name: `A Playlist ${i}`,
  Type: 'Playlist',
  ChildCount: 25,
  DateCreated: '2024-06-17T12:00:00.0000000Z',
  DateLastMediaAdded: '2025-01-02T00:00:00.0000000Z',
  ImageTags: {},
});

/** Every track on an album, in the order the album lists them. */
function tracksOfAlbum(index) {
  const out = [];
  for (let i = index; i < TRACK_COUNT; i += ALBUM_COUNT) out.push(track(i));
  return out;
}

/** Every album an artist made. */
function albumsOfArtist(index) {
  const out = [];
  for (let i = index; i < ALBUM_COUNT; i += ARTIST_COUNT) out.push(album(i));
  return out;
}

const KINDS = {
  Audio: { count: () => TRACK_COUNT, make: track, prefix: 'song-' },
  MusicAlbum: { count: () => ALBUM_COUNT, make: album, prefix: 'album-' },
  MusicArtist: { count: () => ARTIST_COUNT, make: artist, prefix: 'artist-' },
  Playlist: { count: () => PLAYLIST_COUNT, make: playlist, prefix: 'playlist-' },
};

const byPrefix = (id) =>
  Object.values(KINDS).find((kind) => (id ?? '').startsWith(kind.prefix)) ?? null;

let cachedFull = null;
/**
 * The unpaged whole-library response, kept as it was: this is the #266 body,
 * the one big enough to kill the app before any JS runs. A client that asks
 * for everything still gets everything.
 */
function fullPayload() {
  if (!cachedFull) {
    cachedFull = JSON.stringify({
      Items: Array.from({ length: TRACK_COUNT }, (_, i) => track(i)),
      TotalRecordCount: TRACK_COUNT,
      StartIndex: 0,
    });
    console.log(
      `[mockjf] unpaged /Items payload would be ${(cachedFull.length / 1048576).toFixed(1)} MB across ${TRACK_COUNT} tracks`
    );
  }
  return cachedFull;
}

const listing = (items, total = items.length, startIndex = 0) =>
  JSON.stringify({ Items: items, TotalRecordCount: total, StartIndex: startIndex });

/** Honours StartIndex/Limit the way Jellyfin does. */
function page(kind, query) {
  const total = kind.count();
  const startIndex = Number(query.get('StartIndex') || 0);
  const limitRaw = query.get('Limit');
  if (limitRaw === null) {
    return kind === KINDS.Audio
      ? fullPayload()
      : listing(Array.from({ length: total }, (_, i) => kind.make(i)), total);
  }
  const end = Math.min(total, startIndex + Number(limitRaw));
  const items = [];
  for (let i = startIndex; i < end; i += 1) items.push(kind.make(i));
  return listing(items, total, startIndex);
}

function resolve(path, query) {
  // Favourites: the app asks for starred items on launch. Nothing is starred.
  if ((query.get('Filters') ?? '').includes('IsFavorite')) return listing([]);

  const ids = query.get('Ids');
  if (ids) {
    const items = ids
      .split(',')
      .filter(Boolean)
      .map((id) => {
        const kind = byPrefix(id);
        const index = indexOf(id);
        return kind && index !== null && index < kind.count() ? kind.make(index) : null;
      })
      .filter(Boolean);
    return listing(items);
  }

  const wanted = query.get('IncludeItemTypes');

  // An album's tracks, or an artist's. `ParentId` is also how the app scopes
  // every request to a music library, so a library id means "no filter".
  const parentId = query.get('ParentId');
  const parentIndex = indexOf(parentId);
  if (parentId && parentId !== 'lib-music') {
    if (parentIndex === null) return listing([]);
    if (parentId.startsWith('album-')) return listing(tracksOfAlbum(parentIndex));
    if (parentId.startsWith('artist-')) {
      return wanted === 'MusicAlbum'
        ? listing(albumsOfArtist(parentIndex))
        : listing(tracksOfAlbum(parentIndex % ALBUM_COUNT));
    }
    // A parent this catalog does not have — a stale id out of the app's
    // persisted cache, say. Empty, not everything: falling through to the
    // whole library is how the first version of this mock killed the app.
    return listing([]);
  }

  const artistFilter = query.get('AlbumArtistIds') ?? query.get('ArtistIds');
  const artistIndex = indexOf(artistFilter);
  if (artistFilter && artistIndex !== null) {
    return wanted === 'MusicAlbum' ? listing(albumsOfArtist(artistIndex)) : listing([]);
  }

  if (path === '/Artists' || path.endsWith('/Artists')) return page(KINDS.MusicArtist, query);

  return page(KINDS[wanted] ?? KINDS.Audio, query);
}

const json = (res, body, code = 200) => {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(code, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(text) });
  res.end(text);
};


// A real, decodable stream: a 440 Hz tone, 8 kHz mono 16-bit PCM, exactly as
// long as the tracks claim to be (RunTimeTicks). Without it every stream
// request fell through to the JSON listing below and the player reported
// "Source error" for every track. Shorter than the declared length, playback
// ran out early and looked to the app like a stall.
const WAV = (() => {
  const rate = 8000, seconds = TRACK_SECONDS, samples = rate * seconds;
  const buf = Buffer.alloc(44 + samples * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + samples * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) buf.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 440 * i / rate) * 8000), 44 + i * 2);
  return buf;
})();
http.createServer((req, res) => {
  const [path, rawQuery = ''] = req.url.split('?');
  const query = new URLSearchParams(rawQuery);
  const interesting = (path.includes('Items') || path.includes('Artists')) && !path.includes('/Images/');
  if (interesting) {
    const paging = query.has('Limit')
      ? `StartIndex=${query.get('StartIndex') || 0} Limit=${query.get('Limit')}`
      : 'UNPAGED';
    const filters = ['IncludeItemTypes', 'ParentId', 'Ids', 'AlbumArtistIds', 'Filters']
      .map((key) => (query.get(key) ? `${key}=${query.get(key)}` : null))
      .filter(Boolean)
      .join(' ');
    console.log(`[mockjf] ${new Date().toISOString().slice(11, 23)} ${req.method} ${path.slice(0, 40)} ${paging} ${filters}`);
  }

  if (/^\/Audio\/[^/]+\/stream/.test(path)) {
    // A captive portal, on demand: any song id listed in poison.txt gets a
    // 200 JSON body instead of audio, read fresh on every request.
    const songId = path.split('/')[2];
    let poisoned = [];
    try { poisoned = require('fs').readFileSync(require('path').join(__dirname, 'poison.txt'), 'utf8').split(/\s+/).filter(Boolean); } catch {}
    if (poisoned.includes(songId) || poisoned.includes('*')) {
      console.log(`[mockjf] ${new Date().toISOString().slice(11, 23)} ${req.method} POISONED ${path.slice(0, 60)}`);
      return json(res, { error: 'not audio' });
    }
    console.log(`[mockjf] ${new Date().toISOString().slice(11, 23)} ${req.method} AUDIO ${path.slice(0, 60)}`);
    res.writeHead(200, { 'Content-Type': 'audio/wav', 'Content-Length': WAV.length });
    return res.end(WAV);
  }
  if (path === '/System/Info/Public') {
    return json(res, { Id: 'mock-jellyfin', ProductName: 'Jellyfin Server', Version: '10.9.0', ServerName: 'MockJF' });
  }
  if (path.endsWith('/Authenticate') || path.endsWith('/AuthenticateByName')) {
    return json(res, {
      User: { Id: 'user-1', Name: 'mock' },
      AccessToken: 'mock-token',
      ServerId: 'mock-jellyfin',
    });
  }
  if (path === '/Genres' || path.endsWith('/Genres')) {
    return json(res, listing(GENRES.map((name, i) => ({ Id: `genre-${i}-aa11bb22`, Name: name, Type: 'MusicGenre' }))));
  }
  // No artwork. Answering an image request with JSON would be worse than a
  // miss: the image layer would cache a body it cannot decode.
  if (path.includes('/Images/')) return json(res, { }, 404);
  // A playlist's contents. Without this the unfiltered fallthrough below
  // would hand back the entire library for one playlist.
  if (path.startsWith('/Playlists/')) {
    return json(res, listing(Array.from({ length: 25 }, (_, i) => track(i * 97))));
  }
  if (path.includes('/Items') || path.includes('/Artists')) return json(res, resolve(path, query));
  if (path.includes('/Views') || path.includes('/MediaFolders')) {
    return json(res, { Items: [{ Id: 'lib-music', Name: 'Music', CollectionType: 'music' }], TotalRecordCount: 1 });
  }
  console.log(`[mockjf] ${new Date().toISOString().slice(11, 23)} ${req.method} UNMATCHED ${req.url.slice(0, 160)}`);
  return json(res, { Items: [], TotalRecordCount: 0 });
}).listen(PORT, '0.0.0.0', () => {
  console.log(
    `[mockjf] listening on ${PORT}: ${TRACK_COUNT} tracks, ${ALBUM_COUNT} albums, ${ARTIST_COUNT} artists, ${PLAYLIST_COUNT} playlists, filler ${FILLER_BYTES} B/track`
  );
  fullPayload();
});
