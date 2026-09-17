# 上游同步（一键）

把上游 <https://github.com/NanmiCoder/cc-haha> 的新版本同步到本地 fork，并自动重放我们的全部自定义修改。

## 日常使用

```powershell
# 同步到指定 tag（推荐）
powershell -ExecutionPolicy Bypass -File scripts\upstream-sync\sync.ps1 v0.6.4

# 不带参数 = 自动取上游最新 tag（需先跑过一次带参数的命令，缓存克隆已存在）
powershell -ExecutionPolicy Bypass -File scripts\upstream-sync\sync.ps1
```

同步完成后：

```powershell
bun install
cd desktop; bun install
bun test src/server/__tests__/providers.test.ts src/server/proxy/handlerKeyPool.test.ts
cd desktop; .\node_modules\.bin\vitest.exe run
# 验证通过后重建安装包
```

## 工作原理

本地 `F:\ai\cc-haha-main` 不是 git 仓库（是上游某两个 tag 之间的一次快照 + 我们的手改）。
方案：把「我们的修改」当成一个可重放的补丁层。

```
baseline-sha.txt   基线 commit = 本地快照对应的上游 commit（首次由 detect-baseline.py 识别）
our-changes.patch  diff(本地, 基线) —— 我们全部自定义修改（含二进制）
wt/  wt-new/  backup/  运行时目录（在 %TEMP%\cc-haha-sync\，不在仓库内）
```

`sync.ps1 <ref>` 的步骤：

1. 增量更新上游克隆（`%TEMP%\cc-haha-git`，自动绕过本机代理环境变量）
2. 基线 worktree（LF 行尾）重置到 `baseline-sha.txt`
3. 重新抽取补丁：diff(当前本地, 基线) → `our-changes.patch`
4. 新建 worktree 检出目标 ref，`git apply --3way` 重放补丁
5. **有冲突** → 打印冲突文件列表并退出（退出码 2），**不动本地**；手工在
   `%TEMP%\cc-haha-sync\wt-new` 解决后把文件拷回本地即可
6. **无冲突** → 把结果安装到本地树（逐文件备份到 `backup\loc-<时间戳>\`；
   只删上游已删除的基线文件；`.env`、`node_modules` 等本地文件绝不碰）
7. 基线推进到本次同步的 ref，并重抽出「纯我们的层」补丁（幂等，可反复运行）

## 冲突时手工处理

```powershell
# 冲突列表会打印出来，文件在：
cd %TEMP%\cc-haha-sync\wt-new
# 直接编辑冲突文件（<<<<<<< / ======= / >>>>>>> 标记），确认没有残留标记后：
copy /Y <冲突文件> F:\ai\cc-haha-main\<相同路径>
# 然后重跑验证与 bun test / vitest
```

## 重新识别基线（只在补丁丢失/基线错乱时用）

```powershell
python scripts\detect-baseline.py F:\ai\cc-haha-main %TEMP%\cc-haha-git v0.6.2 v0.6.3
# 把识别出的 commit 写入 scripts\upstream-sync\baseline-sha.txt
```

## 已知注意事项

- 本工具假设本地树相对基线「只增/改、不删」；上游删除的文件也会跟着删（先备份）。
- `bun test` 的测试发现范围是整个仓库，所以运行时目录必须放在仓库外（脚本已保证）。
- 代理：本机系统代理（127.0.0.1:11188）会打断 git，脚本已自动清除环境变量代理。
- 若上游改了 `package.json`，同步后两端都要 `bun install`。
