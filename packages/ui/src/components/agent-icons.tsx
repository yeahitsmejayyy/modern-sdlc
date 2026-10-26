import * as React from "react";

// The handful of icons the agent widget needs, drawn inline (Lucide's shapes)
// rather than adding an icon library for six glyphs.

type IconProps = React.ComponentProps<"svg">;

function Icon({ children, ...props }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      {children}
    </svg>
  );
}

const AudioLinesIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M2 10v3M6 6v11M10 3v18M14 8v7M18 5v13M22 10v3" />
  </Icon>
);

const MicIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 19v3M19 10v2a7 7 0 0 1-14 0v-2" />
    <rect x="9" y="2" width="6" height="13" rx="3" />
  </Icon>
);

const MicOffIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 19v3M15 9.34V5a3 3 0 0 0-5.68-1.33M16.95 16.95A7 7 0 0 1 5 12v-2M18.89 13.23A7 7 0 0 0 19 12v-2M9 9v3a3 3 0 0 0 5.12 2.12M2 2l20 20" />
  </Icon>
);

const PhoneOffIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M10.1 13.9a14 14 0 0 0 3.732 2.668 1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2 18 18 0 0 1-12.728-5.272" />
    <path d="M22 2 2 22" />
    <path d="M4.76 13.582A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 .244.473" />
  </Icon>
);

const RotateCcwIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8M3 3v5h5" />
  </Icon>
);

const XIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M18 6 6 18M6 6l12 12" />
  </Icon>
);

const ArrowUpIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="m5 12 7-7 7 7M12 19V5" />
  </Icon>
);

export { ArrowUpIcon, AudioLinesIcon, MicIcon, MicOffIcon, PhoneOffIcon, RotateCcwIcon, XIcon };
