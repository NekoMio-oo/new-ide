import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserWasmRuntimeBridge } from '@pocketforge/runtime-bridge';
import { PocketWorkbench } from '../src';

describe('PocketWorkbench Mobile Multi-functional UI', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders mobile code editor, dual-row accessory keybar, and switches across all 6 modules', async () => {
    const bridge = new BrowserWasmRuntimeBridge(true);
    await bridge.initialize();

    render(<PocketWorkbench bridge={bridge} />);

    // Verify editor host & touch accessory keybar + virtual trackpad
    expect(screen.getByTestId('codemirror-host')).toBeTruthy();
    expect(screen.getByTestId('accessory-keybar')).toBeTruthy();
    expect(screen.getByTestId('spacebar-trackpad')).toBeTruthy();

    // Switch to Live Web Preview + Mobile DevTools
    fireEvent.click(screen.getByText('预览'));
    expect(screen.getByTestId('live-preview-iframe')).toBeTruthy();
    expect(screen.getByTestId('mobile-devtools')).toBeTruthy();

    // Switch to Git Workbench
    fireEvent.click(screen.getByText('Git'));
    expect(await screen.findByText(/工作区变更/)).toBeTruthy();

    // Switch to Swiss-Army Dev Toolbox
    fireEvent.click(screen.getByText('工具箱'));
    expect(screen.getByText('接口调试')).toBeTruthy();
    expect(screen.getByText('SQLite 库')).toBeTruthy();
    expect(screen.getByText('离线工具链包')).toBeTruthy();

    // Switch to Multi-Provider AI Copilot
    fireEvent.click(screen.getByText('AI 助手'));
    expect(screen.getByText('AI 随身编程助手')).toBeTruthy();
    expect(screen.getByText('API 配置')).toBeTruthy();
  });
});
