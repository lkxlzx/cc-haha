#!/usr/bin/env python3
"""Baseline detection for syncing local fork onto upstream cc-haha.

The local working tree (LOC) is a snapshot taken somewhere between two upstream
tags, plus our own hand edits. This finds which upstream commit our snapshot is
closest to, by matching git blob SHAs (content, CRLF-normalized) — robust to the
missing .git and to line-ending drift.

Usage:
  python detect-baseline.py <local_dir> <git_repo> <old_tag> <new_tag>
"""
import subprocess, os, sys, hashlib

LOC, REPO, OLD, NEW = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
EXCL = {'node_modules', '.git', 'build-artifacts', 'dist', 'coverage',
        'electron-dist', '.bun-cache', '.claude', 'binaries',
        'release-notes', 'site', 'web-dist'}
EXF = {'package-lock.json', 'bun.lock', 'tsconfig.tsbuildinfo'}


def norm_bytes(p):
    try:
        return open(p, 'rb').read().replace(b'\r\n', b'\n')
    except OSError:
        return None


def blobsha(data):
    h = hashlib.sha1()
    h.update(b'blob %d\x00' % len(data))
    h.update(data)
    return h.hexdigest()


def blob_index(commit):
    r = subprocess.run(['git', '-C', REPO, 'ls-tree', '-r', '--format=%(objectname) %(path)', commit],
                       capture_output=True, text=True, encoding='utf-8')
    idx = {}
    for line in r.stdout.splitlines():
        sha, _, path = line.partition(' ')
        parts = path.split('/')
        if parts[0] in EXCL:
            continue
        if any(seg in EXCL for seg in parts):
            continue
        if parts[-1] in EXF:
            continue
        idx[path] = sha
    return idx


def local_blobs():
    idx = {}
    for dp, dns, fns in os.walk(LOC):
        dns[:] = [d for d in dns if d not in EXCL]
        for fn in fns:
            if fn in EXF:
                continue
            p = os.path.join(dp, fn)
            rel = os.path.relpath(p, LOC).replace(os.sep, '/')
            if any(seg in EXCL for seg in rel.split('/')):
                continue
            d = norm_bytes(p)
            if d is not None:
                idx[rel] = blobsha(d)
    return idx


def main():
    base = subprocess.run(['git', '-C', REPO, 'rev-list', f'{OLD}..{NEW}'],
                          capture_output=True, text=True).stdout.split()
    commits = list(reversed(base))  # oldest -> newest
    locidx = local_blobs()
    print(f'local tracked files: {len(locidx)}', file=sys.stderr)
    rows = []
    best_score, best_i = -1, 0
    for i, c in enumerate(commits):
        ti = blob_index(c)
        common = set(ti) & set(locidx)
        match = sum(1 for p in common if ti[p] == locidx[p])
        only_loc = len(set(locidx) - set(ti))
        only_up = len(set(ti) - set(locidx))
        rows.append((i, c, match, only_loc, only_up, len(ti)))
        if match > best_score:
            best_score, best_i = match, i
    print(f"{'idx':>4} {'sha':>10} {'match':>6} {'locOnly':>7} {'upOnly':>7}  subject")
    for i, c, m, ol, ou, tu in rows:
        s = subprocess.run(['git', '-C', REPO, 'log', '-1', '--format=%s', c],
                           capture_output=True, text=True).stdout.strip()[:55]
        star = '  <== BASELINE' if i == best_i else ''
        print(f'{i:>4} {c[:10]} {m:>6} {ol:>7} {ou:>7}  {s}{star}')
    # Emit the best baseline sha to a file for the sync script to consume
    with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'baseline-sha.txt'), 'w') as fh:
        fh.write(commits[best_i] + '\n')
    print(f"\nBaseline commit: {commits[best_i]}  (matched {best_score}/{len(locidx)} local files)")


if __name__ == '__main__':
    main()
