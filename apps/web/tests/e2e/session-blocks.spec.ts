import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

test("standard blocks share content across layouts and keep play state local", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Username").fill("dm");
  await page.getByLabel("Password").fill("password");
  await page.getByRole("button", { name: "Open workspace" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  const csrf = await page.evaluate(
    () =>
      document.cookie
        .split("; ")
        .find((value) => value.startsWith("csrftoken="))!
        .split("=")[1],
  );
  const headers = { "X-CSRFToken": csrf };
  const campaignResponse = await page.request.post("/api/v1/campaigns", {
    headers,
    data: { name: `Blocks fixture ${Date.now()}` },
  });
  expect(campaignResponse.ok()).toBeTruthy();
  const campaign = await campaignResponse.json();
  const sceneId = randomUUID();
  const encounterId = randomUUID();
  const beatId = randomUUID();
  const metadata = {
    document_type: "archive_item",
    schema_version: 1,
    id: randomUUID(),
    campaign_id: campaign.id,
    kind: "note",
    title: "Example session",
    status: "draft",
    custom: { retained: true },
    blocks: {
      version: 1,
      entries: [
        {
          id: randomUUID(),
          type: "story",
          title: "Find the courier",
          data: {
            summary: "A missing delivery",
            beats: [
              {
                id: beatId,
                title: "At the harbor",
                goal: "Find a witness",
                scene_ids: [sceneId],
                encounter_ids: [encounterId],
              },
            ],
          },
        },
        {
          id: sceneId,
          type: "scene",
          title: "Harbor",
          data: { mood: "Quiet and foggy", sights: "A single lantern" },
        },
        {
          id: randomUUID(),
          type: "character",
          title: "Example courier",
          data: {
            ruleset: "dnd_5e_2014",
            ac: 12,
            max_hp: 10,
            attacks: [{ id: randomUUID(), name: "Staff", damage: "1d6" }],
            reactions: [
              { id: randomUUID(), name: "Parry", effect: "Deflect a blow" },
            ],
          },
        },
        {
          id: encounterId,
          type: "conversation",
          title: "Dock testimony",
          data: {
            topics: [
              {
                id: randomUUID(),
                label: "Delivery",
                entries: [{ id: randomUUID(), text: "Meet at dusk" }],
              },
            ],
            evidence: [
              {
                id: randomUUID(),
                title: "Ledger",
                content: "A missing name",
                required: true,
                fallback: "The witness points to the gap",
              },
            ],
          },
        },
        {
          id: randomUUID(),
          type: "challenge",
          title: "Decode the note",
          data: {
            mode: "individual_checks",
            checks: [
              {
                id: randomUUID(),
                approach: "Read carefully",
                dc: 12,
                effect: "Recognize the name",
              },
            ],
          },
        },
      ],
    },
  };
  const created = await page.request.post(
    `/api/v1/campaigns/${campaign.id}/items`,
    {
      headers,
      data: {
        kind: "note",
        markdown: `---\n${JSON.stringify(metadata)}\n---\n\nSupplementary prose`,
      },
    },
  );
  expect(created.ok()).toBeTruthy();
  const item = await created.json();
  await page.goto(`/campaigns/${campaign.id}/archive/items/${item.id}`);
  await expect(
    page.getByText("Scene workspace", { exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByText("Quiet and foggy", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Compact outline", exact: true })
    .focus();
  await page.keyboard.press("Space");
  await expect(
    page.getByRole("button", { name: "Compact outline" }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Scene workspace" }).click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.getByLabel("Current HP for Example courier").fill("6");
  await page.getByRole("button", { name: "Draw unused line" }).click();
  await expect(page.getByText("1 unused", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Mark used", exact: true }).click();
  await expect(page.getByText("0 unused", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByText("1 unused", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Mark revealed", exact: true })
    .click();
  await page.reload();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.getByLabel("Current HP for Example courier")).toHaveValue(
    "6",
  );
  await expect(
    page.getByRole("button", { name: "Mark unrevealed" }),
  ).toBeVisible();
  const unchanged = await (
    await page.request.get(`/api/v1/items/${item.id}`)
  ).json();
  expect(unchanged.version).toBe(item.version);
  expect(unchanged.markdown).toBe(item.markdown);
  for (const width of [1200, 820, 375]) {
    await page.setViewportSize({ width, height: 1000 });
    const reader = page.getByRole("region", {
      name: "Standard session blocks",
    });
    await expect(reader).toBeVisible();
    expect(
      await reader.evaluate(
        (element) => element.scrollWidth <= element.clientWidth + 1,
      ),
    ).toBeTruthy();
  }
  await page.setViewportSize({ width: 1200, height: 1000 });
  for (const theme of [
    "emberkeep",
    "astral",
    "verdant",
    "scriptorium",
    "cartographer",
  ]) {
    // Apply the established theme cookie through a fresh page load.
    await page
      .context()
      .addCookies([
        { name: "dmhq_theme", value: theme, url: new URL(page.url()).origin },
      ]);
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await expect(
      page.getByText("Quiet and foggy", { exact: true }),
    ).toBeVisible();
  }
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByText("Scene · Harbor", { exact: true }).click();
  await page.getByLabel("Mood / atmosphere").fill("Bright and breezy");
  await page.getByRole("button", { name: "Save Markdown revision" }).click();
  await expect(
    page.getByText("Saved as a new Markdown revision."),
  ).toBeVisible();
  await expect(
    page.getByText("Bright and breezy", { exact: true }),
  ).toBeVisible();
  const changed = await (
    await page.request.get(`/api/v1/items/${item.id}`)
  ).json();
  expect(changed.metadata.custom).toEqual({ retained: true });
  expect(changed.version).toBe(2);
  await page.getByRole("button", { name: "Source", exact: true }).click();
  const source = page.getByLabel("Complete canonical Markdown");
  await source.fill("---\ntitle: [\n---\nBody");
  await expect(
    page.getByRole("alert").filter({ hasText: "Invalid frontmatter" }),
  ).toContainText("Invalid frontmatter");
  await expect(
    page.getByRole("button", { name: "Save Markdown revision" }),
  ).toBeDisabled();
  await source.fill(changed.markdown);
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByLabel("Player-safe prose")).toHaveValue("");
  await expect(
    page.getByRole("button", { name: "Publish snapshot" }),
  ).toBeDisabled();
});
