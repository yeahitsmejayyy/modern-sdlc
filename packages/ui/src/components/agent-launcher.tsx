import * as React from "react";

import { cn } from "../utils";
import { AudioLinesIcon, XIcon } from "./agent-icons";

type AgentLauncherProps = Omit<React.ComponentProps<"button">, "children"> & {
  /** e.g. "ask edith": the label on desktop and the accessible name on phones. */
  label: string;
  closeLabel: string;
  open?: boolean;
};

/**
 * The floating button that opens the agent, fixed to the bottom right. Desktop:
 * a pill with the label. Phones: a round icon button. Shows a close icon while
 * the panel is open.
 */
function AgentLauncher({ label, closeLabel, open, className, ...props }: AgentLauncherProps) {
  return (
    <button
      type="button"
      aria-label={open ? closeLabel : label}
      aria-expanded={open}
      className={cn(
        "bg-foreground text-background fixed right-4 bottom-[calc(16px+env(safe-area-inset-bottom))] z-50 flex size-13 items-center justify-center gap-2 rounded-full shadow-lg outline-none",
        "focus-visible:ring-ring/50 focus-visible:ring-[3px]",
        "md:right-8 md:bottom-8 md:h-12 md:w-auto md:px-4.5",
        className,
      )}
      {...props}
    >
      {open ? <XIcon className="size-5" /> : <AudioLinesIcon className="size-5" />}
      <span className="hidden font-mono text-sm md:inline">{open ? closeLabel : label}</span>
    </button>
  );
}

export { AgentLauncher };
