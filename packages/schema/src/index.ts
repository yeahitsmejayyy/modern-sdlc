// The API contract, as TypeScript types.
// These mirror the Pydantic models in apps/server/pings.py and auth.py — change both together.
// Timestamps arrive as ISO-8601 strings.

export type PingResponse = {
  message: string;
  servedAt: string;
  commit: string;
  count: number;
};

export type PingRecord = {
  id: number;
  createdAt: string;
  commit: string;
};

export type Health = {
  ok: boolean;
  db: boolean;
  commit: string;
};

// Auth: these mirror the models in apps/server/auth.py.

export type AuthMe = {
  authenticated: boolean;
};

// The body of a 429 from POST /api/auth/login while an IP is locked out.
export type AuthLocked = {
  detail: { error: "locked"; retryAfter: number };
};

export type AuthEvent = {
  id: number;
  createdAt: string;
  event: "login_ok" | "login_failed" | "login_locked" | "logout" | "api_token_rejected" | "agent_session";
  ip: string | null;
  userAgent: string | null;
};

// POST /api/agent/session: a short-lived pass to start one conversation with the
// voice agent. Mirrors apps/server/agent.py.
export type AgentSessionRequest = { mode: "voice" | "chat" };
export type AgentSessionPass = { token: string } | { signedUrl: string };
