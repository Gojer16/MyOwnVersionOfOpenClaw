// src/tui/hooks/use-keyboard.ts
import { useInput } from 'ink';
import { useCallback } from 'react';

export interface KeyboardShortcuts {
  onCtrlC?: () => void;
  onCtrlD?: () => void;
  onCtrlG?: () => void;
  onCtrlL?: () => void;
  onCtrlO?: () => void;
  onCtrlP?: () => void;
  onCtrlT?: () => void;
  onShiftTab?: () => void;
  onEscape?: () => void;
}

export function useKeyboard(shortcuts: KeyboardShortcuts) {
  useInput(
    useCallback(
      (input, key) => {
        if (key.ctrl && input === 'c') {
          shortcuts.onCtrlC?.();
          return;
        }

        if (key.ctrl && input === 'd') {
          shortcuts.onCtrlD?.();
          return;
        }

        if (key.ctrl && input === 'g') {
          shortcuts.onCtrlG?.();
          return;
        }

        if (key.ctrl && input === 'l') {
          shortcuts.onCtrlL?.();
          return;
        }

        if (key.ctrl && input === 'o') {
          shortcuts.onCtrlO?.();
          return;
        }

        if (key.ctrl && input === 'p') {
          shortcuts.onCtrlP?.();
          return;
        }

        if (key.ctrl && input === 't') {
          shortcuts.onCtrlT?.();
          return;
        }

        if (key.shift && key.tab) {
          shortcuts.onShiftTab?.();
          return;
        }

        if (key.escape) {
          shortcuts.onEscape?.();
          return;
        }
      },
      [shortcuts]
    )
  );
}
