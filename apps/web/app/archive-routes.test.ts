import { describe, expect, test } from "vitest";
import { archiveDocumentHref } from "@/lib/archive-routes";

describe("archiveDocumentHref", () => {
  test("routes campaign documents to the Archive home", () => {
    expect(archiveDocumentHref("campaign-1", "campaign-1", "campaign")).toBe("/campaigns/campaign-1/archive");
  });

  test.each(["item", "archive_item", undefined])("routes %s documents to item pages", (documentType) => {
    expect(archiveDocumentHref("campaign-1", "item-1", documentType)).toBe("/campaigns/campaign-1/archive/items/item-1");
  });
});
