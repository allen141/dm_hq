"use client";

import { useId } from "react";
import { THEMES, resolveThemeId } from "@/lib/theme";
import { useTheme } from "@/components/theme-provider";

type ThemeSwitcherProps = Readonly<{
  className?: string;
  label?: string;
  selectClassName?: string;
}>;

export function ThemeSwitcher({ className, label = "Theme", selectClassName }: ThemeSwitcherProps) {
  const { theme, setTheme } = useTheme();
  const selectId = useId();

  return (
    <label className={className} htmlFor={selectId} data-theme-switcher="">
      <span>{label}</span>
      <select
        id={selectId}
        className={selectClassName}
        name="dmhq-theme"
        value={theme.id}
        title={theme.description}
        onChange={(event) => setTheme(resolveThemeId(event.currentTarget.value))}
      >
        {THEMES.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
      </select>
    </label>
  );
}

export default ThemeSwitcher;
