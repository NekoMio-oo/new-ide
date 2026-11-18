import React, { useEffect, useState } from 'react';
import { createAutoRuntimeBridge, type RuntimeBridge } from '@pocketforge/runtime-bridge';
import { PocketWorkbench } from '@pocketforge/workbench-ui';
import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url';

export const App: React.FC = () => {
  const [bridge, setBridge] = useState<RuntimeBridge | null>(null);

  useEffect(() => {
    void createAutoRuntimeBridge().then(setBridge);
  }, []);

  if (!bridge) {
    return (
      <div className="flex flex-col items-center justify-center h-dvh w-screen bg-slate-950 text-slate-300 gap-3">
        <div className="w-8 h-8 rounded-full border-2 border-sky-500 border-t-transparent animate-spin" />
        <span className="text-xs font-mono">正在挂载 PocketForge 离线工作区与工具链...</span>
      </div>
    );
  }

  return <PocketWorkbench bridge={bridge} sqlWasmUrl={sqlWasmUrl} />;
};
