"""Extract our modification layer: diff(local working tree, baseline commit).

Resets the worktree (--wt) hard to --baseline, copies local (--loc) content in
(binary-safe: raw bytes; files identical modulo CRLF keep baseline bytes),
then exports `git diff --cached --binary` to --out and resets the index.

Exit 0 = patch written (even if empty).
"""
import argparse, os, subprocess, sys

ap = argparse.ArgumentParser()
ap.add_argument('--loc', required=True)
ap.add_argument('--wt', required=True)
ap.add_argument('--baseline', required=True)
ap.add_argument('--out', required=True)
a = ap.parse_args()

EXCL_DIRS = {'node_modules', 'build-artifacts', 'dist', 'coverage', 'electron-dist',
             '.bun-cache', '.claude', 'binaries', 'release-notes', 'site', 'web-dist',
             'upstream-sync'}
EXCL_FILES = {'package-lock.json', 'tsconfig.tsbuildinfo', '.env.local'}


def git(*args, **kw):
    r = subprocess.run(['git', '-C', a.wt, *args], capture_output=True, text=True, **kw)
    if r.returncode != 0:
        sys.exit(f'git {" ".join(args)} failed: {r.stderr.strip()}')
    return r.stdout


git('reset', '--hard', '-q', a.baseline)
git('clean', '-fdq')

n = 0
for dp, dns, fns in os.walk(a.loc):
    dns[:] = [d for d in dns if d not in EXCL_DIRS]
    rel_dir = os.path.relpath(dp, a.loc)
    for fn in fns:
        if fn in EXCL_FILES:
            continue
        rel = os.path.join(rel_dir, fn) if rel_dir != '.' else fn
        rel_parts = rel.replace(os.sep, '/').split('/')
        if any(seg in EXCL_DIRS for seg in rel_parts):
            continue
        if '.git' in rel_parts:  # worktree pointer file or .git dir content
            continue
        src = os.path.join(dp, fn)
        dst = os.path.join(a.wt, rel)
        raw = open(src, 'rb').read()
        if os.path.isfile(dst):
            cur = open(dst, 'rb').read()
            if raw == cur or raw.replace(b'\r\n', b'\n') == cur.replace(b'\r\n', b'\n'):
                continue
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        open(dst, 'wb').write(raw)
        n += 1
print(f'[extract] local files copied: {n}', file=sys.stderr)

git('add', '-A')
with open(a.out, 'wb') as fh:
    r = subprocess.run(['git', '-C', a.wt, 'diff', '--cached', '--binary'],
                       stdout=fh, stderr=subprocess.PIPE)
if r.returncode != 0:
    sys.exit(f'git diff failed: {r.stderr.decode(errors="replace")}')
git('reset', '-q')
kb = os.path.getsize(a.out) / 1024
print(f'[extract] wrote {a.out} ({kb:.0f} KB)', file=sys.stderr)
