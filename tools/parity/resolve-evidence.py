"""Resolve `replacementEvidence` for .hermes/rewrite-parity.json (Phase 12.3).

Run it again whenever the tree moves; the evidence is derived, not typed, so a
renamed adapter method shows up as an unresolved row instead of a stale string
nobody rechecks.

    python3 tools/parity/resolve-evidence.py            # report only
    python3 tools/parity/resolve-evidence.py --write    # update the matrix

Every value written here comes from the tree, never a guess: a row is filled
only when the implementing site is found, and left untouched otherwise so an
unfilled row stays visibly unfilled. The surfaces the rewrite deliberately
reshaped are listed in ADAPTER_DIVERGENCE, and `verify_divergences()` refuses
to run if any of them turns out to be implemented after all — so the list
cannot quietly rot into an excuse for a genuine gap.

It does not fill `unit`, `integration`, `ios`, `android` or `negativeControl`.
Those are claims about behaviour, and nothing here observes behaviour.
"""
import json, os, re, sys

os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))

# ---------- adapter.<group>.<method> ----------
# Each server adapter builds typed sub-APIs: `const albums: AlbumsApi = { ... }`.
ADAPTERS = {
    'navidrome': 'src/providers/server/navidrome/index.ts',
    'mediaBrowser': 'src/providers/server/media-browser/adapter.ts',
    'plex': 'src/providers/server/plex/index.ts',
    'local': 'src/providers/server/local/index.ts',
}

# The ApiAdapter interface is the authority on group -> XxxApi, because some
# adapters build their sub-APIs untyped (`const bookmarks = {`).
_types = open('src/providers/contracts/ServerAdapter.ts').read()
_iface = re.search(r'export interface ApiAdapter \{(.*?)\n\}', _types, re.S).group(1)
GROUP_TO_API = dict(re.findall(r'^\s{2}(\w+)\??\s*:\s*(\w+Api)\s*;', _iface, re.M))

BLOCK = re.compile(r'const\s+(\w+)\s*(?::\s*(\w+Api)\s*)?=\s*\{', re.M)

def sub_api_methods(path):
    """{GroupApi: {method: line}} for one adapter file."""
    if not os.path.exists(path):
        return {}
    src = open(path).read()
    lines = src.split('\n')
    out = {}
    for m in BLOCK.finditer(src):
        name = m.group(1)
        group = m.group(2) or GROUP_TO_API.get(name)
        if not group:
            continue
        start_line = src[:m.start()].count('\n')
        depth, methods = 0, {}
        for i in range(start_line, len(lines)):
            line = lines[i]
            depth += line.count('{') - line.count('}')
            if i > start_line:
                km = re.match(r'\s{4}(\w+)\s*:', line)
                if km:
                    methods[km.group(1)] = i + 1
            if depth <= 0 and i > start_line:
                break
        out.setdefault(group, {}).update(methods)
    return out

ADAPTER_METHODS = {name: sub_api_methods(p) for name, p in ADAPTERS.items()}

def resolve_adapter(row_id):
    _, group, method = row_id.split('.', 2)
    api = GROUP_TO_API.get(group)
    if not api:
        return None, None
    sites = []
    for name in ('navidrome', 'mediaBrowser', 'plex', 'local'):
        line = ADAPTER_METHODS.get(name, {}).get(api, {}).get(method)
        if line:
            sites.append(f'{name}:{ADAPTERS[name]}:{line}')
    if not sites:
        return None, api
    return sites, api

# Adapter surfaces the rewrite deliberately reshaped. Each entry is checked
# against the tree below, so a stale one fails loudly rather than lying.
ADAPTER_DIVERGENCE = {
    'adapter.auth.password': (
        'AuthApi has no credential accessors. The legacy adapter exposed password/'
        'username/serverUrl as readable properties; the rewrite passes them as '
        'arguments to AuthApi.connect(serverUrl, username, password) '
        '(src/providers/contracts/ServerAdapter.ts AuthApi.connect) and keeps the secret in the keystore '
        '(src/state/credentials.ts), never in Redux or on the adapter.'),
    'adapter.auth.username': None,   # same reason, filled below
    'adapter.auth.serverUrl': None,
    'adapter.search.albums': (
        'SearchApi is one call, not three: search(query) returns '
        '{albums, artists, songs} (src/providers/contracts/ServerAdapter.ts SearchApi.search), so the '
        'per-kind methods became fields of a single result and one round trip.'),
    'adapter.search.artists': None,
    'adapter.search.songs': None,
    'adapter.starred.albums': (
        'StarredApi.list() returns {songs, albums} (src/providers/contracts/ServerAdapter.ts StarredApi.list), '
        'so the per-kind reads became fields of one result.'),
    'adapter.starred.songs': None,
}
for _k, _group in (('adapter.auth.username', 'adapter.auth.password'),
                   ('adapter.auth.serverUrl', 'adapter.auth.password'),
                   ('adapter.search.artists', 'adapter.search.albums'),
                   ('adapter.search.songs', 'adapter.search.albums'),
                   ('adapter.starred.songs', 'adapter.starred.albums')):
    ADAPTER_DIVERGENCE[_k] = ADAPTER_DIVERGENCE[_group]

def verify_divergences():
    """Each divergent row must genuinely be absent from every adapter."""
    for rid in ADAPTER_DIVERGENCE:
        _, group, method = rid.split('.', 2)
        api = GROUP_TO_API.get(group)
        for name in ADAPTERS:
            if ADAPTER_METHODS.get(name, {}).get(api, {}).get(method):
                raise SystemExit(
                    f'{rid} is marked an intended divergence but {name} implements it')

# ---------- capability.<name> ----------
CAP_SRC = open('src/providers/contracts/Capabilities.ts').read()
CAP_BODY = re.search(r'export interface CapabilityMap \{(.*?)\n\}', CAP_SRC, re.S).group(1)
CAP_KEYS = set(re.findall(r"^\s{2}'?([A-Za-z][\w.]*)'?\s*:", CAP_BODY, re.M))

# Capabilities the legacy contract had and this one deliberately does not, each
# with where the job lives now. Every owner path is checked to exist and every
# name checked to be absent from CapabilityMap, so an entry here cannot go stale
# into cover for a capability that came back or an owner that moved.
FOLDED_INTO_SEARCH = ("folded into 'catalogue.search' as a parameter "
                      "(src/providers/contracts/Capabilities.ts CatalogueSearchKinds); "
                      "marker-style slots were removed with SlotImpl")
REMOVED_CAPABILITIES = {
    'kinds': (None, FOLDED_INTO_SEARCH),
    'query': (None, FOLDED_INTO_SEARCH),
    'acquisition.album': ('src/features/downloaders/registry.ts',
        'one implementation per downloader, with per-call options, error codes and queue polling the capability could not carry'),
    'acquisition.track': ('src/features/downloaders/registry.ts',
        'one implementation per downloader, with per-call options, error codes and queue polling the capability could not carry'),
    'similarity.songs': ('src/features/playback/queueProviders.ts',
        'autoplay and Smart Shuffle fill: AudioMuse first, the server adapter\'s similar songs as the fallback'),
    'similarity.artists': ('src/features/artist/components/Content/index.tsx',
        'the similar-artists rail combines useSimilarArtists (Last.fm), useLBSimilarArtists and '
        'useServerSimilarArtists; nothing asked the broker'),
    'discovery.shelf': ('src/features/home/Explore.tsx',
        'each Home shelf fetches from its own source (DeezerChartsSection, LBCreatedForSection, '
        'LBSimilarForYouSection, ServerRandomSection) and Explore renders it; nothing asked the broker'),
    'playlist.generate': ('src/features/audiomuse/generatePlaylist.ts',
        'AudioMuse is the only generator'),
    'scrobble': ('src/state/redux/selectors/scrobbleRoutingSelectors.ts',
        'routed per destination with the offline mutation queue, which the capability bypassed'),
}

def verify_removed_capabilities():
    for name, (owner, _why) in REMOVED_CAPABILITIES.items():
        if name in CAP_KEYS:
            raise SystemExit(f'{name} is listed as removed but CapabilityMap declares it')
        if owner and not os.path.exists(owner):
            raise SystemExit(f'{name} is said to live in {owner}, which does not exist')

# A provider declaration is a registry module that declares an integration —
# not every file that happens to have a `lyrics:` key (the empty server adapter
# in useApi.ts does).
def declaration_files():
    for f in sorted(os.listdir('src/providers/registry')):
        pth = os.path.join('src/providers/registry', f)
        if f.endswith('.ts') and '.test.' not in f and "kind: 'integration'" in open(pth).read():
            yield pth

def resolve_capability(row_id):
    """(evidence, is_divergence). A capability absent from CapabilityMap is a
    divergence only when REMOVED_CAPABILITIES says where its job went; any other
    absence stays unresolved."""
    name = row_id.split('.', 1)[1]
    if name not in CAP_KEYS:
        if name not in REMOVED_CAPABILITIES:
            return (None, False)
        owner, why = REMOVED_CAPABILITIES[name]
        if owner is None:
            return (f'absent from CapabilityMap — {why}', True)
        return (f'absent from CapabilityMap — owned by {owner}: {why}', True)
    impls = []
    for pth in declaration_files():
        # Keys that are valid identifiers (lyrics) are written unquoted; dotted
        # ones must be quoted.
        pat = r"'" + re.escape(name) + r"'\s*:" if '.' in name else r"(?:'" + name + r"'|\b" + name + r")\s*:"
        if re.search(pat, open(pth).read()):
            impls.append(pth)
    ev = f'src/providers/contracts/Capabilities.ts CapabilityMap[{name!r}]'
    ev += (' implemented by ' + ', '.join(impls)) if impls else ' — declared, no registry provider implements it'
    return (ev, False)

# ---------- provider.<name> ----------
def resolve_provider(legacy):
    d = legacy.strip().rstrip('/')
    if not os.path.isdir(d):
        return None
    files = sorted(
        os.path.join(dp, f)
        for dp, _dn, fn in os.walk(d) for f in fn
        if f.endswith(('.ts', '.tsx'))
    )
    impl = [f for f in files if '.test.' not in f]
    tests = [f for f in files if '.test.' in f]
    return impl, tests

# ---------- route.<path> ----------
RE_DEFAULT_FROM = re.compile(r"export\s*\{\s*default\s*\}\s*from\s*['\"]([^'\"]+)['\"]")
RE_IMPORT_DEFAULT = re.compile(r"import\s+(\w+)\s+from\s*['\"](@/[^'\"]+)['\"]")

def resolve_route(legacy):
    if not os.path.exists(legacy):
        return None
    src = open(legacy).read()
    targets = []
    m = RE_DEFAULT_FROM.search(src)
    if m:
        targets.append(m.group(1))
    for _name, spec in RE_IMPORT_DEFAULT.findall(src):
        targets.append(spec)
    resolved = []
    for t in targets:
        if t.startswith('@/'):
            base = 'src/' + t[2:]
        else:
            base = os.path.normpath(os.path.join(os.path.dirname(legacy), t))
        for cand in (base + '.tsx', base + '.ts', base + '/index.tsx', base + '/index.ts'):
            if os.path.exists(cand):
                resolved.append(cand)
                break
    return legacy, sorted(set(resolved))

# ---------- drive ----------
verify_divergences()
verify_removed_capabilities()
data = json.load(open('.hermes/rewrite-parity.json'))
filled = unfilled = 0
report = []

for row in data['rows']:
    rid, owner, legacy = row['id'], row['owner'], row['legacyEvidence']
    ev = None
    if rid.startswith('adapter.'):
        if rid in ADAPTER_DIVERGENCE:
            ev = ADAPTER_DIVERGENCE[rid]
            row['divergence'] = 'intended'
            row['unit'] = row['integration'] = row['negativeControl'] = 'na'
        else:
            sites, api = resolve_adapter(rid)
            if sites:
                ev = f'{api}.{rid.split(".")[-1]} implemented by ' + ', '.join(sites)
    elif rid.startswith('capability.'):
        ev, divergent = resolve_capability(rid)
        if divergent:
            row['divergence'] = 'intended'
            row['unit'] = 'na'
            row['integration'] = 'na'
            row['negativeControl'] = 'na' 
    elif rid.startswith('provider.'):
        r = resolve_provider(legacy)
        if r:
            impl, tests = r
            ev = f'{legacy} — {len(impl)} modules, {len(tests)} test files'
    elif rid.startswith('route.'):
        r = resolve_route(legacy)
        if r:
            route, screens = r
            ev = f'{route} -> ' + (', '.join(screens) if screens else 'inline (no delegated screen)')
    if ev:
        row['replacementEvidence'] = ev
        filled += 1
    else:
        unfilled += 1
        report.append(f'UNRESOLVED {owner:20} {rid}')

print(f'filled {filled} / {len(data["rows"])}, unresolved {unfilled}')
for line in report:
    print(' ', line)

if '--write' in sys.argv:
    json.dump(data, open('.hermes/rewrite-parity.json', 'w'), indent=2)
    open('.hermes/rewrite-parity.json', 'a').write('\n')
    print('written')
