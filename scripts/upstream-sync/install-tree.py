"""Install synced worktree (--src, target ref + our layer) into the local tree (--dst).

 - copy: every file present in --src (git worktrees contain only tracked files) is
   written to --dst when bytes differ (raw, LF preserved).
 - delete: only files tracked at --baseline that vanished in --src (upstream
   deletions). Gitignored / user files (.env.local, node_modules, ...) are never touched.
 - --backup DIR: copy every local file to be overwritten or deleted into DIR
   first, preserving relative paths (whole-tree node_modules is never copied).
"""
import argparse, os, shutil, subprocess, sys

ap = argparse.ArgumentParser()
ap.add_argument('--src', required=True)
ap.add_argument('--dst', required=True)
ap.add_argument('--repo', required=True)
ap.add_argument('--baseline', required=True)
ap.add_argument('--backup', default=None)
a = ap.parse_args()


def backup(rel):
    if not a.backup:
        return
    sp = os.path.join(a.dst, *rel.split('/'))
    if os.path.isfile(sp):
        dp_ = os.path.join(a.backup, *rel.split('/'))
        os.makedirs(os.path.dirname(dp_), exist_ok=True)
        shutil.copy2(sp, dp_)

SKIP_DIRS = {'.git', 'node_modules'}

src_files = set()
for dp, dns, fns in os.walk(a.src):
    dns[:] = [d for d in dns if d not in SKIP_DIRS]
    for fn in fns:
        rel = os.path.relpath(os.path.join(dp, fn), a.src).replace(os.sep, '/')
        if '.git' in rel.split('/'):  # worktree pointer file or .git dir content
            continue
        src_files.add(rel)

w = d = 0
for rel in sorted(src_files):
    sp = os.path.join(a.src, *rel.split('/'))
    dp_ = os.path.join(a.dst, *rel.split('/'))
    raw = open(sp, 'rb').read()
    if os.path.isfile(dp_):
        if open(dp_, 'rb').read() == raw:
            continue
        backup(rel)
    os.makedirs(os.path.dirname(dp_), exist_ok=True)
    open(dp_, 'wb').write(raw)
    w += 1

r = subprocess.run(['git', '-C', a.repo, 'ls-tree', '-r', '--name-only', a.baseline],
                   capture_output=True, text=True, encoding='utf-8')
if r.returncode != 0:
    sys.exit(f'git ls-tree failed: {r.stderr}')
for rel in r.stdout.splitlines():
    if not rel or rel in src_files:
        continue
    parts = rel.split('/')
    if any(seg in SKIP_DIRS for seg in parts):
        continue
    p = os.path.join(a.dst, *parts)
    if os.path.isfile(p):
        backup(rel)
        os.remove(p)
        d += 1
print(f'[install] wrote {w}, deleted {d}', file=sys.stderr)
