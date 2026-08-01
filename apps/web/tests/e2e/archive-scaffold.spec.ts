import { expect, test } from "@playwright/test";

test("an owner can create and reopen a campaign", async ({ page }) => {
  const campaignName = `Smoke Campaign ${Date.now()}`;
  await page.goto("/");
  await page.getByLabel("Username").fill("dm");
  await page.getByLabel("Password").fill("password");
  await page.getByRole("button", { name: "Open workspace" }).click();

  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  await page.getByLabel("Campaign name").fill(campaignName);
  await page.getByRole("button", { name: "Create campaign" }).click();
  await expect(page.getByRole("button", { name: `Open ${campaignName}` })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("button", { name: `Open ${campaignName}` })).toBeVisible();
  await page.getByRole("button", { name: `Open ${campaignName}` }).click();
  await expect(page.getByRole("status")).toContainText("Campaign open");
  await expect(page.getByRole("status")).toContainText(campaignName);
});
