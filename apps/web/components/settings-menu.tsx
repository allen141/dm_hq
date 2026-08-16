"use client";

import {
  FloatingFocusManager,
  FloatingPortal,
  autoUpdate,
  flip,
  offset,
  shift,
  useClick,
  useDismiss,
  useFloating,
  useInteractions,
  useRole,
} from "@floating-ui/react";
import { useState } from "react";
import { ThemeSwitcher } from "@/components/theme-switcher";

type SettingsMenuProps = Readonly<{
  className?: string;
}>;

export function SettingsMenu({ className }: SettingsMenuProps) {
  const [open, setOpen] = useState(false);
  const { context, floatingStyles, refs } = useFloating({
    open,
    onOpenChange: setOpen,
    placement: "bottom-end",
    whileElementsMounted: autoUpdate,
    middleware: [offset(8), flip(), shift({ padding: 12 })],
  });
  const click = useClick(context);
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: "dialog" });
  const { getFloatingProps, getReferenceProps } = useInteractions([click, dismiss, role]);

  return (
    <div className={`settings-menu${className ? ` ${className}` : ""}`}>
      <button
        ref={(node) => refs.setReference(node)}
        type="button"
        className="secondary settings-menu-trigger"
        aria-expanded={open}
        {...getReferenceProps()}
      >
        <span aria-hidden="true">⚙</span>
        <span>Settings</span>
      </button>
      <FloatingPortal>
        {open && (
          <FloatingFocusManager context={context} modal={false} initialFocus={-1} returnFocus>
            <section
              ref={(node) => refs.setFloating(node)}
              style={floatingStyles}
              className="settings-menu-panel"
              aria-label="Settings"
              {...getFloatingProps()}
            >
              <div className="settings-menu-heading">
                <span className="eyebrow">Appearance</span>
                <strong>Workspace theme</strong>
              </div>
              <ThemeSwitcher className="theme-switcher settings-menu-theme" label="Theme" />
            </section>
          </FloatingFocusManager>
        )}
      </FloatingPortal>
    </div>
  );
}

export default SettingsMenu;
