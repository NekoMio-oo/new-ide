import { describe, expect, it } from 'vitest';
import {
  COLOR_ROLES,
  darkScheme,
  lightScheme,
  setThemeMode,
  type M3Scheme,
} from '@pocketforge/m3-theme';

const channel = (value: number) => {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

const luminance = (hex: string) => {
  const raw = hex.replace('#', '');
  const int = Number.parseInt(raw, 16);
  const [r, g, b] = [(int >> 16) & 255, (int >> 8) & 255, int & 255];
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};

const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe('design tokens', () => {
  it('keeps the product palette anchors', () => {
    expect(darkScheme.surface.toUpperCase()).toBe('#121318');
    expect(darkScheme.surfaceContainer.toUpperCase()).toBe('#1C1D23');
    expect(darkScheme.primary.toUpperCase()).toBe('#B9C6FF');
    expect(darkScheme.secondary.toUpperCase()).toBe('#C2C6DC');
    expect(darkScheme.outline.toUpperCase()).toBe('#444650');
    expect(darkScheme.editor.toUpperCase()).toBe('#17181D');
  });

  it('defines every colour role in both schemes as a hex value', () => {
    for (const scheme of [darkScheme, lightScheme] as M3Scheme[]) {
      for (const role of COLOR_ROLES) {
        expect(scheme[role], `missing role: ${role}`).toMatch(/^#[0-9A-F]{6}$/i);
      }
    }
  });

  it('keeps body text and UI labels legible in both schemes', () => {
    for (const scheme of [darkScheme, lightScheme]) {
      expect(contrast(scheme.onSurface, scheme.surface)).toBeGreaterThan(4.5);
      expect(contrast(scheme.onSurfaceVariant, scheme.surfaceContainer)).toBeGreaterThan(4.5);
      expect(contrast(scheme.onPrimary, scheme.primary)).toBeGreaterThan(4.5);
      // Editor: code must stay readable; comments are intentionally de-emphasised.
      expect(contrast(scheme.syntaxVariable, scheme.editor)).toBeGreaterThan(4.5);
      expect(contrast(scheme.syntaxKeyword, scheme.editor)).toBeGreaterThan(4.5);
      expect(contrast(scheme.syntaxComment, scheme.editor)).toBeGreaterThan(3);
    }
  });

  it('injects the active scheme as css variables and toggles the scheme class', () => {
    setThemeMode('dark');
    const root = document.documentElement;
    expect(root.classList.contains('dark')).toBe(true);
    expect(root.style.getPropertyValue('--m3-surface').trim()).toBe('18 19 24');
    expect(root.style.getPropertyValue('--m3-editor').trim()).toBe('23 24 29');

    setThemeMode('light');
    expect(root.classList.contains('light')).toBe(true);
    expect(root.style.getPropertyValue('--m3-surface').trim()).toBe('251 248 255');
    expect(root.style.getPropertyValue('--m3-surface-container-low').trim()).toBe('245 243 251');
  });
});
