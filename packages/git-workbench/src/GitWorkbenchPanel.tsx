import React, { useCallback, useEffect, useState } from 'react';
import {
  GitBranch,
  GitCommitHorizontal,
  Plus,
  Minus,
  RotateCcw,
  Check,
  FolderGit2,
  AlertOctagon,
} from 'lucide-react';
import type {
  GitCommitInfo,
  GitStatusItem,
  RuntimeBridge,
} from '@pocketforge/runtime-bridge';
import {
  UnifiedDiffViewer,
  hasMergeConflictMarkers,
  resolveMergeConflicts,
} from './UnifiedDiffViewer';

interface GitWorkbenchPanelProps {
  bridge: RuntimeBridge;
  repoDir: string;
  onFileRestored?: () => void;
}

export const GitWorkbenchPanel: React.FC<GitWorkbenchPanelProps> = ({
  bridge,
  repoDir,
  onFileRestored,
}) => {
  const [isRepo, setIsRepo] = useState(false);
  const [statusItems, setStatusItems] = useState<GitStatusItem[]>([]);
  const [commits, setCommits] = useState<GitCommitInfo[]>([]);
  const [branchInfo, setBranchInfo] = useState<{ current: string; branches: string[] }>({
    current: 'main',
    branches: ['main'],
  });

  const [commitMsg, setCommitMsg] = useState('');
  const [newBranchName, setNewBranchName] = useState('');
  const [selectedDiffFile, setSelectedDiffFile] = useState<string | null>(null);
  const [diffPair, setDiffPair] = useState<{ head: string; work: string } | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const refreshGit = useCallback(async () => {
    const initialized = await bridge.git.isRepo(repoDir);
    setIsRepo(initialized);
    if (!initialized) {
      setStatusItems([]);
      setCommits([]);
      return;
    }
    const [st, lg, br] = await Promise.all([
      bridge.git.status(repoDir),
      bridge.git.log(repoDir, 25),
      bridge.git.listBranches(repoDir),
    ]);
    setStatusItems(st);
    setCommits(lg);
    setBranchInfo(br);
  }, [bridge.git, repoDir]);

  useEffect(() => {
    void refreshGit();
    const unsub = bridge.fs.onChange(() => {
      void refreshGit();
    });
    return unsub;
  }, [bridge.fs, refreshGit]);

  const openDiffFor = async (relFile: string) => {
    setSelectedDiffFile(relFile);
    const fullPath = repoDir ? `${repoDir}/${relFile}` : relFile;
    const [headText, workText] = await Promise.all([
      bridge.git.getFileAtHead(repoDir, relFile),
      bridge.fs.exists(fullPath).then((ok) => (ok ? bridge.fs.readFile(fullPath) : '')),
    ]);
    setDiffPair({ head: headText, work: workText });
  };

  const handleStageAll = async () => {
    for (const item of statusItems.filter((i) => !i.staged)) {
      await bridge.git.stage(repoDir, item.filepath);
    }
    await refreshGit();
  };

  const handleCommit = async (e: React.FormEvent) => {
    e.preventDefault();
    const msg = commitMsg.trim();
    if (!msg) {
      setFeedback('请输入提交说明 (Commit Message)');
      return;
    }
    try {
      const oid = await bridge.git.commit(repoDir, msg);
      setCommitMsg('');
      setSelectedDiffFile(null);
      setDiffPair(null);
      setFeedback(`已提交版本 ${oid.slice(0, 7)}`);
      await refreshGit();
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : String(err));
    }
  };

  const handleCreateBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBranchName.trim()) return;
    try {
      await bridge.git.createBranch(repoDir, newBranchName.trim(), true);
      setNewBranchName('');
      await refreshGit();
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : String(err));
    }
  };

  const handleResolveConflict = async (strategy: 'ours' | 'theirs' | 'both') => {
    if (!selectedDiffFile || !diffPair) return;
    const resolved = resolveMergeConflicts(diffPair.work, strategy);
    const fullPath = repoDir ? `${repoDir}/${selectedDiffFile}` : selectedDiffFile;
    await bridge.fs.writeFile(fullPath, resolved);
    await openDiffFor(selectedDiffFile);
    onFileRestored?.();
  };

  if (!isRepo) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center bg-slate-950 text-slate-300 gap-3">
        <FolderGit2 className="w-10 h-10 text-sky-400" />
        <div className="text-sm font-medium">当前项目目录 ({repoDir || '/'}) 尚未初始化 Git 仓库</div>
        <button
          type="button"
          onClick={async () => {
            await bridge.git.init(repoDir);
            await refreshGit();
          }}
          className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold"
        >
          一键离线初始化仓库 (git init)
        </button>
      </div>
    );
  }

  const stagedList = statusItems.filter((i) => i.staged);
  const unstagedList = statusItems.filter((i) => !i.staged);

  return (
    <div className="flex flex-col h-full w-full bg-slate-950 text-slate-200 overflow-y-auto p-3 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-900 border border-slate-800">
        <div className="flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-sky-400" />
          <span className="text-xs text-slate-400">仓库: {repoDir || 'root'}</span>
          <select
            value={branchInfo.current}
            onChange={async (e) => {
              await bridge.git.checkout(repoDir, e.target.value);
              onFileRestored?.();
              await refreshGit();
            }}
            className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-100"
          >
            {branchInfo.branches.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </div>

        <form onSubmit={handleCreateBranch} className="flex items-center gap-1">
          <input
            type="text"
            value={newBranchName}
            onChange={(e) => setNewBranchName(e.target.value)}
            placeholder="新分支名..."
            className="w-28 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs"
          />
          <button
            type="submit"
            className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs text-sky-300"
          >
            + 分支
          </button>
        </form>
      </div>

      {feedback && (
        <div className="px-3 py-1.5 rounded-lg bg-sky-950/70 border border-sky-800/60 text-xs text-sky-200">
          {feedback}
        </div>
      )}

      <form onSubmit={handleCommit} className="flex gap-2">
        <input
          type="text"
          value={commitMsg}
          onChange={(e) => setCommitMsg(e.target.value)}
          placeholder="输入 Commit 提交说明 (如 feat: 优化移动端布局)..."
          className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 outline-none focus:border-sky-500"
        />
        <button
          type="submit"
          className="flex items-center gap-1 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shrink-0"
        >
          <Check className="w-3.5 h-3.5" />
          <span>提交 ({stagedList.length})</span>
        </button>
      </form>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1.5">
          <div className="flex items-center justify-between text-xs font-semibold text-emerald-400">
            <span>暂存的更改 ({stagedList.length})</span>
          </div>
          {stagedList.length === 0 ? (
            <div className="text-xs text-slate-500 py-2">暂无已暂存文件</div>
          ) : (
            stagedList.map((item) => (
              <div
                key={`staged-${item.filepath}`}
                className="flex items-center justify-between gap-2 px-2 py-1.5 rounded bg-slate-950 text-xs"
              >
                <button
                  type="button"
                  onClick={() => void openDiffFor(item.filepath)}
                  className="text-left font-mono text-slate-200 truncate flex-1 hover:text-sky-300"
                >
                  {item.filepath}
                </button>
                <button
                  type="button"
                  onClick={() => void bridge.git.unstage(repoDir, item.filepath).then(refreshGit)}
                  className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-amber-300"
                  title="取消暂存"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>

        <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1.5">
          <div className="flex items-center justify-between text-xs font-semibold text-amber-300">
            <span>工作区变更 ({unstagedList.length})</span>
            {unstagedList.length > 0 && (
              <button
                type="button"
                onClick={() => void handleStageAll()}
                className="text-[11px] px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-sky-300"
              >
                全部暂存
              </button>
            )}
          </div>
          {unstagedList.length === 0 ? (
            <div className="text-xs text-slate-500 py-2">工作区干净无修改</div>
          ) : (
            unstagedList.map((item) => (
              <div
                key={`unstaged-${item.filepath}`}
                className="flex items-center justify-between gap-1.5 px-2 py-1.5 rounded bg-slate-950 text-xs"
              >
                <button
                  type="button"
                  onClick={() => void openDiffFor(item.filepath)}
                  className="text-left font-mono text-slate-200 truncate flex-1 hover:text-sky-300"
                >
                  <span className="text-[10px] uppercase mr-1.5 px-1 rounded bg-slate-800 text-amber-300">
                    {item.state[0]}
                  </span>
                  {item.filepath}
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await bridge.git.discardFile(repoDir, item.filepath);
                    onFileRestored?.();
                    await refreshGit();
                  }}
                  className="p-1 rounded bg-slate-800 hover:bg-rose-900/50 text-rose-300"
                  title="回滚放弃更改"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => void bridge.git.stage(repoDir, item.filepath).then(refreshGit)}
                  className="p-1 rounded bg-slate-800 hover:bg-emerald-900/50 text-emerald-300"
                  title="暂存文件"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {selectedDiffFile && diffPair && (
        <div className="space-y-2">
          {hasMergeConflictMarkers(diffPair.work) && (
            <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg bg-rose-950/60 border border-rose-700/60 text-xs">
              <div className="flex items-center gap-1.5 text-rose-200">
                <AlertOctagon className="w-4 h-4 text-rose-400" />
                <span>检测到合并冲突标记，一键点选解决：</span>
              </div>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => void handleResolveConflict('ours')}
                  className="px-2 py-1 rounded bg-sky-700 text-white"
                >
                  采用当前
                </button>
                <button
                  type="button"
                  onClick={() => void handleResolveConflict('theirs')}
                  className="px-2 py-1 rounded bg-purple-700 text-white"
                >
                  采用传入
                </button>
                <button
                  type="button"
                  onClick={() => void handleResolveConflict('both')}
                  className="px-2 py-1 rounded bg-emerald-700 text-white"
                >
                  保留双方
                </button>
              </div>
            </div>
          )}
          <UnifiedDiffViewer
            filepath={selectedDiffFile}
            oldText={diffPair.head}
            newText={diffPair.work}
          />
        </div>
      )}

      <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
          <GitCommitHorizontal className="w-4 h-4 text-sky-400" />
          <span>提交历史 ({commits.length})</span>
        </div>
        {commits.length === 0 ? (
          <div className="text-xs text-slate-500">暂无提交记录</div>
        ) : (
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {commits.map((c) => (
              <div
                key={c.oid}
                className="px-2.5 py-1.5 rounded bg-slate-950 flex items-center justify-between gap-2 text-xs"
              >
                <div className="truncate">
                  <span className="font-mono text-amber-400 mr-2">{c.oid.slice(0, 7)}</span>
                  <span className="text-slate-200">{c.message}</span>
                </div>
                <span className="text-[10px] text-slate-500 shrink-0">
                  {new Date(c.timestamp).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
