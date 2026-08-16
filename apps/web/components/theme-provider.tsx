"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  DEFAULT_THEME_ID,
  THEME_REGISTRY,
  readThemeCookie,
  resolveThemeId,
  writeThemeCookie,
  type ThemeDefinition,
  type ThemeId,
} from "@/lib/theme";

type ThemeContextValue = Readonly<{
  theme: ThemeDefinition;
  setTheme: (theme: ThemeId) => void;
}>;

const ThemeContext = createContext<ThemeContextValue | null>(null);
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function serverSnapshot(): ThemeId {
  return DEFAULT_THEME_ID;
}

function browserSnapshot(): ThemeId {
  if (typeof document === "undefined") return DEFAULT_THEME_ID;
  return resolveThemeId(document.documentElement.dataset.theme ?? readThemeCookie());
}

function commitTheme(value: unknown): ThemeId {
  const themeId = resolveThemeId(value);
  if (typeof document !== "undefined") {
    document.documentElement.dataset.theme = themeId;
    writeThemeCookie(themeId);
  }
  listeners.forEach((listener) => listener());
  return themeId;
}

export function ThemeProvider({ children }: Readonly<{ children: ReactNode }>) {
  const themeId = useSyncExternalStore(subscribe, browserSnapshot, serverSnapshot);
  const setTheme = useCallback((value: ThemeId) => { commitTheme(value); }, []);
  const value = useMemo<ThemeContextValue>(() => ({ theme: THEME_REGISTRY[themeId], setTheme }), [setTheme, themeId]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used within a ThemeProvider.");
  return value;
}
