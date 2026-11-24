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
  ChevronRight,
  X,
} from 'lucide-react';
import type {
  GitCommitInfo,
  GitStatusItem,
  RuntimeBridge,
} from '@pocketforge/runtime-bridge';
import {
  Badge,
  Button,
  EmptyState,
  IconButton,
  ListRow,
  Notice,
  Panel,
  PanelHeader,
  Section,
  SelectInput,
  Sheet,
  TextArea,
  TextInput,
  haptic,
} from '@pocketforge/ui-kit';
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

type FeedbackTone = 'info' | 'success' | 'error';

const stateTone = (state: string): 'success' | 'warning' | 'error' | 'neutral' => {
  const flag = state[0]?.toUpperCase();
  if (flag === 'A' || flag === '?') return flag === '?' ? 'neutral' : 'success';
  if (flag === 'D') return 'error';
  if (flag === 'M' || flag === 'R') return 'warning';
  return 'neutral';
};

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
  const [feedback, setFeedback] = useState<{ text: string; tone: FeedbackTone } | null>(null);
  const [busy, setBusy] = useState(false);

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

  const notify = (text: string, tone: FeedbackTone = 'info') => setFeedback({ text, tone });

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
    setBusy(true);
    for (const item of statusItems.filter((i) => !i.staged)) {
      await bridge.git.stage(repoDir, item.filepath);
    }
    await refreshGit();
    setBusy(false);
    notify('已将全部变更加入暂存区', 'success');
  };

  const handleCommit = async (e: React.FormEvent) => {
    e.preventDefault();
    const msg = commitMsg.trim();
    if (!msg) {
      notify('请输入提交说明', 'error');
      return;
    }
    try {
      setBusy(true);
      const oid = await bridge.git.commit(repoDir, msg);
      setCommitMsg('');
      setSelectedDiffFile(null);
      setDiffPair(null);
      notify(`已提交 ${oid.slice(0, 7)}`, 'success');
      haptic('success');
      await refreshGit();
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err), 'error');
      haptic('error');
    } finally {
      setBusy(false);
    }
  };

  const handleCreateBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBranchName.trim()) return;
    try {
      await bridge.git.createBranch(repoDir, newBranchName.trim(), true);
      notify(`已创建并切换到 ${newBranchName.trim()}`, 'success');
      setNewBranchName('');
      await refreshGit();
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  const handleResolveConflict = async (strategy: 'ours' | 'theirs' | 'both') => {
    if (!selectedDiffFile || !diffPair) return;
    const resolved = resolveMergeConflicts(diffPair.work, strategy);
    const fullPath = repoDir ? `${repoDir}/${selectedDiffFile}` : selectedDiffFile;
    await bridge.fs.writeFile(fullPath, resolved);
    await openDiffFor(selectedDiffFile);
    onFileRestored?.();
    notify('冲突已按所选策略合并', 'success');
  };

  if (!isRepo) {
    return (
      <Panel>
        <PanelHeader title="Git" subtitle={repoDir || '工作区根目录'} />
        <EmptyState
          icon={<FolderGit2 size={20} />}
          title="尚未初始化 Git 仓库"
          description={`目录 ${repoDir || '/'} 还不是 Git 仓库。初始化后可离线提交、切换分支并查看差异。`}
          action={
            <Button
              variant="filled"
              size="md"
              icon={<GitBranch size={14} />}
              onClick={async () => {
                await bridge.git.init(repoDir);
                await refreshGit();
                notify('仓库已初始化', 'success');
              }}
            >
              初始化仓库 (git init)
            </Button>
          }
        />
      </Panel>
    );
  }

  const stagedList = statusItems.filter((i) => i.staged);
  const unstagedList = statusItems.filter((i) => !i.staged);
  const diffOpen = Boolean(selectedDiffFile && diffPair);

  return (
    <Panel>
      <PanelHeader
        title="Git"
        subtitle={repoDir || 'root'}
        leading={<GitBranch size={15} className="shrink-0 text-primary" />}
        actions={
          <IconButton label="刷新仓库状态" size="sm" onClick={() => void refreshGit()}>
            <RotateCcw size={14} />
          </IconButton>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto touch-scroll">
        {/* Branch context + create */}
        <div className="flex items-center gap-1.5 border-b border-outline-variant bg-surface-container-low px-3 py-2">
          <SelectInput
            size="sm"
            aria-label="当前分支"
            value={branchInfo.current}
            containerClassName="w-[136px] shrink-0"
            onChange={async (e) => {
              await bridge.git.checkout(repoDir, e.target.value);
              onFileRestored?.();
              await refreshGit();
              notify(`已切换到 ${e.target.value}`, 'success');
            }}
          >
            {branchInfo.branches.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </SelectInput>
          <form onSubmit={handleCreateBranch} className="flex min-w-0 flex-1 items-center gap-1">
            <TextInput
              size="sm"
              value={newBranchName}
              onChange={(e) => setNewBranchName(e.target.value)}
              placeholder="新分支名"
              aria-label="新分支名"
              containerClassName="min-w-0 flex-1"
            />
            <IconButton label="创建并切换分支" size="sm" type="submit" variant="outlined">
              <Plus size={14} />
            </IconButton>
          </form>
        </div>

        {feedback ? (
          <Notice
            tone={feedback.tone}
            actions={
              <IconButton label="关闭提示" size="sm" onClick={() => setFeedback(null)}>
                <X size={13} />
              </IconButton>
            }
          >
            {feedback.text}
          </Notice>
        ) : null}

        {/* Commit composer */}
        <form onSubmit={handleCommit} className="space-y-2 border-b border-outline-variant px-3 py-2.5">
          <TextArea
            rows={2}
            value={commitMsg}
            onChange={(e) => setCommitMsg(e.target.value)}
            placeholder="提交说明，例如 feat: 优化移动端编辑器布局"
            aria-label="提交说明"
          />
          <div className="flex items-center gap-2">
            <span className="flex-1 font-mono text-2xs text-on-surface-variant">
              {stagedList.length} 个文件已暂存
            </span>
            <Button
              type="submit"
              variant="filled"
              size="md"
              icon={<Check size={14} />}
              disabled={busy}
            >
              提交
            </Button>
          </div>
        </form>

        <Section
          title="暂存的更改"
          meta={<Badge>{stagedList.length}</Badge>}
          bodyClassName="py-0"
        >
          {stagedList.length === 0 ? (
            <div className="px-3 py-2.5 text-xs text-on-surface-variant">暂无已暂存文件</div>
          ) : (
            stagedList.map((item) => (
              <ListRow
                key={`staged-${item.filepath}`}
                leading={<Badge tone={stateTone(item.state)}>{item.state[0] ?? 'M'}</Badge>}
                title={item.filepath}
                titleClassName="font-mono text-xs"
                onClick={() => void openDiffFor(item.filepath)}
                trailing={
                  <IconButton
                    label="取消暂存"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      void bridge.git.unstage(repoDir, item.filepath).then(refreshGit);
                    }}
                  >
                    <Minus size={13} />
                  </IconButton>
                }
              />
            ))
          )}
        </Section>

        <Section
          title="工作区变更"
          meta={<Badge>{unstagedList.length}</Badge>}
          bodyClassName="py-0"
          actions={
            unstagedList.length > 0 ? (
              <Button size="sm" variant="text" disabled={busy} onClick={() => void handleStageAll()}>
                全部暂存
              </Button>
            ) : null
          }
        >
          {unstagedList.length === 0 ? (
            <div className="px-3 py-2.5 text-xs text-on-surface-variant">工作区干净，无未提交修改</div>
          ) : (
            unstagedList.map((item) => (
              <ListRow
                key={`unstaged-${item.filepath}`}
                leading={<Badge tone={stateTone(item.state)}>{item.state[0] ?? 'M'}</Badge>}
                title={item.filepath}
                titleClassName="font-mono text-xs"
                onClick={() => void openDiffFor(item.filepath)}
                trailing={
                  <>
                    <IconButton
                      label="放弃更改并还原文件"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        void bridge.git
                          .discardFile(repoDir, item.filepath)
                          .then(onFileRestored)
                          .then(refreshGit)
                          .then(() => notify('已还原文件', 'success'));
                      }}
                    >
                      <RotateCcw size={13} />
                    </IconButton>
                    <IconButton
                      label="暂存文件"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        void bridge.git.stage(repoDir, item.filepath).then(refreshGit);
                      }}
                    >
                      <Plus size={13} />
                    </IconButton>
                  </>
                }
              />
            ))
          )}
        </Section>

        <Section
          title="提交历史"
          meta={<Badge>{commits.length}</Badge>}
          bodyClassName="py-0"
        >
          {commits.length === 0 ? (
            <div className="px-3 py-2.5 text-xs text-on-surface-variant">暂无提交记录</div>
          ) : (
            commits.map((c) => (
              <ListRow
                key={c.oid}
                leading={<GitCommitHorizontal size={14} className="text-on-surface-variant" />}
                title={c.message}
                subtitle={`${new Date(c.timestamp).toLocaleString()} · ${c.oid.slice(0, 7)}`}
                meta={null}
              />
            ))
          )}
        </Section>
      </div>

      {/* Diff lives in a sheet so the mobile screen can actually show the change */}
      <Sheet
        open={diffOpen}
        onClose={() => {
          setSelectedDiffFile(null);
          setDiffPair(null);
        }}
        title={selectedDiffFile?.split('/').pop()}
        description={selectedDiffFile ?? undefined}
        testId="git-diff-sheet"
      >
        {diffPair ? (
          <div className="space-y-2 px-3 pb-4 pt-1">
            {hasMergeConflictMarkers(diffPair.work) ? (
              <div className="rounded-sm border border-error/40 bg-error-container/30 p-2.5">
                <div className="mb-2 flex items-center gap-1.5 text-xs text-on-error-container">
                  <AlertOctagon size={14} className="text-error" />
                  检测到合并冲突标记，选择保留策略：
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" variant="filled" onClick={() => void handleResolveConflict('ours')}>
                    采用当前
                  </Button>
                  <Button
                    size="sm"
                    variant="outlined"
                    onClick={() => void handleResolveConflict('theirs')}
                  >
                    采用传入
                  </Button>
                  <Button size="sm" variant="tonal" onClick={() => void handleResolveConflict('both')}>
                    保留双方
                  </Button>
                </div>
              </div>
            ) : null}
            <UnifiedDiffViewer
              filepath={selectedDiffFile ?? undefined}
              oldText={diffPair.head}
              newText={diffPair.work}
              maxHeightClass="max-h-[52vh]"
            />
            <div className="flex items-center gap-1.5 text-2xs text-on-surface-variant">
              <ChevronRight size={12} />
              左列为仓库版本行号，右列为工作区行号
            </div>
          </div>
        ) : null}
      </Sheet>
    </Panel>
  );
};
