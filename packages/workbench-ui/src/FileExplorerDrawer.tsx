import React, { useEffect, useState } from 'react';
import {
  ChevronRight,
  Folder,
  FolderOpen,
  FileCode2,
  FileJson,
  FileText,
  FileImage,
  FileTerminal,
  File,
  Database,
  FilePlus2,
  FolderPlus,
  Trash2,
  X,
  Layers,
} from 'lucide-react';
import {
  Button,
  IconButton,
  ListRow,
  Section,
  Sheet,
  TextInput,
  haptic,
  useLongPress,
} from '@pocketforge/ui-kit';
import {
  STARTER_TEMPLATES,
  type FileNode,
  type ProjectTemplate,
  type RuntimeBridge,
} from '@pocketforge/runtime-bridge';

interface FileExplorerDrawerProps {
  open: boolean;
  tree: FileNode[];
  activeFilePath: string | null;
  bridge: RuntimeBridge;
  onSelectFile: (filepath: string) => void;
  onClose: () => void;
  onRefresh: () => Promise<void>;
}

/** Extension → icon + tone. Colours come from syntax tokens, never literals. */
const fileVisual = (name: string): { icon: React.ReactNode; tone: string } => {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  const size = 14;

  if (['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs'].includes(ext))
    return { icon: <FileCode2 size={size} />, tone: 'text-syntax-number' };
  if (['rs', 'go', 'java', 'kt', 'kts', 'c', 'h', 'cpp', 'cc', 'hpp', 'swift'].includes(ext))
    return { icon: <FileCode2 size={size} />, tone: 'text-syntax-type' };
  if (['py', 'rb', 'php', 'lua'].includes(ext))
    return { icon: <FileCode2 size={size} />, tone: 'text-syntax-string' };
  if (['html', 'htm', 'vue', 'svelte', 'css', 'scss', 'less'].includes(ext))
    return { icon: <FileCode2 size={size} />, tone: 'text-syntax-tag' };
  if (['json', 'jsonc', 'yaml', 'yml', 'toml', 'ini', 'env'].includes(ext))
    return { icon: <FileJson size={size} />, tone: 'text-syntax-attribute' };
  if (['md', 'mdx', 'txt', 'rst'].includes(ext))
    return { icon: <FileText size={size} />, tone: 'text-syntax-property' };
  if (['sh', 'bash', 'zsh', 'fish'].includes(ext))
    return { icon: <FileTerminal size={size} />, tone: 'text-syntax-function' };
  if (['sql', 'db', 'sqlite'].includes(ext))
    return { icon: <Database size={size} />, tone: 'text-syntax-meta' };
  if (['png', 'jpg', 'jpeg', 'svg', 'webp', 'gif', 'ico'].includes(ext))
    return { icon: <FileImage size={size} />, tone: 'text-syntax-meta' };
  return { icon: <File size={size} />, tone: 'text-on-surface-variant' };
};

interface TreeRowProps {
  node: FileNode;
  depth: number;
  expanded: boolean;
  active: boolean;
  onToggle: () => void;
  onSelect: () => void;
  onRequestDelete: () => void;
}

const TreeRow: React.FC<TreeRowProps> = ({
  node,
  depth,
  expanded,
  active,
  onToggle,
  onSelect,
  onRequestDelete,
}) => {
  const visual = node.kind === 'directory' ? null : fileVisual(node.name);
  const { handlers, consumeSuppressedClick } = useLongPress(onRequestDelete, 500);

  return (
    <button
      type="button"
      {...handlers}
      onClick={() => {
        if (consumeSuppressedClick()) return;
        haptic('select');
        if (node.kind === 'directory') onToggle();
        else onSelect();
      }}
      className={`press flex h-8 w-full items-center gap-1.5 rounded-sm pr-1.5 text-left ${
        active
          ? 'bg-secondary-container/65 text-on-surface'
          : 'text-on-surface-variant hover:bg-on-surface/[0.05]'
      }`}
      style={{ paddingLeft: 6 + depth * 12 }}
    >
      {node.kind === 'directory' ? (
        <>
          <ChevronRight
            size={13}
            className={`shrink-0 text-on-surface-variant/70 transition-transform duration-fast ${
              expanded ? 'rotate-90' : ''
            }`}
          />
          {expanded ? (
            <FolderOpen size={14} className="shrink-0 text-syntax-number" />
          ) : (
            <Folder size={14} className="shrink-0 text-syntax-number" />
          )}
          <span className="truncate text-sm font-medium text-on-surface">{node.name}</span>
        </>
      ) : (
        <>
          <span className="w-[13px] shrink-0" />
          <span className={`shrink-0 ${visual!.tone}`}>{visual!.icon}</span>
          <span className={`truncate font-mono text-sm ${active ? 'text-on-surface' : ''}`}>
            {node.name}
          </span>
        </>
      )}
    </button>
  );
};

export const FileExplorerDrawer: React.FC<FileExplorerDrawerProps> = ({
  open,
  tree,
  activeFilePath,
  bridge,
  onSelectFile,
  onClose,
  onRefresh,
}) => {
  const [expandedDirs, setExpandedDirs] = useState<Record<string, boolean>>({
    'web-nebula-app': true,
    'python-algo-kit': true,
  });
  const [creatingKind, setCreatingKind] = useState<'file' | 'dir' | null>(null);
  const [newPathInput, setNewPathInput] = useState('');
  const [showTemplates, setShowTemplates] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<FileNode | null>(null);
  useEffect(() => {
    if (!open) {
      setCreatingKind(null);
      setPendingDelete(null);
      setShowTemplates(false);
    }
  }, [open]);

  if (!open) return null;

  const toggleDir = (path: string) => {
    setExpandedDirs((prev) => ({ ...prev, [path]: !prev[path] }));
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newPathInput.trim();
    if (!clean || !creatingKind) return;
    if (creatingKind === 'file') {
      await bridge.fs.writeFile(clean, '');
      onSelectFile(clean);
      onClose();
    } else {
      await bridge.fs.mkdir(clean);
      setExpandedDirs((prev) => ({ ...prev, [clean]: true }));
    }
    setCreatingKind(null);
    setNewPathInput('');
    await onRefresh();
  };

  const handleSpawnTemplate = async (tpl: ProjectTemplate) => {
    for (const [filepath, content] of Object.entries(tpl.files)) {
      await bridge.fs.writeFile(filepath, content);
    }
    setExpandedDirs((prev) => ({ ...prev, [tpl.id]: true }));
    setShowTemplates(false);
    await onRefresh();
    onSelectFile(tpl.defaultEntry);
    onClose();
  };

  const handleDeleteConfirmed = async () => {
    if (!pendingDelete) return;
    await bridge.fs.deletePath(pendingDelete.path);
    setPendingDelete(null);
    await onRefresh();
  };

  const renderNode = (node: FileNode, depth = 0): React.ReactNode => {
    if (node.kind === 'directory') {
      const isExpanded = Boolean(expandedDirs[node.path]);
      return (
        <div key={node.path}>
          <TreeRow
            node={node}
            depth={depth}
            expanded={isExpanded}
            active={false}
            onToggle={() => toggleDir(node.path)}
            onSelect={() => undefined}
            onRequestDelete={() => setPendingDelete(node)}
          />
          {isExpanded ? node.children?.map((child) => renderNode(child, depth + 1)) : null}
        </div>
      );
    }

    return (
      <TreeRow
        key={node.path}
        node={node}
        depth={depth}
        expanded={false}
        active={node.path === activeFilePath}
        onToggle={() => undefined}
        onSelect={() => {
          onSelectFile(node.path);
          onClose();
        }}
        onRequestDelete={() => setPendingDelete(node)}
      />
    );
  };

  return (
    <div className="fixed inset-0 z-40 flex" role="presentation">
      <div className="absolute inset-0 animate-fade-in bg-scrim/50" onClick={onClose} aria-hidden="true" />

      <aside
        className="relative z-10 flex h-full w-80 max-w-[86vw] shrink-0 animate-drawer-in flex-col rounded-r-lg border-r border-outline-variant bg-surface-container-low pt-safe text-on-surface shadow-e3"
        role="dialog"
        aria-label="资源管理器"
      >
        {/* Drawer header — title + create actions, no decorative chrome */}
        <div className="flex h-11 shrink-0 items-center gap-0.5 border-b border-outline-variant pl-3.5 pr-1">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-on-surface">资源管理器</div>
            <div className="font-mono text-2xs text-on-surface-variant">离线工作区</div>
          </div>
          <IconButton
            label="新建文件"
            size="sm"
            onClick={() => {
              setCreatingKind('file');
              setNewPathInput('web-nebula-app/untitled.js');
            }}
          >
            <FilePlus2 size={15} />
          </IconButton>
          <IconButton
            label="新建文件夹"
            size="sm"
            onClick={() => {
              setCreatingKind('dir');
              setNewPathInput('my-project');
            }}
          >
            <FolderPlus size={15} />
          </IconButton>
          <IconButton
            label="工程模板"
            size="sm"
            active={showTemplates}
            onClick={() => setShowTemplates((v) => !v)}
          >
            <Layers size={15} />
          </IconButton>
          <IconButton label="关闭资源管理器" size="sm" onClick={onClose}>
            <X size={15} />
          </IconButton>
        </div>

        {creatingKind ? (
          <form
            onSubmit={handleCreateSubmit}
            className="shrink-0 animate-panel-in border-b border-outline-variant bg-surface px-2 py-2"
          >
            <TextInput
              autoFocus
              value={newPathInput}
              onChange={(e) => setNewPathInput(e.target.value)}
              placeholder={creatingKind === 'file' ? '目录/文件名.ts' : '文件夹名'}
              aria-label={creatingKind === 'file' ? '新文件路径' : '新文件夹名称'}
            />
            <div className="mt-1.5 flex items-center justify-end gap-1.5">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setCreatingKind(null);
                  setNewPathInput('');
                }}
              >
                取消
              </Button>
              <Button size="sm" variant="filled" type="submit">
                创建
              </Button>
            </div>
          </form>
        ) : null}

        {showTemplates ? (
          <div className="max-h-[46%] shrink-0 overflow-y-auto border-b border-outline-variant bg-surface touch-scroll">
            <Section title="多语言工程模板" bodyClassName="py-0">
              {STARTER_TEMPLATES.map((tpl) => (
                <ListRow
                  key={tpl.id}
                  leading={<FolderPlus size={14} />}
                  title={tpl.name}
                  subtitle={tpl.description}
                  meta={tpl.category}
                  onClick={() => void handleSpawnTemplate(tpl)}
                />
              ))}
            </Section>
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto px-1.5 py-1 touch-scroll">
          {tree.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-on-surface-variant">
              工作区为空，先新建文件或导入模板。
            </div>
          ) : (
            tree.map((node) => renderNode(node, 0))
          )}
        </div>

        <div className="shrink-0 border-t border-outline-variant px-3 pt-2 pb-safe font-mono text-2xs text-on-surface-variant">
          长按文件可删除
        </div>
      </aside>

      {/* Delete confirmation sheet — destructive actions never fire on long-press alone */}
      <Sheet
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        title={`删除${pendingDelete?.kind === 'directory' ? '文件夹' : '文件'}`}
        description={pendingDelete?.path}
        testId="delete-sheet"
      >
        <div className="px-3 pb-2 text-xs leading-relaxed text-on-surface-variant">
          {pendingDelete?.kind === 'directory'
            ? '该文件夹及其全部内容将从工作区移除，此操作无法撤销。'
            : '该文件将从工作区移除，此操作无法撤销。'}
        </div>
        <div className="flex gap-2 px-3 pb-4 pt-1">
          <Button variant="outlined" size="md" block onClick={() => setPendingDelete(null)}>
            取消
          </Button>
          <Button
            variant="danger"
            size="md"
            block
            icon={<Trash2 size={14} />}
            hapticKind="warning"
            onClick={() => void handleDeleteConfirmed()}
          >
            删除
          </Button>
        </div>
      </Sheet>
    </div>
  );
};
