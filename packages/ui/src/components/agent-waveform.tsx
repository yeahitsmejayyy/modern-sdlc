import * as React from "react";

import { cn } from "../utils";

export const WAVEFORM_BARS = 24;

/** Turns an audio analyser's frequency bins into `count` bars, 0 to 1, mirrored from the middle out. */
export function toBars(bins: Uint8Array, count = WAVEFORM_BARS) {
  const half = Math.ceil(count / 2);
  // Speech lives in the lower part of the spectrum; ignore the top half of the bins.
  const usable = Math.max(1, Math.floor(bins.length / 2));
  const size = Math.max(1, Math.floor(usable / half));
  const side = Array.from({ length: half }, (_, i) => {
    let sum = 0;
    for (let j = 0; j < size; j++) sum += bins[i * size + j] ?? 0;
    return Math.min(1, sum / size / 200);
  });
  return [...side.slice().reverse(), ...side].slice(0, count);
}

type AgentWaveformProps = Omit<React.ComponentProps<"div">, "children"> & {
  /** Bar heights, 0 to 1, from the live audio; empty draws a flat line. */
  bars: number[];
  /** The agent is talking: cyan. Otherwise the person's voice: the foreground colour. */
  speaking?: boolean;
};

/**
 * The call screen's waveform: rounded bars that rise and fall with whoever is
 * talking, cyan while it's the agent. A minimum height keeps silence visible as a
 * line. Decorative: the status text says the same thing in words.
 */
function AgentWaveform({ bars, speaking, className, ...props }: AgentWaveformProps) {
  const values = Array.from({ length: WAVEFORM_BARS }, (_, i) => bars[i] ?? 0);
  return (
    <div aria-hidden className={cn("flex h-28 items-center justify-center gap-[5px]", className)} {...props}>
      {values.map((v, i) => (
        <span
          key={i}
          className={cn(
            "w-[5px] rounded-full transition-[height] duration-100 ease-out motion-reduce:transition-none",
            speaking ? "bg-cyan-400" : "bg-foreground",
          )}
          style={{ height: `${Math.round(6 + Math.min(1, Math.max(0, v)) * 106)}px` }}
        />
      ))}
    </div>
  );
}

export { AgentWaveform };
