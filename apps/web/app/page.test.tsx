import { render, screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";

import Home from "./page";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockImplementation((path: string) => {
    if (path.includes("/csrf")) return Promise.resolve({ ok: true, json: async () => ({ csrfToken: "test" }) });
    return Promise.resolve({ ok: false, json: async () => ({ detail: "Unauthenticated" }) });
  }));
});

test("shows the Archive sign-in workspace", async () => {
  render(<Home />);
  expect(screen.getByRole("heading", { name: "Keep the thread." })).toBeInTheDocument();
  expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
});
