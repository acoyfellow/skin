import { CLOUDFLARE_AI_GATEWAY_MODELS } from "@earendil-works/pi-ai/providers/cloudflare-ai-gateway.models";
import { CLOUDFLARE_WORKERS_AI_MODELS } from "@earendil-works/pi-ai/providers/cloudflare-workers-ai.models";
import { familyOfApi, type GatewayFamily } from "../gateway";

export type ModelOption = { readonly id: string; readonly label: string; readonly family: GatewayFamily; readonly group: string };

const WORKERS_AI_PREFIX = "workers-ai/";

export const FRONTIER_IDS = [
	"claude-opus-5-5",
	"claude-fable-5-1",
	"claude-sonnet-5-5",
	"claude-opus-5",
	"claude-fable-5",
	"claude-sonnet-5",
	"claude-haiku-4-5",
	"gpt-6.1-sol",
	"gpt-6-astra",
	"gpt-6-sol",
	"gpt-6-luna",
	"gpt-5.6-sol",
	"gpt-5.6-terra",
	"gpt-5.6-luna",
	"gpt-5.5-pro",
	"gpt-5.5",
	"o3",
];

const gatewayCatalog = Object.values(CLOUDFLARE_AI_GATEWAY_MODELS);

const frontier = FRONTIER_IDS.flatMap((id) => gatewayCatalog.filter((model) => model.id === id));

const servedByGateway: ReadonlySet<string> = new Set(gatewayCatalog.map((model) => model.id));

const workersAI = Object.values(CLOUDFLARE_WORKERS_AI_MODELS);

const labelOf = (name: string) => name.replace(/^Glm /, "GLM ").replace(/^Gpt /, "GPT ");

export const WORKERS_AI_OPTIONS: ReadonlyArray<ModelOption> = workersAI.map((model) => ({ id: model.id, label: labelOf(model.name), family: "compat", group: "Workers AI" }));

const GATEWAY_WORKERS_AI_OPTIONS = WORKERS_AI_OPTIONS.filter((model) => servedByGateway.has(`${WORKERS_AI_PREFIX}${model.id}`));

export const FRONTIER_OPTIONS: ReadonlyArray<ModelOption> = frontier.map((model) => ({
	id: model.id,
	label: labelOf(model.name),
	family: familyOfApi(model.api),
	group: model.api === "anthropic-messages" ? "Anthropic" : "OpenAI",
}));

export const modelOptionsFor = (gateway: string | null): ReadonlyArray<ModelOption> => (gateway === null ? WORKERS_AI_OPTIONS : [...FRONTIER_OPTIONS, ...GATEWAY_WORKERS_AI_OPTIONS]);

export const modelOrDefault = (chosen: string | null, fallback: string, gateway: string | null): string =>
	chosen !== null && modelOptionsFor(gateway).some((model) => model.id === chosen) ? chosen : fallback;

export const familyOfModel = (id: string): GatewayFamily => FRONTIER_OPTIONS.find((model) => model.id === id)?.family ?? "compat";

export const gatewayModelId = (id: string): string => (familyOfModel(id) === "compat" ? `${WORKERS_AI_PREFIX}${id}` : id);
