import { KERNEL_PREFIX } from "../shared/protocol";

export const COMMAND_CENTER_PATH = `${KERNEL_PREFIX}/command.js`;

export const COMMAND_SETTINGS_PATH = `${KERNEL_PREFIX}/api/settings`;

const STYLE = `
#cc-root { position: fixed; inset: 0; z-index: 2147483646; display: none; font: 14px/20px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; color: var(--cc-ink); -webkit-font-smoothing: antialiased; }
#cc-root[data-open="true"] { display: block; }
#cc-root { --cc-bg: #ffffff; --cc-ink: #171717; --cc-dim: #5c5c5c; --cc-faint: #8f8f8f; --cc-line: #ebebeb; --cc-hover: #f5f5f5; --cc-accent: #171717; --cc-error: #c41a1a; --cc-saved: #107d32; --cc-scrim: rgba(0,0,0,.32); }
@media (prefers-color-scheme: dark) { #cc-root { --cc-bg: #0a0a0a; --cc-ink: #ededed; --cc-dim: #a1a1a1; --cc-faint: #737373; --cc-line: #262626; --cc-hover: #161616; --cc-accent: #ededed; --cc-error: #ff6166; --cc-saved: #4ade80; --cc-scrim: rgba(0,0,0,.6); } }
#cc-root * { box-sizing: border-box; }
#cc-root .cc-scrim { position: absolute; inset: 0; background: var(--cc-scrim); }
#cc-root .cc-dialog { position: absolute; left: 50%; top: max(8px, env(safe-area-inset-top)); transform: translateX(-50%); width: calc(100vw - 16px); height: calc(100dvh - 16px); display: flex; flex-direction: column; background: var(--cc-bg); border: 1px solid var(--cc-line); border-radius: 12px; overflow: hidden; }
@media (min-width: 640px) { #cc-root .cc-dialog { top: 10vh; width: min(720px, calc(100vw - 32px)); height: min(560px, 80dvh); } }
#cc-root header { display: flex; gap: 8px; align-items: center; padding: 10px; border-bottom: 1px solid var(--cc-line); }
#cc-root .cc-search { flex: 1; display: flex; align-items: center; gap: 8px; height: 40px; padding: 0 12px; border: 1px solid var(--cc-line); border-radius: 8px; color: var(--cc-faint); }
#cc-root .cc-search:focus-within { border-color: var(--cc-accent); color: var(--cc-ink); }
#cc-root .cc-search input { flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; color: var(--cc-ink); font: inherit; }
#cc-root kbd { font: 11px ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--cc-faint); border: 1px solid var(--cc-line); border-radius: 5px; padding: 1px 5px; }
#cc-root button, #cc-root select { font: inherit; color: inherit; }
#cc-root .cc-close { height: 40px; padding: 0 12px; border: 1px solid var(--cc-line); border-radius: 8px; background: transparent; cursor: pointer; color: var(--cc-dim); }
#cc-root .cc-body { flex: 1; min-height: 0; display: grid; grid-template-rows: auto minmax(0, 1fr); }
@media (min-width: 640px) { #cc-root .cc-body { grid-template-columns: 180px minmax(0, 1fr); grid-template-rows: none; } }
#cc-root nav { display: flex; gap: 4px; padding: 8px; overflow-x: auto; border-bottom: 1px solid var(--cc-line); }
@media (min-width: 640px) { #cc-root nav { flex-direction: column; border-bottom: 0; border-right: 1px solid var(--cc-line); } }
#cc-root nav button { display: flex; flex-direction: column; align-items: flex-start; gap: 0; min-width: max-content; padding: 8px 10px; border: 0; border-radius: 6px; background: transparent; text-align: left; cursor: pointer; color: var(--cc-dim); }
#cc-root nav button[aria-selected="true"] { background: var(--cc-hover); color: var(--cc-ink); box-shadow: inset 2px 0 0 var(--cc-accent); }
#cc-root nav .cc-hint { display: none; font-size: 12px; color: var(--cc-faint); }
@media (min-width: 640px) { #cc-root nav .cc-hint { display: block; } }
#cc-root .cc-panel { overflow-y: auto; padding: 20px; }
#cc-root h3 { margin: 0 0 8px; font-size: 12px; font-weight: 500; color: var(--cc-faint); }
#cc-root section + section { margin-top: 24px; }
#cc-root .cc-list { border: 1px solid var(--cc-line); border-radius: 8px; overflow: hidden; }
#cc-root .cc-row { display: flex; gap: 12px; align-items: flex-start; width: 100%; padding: 10px 12px; border: 0; background: transparent; text-align: left; cursor: pointer; }
#cc-root .cc-row + .cc-row { border-top: 1px solid var(--cc-line); }
#cc-root .cc-row:hover { background: var(--cc-hover); }
#cc-root .cc-row[aria-checked="true"] { background: var(--cc-hover); box-shadow: inset 2px 0 0 var(--cc-accent); }
#cc-root .cc-row[aria-disabled="true"] { cursor: not-allowed; color: var(--cc-faint); }
#cc-root .cc-row[aria-disabled="true"]:hover { background: transparent; }
#cc-root .cc-dot { flex: none; margin-top: 4px; width: 12px; height: 12px; border-radius: 50%; border: 1px solid var(--cc-faint); }
#cc-root .cc-row[aria-checked="true"] .cc-dot { border: 4px solid var(--cc-accent); }
#cc-root .cc-text { display: grid; gap: 2px; min-width: 0; }
#cc-root .cc-title { font-weight: 500; }
#cc-root .cc-detail { font-size: 13px; color: var(--cc-dim); }
#cc-root code { font: 12px ui-monospace, SFMono-Regular, Menlo, monospace; }
#cc-root select { width: 100%; height: 36px; padding: 0 10px; border: 1px solid var(--cc-line); border-radius: 8px; background: var(--cc-bg); }
#cc-root .cc-fact { display: flex; justify-content: space-between; gap: 16px; padding: 8px 0; border-bottom: 1px solid var(--cc-line); }
#cc-root .cc-fact span:first-child { color: var(--cc-dim); }
#cc-root .cc-fact span:last-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#cc-root .cc-action { height: 36px; padding: 0 14px; border-radius: 8px; border: 1px solid var(--cc-line); background: var(--cc-bg); cursor: pointer; font-weight: 500; }
#cc-root .cc-action.cc-primary { background: var(--cc-accent); color: var(--cc-bg); border-color: var(--cc-accent); }
#cc-root .cc-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
#cc-root .cc-notice { display: flex; gap: 8px; margin: 0 0 16px; font-weight: 500; }
#cc-root .cc-notice.cc-error { color: var(--cc-error); }
#cc-root .cc-notice.cc-saved { color: var(--cc-saved); }
#cc-root .cc-empty { color: var(--cc-dim); padding: 10px 12px; }
#cc-trigger { position: fixed; right: 12px; bottom: 12px; z-index: 2147483645; display: inline-flex; gap: 6px; align-items: center; height: 32px; padding: 0 10px; border-radius: 8px; border: 1px solid #d4d4d4; background: #fff; color: #171717; font: 500 13px/1 ui-sans-serif, system-ui, sans-serif; cursor: pointer; }
@media (prefers-color-scheme: dark) { #cc-trigger { background: #0a0a0a; color: #ededed; border-color: #3d3d3d; } }
#cc-trigger kbd { font: 11px ui-monospace, Menlo, monospace; opacity: .6; }
`;

export const COMMAND_CENTER = `(() => {
	if (window.__skinCommandCenter) return;
	window.__skinCommandCenter = true;

	const SETTINGS = "${COMMAND_SETTINGS_PATH}";
	const SECTIONS = [
		{ id: "model", label: "Model", hint: "Account, route, model", words: "model account route gateway workers ai claude gpt opus llm settings who pays" },
		{ id: "account", label: "Account", hint: "Who is signed in, sign out", words: "account sign out log out logout email session" },
		{ id: "app", label: "App", hint: "Versions, console, reset", words: "app versions generations console reset original rollback" },
	];

	const state = { open: false, tab: "model", query: "", data: null, notice: null, busy: false, lastFocus: null };

	const style = document.createElement("style");
	style.textContent = ${JSON.stringify(STYLE)};
	document.head.appendChild(style);

	const root = document.createElement("div");
	root.id = "cc-root";
	root.setAttribute("aria-hidden", "true");
	document.documentElement.appendChild(root);

	const trigger = document.createElement("button");
	trigger.id = "cc-trigger";
	trigger.type = "button";
	trigger.setAttribute("aria-label", "Open settings");
	trigger.setAttribute("aria-haspopup", "dialog");
	trigger.innerHTML = "Settings <kbd>" + (/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘K" : "Ctrl K") + "</kbd>";
	trigger.onclick = () => open();

	const showTriggerUnlessTheAppHasOne = () => {
		const own = document.querySelector("[data-command-center]");
		if (own && trigger.isConnected) trigger.remove();
		if (!own && !trigger.isConnected) document.documentElement.appendChild(trigger);
	};

	new MutationObserver(showTriggerUnlessTheAppHasOne).observe(document.documentElement, { childList: true, subtree: true });
	showTriggerUnlessTheAppHasOne();

	document.addEventListener("click", (event) => {
		const link = event.target instanceof Element ? event.target.closest("[data-command-center]") : null;
		if (link === null || event.metaKey || event.ctrlKey || event.shiftKey) return;
		event.preventDefault();
		open();
	}, true);

	const el = (tag, attrs, children) => {
		const node = document.createElement(tag);
		for (const [key, value] of Object.entries(attrs || {})) {
			if (value === undefined || value === null || value === false) continue;
			if (key.startsWith("on")) node[key] = value;
			else if (key === "text") node.textContent = value;
			else node.setAttribute(key, value === true ? "" : String(value));
		}
		for (const child of children || []) if (child !== null && child !== undefined) node.append(child);
		return node;
	};

	const matches = (...texts) => {
		const wanted = state.query.trim().toLowerCase();
		return wanted === "" || texts.some((text) => String(text).toLowerCase().includes(wanted));
	};

	const load = async (form) => {
		state.busy = true;
		render();
		try {
			const response = await fetch(SETTINGS, form ? { method: "POST", body: form, credentials: "same-origin" } : { credentials: "same-origin", cache: "no-store" });
			if (response.status === 401) { location.assign("/"); return; }
			const data = await response.json();
			state.data = data;
			state.notice = data.error ? { kind: "error", text: data.error } : data.saved ? { kind: "saved", text: "Saved. Your next message uses this model." } : null;
		} catch (error) {
			state.notice = { kind: "error", text: "Could not reach skin. Check your connection and try again." };
		}
		state.busy = false;
		render();
	};

	const submit = (patch, intent) => {
		const chosen = { ...state.data.chosen, ...patch };
		const form = new FormData();
		form.set("account", chosen.accountId);
		form.set("route", chosen.route);
		form.set("model", chosen.model);
		form.set("intent", intent);
		return load(form);
	};

	const radio = (checked, title, detail, onclick, disabled) =>
		el("button", { type: "button", role: "radio", class: "cc-row", "aria-checked": String(checked), "aria-disabled": disabled ? "true" : null, onclick: disabled ? null : onclick }, [
			el("span", { class: "cc-dot", "aria-hidden": "true" }),
			el("span", { class: "cc-text" }, [el("span", { class: "cc-title" }, [title]), el("span", { class: "cc-detail", text: detail })]),
		]);

	const code = (text) => el("code", { text });

	const modelPanel = () => {
		const data = state.data;
		if (data === null) return [el("p", { class: "cc-empty", text: state.busy ? "Loading…" : "" })];
		const nodes = [];
		if (matches("account", ...data.accounts.map((a) => a.name))) {
			nodes.push(el("section", {}, [
				el("h3", { text: "Account that pays" }),
				el("select", { "aria-label": "Account", onchange: (event) => submit({ accountId: event.target.value }, "refresh") },
					data.accounts.map((account) => el("option", { value: account.id, selected: account.id === data.chosen.accountId ? true : null, text: account.name }))),
			]));
		}
		const routes = [radio(data.chosen.route === "workers-ai", "Workers AI, direct", "Open models on Workers AI, billed to this account.", () => submit({ route: "workers-ai" }, "refresh"))]
			.concat(data.gateways.map((gateway) => {
				const title = el("span", {}, ["AI Gateway ", code(gateway.id)]);
				return gateway.authenticated
					? radio(data.chosen.route === "gateway:" + gateway.id, title, "Claude, GPT, and Workers AI, with this gateway's logs and limits.", () => submit({ route: "gateway:" + gateway.id }, "refresh"))
					: radio(false, title, "Authentication is off. Turn it on in the dashboard to use this gateway.", null, true);
			}));
		if (matches("route gateway workers ai", ...data.gateways.map((g) => g.id))) {
			nodes.push(el("section", {}, [el("h3", { text: "Route" }), el("div", { class: "cc-list", role: "radiogroup", "aria-label": "Route" }, routes)]));
		}
		const groups = [...new Set(data.models.map((m) => m.group))];
		const visible = data.models.filter((m) => matches(m.label, m.id, m.group));
		if (visible.length > 0 || matches("model")) {
			nodes.push(el("section", {}, [
				el("h3", { text: "Model" }),
				el("div", { class: "cc-list", role: "radiogroup", "aria-label": "Model" },
					groups.flatMap((group) => {
						const inGroup = (visible.length > 0 ? visible : data.models).filter((m) => m.group === group);
						return inGroup.map((m) => radio(m.id === data.chosen.model, m.label, group, () => submit({ model: m.id }, "save")));
					})),
				data.chosen.route === "workers-ai" ? el("p", { class: "cc-detail", style: "margin:8px 0 0", text: "Claude and GPT models need an AI Gateway route." }) : null,
			]));
		}
		return nodes.length > 0 ? nodes : [el("p", { class: "cc-empty", text: "Nothing in Model matches that." })];
	};

	const signOut = () =>
		el("form", { method: "post", action: "/oauth/logout", style: "display:inline" }, [el("button", { type: "submit", class: "cc-action cc-primary", id: "cc-sign-out", text: "Sign out" })]);

	const accountPanel = () => {
		const data = state.data;
		const account = data && data.accounts.find((a) => a.id === data.chosen.accountId);
		return [
			el("section", {}, [
				el("h3", { text: "Signed in" }),
				el("div", {}, [
					el("div", { class: "cc-fact" }, [el("span", { text: "Email" }), el("span", { id: "cc-email", text: data && data.email ? data.email : "—" })]),
					el("div", { class: "cc-fact" }, [el("span", { text: "Pays for models" }), el("span", { text: account ? account.name : "—" })]),
					el("div", { class: "cc-fact" }, [el("span", { text: "Model" }), el("span", { text: data ? data.chosen.model : "—" })]),
				]),
				el("div", { class: "cc-actions" }, [signOut()]),
				el("p", { class: "cc-detail", style: "margin:8px 0 0", text: "Signing out ends this session and revokes skin's access to your Cloudflare account." }),
			]),
		];
	};

	const appPanel = () => [
		el("section", {}, [
			el("h3", { text: "This app" }),
			el("div", { class: "cc-list" }, [
				el("a", { class: "cc-row", href: "${KERNEL_PREFIX}/", style: "text-decoration:none;color:inherit" }, [el("span", { class: "cc-text" }, [el("span", { class: "cc-title", text: "Open the console" }), el("span", { class: "cc-detail", text: "Every version, what checked it, and rollback." })])]),
				el("button", { type: "button", class: "cc-row", id: "cc-reset", onclick: async () => {
					if (!confirm("Reset your app to the latest original? Your data stays; every earlier version stays under Versions.")) return;
					await fetch("${KERNEL_PREFIX}/api/reseed", { method: "POST", credentials: "same-origin" });
					location.reload();
				} }, [el("span", { class: "cc-text" }, [el("span", { class: "cc-title", text: "Reset to the original" }), el("span", { class: "cc-detail", text: "Ship the latest seed as a new version. Nothing is deleted." })])]),
			]),
		]),
	];

	const PANELS = { model: modelPanel, account: accountPanel, app: appPanel };

	const render = () => {
		root.dataset.open = String(state.open);
		root.setAttribute("aria-hidden", String(!state.open));
		trigger.setAttribute("aria-expanded", String(state.open));
		if (!state.open) { root.replaceChildren(); return; }
		const search = document.activeElement && document.activeElement.id === "cc-search";
		const caret = search ? document.activeElement.selectionStart : null;
		const sections = SECTIONS.filter((s) => s.id === state.tab || matches(s.label, s.hint, s.words));
		const input = el("input", { id: "cc-search", type: "text", placeholder: "Search settings", autocomplete: "off", spellcheck: "false", "aria-label": "Search settings", value: state.query });
		input.oninput = (event) => {
			state.query = event.target.value;
			const first = SECTIONS.find((s) => matches(s.label, s.hint, s.words));
			if (first && !matches(SECTIONS.find((s) => s.id === state.tab).words)) state.tab = first.id;
			render();
		};
		root.replaceChildren(
			el("div", { class: "cc-scrim", onclick: close }),
			el("div", { class: "cc-dialog", role: "dialog", "aria-modal": "true", "aria-label": "Settings" }, [
				el("header", {}, [
					el("label", { class: "cc-search" }, [input, el("kbd", { text: "Esc" })]),
					el("button", { type: "button", class: "cc-close", "aria-label": "Close settings", onclick: close, text: "Close" }),
				]),
				el("div", { class: "cc-body" }, [
					el("nav", { role: "tablist", "aria-label": "Settings sections" }, sections.map((s) =>
						el("button", { type: "button", role: "tab", "aria-selected": String(s.id === state.tab), "data-tab": s.id, onclick: () => { state.tab = s.id; render(); } }, [
							el("span", { text: s.label }), el("span", { class: "cc-hint", text: s.hint }),
						]))),
					el("div", { class: "cc-panel", role: "tabpanel", "data-panel": state.tab }, [
						state.notice ? el("p", { class: "cc-notice " + (state.notice.kind === "error" ? "cc-error" : "cc-saved"), role: state.notice.kind === "error" ? "alert" : "status", text: (state.notice.kind === "error" ? "! " : "✓ ") + state.notice.text }) : null,
						...PANELS[state.tab](),
					]),
				]),
			]),
		);
		if (search || state.open) {
			const field = document.getElementById("cc-search");
			if (search && field) { field.focus(); if (caret !== null) field.setSelectionRange(caret, caret); }
		}
	};

	const open = (tab) => {
		if (state.open) return;
		state.lastFocus = document.activeElement;
		state.open = true;
		if (tab) state.tab = tab;
		state.notice = null;
		render();
		document.getElementById("cc-search").focus();
		load();
	};

	const close = () => {
		if (!state.open) return;
		state.open = false;
		state.query = "";
		render();
		if (state.lastFocus && state.lastFocus.focus) state.lastFocus.focus();
	};

	window.addEventListener("keydown", (event) => {
		if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "k") {
			event.preventDefault();
			state.open ? close() : open();
		} else if (event.key === "Escape" && state.open) {
			event.preventDefault();
			close();
		} else if (event.key === "Tab" && state.open) {
			const focusable = [...root.querySelectorAll("button:not([aria-disabled=true]), select, input, a[href]")];
			if (focusable.length === 0) return;
			const first = focusable[0], last = focusable[focusable.length - 1];
			if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
			else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
		}
	}, true);

	window.skinCommandCenter = { open, close };
	if (new URLSearchParams(location.search).get("settings") === "open" || location.hash === "#settings") open("model");
})();
`;
