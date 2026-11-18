import React, { useState } from 'react';
import {
  Folder,
  FolderOpen,
  FileCode2,
  FilePlus2,
  FolderPlus,
  Trash2,
  X,
  Layers,
} from 'lucide-react';
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
  };

  const renderNode = (node: FileNode, depth = 0): React.ReactNode => {
    if (node.kind === 'directory') {
      const isExpanded = Boolean(expandedDirs[node.path]);
      return (
        <div key={node.path}>
          <div
            style={{ paddingLeft: `${depth * 14 + 8}px` }}
            className="flex items-center justify-between pr-2 py-1.5 hover:bg-slate-800/70 rounded cursor-pointer text-xs text-slate-200 group"
            onClick={() => toggleDir(node.path)}
          >
            <div className="flex items-center gap-1.5 truncate">
              {isExpanded ? (
                <FolderOpen className="w-4 h-4 text-amber-400 shrink-0" />
              ) : (
                <Folder className="w-4 h-4 text-amber-400/80 shrink-0" />
              )}
              <span className="truncate font-medium">{node.name}</span>
            </div>
            <button
              type="button"
              onClick={async (e) => {
                e.stopPropagation();
                await bridge.fs.deletePath(node.path);
                await onRefresh();
              }}
              className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-rose-400"
              title="删除目录"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
          {isExpanded && node.children?.map((child) => renderNode(child, depth + 1))}
        </div>
      );
    }

    const isActive = node.path === activeFilePath;
    return (
      <div
        key={node.path}
        style={{ paddingLeft: `${depth * 14 + 12}px` }}
        onClick={() => {
          onSelectFile(node.path);
          onClose();
        }}
        className={`flex items-center justify-between pr-2 py-1.5 rounded cursor-pointer text-xs group ${
          isActive
            ? 'bg-sky-600/25 text-sky-300 border-l-2 border-sky-400'
            : 'text-slate-300 hover:bg-slate-800/60'
        }`}
      >
        <div className="flex items-center gap-1.5 truncate">
          <FileCode2 className="w-3.5 h-3.5 text-sky-400 shrink-0" />
          <span className="truncate font-mono">{node.name}</span>
        </div>
        <button
          type="button"
          onClick={async (e) => {
            e.stopPropagation();
            await bridge.fs.deletePath(node.path);
            await onRefresh();
          }}
          className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-rose-400"
          title="删除文件"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-40 flex">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/60 backdrop-blur-xs" onClick={onClose} />

      {/* Drawer Panel */}
      <aside className="relative z-10 w-72 max-w-[85vw] h-full bg-slate-900 border-r border-slate-800 flex flex-col text-slate-200 shadow-2xl">
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-800">
          <span className="text-xs font-bold tracking-wide uppercase text-slate-300">
            离线工作区资源管理器
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                setCreatingKind('file');
                setNewPathInput('web-nebula-app/newFile.js');
              }}
              className="p-1.5 rounded hover:bg-slate-800 text-slate-300"
              title="新建文件"
            >
              <FilePlus2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                setCreatingKind('dir');
                setNewPathInput('my-project');
              }}
              className="p-1.5 rounded hover:bg-slate-800 text-slate-300"
              title="新建文件夹"
            >
              <FolderPlus className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setShowTemplates((v) => !v)}
              className="p-1.5 rounded hover:bg-slate-800 text-sky-400"
              title="从多语言模板创建项目"
            >
              <Layers className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded hover:bg-slate-800 text-slate-400"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {creatingKind && (
          <form onSubmit={handleCreateSubmit} className="p-2 bg-slate-950 border-b border-slate-800 flex gap-1.5">
            <input
              type="text"
              autoFocus
              value={newPathInput}
              onChange={(e) => setNewPathInput(e.target.value)}
              placeholder={creatingKind === 'file' ? 'dir/filename.ts' : 'folder-name'}
              className="flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs font-mono"
            />
            <button type="submit" className="px-2.5 py-1 rounded bg-sky-600 text-white text-xs">
              创建
            </button>
          </form>
        )}

        {showTemplates && (
          <div className="p-2.5 bg-slate-950 border-b border-slate-800 space-y-1.5 max-h-60 overflow-y-auto">
            <div className="text-[11px] font-semibold text-sky-400">一键导入多语言工程模板：</div>
            {STARTER_TEMPLATES.map((tpl) => (
              <button
                key={tpl.id}
                type="button"
                onClick={() => void handleSpawnTemplate(tpl)}
                className="w-full text-left p-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 space-y-0.5"
              >
                <div className="flex items-center justify-between text-xs font-medium text-slate-100">
                  <span>{tpl.name}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-950 text-sky-300">
                    {tpl.category}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 line-clamp-2">{tpl.description}</p>
              </button>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
          {tree.map((node) => renderNode(node, 0))}
        </div>
      </aside>
    </div>
  );
};
