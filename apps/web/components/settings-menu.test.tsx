import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, test } from "vitest";
import { DEFAULT_THEME_ID, THEME_COOKIE_NAME, readThemeCookie } from "@/lib/theme";
import { ThemeProvider } from "./theme-provider";
import { SettingsMenu } from "./settings-menu";

beforeEach(() => {
  document.cookie = `${THEME_COOKIE_NAME}=; Path=/; Max-Age=0`;
  document.documentElement.dataset.theme = DEFAULT_THEME_ID;
});

test("keeps appearance controls inside a dismissible settings popover", async () => {
  render(<ThemeProvider><SettingsMenu /></ThemeProvider>);

  const trigger = screen.getByRole("button", { name: "Settings" });
  expect(trigger).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByRole("dialog", { name: "Settings" })).not.toBeInTheDocument();

  fireEvent.click(trigger);
  expect(trigger).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByRole("dialog", { name: "Settings" })).toBeInTheDocument();

  fireEvent.change(screen.getByRole("combobox", { name: "Theme" }), { target: { value: "scriptorium" } });
  expect(document.documentElement).toHaveAttribute("data-theme", "scriptorium");
  expect(readThemeCookie()).toBe("scriptorium");

  fireEvent.keyDown(document, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "Settings" })).not.toBeInTheDocument());
  expect(trigger).toHaveAttribute("aria-expanded", "false");
});
