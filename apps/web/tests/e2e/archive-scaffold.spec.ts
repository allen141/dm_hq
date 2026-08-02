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
  await page.getByLabel("Markdown note").fill("A ferrymaster with a secret.");
  await page.getByRole("button", { name: "Capture item" }).click();
  await expect(page.getByRole("heading", { name: "Mara Venn" })).toBeVisible();
  await expect(page.getByText("Sanitized preview")).toBeVisible();
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
});
