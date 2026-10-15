import { Option } from "effect";
import { type AccountOption, DIRECT_ROUTE, GATEWAY_ROUTE_PREFIX, type GatewayOption, type ModelOption, type RouteChoice } from "./route";

const escapeHtml = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

export type SettingsView = {
	readonly accounts: ReadonlyArray<AccountOption>;
	readonly gateways: ReadonlyArray<GatewayOption>;
	readonly models: ReadonlyArray<ModelOption>;
	readonly chosen: RouteChoice;
	readonly saved: boolean;
	readonly error: Option.Option<string>;
	readonly firstTime: boolean;
	readonly email: string;
};

const selected = (yes: boolean) => (yes ? " selected" : "");

const checked = (yes: boolean) => (yes ? " checked" : "");

const accountOption = (account: AccountOption, chosen: string) => `<option value="${escapeHtml(account.id)}"${selected(account.id === chosen)}>${escapeHtml(account.name)}</option>`;

const modelGroups = (models: ReadonlyArray<ModelOption>, chosen: string) =>
	[...new Set(models.map((model) => model.group))]
		.map(
			(group) =>
				`<optgroup label="${escapeHtml(group)}">${models
					.flatMap((model) => (model.group === group ? [`<option value="${escapeHtml(model.id)}"${selected(model.id === chosen)}>${escapeHtml(model.label)}</option>`] : []))
					.join("")}</optgroup>`,
		)
		.join("");

const option = (value: string, chosen: string, title: string, detail: string) =>
	`<label class="option"><input type="radio" name="route" value="${escapeHtml(value)}"${checked(chosen === value)} onchange="this.form.requestSubmit(document.getElementById('refresh'))"><span class="text"><span class="title">${title}</span><span class="detail">${detail}</span></span></label>`;

const disabledOption = (title: string, detail: string) =>
	`<div class="option disabled" aria-disabled="true"><input type="radio" disabled><span class="text"><span class="title">${title}</span><span class="detail">${detail}</span></span></div>`;

const gatewayOption = (gateway: GatewayOption, chosen: string) => {
	const title = `AI Gateway <code>${escapeHtml(gateway.id)}</code>`;

	return gateway.authenticated
		? option(`${GATEWAY_ROUTE_PREFIX}${gateway.id}`, chosen, title, "Claude, GPT, and Workers AI models, with this gateway's logs and limits.")
		: disabledOption(title, "Authentication is off. Turn it on in the dashboard to use this gateway.");
};

const notice = (view: SettingsView) =>
	Option.match(view.error, {
		onSome: (message) => `<p class="notice error" role="alert"><span aria-hidden="true">!</span> ${escapeHtml(message)}</p>`,
		onNone: () => (view.saved ? `<p class="notice saved" role="status"><span aria-hidden="true">✓</span> Saved. Your next message uses this route and model.</p>` : ""),
	});

const STYLE = `
:root { color-scheme: light dark; --bg: #fff; --ink: #171717; --dim: #5c5c5c; --line: #e6e6e6; --line-strong: #c9c9c9; --hover: #f5f5f5; --accent: #171717; --error: #c41a1a; --saved: #107d32; }
@media (prefers-color-scheme: dark) { :root { --bg: #0a0a0a; --ink: #ededed; --dim: #a1a1a1; --line: #262626; --line-strong: #3d3d3d; --hover: #161616; --accent: #ededed; --error: #ff6166; --saved: #4ade80; } }
* { box-sizing: border-box; }
[hidden] { display: none !important; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 400 14px/20px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; -webkit-font-smoothing: antialiased; }
main { max-width: 600px; margin: 0 auto; padding: 40px 24px 64px; }
.brand { display: flex; align-items: center; gap: 8px; font-weight: 500; text-decoration: none; color: inherit; margin-bottom: 32px; }
.brand img { border-radius: 6px; }
h1 { font-size: 24px; line-height: 32px; font-weight: 600; margin: 0; }
.lede { color: var(--dim); margin: 4px 0 0; max-width: 60ch; }
form { margin-top: 32px; display: grid; gap: 32px; }
fieldset { border: 0; padding: 0; margin: 0; min-width: 0; display: grid; gap: 8px; }
legend, .label { font-size: 16px; line-height: 24px; font-weight: 600; padding: 0; margin: 0 0 4px; }
.hint { color: var(--dim); margin: 0; }
select { width: 100%; font: inherit; color: inherit; background: var(--bg); border: 1px solid var(--line-strong); border-radius: 8px; padding: 7px 10px; height: 36px; }
select:focus-visible, .option:has(input:focus-visible), button:focus-visible, a.button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.options { border: 1px solid var(--line-strong); border-radius: 8px; overflow: hidden; }
.option { display: flex; gap: 12px; align-items: flex-start; padding: 10px 12px; cursor: pointer; }
.option + .option { border-top: 1px solid var(--line); }
.option:hover { background: var(--hover); }
.option:has(input:checked) { box-shadow: inset 2px 0 0 var(--accent); background: var(--hover); }
.option.disabled { cursor: not-allowed; color: var(--dim); }
.option.disabled:hover { background: transparent; }
.option input { margin: 3px 0 0; accent-color: var(--accent); }
.text { display: grid; gap: 2px; }
.title { font-weight: 500; }
.detail { color: var(--dim); }
code { font: 0.9em ui-monospace, SFMono-Regular, Menlo, monospace; }
.notice { display: flex; gap: 8px; margin: 24px 0 0; font-weight: 500; }
.notice.error { color: var(--error); }
.notice.saved { color: var(--saved); }
.top { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 32px; }
.top .brand { margin: 0; }
.account { display: flex; align-items: center; gap: 10px; min-width: 0; }
.who { color: var(--dim); font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.actions { display: flex; gap: 8px; align-items: center; padding-top: 8px; border-top: 1px solid var(--line); }
button, a.button { font: inherit; font-weight: 500; height: 36px; padding: 0 14px; border-radius: 8px; border: 1px solid var(--line-strong); background: var(--bg); color: var(--ink); text-decoration: none; display: inline-flex; align-items: center; cursor: pointer; }
button.primary { background: var(--accent); color: var(--bg); border-color: var(--accent); }
button:hover, a.button:hover { background: var(--hover); }
button.primary:hover { background: var(--accent); opacity: 0.88; }
`;

export const settingsPage = (view: SettingsView) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Model settings · skin</title>
<link rel="icon" href="/_kernel/icon.png" type="image/png">
<style>${STYLE}</style>
</head>
<body>
<main>
<div class="top"><a class="brand" href="/"><img src="/_kernel/icon.png" alt="" width="24" height="24">skin</a><form class="account" method="post" action="/oauth/logout">${view.email === "" ? "" : `<span class="who" id="signed-in-as">Signed in as ${escapeHtml(view.email)}</span>`}<button type="submit" id="sign-out">Sign out</button></form></div>
<h1>${view.firstTime ? "Pick where your agent runs" : "Model settings"}</h1>
<p class="lede">Model calls run on the Cloudflare account you pick, under its limits and its logs. Change this any time.</p>
${notice(view)}
<form method="post" action="/settings">
<fieldset>
<legend>Account</legend>
<select name="account" aria-label="Account" onchange="this.form.requestSubmit(document.getElementById('refresh'))">${view.accounts.map((account) => accountOption(account, view.chosen.accountId)).join("")}</select>
<p class="hint">Only accounts you allowed on Cloudflare's consent screen appear here.</p>
</fieldset>
<fieldset>
<legend>Route</legend>
<div class="options">
${option(DIRECT_ROUTE, view.chosen.route, "Workers AI, direct", "Open models on Workers AI, billed to this account.")}
${view.gateways.map((gateway) => gatewayOption(gateway, view.chosen.route)).join("\n")}
</div>
${view.gateways.length === 0 ? '<p class="hint">This account has no AI Gateways. Create one with authentication on to use Claude and GPT models.</p>' : ""}
</fieldset>
<fieldset>
<legend>Model</legend>
<select name="model" id="model" aria-label="Model">${modelGroups(view.models, view.chosen.model)}</select>
${view.chosen.route === DIRECT_ROUTE ? '<p class="hint">Claude and GPT models need an AI Gateway route.</p>' : ""}
</fieldset>
<div class="actions">
<button class="primary" type="submit" name="intent" value="save">Save</button>
<button type="submit" name="intent" value="refresh" id="refresh" hidden>Refresh</button>
<a class="button" href="/">Back to my app</a>
</div>
</form>
</main>
</body>
</html>`;
