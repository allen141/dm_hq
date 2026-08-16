export type StyleTheme = {
  slug: string;
  index: string;
  name: string;
  subtitle: string;
  description: string;
};

export const styleThemes: StyleTheme[] = [
  {
    slug: "emberkeep",
    index: "I",
    name: "Emberkeep",
    subtitle: "The fortified campaign room",
    description: "Blackened iron, warm brass, banked coals, and decisive high-contrast controls.",
  },
  {
    slug: "astral",
    index: "II",
    name: "Astral Codex",
    subtitle: "The high-magic observatory",
    description: "Smoked indigo crystal, moonlit type, and restrained arcs of amethyst and cyan.",
  },
  {
    slug: "verdant",
    index: "III",
    name: "Verdant Ruins",
    subtitle: "The ranger's field archive",
    description: "Forest-black stone, moss wayfinding, aged copper, and an organic but focused rhythm.",
  },
  {
    slug: "scriptorium",
    index: "IV",
    name: "Obsidian Scriptorium",
    subtitle: "The occult campaign library",
    description: "Charcoal leather, wine-red bookmarks, antique gold rules, and intimate bookish typography.",
  },
  {
    slug: "cartographer",
    index: "V",
    name: "Night Cartographer",
    subtitle: "The expedition console",
    description: "Deep ocean ink, brass survey marks, cool teal signals, and the clearest path to production.",
  },
];

export function findStyleTheme(slug: string) {
  return styleThemes.find((theme) => theme.slug === slug);
}
