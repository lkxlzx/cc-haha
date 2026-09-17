# One-click upstream sync for cc-haha fork.
#
#   powershell -ExecutionPolicy Bypass -File scripts\upstream-sync\sync.ps1 v0.6.4
#
# Steps:
#   1. Refresh upstream clone (github.com/NanmiCoder/cc-haha) -- proxies bypassed
#   2. Ensure baseline worktree at %TEMP%\cc-haha-sync\wt (detached, LF)
#   3. Extract our modification layer: diff(local, baseline-sha.txt) -> our-changes.patch
#   4. New worktree from <ref>, apply patch with --3way (binary-safe)
#   5. Clean-apply: copy changed files into local (each backed up under
#      %TEMP%\cc-haha-sync\backup\loc-<ts>\); conflict: leave in worktree for
#      manual resolution, report conflicted files, nothing local touched.
#   6. Advance baseline-sha.txt to <ref>, re-extract a layer-only patch (idempotent).
#
# Env overrides: PYTHON, SYNC_REPO (upstream clone dir), SYNC_WORK (work dir).
# See README.md in this folder for details.

param(
    [Parameter(Position = 0)]
    [string]$Ref = ''
)

$ErrorActionPreference = 'Stop'
# git must bypass the app's local proxy env (127.0.0.1:11188)
foreach ($v in 'HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','http_proxy','https_proxy','all_proxy') {
    Remove-Item "env:$v" -ErrorAction SilentlyContinue
}

$SyncDir = $PSScriptRoot
$Loc     = (Resolve-Path (Join-Path $SyncDir '..\..')).Path
$Repo    = if ($env:SYNC_REPO) { $env:SYNC_REPO } else { Join-Path $env:TEMP 'cc-haha-git' }
# worktrees/backups must live OUTSIDE the local tree: bun test would otherwise
# discover and run the *.test.ts copies inside them
$WorkDir    = if ($env:SYNC_WORK) { $env:SYNC_WORK } else { Join-Path $env:TEMP 'cc-haha-sync' }
$Upstream  = 'https://github.com/NanmiCoder/cc-haha'
$Baseline  = (Get-Content (Join-Path $SyncDir 'baseline-sha.txt')).Trim()
$BaselineWt = Join-Path $WorkDir 'wt'
$NewWt      = Join-Path $WorkDir 'wt-new'
$Patch      = Join-Path $SyncDir 'our-changes.patch'
$BackupRoot = Join-Path $WorkDir 'backup'
$Py = if ($env:PYTHON) { $env:PYTHON } else { 'python' }

function Invoke-Git {
    param([Parameter(ValueFromRemainingArguments)]$GitArgs)
    # route through cmd so git's stderr doesn't raise NativeCommandError under EAP=Stop
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $out = cmd /c "git $($GitArgs -join ' ') 2>&1"
    $code = $LASTEXITCODE
    $ErrorActionPreference = $prevEap
    if ($code -ne 0) { throw "git $($GitArgs -join ' ') failed (code $code):`n$out" }
    return $out
}

if (-not $Ref) {
    if (-not (Test-Path (Join-Path $Repo '.git'))) {
        throw "no clone at $Repo and no <ref> given; run once with a tag, e.g. v0.6.4"
    }
    Invoke-Git -C $Repo fetch origin --tags --prune
    $Ref = (Invoke-Git -C $Repo describe --tags --abbrev=0 origin/main).Trim()
    Write-Host "[sync] no ref given, using latest upstream tag: $Ref"
}

# 1. clone / refresh
if (-not (Test-Path (Join-Path $Repo '.git'))) {
    New-Item -ItemType Directory -Force -Path (Split-Path $Repo) | Out-Null
    Write-Host "[sync] cloning $Upstream -> $Repo (one-time, ~240 MB)"
    Invoke-Git clone -- $Upstream $Repo
}
Invoke-Git -C $Repo fetch origin --tags --prune
$Target = (Invoke-Git -C $Repo rev-list -n 1 $Ref | Select-Object -First 1).Trim()
if (-not $Target) { throw "unknown ref: $Ref" }
Write-Host "[sync] target $Ref = $Target"

# 2. baseline worktree
Invoke-Git -C $Repo config core.autocrlf false
Invoke-Git -C $Repo config core.eol lf
function Ensure-LfWorktree([string]$Path, [string]$Commit) {
    if (Test-Path $Path) {
        $head = (& git -C $Path rev-parse HEAD 2>$null)
        if ($LASTEXITCODE -ne 0) { throw "worktree $Path is not a git checkout" }
        if ($head.Trim() -ne $Commit) {
            Invoke-Git -C $Path reset --hard -q $Commit
            Invoke-Git -C $Path clean -fdq
        }
        return
    }
    Invoke-Git -C $Repo worktree add -q --detach -- $Path $Commit
}
Ensure-LfWorktree $BaselineWt $Baseline

# 3. extract our layer
& $Py (Join-Path $SyncDir 'extract-our-changes.py') --loc $Loc --wt $BaselineWt --baseline $Baseline --out $Patch
if ($LASTEXITCODE -ne 0) { throw 'extract failed' }

# 4. fresh worktree at target + apply our layer
if (Test-Path $NewWt) { Invoke-Git -C $Repo worktree remove --force $NewWt }
Invoke-Git -C $Repo worktree add -q --detach -- $NewWt $Target
# git prints info to stderr; prevent PowerShell from treating that as an error
$prevEap = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
Push-Location $NewWt
$applyOut = cmd /c "git apply --3way --binary `"$Patch`" 2>&1"
$applyCode = $LASTEXITCODE
Pop-Location
$ErrorActionPreference = $prevEap
$applyOut | ForEach-Object { Write-Host $_ }

if ($applyCode -ne 0) {
    # 1 = conflicts recorded in index
    $conflicted = & git -C $NewWt diff --name-only --diff-filter=U
    if (-not $conflicted) {
        throw "git apply failed (code $applyCode) with no recorded conflicts:`n$applyOut"
    }
    Write-Host ''
    Write-Host "[sync] CONFLICTS applying our layer onto $Ref -- local tree NOT touched."
    Write-Host "       Resolve in $NewWt, then copy resolved files back to $Loc :"
    $conflicted | ForEach-Object { Write-Host "         $_" }
    exit 2
}

# 5. clean apply -> replace local content (baseline-relative, deletions included)
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$Backup = Join-Path $BackupRoot "loc-$stamp"
New-Item -ItemType Directory -Force -Path $BackupRoot | Out-Null

# 5. install: copy changed files into local, delete upstream-removed files;
#    every file being overwritten or deleted is copied into $Backup first.
& $Py (Join-Path $SyncDir 'install-tree.py') --src $NewWt --dst $Loc --repo $Repo --baseline $Baseline --backup $Backup
if ($LASTEXITCODE -ne 0) { throw 'install-tree failed' }

# 6. advance the baseline to the synced ref, then re-extract a pure "our layer-only"
#    patch so the next sync does not re-apply upstream changes as if they were ours.
Invoke-Git -C $Repo worktree remove --force $NewWt
$Baseline = $Target
Set-Content -Path (Join-Path $SyncDir 'baseline-sha.txt') -Value $Target
Ensure-LfWorktree $BaselineWt $Baseline
& $Py (Join-Path $SyncDir 'extract-our-changes.py') --loc $Loc --wt $BaselineWt --baseline $Baseline --out $Patch
if ($LASTEXITCODE -ne 0) { throw 'post-sync re-extract failed' }

Write-Host ''
Write-Host "[sync] DONE: local tree now = $Ref + our changes."
Write-Host "[sync] baseline advanced to $Target; our-changes.patch refreshed."
Write-Host "[sync] backup of changed files: $Backup"
Write-Host '[sync] verify:'
Write-Host '[sync]   bun install  (root and desktop/, if package.json changed)'
Write-Host '[sync]   bun test src/server/__tests__/providers.test.ts src/server/proxy/handlerKeyPool.test.ts'
Write-Host '[sync]   cd desktop && ./node_modules/.bin/vitest.exe run src/pages/settings/ProviderSettings.test.tsx'
Write-Host '[sync] then: rebuild the Windows installer.'
