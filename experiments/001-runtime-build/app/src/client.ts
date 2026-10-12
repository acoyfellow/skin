import { Schema } from "effect";
import { Runtime } from "foldkit";
import type { Html, HtmlBuilder } from "foldkit/html";
import { defineMessageUnion } from "foldkit/message";

const Model = Schema.Struct({ count: Schema.Number });
type Model = typeof Model.Type;

const Message = defineMessageUnion({ ClickedAdd: {} });
type Message = typeof Message.Type;

const update = (model: Model, message: Message) =>
	Message.match(message, { ClickedAdd: () => ({ model: { count: model.count + 1 } }) });

const view = (model: Model, h: HtmlBuilder<Message>): Html =>
	h.div([h.Class("p-6 text-2xl font-bold text-violet-700")], [
		h.button([h.Type("button"), h.Class("rounded-md bg-violet-100 px-3 py-1"), h.OnClick(Message.ClickedAdd())], [`count ${model.count}`]),
	]);

Runtime.run(Runtime.makeElement({ Model, init: () => ({ model: { count: 0 } }), update, view, container: document.getElementById("root") }));
