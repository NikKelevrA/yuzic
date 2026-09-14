"""Fill the parity matrix's `unit` column from istanbul per-function coverage.

    npx jest --ci --coverage --coverageReporters=json --coverageDirectory=coverage
    python3 tools/parity/classify-unit-coverage.py coverage/coverage-final.json --write


Two different claims are kept apart, because conflating them would overstate
the gap in one direction and hide it in the other:

  pass     the adapter closure itself is executed by a unit test
  indirect the closure is cold, but the helper it delegates to is covered —
           the logic is tested, the wiring is not
  gap      neither the closure nor anything it calls is executed

Verdicts come from the exact file:line the evidence already cites, matched
against the function istanbul recorded there. A whole-file percentage would
only say a file was touched, which is a different claim, so it is not used.
"""
import json, os, re, sys

REPO = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
REPO = os.path.normpath(REPO)
COV = next((a for a in sys.argv[1:] if not a.startswith('--')), 'coverage/coverage-final.json')
if not os.path.exists(COV):
    raise SystemExit(
        f'no coverage at {COV}\n'
        'generate it first:\n'
        '  npx jest --ci --coverage --coverageReporters=json --coverageDirectory=coverage')
cov = json.load(open(COV))

fn_hits, file_cov = {}, {}
# function name -> [(file, hits)], so a delegate reached through a runtime
# object (client.buildAvatarUrl()) is found as well as one reached by import.
fn_by_name = {}
for abspath, data in cov.items():
    rel = os.path.relpath(abspath, REPO)
    lines = {}
    for fid, meta in data.get('fnMap', {}).items():
        hits = data.get('f', {}).get(fid, 0)
        for key in ('decl', 'loc'):
            start = ((meta.get(key) or {}).get('start') or {}).get('line')
            if start:
                lines[start] = max(lines.get(start, 0), hits)
        name = meta.get('name')
        if name and not name.startswith('('):
            fn_by_name.setdefault(name, []).append((rel, hits))
    fn_hits[rel] = lines
    st = data.get('s', {})
    file_cov[rel] = (sum(1 for v in st.values() if v > 0), len(st))

IMPORT = re.compile(r"import\s+(?:\{([^}]*)\}|(\w+))\s+from\s*['\"](\.[^'\"]+)['\"]")

def import_map(rel):
    """imported name -> resolved repo-relative path, for relative imports."""
    src = open(os.path.join(REPO, rel)).read()
    base = os.path.dirname(rel)
    out = {}
    for braced, default, spec in IMPORT.findall(src):
        target = os.path.normpath(os.path.join(base, spec))
        for cand in (target + '.ts', target + '.tsx', target + '/index.ts'):
            if os.path.exists(os.path.join(REPO, cand)):
                names = [default] if default else [
                    n.strip().split(' as ')[-1].strip() for n in braced.split(',') if n.strip()]
                for n in names:
                    out[n] = cand
                break
    return out

IMPORTS = {}

def closure_delegates(rel, line, method):
    """Files the method body at `line` delegates to, via relative imports."""
    if rel not in IMPORTS:
        IMPORTS[rel] = import_map(rel)
    imports = IMPORTS[rel]
    lines = open(os.path.join(REPO, rel)).read().split('\n')
    i, depth, body = line - 1, 0, []
    while i < len(lines):
        depth += lines[i].count('{') - lines[i].count('}')
        body.append(lines[i])
        if depth <= 0 and i > line - 1:
            break
        i += 1
    text = '\n'.join(body)
    # Only things actually invoked, and never the method's own key: `list:`
    # would otherwise match any covered function named `list` in the provider
    # and report tested wiring where there is none.
    names = set(re.findall(r'\b(\w+)\s*\(', text)) | set(re.findall(r'\.(\w+)\s*\(', text))
    names -= {method, 'async', 'await', 'if', 'for', 'while', 'return', 'catch', 'switch'}
    out = {imports[n] for n in names if n in imports}
    # Delegates called on a runtime object — client.buildAvatarUrl() — resolve
    # by function name, but only to a definition inside this provider's own
    # tree, so a common name cannot borrow coverage from elsewhere.
    provider_root = '/'.join(rel.split('/')[:3])
    for n in names:
        for f, _hits in fn_by_name.get(n, []):
            if f.startswith(provider_root):
                out.add(f)
    return out

SITE = re.compile(r'(\w+):(src/[^\s:,]+):(\d+)')
path = os.path.join(REPO, '.hermes/rewrite-parity.json')
data = json.load(open(path))
stats, gaps, indirect = {'pass': 0, 'indirect': 0, 'gap': 0, 'skipped': 0}, [], []

for row in data['rows']:
    if not row['id'].startswith('adapter.') or row.get('divergence'):
        stats['skipped'] += 1
        continue
    sites = SITE.findall(row.get('replacementEvidence', ''))
    if not sites:
        stats['skipped'] += 1
        continue
    hot, warm, cold = [], [], []
    for adapter, rel, line in sites:
        if fn_hits.get(rel, {}).get(int(line), 0) > 0:
            hot.append(adapter)
            continue
        delegates = closure_delegates(rel, int(line), row['id'].rsplit('.', 1)[-1])
        covered = [d for d in delegates if file_cov.get(d, (0, 0))[0] > 0]
        if covered:
            warm.append(f'{adapter}({", ".join(sorted(covered))})')
        else:
            cold.append(adapter)
    if hot:
        row['unit'] = 'pass'
        row['unitEvidence'] = ('adapter method executed by unit tests: ' + ', '.join(hot) +
                               ('; cold on ' + ', '.join(cold) if cold else ''))
        stats['pass'] += 1
    elif warm:
        row['unit'] = 'indirect'
        row['unitEvidence'] = ('no test executes the adapter method; its delegated '
                               'implementation is covered on ' + '; '.join(warm) +
                               ('; nothing covered on ' + ', '.join(cold) if cold else ''))
        stats['indirect'] += 1
        indirect.append(row['id'])
    else:
        row['unit'] = 'gap'
        row['unitEvidence'] = ('neither the adapter method nor anything it delegates to '
                               'is executed by a unit test (' + ', '.join(cold) + ')')
        stats['gap'] += 1
        gaps.append(row['id'])

print('unit column:', stats)
print('\nGAP — nothing under this method runs in any test (%d):' % len(gaps))
for g in gaps:
    print('  ', g)
print('\nINDIRECT — logic tested, adapter wiring not (%d)' % len(indirect))

if '--write' in sys.argv:
    json.dump(data, open(path, 'w'), indent=2)
    open(path, 'a').write('\n')
    print('\nwritten')
