// The API contract, as TypeScript types.
// These mirror the Pydantic models in apps/server/main.py — change both together.
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
