import React, { useEffect, useState } from 'react';
import { createAutoRuntimeBridge, type RuntimeBridge } from '@pocketforge/runtime-bridge';
import { PocketWorkbench } from '@pocketforge/workbench-ui';
import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url';

/**
 * Boot screen: keeps the IDE's typographic language (mono instrument text, one
 * primary accent) instead of a generic spinner page.
 */
const BootSplash: React.FC = () => (
  <div className="flex h-dvh w-screen flex-col items-center justify-center gap-5 bg-surface px-8">
    <div className="flex items-center gap-2.5">
      <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/12 font-mono text-md font-semibold text-primary">
        {'{}'}
      </span>
      <div className="leading-tight">
        <div className="text-md font-semibold tracking-tight text-on-surface">PocketForge</div>
        <div className="font-mono text-2xs uppercase tracking-[0.14em] text-on-surface-variant">
          Offline Mobile IDE
        </div>
      </div>
    </div>

    <div className="h-[2px] w-40 overflow-hidden rounded-full bg-surface-container-high">
      <div className="h-full w-1/2 animate-[boot-slide_1.1s_var(--ease-standard)_infinite] rounded-full bg-primary" />
    </div>

    <span className="font-mono text-2xs text-on-surface-variant">
      正在挂载离线工作区与工具链…
    </span>

    <style>{`
      @keyframes boot-slide {
        0% { transform: translateX(-100%); }
        100% { transform: translateX(300%); }
      }
    `}</style>
  </div>
);

export const App: React.FC = () => {
  const [bridge, setBridge] = useState<RuntimeBridge | null>(null);

  useEffect(() => {
    void createAutoRuntimeBridge().then(setBridge);
  }, []);

  if (!bridge) return <BootSplash />;

  return <PocketWorkbench bridge={bridge} sqlWasmUrl={sqlWasmUrl} />;
};
