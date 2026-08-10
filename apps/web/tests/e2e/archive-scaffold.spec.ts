import { expect, test } from "@playwright/test";

test("an owner can create a campaign and use its Archive workspace", async ({ page }) => {
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
  await expect(page).toHaveURL(/\/campaigns\/[^/]+\/archive$/);
  await expect(page.getByRole("heading", { name: campaignName })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Wiki", exact: true })).toBeVisible();
  await page.getByLabel("Title").fill("Mara Venn");
  await page.getByLabel("Kind").selectOption("entity");
  await page.getByLabel("Markdown", { exact: true }).fill("A ferrymaster with a secret.");
  await page.getByRole("button", { name: "Capture page" }).click();
  await expect(page.getByRole("heading", { name: "Mara Venn" })).toBeVisible();
  await expect(page.getByText("A ferrymaster with a secret.")).toBeVisible();

  const campaignUrl = page.url().replace(/\/items\/[^/]+$/, "");
  await page.getByRole("button", { name: "Source" }).click();
  const source = page.getByLabel("Complete canonical Markdown");
  await source.fill(`${await source.inputValue()}\nHuman ferrymaster.`);
  await page.getByRole("button", { name: "Save Markdown revision" }).click();
  await expect(page.getByText("Saved as a new Markdown revision.")).toBeVisible();

  await page.goto(campaignUrl);
  await expect(page.getByRole("link", { name: "Mara Venn" }).first()).toBeVisible();
  await page.getByRole("link", { name: "Graph" }).click();
  await expect(page.getByRole("heading", { name: "Knowledge graph" })).toBeVisible();
  await expect(page.getByText("Accessible graph table")).toBeVisible();
  await expect(page.getByText("Overview")).toBeVisible();
  await expect(page.getByRole("button", { name: "Two hops" })).not.toBeVisible();

  const maraHref = await page.getByRole("link", { name: "Mara Venn" }).first().getAttribute("href");
  const maraId = maraHref?.split("/").pop();
  if (!maraId) throw new Error("Mara Venn link did not include an item id");
  await page.goto(`${campaignUrl}/graph?focus_id=${encodeURIComponent(maraId)}`);
  await expect(page.getByRole("button", { name: "Two hops" })).toBeVisible();
  await page.getByRole("button", { name: "Two hops" }).click();
  await expect(page.getByRole("button", { name: "Two hops" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Campaign graph explorer")).toBeVisible();
});
