import { DEFAULT_THEME_ID, resolveThemeId, type ThemeId } from "./registry";

export const THEME_COOKIE_NAME = "dmhq_theme";
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function readThemeCookie(cookieSource?: string): ThemeId {
  const source = cookieSource ?? (typeof document === "undefined" ? "" : document.cookie);
  for (const part of source.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0 || part.slice(0, separator).trim() !== THEME_COOKIE_NAME) continue;
    try {
      return resolveThemeId(decodeURIComponent(part.slice(separator + 1).trim()));
    } catch {
      return DEFAULT_THEME_ID;
    }
  }
  return DEFAULT_THEME_ID;
}

export function serializeThemeCookie(value: unknown): string {
  const themeId = resolveThemeId(value);
  return `${THEME_COOKIE_NAME}=${encodeURIComponent(themeId)}; Path=/; Max-Age=${THEME_COOKIE_MAX_AGE}; SameSite=Lax`;
}

export function writeThemeCookie(value: unknown): ThemeId {
  const themeId = resolveThemeId(value);
  if (typeof document !== "undefined") document.cookie = serializeThemeCookie(themeId);
  return themeId;
}
