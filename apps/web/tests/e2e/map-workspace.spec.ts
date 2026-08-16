import { expect, test } from "@playwright/test";

test("a DM can author and explore a map without WebGL", async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, contextId: string, ...args: unknown[]) {
      if (["webgl", "webgl2", "experimental-webgl"].includes(contextId)) return null;
      return original.call(this, contextId as "2d", ...args as []) as ReturnType<typeof original>;
    } as typeof original;
  });
  await page.route("https://example.invalid/map.jpg", async (route) => {
    await route.fulfill({
      contentType: "image/svg+xml",
      headers: { "Access-Control-Allow-Origin": "*" },
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="700"><rect width="1200" height="700" fill="#173942"/><path d="M0 500 Q300 300 600 500 T1200 420" fill="none" stroke="#d4a554" stroke-width="18"/></svg>',
    });
  });

  const campaignName = `Atlas Campaign ${Date.now()}`;
  await page.goto("/");
  await page.getByLabel("Username").fill("dm");
  await page.getByLabel("Password").fill("password");
  await page.getByRole("button", { name: "Open workspace" }).click();
  await page.getByLabel("Campaign name").fill(campaignName);
  await page.getByRole("button", { name: "Create campaign" }).click();
  await page.getByRole("link", { name: `Open ${campaignName}` }).click();

  await page.getByLabel("Title").fill("Mara Venn");
  await page.getByLabel("Kind").selectOption("entity");
  await page.getByLabel("Markdown", { exact: true }).fill("A ferrymaster who keeps the harbor's oldest route ledger.");
  await page.getByRole("button", { name: "Capture page" }).click();
  await expect(page.getByRole("heading", { name: "Mara Venn" })).toBeVisible();

  const archiveUrl = page.url().replace(/\/items\/[^/]+$/, "");
  await page.goto(archiveUrl);
  await page.getByRole("link", { name: "New view" }).click();
  const viewTitle = page.getByLabel("Title");
  const createView = page.getByRole("button", { name: "Create view" });
  await page.getByLabel("Description").fill("Routes, landmarks, and secrets around the harbor.");
  await expect(async () => {
    await viewTitle.fill("Harbor Atlas");
    await expect(createView).toBeEnabled();
  }).toPass();
  await createView.click();

  await expect(page.getByRole("heading", { name: "Harbor Atlas" })).toBeVisible();
  await expect(page.locator(".map-dom-stage")).toBeVisible();
  await expect(page.getByLabel("Page to place")).toHaveCount(0);
  await page.getByRole("link", { name: "Edit map" }).click();
  await expect(page.getByRole("link", { name: "View map" })).toBeVisible();
  await page.getByLabel("Page to place").selectOption({ label: "Mara Venn" });
  await page.getByRole("button", { name: "Add marker" }).click();
  await expect(page.getByText("Placement armed")).toBeVisible();
  await page.locator(".map-dom-stage").click({ position: { x: 420, y: 260 } });

  await expect(page.getByRole("status").filter({ hasText: "Marker added." })).toBeVisible();
  const marker = page.getByRole("button", { name: "Mara Venn", exact: true });
  await expect(marker).toBeVisible();
  await marker.click();
  await expect(page.getByRole("dialog", { name: "Mara Venn" })).toBeVisible();
  await expect(page.getByText("A ferrymaster who keeps the harbor's oldest route ledger.")).toBeVisible();
  await expect(page.getByRole("link", { name: /Open full Archive page/ })).toHaveAttribute("href", /\/archive\/items\//);

  await page.getByRole("button", { name: "3D" }).click();
  await expect(page.getByRole("button", { name: "3D" })).toHaveAttribute("aria-pressed", "true");
  await page.getByLabel("Caption for Mara Venn").fill("Ferrymaster's office");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Marker changes saved." })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("button", { name: "Ferrymaster's office" })).toBeVisible();
  await page.getByRole("button", { name: "Ferrymaster's office" }).click();
  await expect(page.getByText("Ferrymaster's office")).toBeVisible();
  await page.getByRole("link", { name: "View map" }).click();
  await expect(page.getByLabel("Page to place")).toHaveCount(0);
  await expect(page.getByLabel("Search markers")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Ferrymaster's office" })).toBeVisible();
});
