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
};

const selected = (yes: boolean) => (yes ? " selected" : "");

const checked = (yes: boolean) => (yes ? " checked" : "");

const accountOption = (account: AccountOption, chosen: string) => `<option value="${escapeHtml(account.id)}"${selected(account.id === chosen)}>${escapeHtml(account.name)}</option>`;

const modelOption = (model: ModelOption, chosen: string) => `<option value="${escapeHtml(model.id)}"${selected(model.id === chosen)}>${escapeHtml(model.label)} · ${escapeHtml(model.id)}</option>`;

const directRow = (chosen: string) =>
	`<label class="row"><input type="radio" name="route" value="${DIRECT_ROUTE}"${checked(chosen === DIRECT_ROUTE)}><span><strong>Workers AI, direct</strong><small>Calls go straight to Workers AI on this account.</small></span></label>`;

const gatewayRow = (gateway: GatewayOption, chosen: string) => {
	const value = `${GATEWAY_ROUTE_PREFIX}${gateway.id}`;

	return gateway.authenticated
		? `<label class="row"><input type="radio" name="route" value="${escapeHtml(value)}"${checked(chosen === value)}><span><strong>AI Gateway <code>${escapeHtml(gateway.id)}</code></strong><small>Calls go through this gateway, with its logs, caching, and limits.</small></span></label>`
		: `<div class="row off" title="Turn on authentication for this gateway to use it"><input type="radio" disabled><span><strong>AI Gateway <code>${escapeHtml(gateway.id)}</code></strong><small>Authentication is off. Turn it on in the dashboard to use this gateway.</small></span></div>`;
};

const notice = (view: SettingsView) =>
	Option.match(view.error, {
		onSome: (message) => `<p class="alert" role="alert">${escapeHtml(message)}</p>`,
		onNone: () => (view.saved ? `<p class="saved" role="status">Saved. Your next message uses this route and model.</p>` : ""),
	});

export const settingsPage = (view: SettingsView) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="robots" content="noindex">
<title>Model settings · skin</title>
<link rel="icon" href="/_kernel/icon.png" type="image/png">
<style>
:root { --bg: #ffffff; --panel: #fafafa; --line: #ebebeb; --ink: #171717; --dim: #4d4d4d; --life: #7c3aed; --life-soft: #f3eeff; --bad: #c41a1a; --good: #107d32; }
@media (prefers-color-scheme: dark) { :root { --bg: #0a0a0a; --panel: #111111; --line: #2a2a2a; --ink: #ededed; --dim: #a1a1a1; --life: #b79cff; --life-soft: #1c1530; --bad: #ff6166; --good: #4ade80; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 15px/1.55 ui-sans-serif, system-ui, sans-serif; }
main { max-width: 560px; margin: 0 auto; padding: 40px 20px 64px; }
header { display: flex; align-items: center; gap: 10px; font-weight: 600; margin-bottom: 28px; }
header img { border-radius: 7px; }
h1 { font-size: 24px; margin: 0 0 6px; letter-spacing: -0.01em; }
p.lede { color: var(--dim); margin: 0 0 24px; }
fieldset { border: 0; padding: 0; margin: 0 0 24px; }
legend { font-weight: 600; margin-bottom: 8px; }
select { width: 100%; font: inherit; color: inherit; background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; }
.row { display: flex; gap: 12px; align-items: flex-start; padding: 12px 14px; border: 1px solid var(--line); border-radius: 10px; margin-bottom: 8px; cursor: pointer; }
.row:has(input:checked) { border-color: var(--life); background: var(--life-soft); }
.row.off { opacity: 0.55; cursor: not-allowed; }
.row input { margin-top: 4px; }
.row span { display: grid; }
.row small { color: var(--dim); }
code { font: 13px ui-monospace, monospace; }
.actions { display: flex; gap: 10px; align-items: center; }
button, a.button { font: inherit; font-weight: 600; padding: 10px 18px; border-radius: 10px; border: 1px solid var(--line); background: transparent; color: var(--ink); text-decoration: none; cursor: pointer; }
button[type=submit] { background: var(--ink); color: var(--bg); border-color: var(--ink); }
button.link { border: 0; padding: 0; font-weight: 500; color: var(--dim); text-decoration: underline; }
.alert { color: var(--bad); margin: 0 0 16px; }
.saved { color: var(--good); margin: 0 0 16px; }
.hint { color: var(--dim); font-size: 13px; margin: 6px 0 0; }
</style>
</head>
<body>
<main>
<header><img src="/_kernel/icon.png" alt="" width="28" height="28">skin</header>
<h1>${view.firstTime ? "Pick where your agent runs" : "Model settings"}</h1>
<p class="lede">Your agent's model calls run on the Cloudflare account you pick, under its limits and its logs. You can change this any time.</p>
${notice(view)}
<form method="post" action="/settings">
<fieldset>
<legend>Account</legend>
<select name="account" id="account" onchange="this.form.requestSubmit(document.getElementById('switch-account'))">${view.accounts.map((account) => accountOption(account, view.chosen.accountId)).join("")}</select>
<p class="hint">Only accounts you allowed on Cloudflare's consent screen are listed.</p>
</fieldset>
<fieldset>
<legend>Route</legend>
${directRow(view.chosen.route)}
${view.gateways.map((gateway) => gatewayRow(gateway, view.chosen.route)).join("\n")}
${view.gateways.length === 0 ? '<p class="hint">This account has no AI Gateways. Create one with authentication on to route through it.</p>' : ""}
</fieldset>
<fieldset>
<legend>Model</legend>
<select name="model" id="model">${view.models.map((model) => modelOption(model, view.chosen.model)).join("")}</select>
</fieldset>
<div class="actions">
<button type="submit" name="intent" value="save">Save</button>
<button type="submit" name="intent" value="switch-account" id="switch-account" hidden>Switch account</button>
<a class="button" href="/">Back to my app</a>
</div>
</form>
</main>
</body>
</html>`;
