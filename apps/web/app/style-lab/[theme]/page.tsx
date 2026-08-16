import type { Metadata } from "next";
import { notFound } from "next/navigation";
import StyleLab from "@/components/style-lab/style-lab";
import { findStyleTheme, styleThemes } from "../theme-data";

export function generateStaticParams() {
  return styleThemes.map((theme) => ({ theme: theme.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ theme: string }> }): Promise<Metadata> {
  const { theme: slug } = await params;
  const theme = findStyleTheme(slug);
  return {
    title: theme ? `${theme.name} — DM HQ Style Lab` : "DM HQ Style Lab",
    description: theme?.description ?? "Dark fantasy interface studies for DM HQ.",
  };
}

export default async function StyleConceptPage({ params }: { params: Promise<{ theme: string }> }) {
  const { theme: slug } = await params;
  const theme = findStyleTheme(slug);
  if (!theme) notFound();
  return <StyleLab theme={theme} themes={styleThemes} />;
}
