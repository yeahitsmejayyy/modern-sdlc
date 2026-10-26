import * as React from "react";

import { cn } from "../utils";
import { Button } from "./button";
import {
  ArrowUpIcon,
  AudioLinesIcon,
  MicIcon,
  MicOffIcon,
  PhoneOffIcon,
  RotateCcwIcon,
  XIcon,
} from "./agent-icons";
import { AgentWaveform } from "./agent-waveform";

export type AgentStatus = "idle" | "connecting" | "live" | "ended" | "error";
export type AgentMode = "chat" | "voice";
export type AgentError = "mic" | "busy" | "failed";
export type AgentMessage = { id: string; role: "agent" | "user"; text: string };

/** Every string the widget shows, so each app can give its agent its own voice. */
export type AgentContent = {
  /** The launcher's label (desktop) and accessible name. */
  launcher: string;
  title: string;
  subtitle: string;
  /** The empty conversation, before anything is said. */
  greeting: { title: string; body: string };
  /** Starter chips: tapping one sends it as the first message. */
  suggestions: string[];
  /** Small print under the input. */
  note: string;
  input: { placeholder: string; send: string };
  voice: {
    start: string;
    onCall: string;
    connecting: string;
    listening: string;
    speaking: string;
    muted: string;
    mute: string;
    unmute: string;
    hangUp: string;
  };
  controls: { close: string; end: string; restart: string };
  thinking: string;
  ended: { title: string; body: string };
  errors: { mic: string; busy: string; failed: string; retry: string };
};

export type AgentWidgetProps = Omit<React.ComponentProps<"section">, "content"> & {
  content: AgentContent;
  status: AgentStatus;
  mode: AgentMode;
  messages: AgentMessage[];
  /** Chat: waiting for the agent's reply. */
  thinking?: boolean;
  /** Voice: the agent is talking rather than listening. */
  speaking?: boolean;
  muted?: boolean;
  /** Voice: live waveform bars, 0 to 1. */
  bars?: number[];
  error?: AgentError;
  onSend?: (text: string) => void;
  onTalk?: () => void;
  onHangUp?: () => void;
  onMute?: (muted: boolean) => void;
  onEnd?: () => void;
  onRestart?: () => void;
  onRetry?: () => void;
  onClose?: () => void;
};

const mono = "font-mono text-xs leading-[1.3]";

/** The agent's round mark: the waveform glyph on the foreground colour. */
function Mark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "bg-foreground text-background grid size-7 flex-none place-items-center rounded-full",
        className,
      )}
    >
      <AudioLinesIcon className="size-3.5" />
    </span>
  );
}

/**
 * The agent's panel, in two modes that look and feel different. Chat is a quiet
 * messenger: the person's messages in bubbles, the agent's as plain text beside
 * its mark, a typing indicator, and a clear way into a call. Voice is a call
 * screen, always dark: a live waveform (cyan while the agent speaks), the status
 * in large type, the latest line as a caption, and round mute and hang-up
 * buttons. Hanging up returns to chat with the thread kept.
 *
 * Presentational only: the app wires it to a voice agent. A card above the
 * launcher on desktop, full screen on phones.
 */
function AgentWidget(props: AgentWidgetProps) {
  const onCall = props.mode === "voice" && (props.status === "live" || props.status === "connecting");
  return onCall ? <CallScreen {...props} /> : <Messenger {...props} />;
}

function Frame({ dark, className, children, ...props }: React.ComponentProps<"section"> & { dark?: boolean }) {
  return (
    <section
      role="dialog"
      className={cn(
        "bg-card text-card-foreground fixed inset-0 z-[70] flex flex-col",
        "md:inset-auto md:right-8 md:bottom-24 md:h-[min(600px,calc(100dvh-128px))] md:w-[392px] md:overflow-hidden md:rounded-xl md:border md:shadow-xl",
        // The call screen is dark in either theme: .dark re-scopes the theme's colour variables.
        dark && "dark bg-background text-foreground",
        className,
      )}
      {...props}
    >
      {children}
    </section>
  );
}

function CallScreen({
  content,
  status,
  messages,
  speaking,
  muted,
  bars = [],
  onMute,
  onHangUp,
  onClose,
  className,
}: AgentWidgetProps) {
  const live = status === "live";
  const state = !live
    ? content.voice.connecting
    : muted
      ? content.voice.muted
      : speaking
        ? content.voice.speaking
        : content.voice.listening;
  const caption = messages.at(-1);
  return (
    <Frame dark aria-label={`${content.title} · ${content.voice.onCall}`} className={className}>
      <header className="flex items-center gap-3 px-5 pt-[calc(16px+env(safe-area-inset-top))] pb-2 md:pt-4">
        <Mark />
        <p className={cn(mono, "text-muted-foreground flex flex-1 items-center gap-1.5")}>
          <span
            aria-hidden
            className={cn("size-1.5 rounded-full", live ? "bg-red-500 motion-safe:animate-pulse" : "bg-muted-foreground")}
          />
          {content.title} · {content.voice.onCall}
        </p>
        <Button variant="ghost" size="icon" aria-label={content.controls.close} onClick={onClose}>
          <XIcon />
        </Button>
      </header>

      <div className="grid flex-1 content-center justify-items-center gap-6 px-6 text-center">
        <AgentWaveform bars={live && !muted ? bars : []} speaking={speaking} />
        <p aria-live="polite" className="text-[26px] leading-tight font-bold tracking-[-0.02em]">
          {state}
        </p>
        <p className="text-muted-foreground line-clamp-3 min-h-[4.5em] max-w-[30ch] text-[15px]/[1.5]">
          {caption && (caption.role === "agent" ? `“${caption.text}”` : caption.text)}
        </p>
      </div>

      <footer className="flex items-start justify-center gap-10 px-6 pt-2 pb-[calc(28px+env(safe-area-inset-bottom))] md:pb-7">
        <div className="grid justify-items-center gap-2">
          <button
            type="button"
            aria-pressed={muted}
            aria-label={muted ? content.voice.unmute : content.voice.mute}
            disabled={!live}
            onClick={() => onMute?.(!muted)}
            className="focus-visible:ring-ring/50 aria-pressed:bg-foreground aria-pressed:text-background grid size-16 place-items-center rounded-full border outline-none focus-visible:ring-[3px] disabled:opacity-50"
          >
            {muted ? <MicOffIcon className="size-6" /> : <MicIcon className="size-6" />}
          </button>
          <span aria-hidden className={cn(mono, "text-muted-foreground")}>
            {muted ? content.voice.unmute : content.voice.mute}
          </span>
        </div>
        <div className="grid justify-items-center gap-2">
          <button
            type="button"
            aria-label={content.voice.hangUp}
            onClick={onHangUp}
            className="focus-visible:ring-ring/50 grid size-16 place-items-center rounded-full bg-red-600 text-white outline-none focus-visible:ring-[3px]"
          >
            <PhoneOffIcon className="size-6" />
          </button>
          <span aria-hidden className={cn(mono, "text-muted-foreground")}>
            {content.voice.hangUp}
          </span>
        </div>
      </footer>
    </Frame>
  );
}

function Messenger({
  content,
  status,
  messages,
  thinking,
  error,
  onSend,
  onTalk,
  onEnd,
  onRestart,
  onRetry,
  onClose,
  className,
}: AgentWidgetProps) {
  const fresh = messages.length === 0 && (status === "idle" || status === "connecting");
  const [draft, setDraft] = React.useState("");
  const thread = React.useRef<HTMLDivElement>(null);

  // Keep the newest message in view.
  React.useEffect(() => {
    const el = thread.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, thinking, status]);

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    onSend?.(text);
    setDraft("");
  };

  return (
    <Frame aria-label={content.title} className={className}>
      <header className="flex items-center gap-3 border-b px-4 pt-[calc(12px+env(safe-area-inset-top))] pb-3 md:pt-3">
        <Mark className="size-9 [&_svg]:size-4.5" />
        <div className="grid min-w-0 flex-1">
          <h2 className="text-base leading-tight font-bold">{content.title}</h2>
          <p className={cn(mono, "text-muted-foreground flex items-center gap-1.5 truncate")}>
            {status === "live" && <span aria-hidden className="size-1.5 rounded-full bg-emerald-500" />}
            {content.subtitle}
          </p>
        </div>
        {status === "live" && (
          <Button variant="outline" size="sm" onClick={onEnd}>
            {content.controls.end}
          </Button>
        )}
        <Button variant="ghost" size="icon" aria-label={content.controls.close} onClick={onClose}>
          <XIcon />
        </Button>
      </header>

      <div ref={thread} className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-5">
        {fresh && (
          <div className="grid gap-2 pt-6">
            <p className="text-[22px] leading-tight font-bold tracking-[-0.01em]">{content.greeting.title}</p>
            <p className="text-muted-foreground text-[15px]/[1.5]">{content.greeting.body}</p>
          </div>
        )}
        {messages.map((m) =>
          m.role === "user" ? (
            <p
              key={m.id}
              className="bg-foreground text-background ml-auto max-w-[85%] rounded-2xl rounded-br-md px-3.5 py-2.5 text-[15px]/[1.45] whitespace-pre-wrap"
            >
              {m.text}
            </p>
          ) : (
            <div key={m.id} className="flex items-start gap-2.5">
              <Mark className="mt-0.5" />
              <p className="min-w-0 text-[15px]/[1.5] whitespace-pre-wrap">{m.text}</p>
            </div>
          ),
        )}
        {thinking && (
          <div className="flex items-center gap-2.5" aria-label={content.thinking} role="status">
            <Mark />
            <span className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="bg-muted-foreground size-1.5 rounded-full motion-safe:animate-bounce"
                  style={{ animationDelay: `${i * 140}ms` }}
                />
              ))}
            </span>
          </div>
        )}
        {status === "ended" && (
          <div className="grid justify-items-start gap-2 rounded-lg border p-4">
            <p className="text-[17px] leading-tight font-bold">{content.ended.title}</p>
            <p className="text-muted-foreground text-sm">{content.ended.body}</p>
            <Button variant="outline" size="sm" onClick={onRestart} className="mt-1">
              <RotateCcwIcon />
              {content.controls.restart}
            </Button>
          </div>
        )}
        {status === "error" && (
          <div className="grid justify-items-start gap-2">
            <p role="alert" className="text-destructive text-sm">
              {content.errors[error ?? "failed"]}
            </p>
            {error !== "mic" && (
              <Button variant="outline" size="sm" onClick={onRetry}>
                <RotateCcwIcon />
                {content.errors.retry}
              </Button>
            )}
          </div>
        )}
      </div>

      <footer className="grid gap-2.5 px-4 pt-2 pb-[calc(12px+env(safe-area-inset-bottom))] md:pb-3">
        {fresh && status === "idle" && (
          <div className="flex flex-wrap gap-2">
            {content.suggestions.map((s) => (
              <Button
                key={s}
                variant="outline"
                size="sm"
                className="rounded-full font-mono text-xs font-normal"
                onClick={() => onSend?.(s)}
              >
                {s}
              </Button>
            ))}
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="focus-within:border-ring focus-within:ring-ring/50 grid gap-1 rounded-2xl border p-2 focus-within:ring-[3px]"
        >
          <textarea
            id="agent-message"
            rows={1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // Enter sends; Shift+Enter starts a new line.
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={content.input.placeholder}
            aria-label={content.input.placeholder}
            disabled={status === "ended"}
            className="placeholder:text-muted-foreground max-h-32 min-h-11 resize-none bg-transparent px-2 py-1.5 text-[15px] outline-none disabled:opacity-50"
          />
          <div className="flex items-center justify-between">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onTalk}
              disabled={status === "ended" || status === "connecting"}
              className="font-mono text-xs font-normal"
            >
              <AudioLinesIcon />
              {content.voice.start}
            </Button>
            <Button
              type="submit"
              size="icon"
              aria-label={content.input.send}
              disabled={status === "ended" || !draft.trim()}
              className="size-8 rounded-full"
            >
              <ArrowUpIcon />
            </Button>
          </div>
        </form>
        <p className={cn(mono, "text-muted-foreground")}>{content.note}</p>
      </footer>
    </Frame>
  );
}

export { AgentWidget };
