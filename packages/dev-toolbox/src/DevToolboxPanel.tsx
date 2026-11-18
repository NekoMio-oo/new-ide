import React, { useState } from 'react';
import { Send, Database, Braces, FileText, Cpu } from 'lucide-react';
import type { RuntimeBridge } from '@pocketforge/runtime-bridge';
import { MiniPostmanTab } from './MiniPostmanTab';
import { SqliteStudioTab } from './SqliteStudioTab';
import {
  CodecRegexLabTab,
  MarkdownNoteTab,
  ToolchainManagerTab,
} from './CodecMarkdownAndPacks';

type ToolboxSubTab = 'postman' | 'sqlite' | 'codec' | 'markdown' | 'toolchains';

interface DevToolboxPanelProps {
  bridge: RuntimeBridge;
  sqlWasmUrl?: string;
}

export const DevToolboxPanel: React.FC<DevToolboxPanelProps> = ({ bridge, sqlWasmUrl }) => {
  const [subTab, setSubTab] = useState<ToolboxSubTab>('postman');

  const tabs: Array<{ id: ToolboxSubTab; label: string; icon: React.ReactNode }> = [
    { id: 'postman', label: '接口调试', icon: <Send className="w-3.5 h-3.5" /> },
    { id: 'sqlite', label: 'SQLite 库', icon: <Database className="w-3.5 h-3.5" /> },
    { id: 'codec', label: 'JSON/正则/JWT', icon: <Braces className="w-3.5 h-3.5" /> },
    { id: 'markdown', label: 'Markdown 笔记', icon: <FileText className="w-3.5 h-3.5" /> },
    { id: 'toolchains', label: '离线工具链包', icon: <Cpu className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="flex flex-col h-full w-full bg-slate-950 text-slate-200 overflow-hidden">
      <div className="flex items-center gap-1.5 px-3 py-2 bg-slate-900 border-b border-slate-800 overflow-x-auto no-scrollbar shrink-0">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setSubTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium shrink-0 transition-colors ${
              subTab === t.id
                ? 'bg-sky-600 text-white'
                : 'bg-slate-800/90 text-slate-300 hover:bg-slate-700'
            }`}
          >
            {t.icon}
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-3">
        {subTab === 'postman' && <MiniPostmanTab />}
        {subTab === 'sqlite' && <SqliteStudioTab fs={bridge.fs} wasmUrl={sqlWasmUrl} />}
        {subTab === 'codec' && <CodecRegexLabTab />}
        {subTab === 'markdown' && <MarkdownNoteTab />}
        {subTab === 'toolchains' && <ToolchainManagerTab toolchains={bridge.toolchains} />}
      </div>
    </div>
  );
};
