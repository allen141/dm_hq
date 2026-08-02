import { expect, test } from "@playwright/test";

test("an owner can create a campaign and open its Archive workspace", async ({ page }) => {
  const campaignName = `Smoke Campaign ${Date.now()}`;
  await page.goto("/");
  await page.getByLabel("Username").fill("dm");
  await page.getByLabel("Password").fill("password");
  await page.getByRole("button", { name: "Open workspace" }).click();

  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  await expect(page.getByLabel("Build version")).toContainText("build dev");
  await page.getByLabel("Campaign name").fill(campaignName);
  await page.getByRole("button", { name: "Create campaign" }).click();
  await expect(page.getByRole("link", { name: `Open ${campaignName}` })).toBeVisible();

  await page.getByRole("link", { name: `Open ${campaignName}` }).click();
  await expect(page.getByRole("heading", { name: "Make it findable." })).toBeVisible();
  await page.getByLabel("Title").fill("Mara Venn");
  await page.getByLabel("Kind").selectOption("entity");
  await expect(page.getByLabel("Subject type")).toHaveValue("person");
  await page.getByLabel("Additional Markdown (optional)").fill("A ferrymaster with a secret.");
  await page.getByRole("button", { name: "Capture item" }).click();
  await expect(page.getByRole("heading", { name: "Mara Venn" })).toBeVisible();
  await expect(page.getByText("Sanitized preview")).toBeVisible();
  const campaignUrl = page.url().replace(/\/items\/[^/]+$/, "");
  await expect(page.getByLabel("Species")).toBeVisible();
  await expect(page.getByLabel("Armor Class")).toBeVisible();
  await page.getByLabel("Species").fill("Human");
  await page.getByLabel("Level").fill("3");
  await page.getByRole("button", { name: "Save revision" }).click();
  await expect(page.getByText("Saved as a new revision.")).toBeVisible();
  await page.getByRole("button", { name: "Publish player snapshot" }).click();
  await expect(page.getByText("Handouts for this item")).toBeVisible();
  await expect(page.getByRole("link", { name: "Open player handout" }).first()).toBeVisible();
  await page.getByRole("link", { name: "Open player handout" }).first().click();
  await expect(page.getByRole("heading", { name: "Campaign notes" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Mara Venn" })).toBeVisible();

  await page.goto(campaignUrl);
  await expect(page.locator(".handout-label strong", { hasText: "Mara Venn" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open handout" })).toHaveCount(1);
  await page.getByRole("button", { name: "Revoke" }).first().click();
  await expect(page.getByText("Revoked handouts (1)")).toBeVisible();
  await expect(page.getByRole("link", { name: "Open handout" })).toHaveCount(0);
  await page.getByText("Revoked handouts (1)").click();
  await expect(page.getByText("Unavailable")).toBeVisible();
  await expect(page.locator(".handout-history .handout-label strong")).toHaveText("Mara Venn");

  await page.getByLabel("Title").fill("Session One");
  await page.getByLabel("Kind").selectOption("session");
  await expect(page.getByLabel("Scheduled date")).toBeVisible();
  await expect(page.getByLabel("Session status")).toBeVisible();
  await expect(page.getByLabel("Outcome")).toBeVisible();
  await page.getByLabel("Outcome").fill("Reconciled at the table.");
  await page.getByRole("button", { name: "Capture item" }).click();
  await expect(page.getByRole("heading", { name: "Session One" })).toBeVisible();
  await expect(page.getByLabel("Outcome")).toHaveValue("Reconciled at the table.");
  await expect(page.getByLabel("Additional Markdown (optional)")).toBeVisible();
});
