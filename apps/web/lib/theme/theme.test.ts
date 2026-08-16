import { describe, expect, test } from "vitest";
import {
  DEFAULT_THEME_ID,
  GRAPH_PALETTE_REGISTRY,
  GRAPH_THEME_PROPERTIES,
  THEMES,
  type GraphPalette,
  THEME_COOKIE_NAME,
  THEME_CSS,
  THEME_IDS,
  THEME_PREPAINT_SCRIPT,
  UI_THEME_PROPERTIES,
  VISUALIZATION_PROPERTIES,
  readThemeCookie,
  resolveTheme,
  resolveThemeId,
  serializeThemeCookie,
} from "./index";

describe("theme registry", () => {
  test("exposes the five allowlisted themes with Night Cartographer as the default", () => {
    expect(THEME_IDS).toEqual(["emberkeep", "astral", "verdant", "scriptorium", "cartographer"]);
    expect(DEFAULT_THEME_ID).toBe("cartographer");
    expect(resolveTheme(DEFAULT_THEME_ID).name).toBe("Night Cartographer");
  });

  test("falls back for invalid runtime values", () => {
    expect(resolveThemeId("unknown-theme")).toBe(DEFAULT_THEME_ID);
    expect(resolveThemeId(null)).toBe(DEFAULT_THEME_ID);
    expect(resolveTheme("unknown-theme").id).toBe(DEFAULT_THEME_ID);
  });

  test("generates complete UI and visualization variables for every theme", () => {
    for (const theme of THEMES) {
      expect(THEME_CSS).toContain(`[data-theme="${theme.id}"] {`);
      expect(THEME_CSS).toContain("  color-scheme: dark;");
      for (const [key, property] of Object.entries(UI_THEME_PROPERTIES)) {
        expect(THEME_CSS).toContain(`${property}: ${theme.ui[key as keyof typeof theme.ui]};`);
      }
      for (const [key, property] of Object.entries(VISUALIZATION_PROPERTIES)) {
        expect(THEME_CSS).toContain(`${property}: ${theme.visualization[key as keyof typeof theme.visualization]};`);
      }
      for (const [key, property] of Object.entries(GRAPH_THEME_PROPERTIES)) {
        expect(THEME_CSS).toContain(`${property}: ${GRAPH_PALETTE_REGISTRY[theme.id][key as keyof GraphPalette]};`);
      }
    }
  });
});

describe("theme preference cookie", () => {
  test("reads only allowlisted values and falls back for malformed values", () => {
    expect(readThemeCookie(`${THEME_COOKIE_NAME}=astral; another=value`)).toBe("astral");
    expect(readThemeCookie(`${THEME_COOKIE_NAME}=not-real`)).toBe(DEFAULT_THEME_ID);
    expect(readThemeCookie(`${THEME_COOKIE_NAME}=%E0%A4%A`)).toBe(DEFAULT_THEME_ID);
    expect(readThemeCookie("another=value")).toBe(DEFAULT_THEME_ID);
  });

  test("serializes a client-readable, site-wide preference", () => {
    const cookie = serializeThemeCookie("verdant");
    expect(cookie).toContain(`${THEME_COOKIE_NAME}=verdant`);
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).not.toContain("HttpOnly");
    expect(serializeThemeCookie("not-real")).toContain(`${THEME_COOKIE_NAME}=${DEFAULT_THEME_ID}`);
  });

  test("ships a fixed prepaint bootstrap with the complete allowlist", () => {
    expect(THEME_PREPAINT_SCRIPT).toContain(THEME_COOKIE_NAME);
    for (const themeId of THEME_IDS) expect(THEME_PREPAINT_SCRIPT).toContain(themeId);
    expect(THEME_PREPAINT_SCRIPT).toContain(DEFAULT_THEME_ID);
  });
});
