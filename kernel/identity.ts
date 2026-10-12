import { Effect, Option, Schema } from "effect";
import type { ConversationName } from "../shared/protocol";

export const UserId = Schema.String.check(Schema.isPattern(/^u[0-9a-f]{20}$/)).pipe(Schema.brand("UserId"));

export type UserId = typeof UserId.Type;

export type Person = { readonly user: UserId; readonly email: Option.Option<string> };

const OWNER_SEPARATOR = "~";

const hex = (buffer: ArrayBuffer) => [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");

export const userIdOf = (subject: string): Effect.Effect<UserId> =>
	Effect.promise(() => crypto.subtle.digest("SHA-256", new TextEncoder().encode(`skin:${subject}`))).pipe(Effect.map((digest) => UserId.make(`u${hex(digest).slice(0, 20)}`)));

export const agentName = (user: UserId, conversation: ConversationName): string => `${user}${OWNER_SEPARATOR}${conversation}`;

export const ownerOfAgent = (objectName: string | undefined): Option.Option<UserId> =>
	Schema.decodeUnknownOption(UserId)(objectName?.split(OWNER_SEPARATOR)[0]);

const DEV_USER = /^[a-z0-9-]{1,32}$/;

export const DEV_USER_HEADER = "X-Dev-User";

export const devSubject = (request: Request): string => {
	const asked = request.headers.get(DEV_USER_HEADER) ?? "";

	return `dev:${DEV_USER.test(asked) ? asked : "local"}`;
};
