import { Context, Layer } from "effect";
import { FetchHttpClient } from "effect/http";
import { RpcClient, type RpcClientError, RpcSerialization } from "effect/rpc";
import { AgentRpcs, RPC_PATH } from "./kernel/protocol";

type AgentRpcClient = RpcClient.FromGroup<typeof AgentRpcs, RpcClientError.RpcClientError>;

export class AgentClient extends Context.Service<AgentClient, AgentRpcClient>()("planarian/AgentClient") {}

const protocol = RpcClient.layerProtocolHttp({ url: RPC_PATH }).pipe(Layer.provide([FetchHttpClient.layer, RpcSerialization.layerJson]));

export const AgentClientLive = Layer.effect(AgentClient, RpcClient.make(AgentRpcs)).pipe(Layer.provide(protocol));
