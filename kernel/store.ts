import { WorkerEntrypoint } from "cloudflare:workers";
import type { Body } from "./body";

export type StoreEnv = { readonly BODY: DurableObjectNamespace<Body> };

export const BODY_NAME = "body";

export class BodyStore extends WorkerEntrypoint<StoreEnv> {
	private body() {
		return this.env.BODY.getByName(BODY_NAME);
	}

	get(key: string): Promise<string | null> {
		return this.body().kvGet(key);
	}

	put(key: string, value: string): Promise<void> {
		return this.body().kvPut(key, value);
	}

	delete(key: string): Promise<void> {
		return this.body().kvDelete(key);
	}

	list(prefix: string): Promise<ReadonlyArray<string>> {
		return this.body().kvList(prefix);
	}
}
