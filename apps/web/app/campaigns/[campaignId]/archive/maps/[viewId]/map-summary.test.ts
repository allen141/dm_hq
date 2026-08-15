import { expect, test } from "vitest";

import { markdownExcerpt } from "@/lib/map-summary";

test("turns canonical Markdown into an inert plain-text summary", () => {
  const markdown = `---
title: The Lantern
private: true
---

# The [Lantern](dmhq://item/123)

![A brass lantern](https://example.test/lantern.png) **burns** beside <em>old stone</em> &amp; water.`;

  expect(markdownExcerpt(markdown)).toBe("The Lantern A brass lantern burns beside old stone & water.");
});

test("bounds long summaries without cutting a nearby word", () => {
  expect(markdownExcerpt("One two three four five six seven", 20)).toBe("One two three…");
  expect(markdownExcerpt("A very longwordwithoutspaces", 10)).toBe("A very…");
  expect(markdownExcerpt("anything", 1)).toBe("…");
});
