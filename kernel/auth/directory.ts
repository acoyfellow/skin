import { DurableObject } from "cloudflare:workers";
import type { RouteKind } from "./route";
import { DAY_MS, fillDays, type InstanceStats, modelLabel, routeLabel, STATS_DAYS, type Tally, topTallies, type UsageEvent } from "../stats";

export type Grant = {
  readonly owner: string;
  readonly email: string | null;
  readonly accountId: string;
  readonly accountName: string;
  readonly accessToken: string;
  readonly refreshToken: string | null;
  readonly expiresAt: number;
  readonly scope: string;
  readonly routeKind: RouteKind;
  readonly gateway: string | null;
  readonly model: string | null;
};

type GrantRow = {
  owner: string;
  email: string | null;
  account_id: string;
  account_name: string;
  access_token: string;
  refresh_token: string | null;
  expires_at: number;
  scope: string;
  route_kind: string | null;
  gateway: string | null;
  model: string | null;
};

const ROUTE_COLUMNS = ["route_kind TEXT", "gateway TEXT", "model TEXT"];

export const DIRECTORY_NAME = "directory";

export class Directory extends DurableObject<Record<string, never>> {
  constructor(ctx: DurableObjectState, env: Record<string, never>) {
    super(ctx, env);
    ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS grants (owner TEXT PRIMARY KEY, email TEXT, account_id TEXT NOT NULL, account_name TEXT NOT NULL, access_token TEXT NOT NULL, refresh_token TEXT, expires_at INTEGER NOT NULL, scope TEXT NOT NULL, updated_at INTEGER NOT NULL)",
    );
    ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, owner TEXT NOT NULL, expires_at INTEGER NOT NULL)",
    );

    ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS usage (at INTEGER NOT NULL, person TEXT NOT NULL, event TEXT NOT NULL, label TEXT NOT NULL DEFAULT '')",
    );
    ctx.storage.sql.exec("CREATE INDEX IF NOT EXISTS usage_at ON usage (at)");

    const present = new Set(ctx.storage.sql.exec<{ name: string }>("PRAGMA table_info(grants)").toArray().map((column) => column.name));

    for (const column of ROUTE_COLUMNS) if (!present.has(column.split(" ")[0] ?? "")) ctx.storage.sql.exec(`ALTER TABLE grants ADD COLUMN ${column}`);
  }

  saveGrant(grant: Grant): void {
    this.ctx.storage.sql.exec(
      "INSERT INTO grants (owner, email, account_id, account_name, access_token, refresh_token, expires_at, scope, route_kind, gateway, model, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(owner) DO UPDATE SET email = excluded.email, account_id = excluded.account_id, account_name = excluded.account_name, access_token = excluded.access_token, refresh_token = COALESCE(excluded.refresh_token, grants.refresh_token), expires_at = excluded.expires_at, scope = excluded.scope, route_kind = excluded.route_kind, gateway = excluded.gateway, model = excluded.model, updated_at = excluded.updated_at",
      grant.owner,
      grant.email,
      grant.accountId,
      grant.accountName,
      grant.accessToken,
      grant.refreshToken,
      grant.expiresAt,
      grant.scope,
      grant.routeKind,
      grant.gateway,
      grant.model,
      Date.now(),
    );
  }

  grantFor(owner: string): Grant | null {
    const row = this.ctx.storage.sql
      .exec<GrantRow>("SELECT * FROM grants WHERE owner = ?", owner)
      .toArray()[0];

    return row === undefined
      ? null
      : {
          owner: row.owner,
          email: row.email,
          accountId: row.account_id,
          accountName: row.account_name,
          accessToken: row.access_token,
          refreshToken: row.refresh_token,
          expiresAt: row.expires_at,
          scope: row.scope,
          routeKind: row.route_kind === "gateway" ? "gateway" : "workers-ai",
          gateway: row.gateway,
          model: row.model,
        };
  }

  dropGrant(owner: string): void {
    this.ctx.storage.sql.exec("DELETE FROM grants WHERE owner = ?", owner);
    this.ctx.storage.sql.exec("DELETE FROM sessions WHERE owner = ?", owner);
  }

  openSession(id: string, owner: string, expiresAt: number): void {
    this.ctx.storage.sql.exec(
      "INSERT OR REPLACE INTO sessions (id, owner, expires_at) VALUES (?, ?, ?)",
      id,
      owner,
      expiresAt,
    );
  }

  sessionOwner(id: string): string | null {
    return (
      this.ctx.storage.sql
        .exec<{ owner: string }>(
          "SELECT owner FROM sessions WHERE id = ? AND expires_at > ?",
          id,
          Date.now(),
        )
        .toArray()[0]?.owner ?? null
    );
  }

  closeSession(id: string): void {
    this.ctx.storage.sql.exec("DELETE FROM sessions WHERE id = ?", id);
  }

  record(person: string, event: UsageEvent, label = ""): void {
    this.ctx.storage.sql.exec("INSERT INTO usage (at, person, event, label) VALUES (?, ?, ?, ?)", Date.now(), person, event, label.slice(0, 80));
  }

  backfill(person: string, past: ReadonlyArray<{ readonly at: number; readonly event: UsageEvent }>): void {
    for (const row of past) this.ctx.storage.sql.exec("INSERT INTO usage (at, person, event, label) VALUES (?, ?, ?, '')", row.at, person, row.event);
  }

  stats(now = Date.now()): InstanceStats {
    const sql = this.ctx.storage.sql;
    const count = (event: UsageEvent) => sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM usage WHERE event = ?", event).toArray()[0]?.n ?? 0;
    const activeSince = (since: number) => sql.exec<{ n: number }>("SELECT COUNT(DISTINCT person) AS n FROM usage WHERE at >= ?", since).toArray()[0]?.n ?? 0;
    const span = sql.exec<{ firstAt: number | null; lastAt: number | null; people: number }>("SELECT MIN(at) AS firstAt, MAX(at) AS lastAt, COUNT(DISTINCT person) AS people FROM usage").toArray()[0];
    const grants = sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM grants").toArray()[0]?.n ?? 0;

    const counted = new Map(
      sql
        .exec<{ day: string; messages: number; people: number }>(
          "SELECT strftime('%Y-%m-%d', at / 1000, 'unixepoch') AS day, SUM(CASE WHEN event = 'message_sent' THEN 1 ELSE 0 END) AS messages, COUNT(DISTINCT person) AS people FROM usage WHERE at >= ? GROUP BY day",
          now - STATS_DAYS * DAY_MS,
        )
        .toArray()
        .map((row) => [row.day, { messages: row.messages, people: row.people }] as const),
    );

    const tallies = (event: UsageEvent, label: (raw: string) => string): ReadonlyArray<Tally> =>
      topTallies(sql.exec<{ label: string; n: number }>("SELECT label, COUNT(*) AS n FROM usage WHERE event = ? GROUP BY label", event).toArray().map((row) => ({ label: label(row.label), count: row.n })));

    const choices = sql.exec<{ model: string | null; route_kind: string | null; gateway: string | null }>("SELECT model, route_kind, gateway FROM grants").toArray();

    return {
      people: Math.max(grants, span?.people ?? 0),
      activeToday: activeSince(now - DAY_MS),
      active7d: activeSince(now - 7 * DAY_MS),
      chats: count("chat_started"),
      messages: count("message_sent"),
      shipsLive: count("ship_live"),
      shipsBlocked: count("ship_blocked"),
      rollbacks: count("rollback"),
      toolCalls: count("tool_call"),
      firstAt: span?.firstAt ?? null,
      lastAt: span?.lastAt ?? null,
      perDay: fillDays(now, counted),
      models: tallies("message_sent", modelLabel),
      routes: topTallies(choices.map((row) => ({ label: routeLabel(row.route_kind === "gateway" ? `gateway:${row.gateway ?? ""}` : row.route_kind ?? ""), count: 1 }))),
      tools: tallies("tool_call", (raw) => raw),
      at: now,
    };
  }
}
