import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, test } from "vitest";
import { DEFAULT_THEME_ID, THEME_COOKIE_NAME, readThemeCookie, type ThemeId } from "@/lib/theme";
import { ThemeProvider, useTheme } from "./theme-provider";
import { ThemeSwitcher } from "./theme-switcher";

beforeEach(() => {
  document.cookie = `${THEME_COOKIE_NAME}=; Path=/; Max-Age=0`;
  document.documentElement.dataset.theme = DEFAULT_THEME_ID;
});

test("exposes the active definition and persists theme changes", () => {
  function Probe() {
    const { theme, setTheme } = useTheme();
    return <button type="button" onClick={() => setTheme("astral")}>{theme.name}</button>;
  }

  render(<ThemeProvider><Probe /></ThemeProvider>);
  fireEvent.click(screen.getByRole("button", { name: "Night Cartographer" }));

  expect(screen.getByRole("button", { name: "Astral Codex" })).toBeInTheDocument();
  expect(document.documentElement).toHaveAttribute("data-theme", "astral");
  expect(readThemeCookie()).toBe("astral");
});

test("renders a labelled native keyboard control with all allowlisted themes", () => {
  render(<ThemeProvider><ThemeSwitcher label="Campaign theme" /></ThemeProvider>);

  const switcher = screen.getByRole("combobox", { name: "Campaign theme" });
  expect(switcher).toHaveValue(DEFAULT_THEME_ID);
  expect(screen.getAllByRole("option")).toHaveLength(5);

  switcher.focus();
  expect(switcher).toHaveFocus();
  fireEvent.change(switcher, { target: { value: "verdant" } });
  expect(document.documentElement).toHaveAttribute("data-theme", "verdant");
  expect(readThemeCookie()).toBe("verdant");
});

test("guards the provider setter against invalid runtime values", () => {
  function InvalidSetter() {
    const { setTheme } = useTheme();
    return <button type="button" onClick={() => setTheme("invalid" as ThemeId)}>Set invalid theme</button>;
  }

  document.documentElement.dataset.theme = "astral";
  render(<ThemeProvider><InvalidSetter /></ThemeProvider>);
  fireEvent.click(screen.getByRole("button", { name: "Set invalid theme" }));

  expect(document.documentElement).toHaveAttribute("data-theme", DEFAULT_THEME_ID);
  expect(readThemeCookie()).toBe(DEFAULT_THEME_ID);
});
