import React, { useState } from 'react';
import { Send, Database, Braces, FileText, Cpu } from 'lucide-react';
import type { RuntimeBridge } from '@pocketforge/runtime-bridge';
import { Panel, PanelBody, PanelHeader, SegmentedTabs } from '@pocketforge/ui-kit';
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

const TABS: Array<{ id: ToolboxSubTab; label: string; icon: React.ReactNode }> = [
  { id: 'postman', label: '接口调试', icon: <Send size={13} /> },
  { id: 'sqlite', label: 'SQLite 库', icon: <Database size={13} /> },
  { id: 'codec', label: 'JSON/正则/JWT', icon: <Braces size={13} /> },
  { id: 'markdown', label: 'Markdown 笔记', icon: <FileText size={13} /> },
  { id: 'toolchains', label: '离线工具链包', icon: <Cpu size={13} /> },
];

export const DevToolboxPanel: React.FC<DevToolboxPanelProps> = ({ bridge, sqlWasmUrl }) => {
  const [subTab, setSubTab] = useState<ToolboxSubTab>('postman');

  return (
    <Panel>
      <PanelHeader title="工具箱" subtitle="离线开发工具" />
      <SegmentedTabs tabs={TABS} value={subTab} onChange={setSubTab} />
      <PanelBody padded>
        {subTab === 'postman' ? <MiniPostmanTab /> : null}
        {subTab === 'sqlite' ? <SqliteStudioTab fs={bridge.fs} wasmUrl={sqlWasmUrl} /> : null}
        {subTab === 'codec' ? <CodecRegexLabTab /> : null}
        {subTab === 'markdown' ? <MarkdownNoteTab /> : null}
        {subTab === 'toolchains' ? <ToolchainManagerTab toolchains={bridge.toolchains} /> : null}
      </PanelBody>
    </Panel>
  );
};
