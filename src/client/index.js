/**
 * Browser half of the dsh-linear connector (plan §50 UI 落点 — 网页授权).
 *
 * Renders the connector card in Settings → Plugins (`settings.plugin.item`
 * slot) as a collapsible panel matching the harness's built-in plugin cards
 * (PluginCard visual language: `--dsw-alias-*` theme tokens, chevron header,
 * bordered body). The card has two parts:
 *
 * 1. Connection: live status plus Connect / Reconnect / Disconnect buttons,
 *    driven by the same-origin JSON API the host registers
 *    (`src/harness/connection-api.ts`). Connect opens the Linear
 *    authorization page in a NEW tab (`window.open`, noopener); the card's
 *    5 s polling flips to connected once the callback completes.
 * 2. Settings form over the `linear` settings namespace: authMode
 *    (oauth ⇄ apiKey), OAuth app credentials (clientId / clientSecret /
 *    redirectUri) and an API Key control writing the `DSH_LINEAR_API_KEY`
 *    credential through the credentials domain. The harness wire does not
 *    expose third-party settings namespaces on this wave (hard-coded
 *    allowlist in dsh-host-apiproxy), so the form reads/writes through the
 *    plugin's own loopback routes (GET/POST /settings, redacted); the
 *    namespace is `applies: restart`, so the card notes that saved changes
 *    applies live — the host rebuilds its stack in place, no restart.
 *
 * Conventions: plain JS, `React.createElement` (no JSX), services via
 * Cordis inject (`slots`, `locale`, `connection`). `react`
 * is a static of the harness client runtime — this bundle only requires
 * `react` (see `scripts/build-client.mjs` and `package.json` `dsh.client`).
 */
import * as React from "react";

const API = "/integrations/linear/api";

/** Credential reference the API Key control addresses (apiKey mode, §16). */
const API_KEY_REF = "DSH_LINEAR_API_KEY";

/** Locale namespace for this plugin's browser strings. */
const NS = "dsh-linear";

const zh = {
  name: "Linear Connector",
  descriptionConnected: "已连接 — 管理工作区连接",
  descriptionDisconnected: "连接 Linear 工作区",
  statusConnected: "已连接：{workspace}（{user}）",
  statusConnectedNoUser: "已连接：{workspace}",
  statusNotConnected: "未连接。",
  disconnectedOauth: "未连接。点击「连接」授权此工作区（OAuth）。",
  disconnectedOauthNotConfigured:
    "未连接，且 OAuth 流程尚未配置。请填写下方 OAuth 应用凭据并保存（或改用 API Key），保存后即时生效。",
  disconnectedApiKey: "未连接。请在下方向下填写 API Key（authMode = apiKey），保存后即时生效。",
  connecting: "正在连接…",
  expired: "连接已过期，请点击「重新连接」。",
  revoked: "连接已被撤销，请点击「重新连接」。",
  errorCheckFailed: "无法检查 Linear 连接，请检查网络后重试。",
  connect: "连接",
  reconnect: "重新连接",
  disconnect: "断开连接",
  actionFailed: "操作失败。",
  actionNotConnected: "尚未连接，请先完成连接。",
  actionAuthExpired: "会话已过期，请重新连接。",
  actionAuthRevoked: "连接已被撤销，请重新连接。",
  serverUnreachable: "无法连接 Harness 服务器。",
  formTitle: "配置",
  formHint: "编辑后点「保存」；配置即时生效，无需重启。",
  authMode: "认证方式",
  authModeOauth: "OAuth（推荐）",
  authModeApiKey: "API Key",
  oauthClientId: "OAuth 应用 Client ID",
  oauthClientSecret: "OAuth 应用 Client Secret",
  oauthClientSecretHint: "留空表示保持当前值；保存后不再回显。",
  redirectUri: "回调地址（Redirect URI）",
  redirectUriHint: "必须与 Linear 应用注册的回调逐字符一致。",
  apiKey: "API Key",
  apiKeyHint: "Personal API Key；保存后写入 DSH_LINEAR_API_KEY。",
  apiKeyConfigured: "已配置",
  apiKeyNotConfigured: "未配置",
  overridden: "已覆盖",
  reset: "重置",
  save: "保存",
  discard: "放弃",
  saving: "保存中…",
  savedNote: "已保存并即时生效",
  saveFailed: "保存失败，请重试。",
  formUnavailable: "设置当前不可用。",
  readOnly: "当前部署的设置只读。",
};

const en = {
  name: "Linear Connector",
  descriptionConnected: "Connected — manage the workspace connection",
  descriptionDisconnected: "Connect a Linear workspace",
  statusConnected: "Connected: {workspace} ({user})",
  statusConnectedNoUser: "Connected: {workspace}",
  statusNotConnected: "Not connected.",
  disconnectedOauth: "Not connected. Start the Connect flow to authorize this workspace (OAuth).",
  disconnectedOauthNotConfigured:
    "Not connected, and the OAuth flow is not configured. Fill in the OAuth app credentials below and save (or switch to API Key); changes apply live.",
  disconnectedApiKey:
    "Not connected. Enter an API Key below (authMode = apiKey) and save; changes apply live.",
  connecting: "Connecting…",
  expired: "The session has expired. Reconnect to continue.",
  revoked: "The connection was revoked. Reconnect to continue.",
  errorCheckFailed: "Could not check the Linear connection. Check the network and retry.",
  connect: "Connect",
  reconnect: "Reconnect",
  disconnect: "Disconnect",
  actionFailed: "The action failed.",
  actionNotConnected: "Not connected yet — complete the connection first.",
  actionAuthExpired: "The session has expired. Reconnect to continue.",
  actionAuthRevoked: "The connection was revoked. Reconnect to continue.",
  serverUnreachable: "Could not reach the Harness web server.",
  formTitle: "Configuration",
  formHint: "Edit and save; the configuration takes effect after a restart.",
  authMode: "Auth mode",
  authModeOauth: "OAuth (recommended)",
  authModeApiKey: "API Key",
  oauthClientId: "OAuth app client ID",
  oauthClientSecret: "OAuth app client secret",
  oauthClientSecretHint: "Leave empty to keep the current value; never echoed after save.",
  redirectUri: "Redirect URI",
  redirectUriHint: "Must match a registered redirect URI in the Linear OAuth app.",
  apiKey: "API Key",
  apiKeyHint: "Personal API key; saved into DSH_LINEAR_API_KEY.",
  apiKeyConfigured: "Configured",
  apiKeyNotConfigured: "Not configured",
  overridden: "Overridden",
  reset: "Reset",
  save: "Save",
  discard: "Discard",
  saving: "Saving…",
  savedNote: "Saved — takes effect after a restart",
  saveFailed: "Save failed, please retry.",
  formUnavailable: "Settings are currently unavailable.",
  readOnly: "This deployment stores settings read-only.",
};

/**
 * Card + form styles, mirroring the built-in plugin cards and their fields
 * (PluginCard.module.css / fields module): bordered rounded card, chevron
 * header, hairline body, labeled inputs with hints. Injected once per page
 * with the same data-plugin-css convention as harness client packages.
 */
const CARD_CSS = `\
.dshl_card{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;list-style:none;transition:border-color .16s,background .16s}
.dshl_card:hover{border-color:var(--dsw-alias-label-dimmed)}
.dshl_cardOpen{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-label-dimmed)}
.dshl_header{appearance:none;width:100%;font:inherit;color:inherit;text-align:left;cursor:pointer;background:0 0;border:0;border-radius:12px;align-items:center;gap:12px;padding:14px 16px;display:flex}
.dshl_header:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}
.dshl_headText{flex-direction:column;flex:1;gap:4px;min-width:0;display:flex}
.dshl_name{color:var(--dsw-alias-label-primary);font-size:15px;font-weight:600;line-height:1.4}
.dshl_description{color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:1.5}
.dshl_chevron{color:var(--dsw-alias-label-tertiary);flex:none;transition:transform .16s}
.dshl_chevronOpen{transform:rotate(180deg)}
.dshl_body{border-top:1px solid var(--dsw-alias-border-l2);margin:0 16px;padding:12px 0 8px;display:flex;flex-direction:column;gap:10px}
.dshl_status{margin:0;font-size:13px;line-height:1.5;color:var(--dsw-alias-label-secondary);white-space:pre-wrap}
.dshl_actions{display:flex;gap:8px}
.dshl_button{appearance:none;font:inherit;cursor:pointer;border:1px solid #0000;border-radius:8px;padding:5px 14px;font-size:13px;line-height:1.5;background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-3)}
.dshl_button:disabled{opacity:.4;cursor:default}
.dshl_button:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.dshl_ghost{border-color:var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);background:0 0}
.dshl_ghost:hover:not(:disabled){color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-label-dimmed)}
.dshl_error{margin:0;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-error);white-space:pre-wrap}
.dshl_divider{border:0;border-top:1px solid var(--dsw-alias-border-l2);margin:4px 0}
.dshl_form{display:flex;flex-direction:column;gap:12px}
.dshl_formHead{display:flex;align-items:baseline;gap:8px}
.dshl_formTitle{margin:0;font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary)}
.dshl_formHint{margin:0;font-size:12px;color:var(--dsw-alias-label-tertiary);line-height:1.5}
.dshl_field{display:flex;flex-direction:column;gap:4px}
.dshl_fieldHead{display:flex;align-items:center;gap:8px;min-height:18px}
.dshl_label{font-size:12px;color:var(--dsw-alias-label-secondary);line-height:1.5}
.dshl_badge{background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);border-radius:999px;padding:1px 8px;font-size:11px;font-weight:500;line-height:17px}
.dshl_badgeOk{background:color-mix(in srgb,var(--dsw-alias-bg-module-platform) 55%,#1a7f37);color:#1a7f37}
.dshl_reset{appearance:none;background:0 0;border:0;cursor:pointer;font-size:11px;color:var(--dsw-alias-label-tertiary);padding:0}
.dshl_reset:hover{color:var(--dsw-alias-label-primary)}
.dshl_input{appearance:none;font:inherit;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-3);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:5px 10px;font-size:13px;line-height:1.5}
.dshl_input:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.dshl_input:disabled{opacity:.5;cursor:default}
.dshl_hint{margin:0;font-size:12px;color:var(--dsw-alias-label-tertiary);line-height:1.5}
.dshl_invalid{color:var(--dsw-alias-label-error)}
.dshl_footer{border-top:1px solid var(--dsw-alias-border-l2);margin-top:2px;padding:10px 0 4px;display:flex;align-items:center;gap:8px}
.dshl_footerNote{margin:0;flex:1;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-tertiary)}
.dshl_footerNoteOk{color:var(--dsw-alias-label-primary)}
.dshl_footerNoteFail{color:var(--dsw-alias-label-error)}`;
const CSS_ID = "dsh-linear/card.css";
if (
  typeof document !== "undefined" &&
  document.querySelector(`style[data-plugin-css="${CSS_ID}"]`) === null
) {
  const tag = document.createElement("style");
  tag.dataset.plugin = "dsh-linear";
  tag.dataset.pluginCss = CSS_ID;
  tag.textContent = CARD_CSS;
  document.head.appendChild(tag);
}

function Chevron({ open }) {
  return React.createElement(
    "svg",
    {
      className: `dshl_chevron${open ? " dshl_chevronOpen" : ""}`,
      width: 14,
      height: 14,
      viewBox: "0 0 14 14",
      "aria-hidden": true,
    },
    React.createElement("path", {
      d: "M3 5.5 7 9.5l4-4",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 1.5,
      strokeLinecap: "round",
      strokeLinejoin: "round",
    }),
  );
}

/**
 * Staged settings form over the `linear` namespace, served through the
 * plugin's own loopback routes (the harness wire does not expose
 * third-party settings namespaces on this wave — see
 * `src/harness/connection-api.ts`). Edits accumulate; Save writes every
 * staged field as settings ops (POST /settings) and the API Key through
 * the credentials domain; the redacted host view is re-read afterwards.
 * The namespace is `applies: live`, so a successful save reports "saved and
 * applied live" — the host rebuilds its stack in place.
 */
class LinearSettingsForm {
  constructor(api) {
    this.api = api; // connection api — credentials domain only
    this.staged = new Map(); // field -> draft text ("" stages a clear for text fields)
    this.saving = false;
    this.failed = false;
    this.savedAt = 0;
    this.loaded = false; // the redacted settings view arrived
    this.unavailable = false; // settings route unreachable / namespace missing
    this.value = {};
    this.user = {};
    this.writable = true;
    this.secretConfigured = false; // from the secrets view (never the value)
    this.apiKeyConfigured = false;
    this.listeners = new Set();
    void this.load();
    void this.readApiKey();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit() {
    for (const listener of this.listeners) listener();
  }

  /** Load the redacted settings view (GET /settings). */
  async load() {
    try {
      const response = await fetch(`${API}/settings`);
      if (!response.ok) {
        this.unavailable = true;
        this.emit();
        return;
      }
      const view = await response.json();
      this.value = view.value ?? {};
      this.user = view.user ?? {};
      this.writable = view.writable !== false;
      this.secretConfigured = (view.secrets ?? []).some(
        (secret) =>
          secret.path.length === 1 && secret.path[0] === "oauthClientSecret" && secret.set,
      );
      this.loaded = true;
      this.emit();
    } catch {
      this.unavailable = true;
      this.emit();
    }
  }

  edit(field, text) {
    this.staged.set(field, text);
    this.savedAt = 0;
    this.failed = false;
    this.emit();
  }

  discard() {
    this.staged.clear();
    this.savedAt = 0;
    this.failed = false;
    this.emit();
  }

  /** Re-read whether the API Key ref has a credential (best effort). */
  async readApiKey() {
    try {
      const response = await this.api.credentials.describe({ refs: [API_KEY_REF] });
      const view = response.result.ok && response.result.value.credentials[API_KEY_REF];
      const next = Boolean(view && view.configured);
      if (next !== this.apiKeyConfigured) {
        this.apiKeyConfigured = next;
        this.emit();
      }
    } catch {
      // Credentials domain unreachable; keep the last known state.
    }
  }

  /** Current auth mode: the staged draft when one exists, else the section value. */
  authMode() {
    const staged = this.staged.get("authMode");
    if (staged !== undefined) {
      const trimmed = staged.trim();
      if (trimmed === "oauth" || trimmed === "apiKey") return trimmed;
    }
    return this.value.authMode ?? "oauth";
  }

  async save() {
    if (this.saving) return;
    const staged = [...this.staged.entries()];
    if (staged.length === 0) return;
    this.saving = true;
    this.failed = false;
    this.savedAt = 0;
    this.emit();

    let ok = true;
    const ops = [];
    for (const [field, text] of staged) {
      const value = text.trim();
      if (field === "apiKey") {
        if (value === "") continue;
        try {
          await this.api.credentials.set({ ref: API_KEY_REF, value });
          await this.readApiKey();
        } catch {
          ok = false;
        }
        continue;
      }
      if (field === "oauthClientSecret") {
        if (value === "") continue; // empty draft = keep the stored secret
        ops.push({ op: "set", path: [field], value });
        continue;
      }
      const current = this.value[field];
      if (field === "authMode") {
        if (value === "" || value === current) continue;
        ops.push({ op: "set", path: [field], value });
        continue;
      }
      if (value === "") {
        // An empty text draft clears the field (unset → base/default).
        ops.push({ op: "unset", path: [field] });
        continue;
      }
      if (value === current) continue;
      ops.push({ op: "set", path: [field], value });
    }

    if (ops.length > 0) {
      try {
        const response = await fetch(`${API}/settings`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ops }),
        });
        const body = await response.json();
        if (!response.ok || body.error) {
          ok = false;
        } else {
          await this.load();
        }
      } catch {
        ok = false;
      }
    }

    this.saving = false;
    if (ok) {
      this.staged.clear();
      this.savedAt = Date.now();
    } else {
      this.failed = true;
    }
    this.emit();
  }

  /** Everything the component needs to render, computed from the live view. */
  state() {
    return {
      ready: this.loaded,
      unavailable: this.unavailable,
      writable: this.writable,
      authMode: this.authMode(),
      value: this.value,
      user: this.user,
      staged: new Map(this.staged),
      dirty: this.staged.size > 0,
      saving: this.saving,
      failed: this.failed,
      saved: this.savedAt > 0,
      secretConfigured: this.secretConfigured,
      apiKeyConfigured: this.apiKeyConfigured,
    };
  }
}

/** A labeled text/secret/select field row (mirrors the built-in ValueField). */
function Field(props) {
  const head = [];
  if (props.label) {
    head.push(
      React.createElement(
        "label",
        { key: "label", className: "dshl_label", htmlFor: props.id },
        props.label,
      ),
    );
  }
  if (props.overridden) {
    head.push(
      React.createElement("span", { key: "badge", className: "dshl_badge" }, props.t("overridden")),
    );
  }
  if (props.overridden && props.onReset) {
    head.push(
      React.createElement(
        "button",
        { key: "reset", type: "button", className: "dshl_reset", onClick: props.onReset },
        props.t("reset"),
      ),
    );
  }
  const input =
    props.select === true
      ? React.createElement(
          "select",
          {
            id: props.id,
            className: "dshl_input",
            value: props.text,
            disabled: props.disabled,
            onChange: (event) => props.onEdit(event.target.value),
          },
          props.options.map((option) =>
            React.createElement("option", { key: option.value, value: option.value }, option.label),
          ),
        )
      : React.createElement("input", {
          id: props.id,
          className: "dshl_input",
          type: props.secret === true ? "password" : "text",
          value: props.text,
          placeholder: props.placeholder ?? "",
          disabled: props.disabled,
          onChange: (event) => props.onEdit(event.target.value),
        });
  const hintClass = `dshl_hint${props.invalid ? " dshl_invalid" : ""}`;
  return React.createElement(
    "div",
    { className: "dshl_field" },
    React.createElement("div", { className: "dshl_fieldHead" }, head),
    input,
    props.hint ? React.createElement("p", { className: hintClass }, props.hint) : null,
  );
}

function LinearCard(props) {
  const t = props.t;
  const form = props.linearForm;
  const [open, setOpen] = React.useState(false);
  const [status, setStatus] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState(null);

  // Re-render on form changes (scope updates, staged edits, save cycles).
  const [, forceRender] = React.useReducer((x) => x + 1, 0);
  React.useEffect(() => form.subscribe(() => forceRender()), [form]);

  const refresh = React.useCallback(async () => {
    try {
      const response = await fetch(`${API}/status`);
      if (response.ok) setStatus(await response.json());
    } catch {
      // The web server is unreachable; keep the last known status.
    }
  }, []);

  React.useEffect(() => {
    refresh();
    const timer = setInterval(() => refresh(), 5000); // poll while connecting / after callback
    return () => clearInterval(timer);
  }, [refresh]);

  const act = React.useCallback(
    async (action) => {
      setBusy(true);
      setError(null);
      try {
        const response = await fetch(`${API}/${action}`, { method: "POST" });
        const body = await response.json();
        if (!response.ok || body.error) {
          // Stable error codes (§35) map to localized copy; unknown failures
          // fall back to the host message.
          const code = body.error;
          if (code === "NOT_CONNECTED") setError(t("actionNotConnected"));
          else if (code === "AUTH_EXPIRED") setError(t("actionAuthExpired"));
          else if (code === "AUTH_REVOKED") setError(t("actionAuthRevoked"));
          else setError(body.message || t("actionFailed"));
          return;
        }
        if (body.url) {
          // Authorize in a NEW tab — the settings page stays open and the
          // card flips to connected on the next poll (§49).
          window.open(body.url, "_blank", "noopener");
          return;
        }
        await refresh();
      } catch {
        setError(t("serverUnreachable"));
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  // Localized status line from structured facts (state + authMode + oauth
  // configuration) — the host's English `message` stays the tool contract.
  const connected = Boolean(status && status.connected);
  let summary;
  if (status && status.workspace) {
    summary = status.viewer
      ? t("statusConnected", { workspace: status.workspace.name, user: status.viewer.name })
      : t("statusConnectedNoUser", { workspace: status.workspace.name });
  } else if (status) {
    const state = status.state;
    const authMode = status.authMode;
    const oauthConfigured = Boolean(status.ui && status.ui.oauthConfigured);
    if (state === "connecting") summary = t("connecting");
    else if (state === "expired") summary = t("expired");
    else if (state === "revoked") summary = t("revoked");
    else if (state === "error") summary = t("errorCheckFailed");
    else if (authMode === "apiKey") summary = t("disconnectedApiKey");
    else if (!oauthConfigured) summary = t("disconnectedOauthNotConfigured");
    else summary = t("disconnectedOauth");
  } else {
    summary = t("statusNotConnected");
  }

  const formState = form.state();
  const formDisabled = !formState.ready || !formState.writable || formState.unavailable;
  const oauthMode = formState.authMode === "oauth";
  const field = (name) => {
    const staged = formState.staged.get(name);
    const current = formState.value[name];
    return {
      // The secret is never echoed: the base text is always empty unless the
      // user is editing a draft.
      text:
        name === "oauthClientSecret"
          ? (staged ?? "")
          : staged !== undefined
            ? staged
            : String(current ?? ""),
      overridden: Object.hasOwn(formState.user, name) && staged === undefined,
    };
  };
  const resetField = (name) => {
    // An empty draft stages a clear — saving unsets the user-layer value.
    form.edit(name, "");
  };

  return React.createElement(
    "li",
    { className: `dshl_card${open ? " dshl_cardOpen" : ""}` },
    React.createElement(
      "button",
      {
        type: "button",
        className: "dshl_header",
        "aria-expanded": open,
        onClick: () => setOpen(!open),
      },
      React.createElement(
        "span",
        { className: "dshl_headText" },
        React.createElement("span", { className: "dshl_name" }, t("name")),
        React.createElement(
          "span",
          { className: "dshl_description" },
          connected ? t("descriptionConnected") : t("descriptionDisconnected"),
        ),
      ),
      React.createElement(Chevron, { open }),
    ),
    open
      ? React.createElement(
          "div",
          { className: "dshl_body" },
          React.createElement("p", { className: "dshl_status" }, summary),
          React.createElement(
            "div",
            { className: "dshl_actions" },
            connected
              ? null
              : React.createElement(
                  "button",
                  {
                    type: "button",
                    className: "dshl_button",
                    disabled: busy,
                    onClick: () => act("connect"),
                  },
                  t("connect"),
                ),
            connected
              ? React.createElement(
                  "button",
                  {
                    type: "button",
                    className: "dshl_button dshl_ghost",
                    disabled: busy,
                    onClick: () => act("reconnect"),
                  },
                  t("reconnect"),
                )
              : null,
            connected
              ? React.createElement(
                  "button",
                  {
                    type: "button",
                    className: "dshl_button dshl_ghost",
                    disabled: busy,
                    onClick: () => act("disconnect"),
                  },
                  t("disconnect"),
                )
              : null,
          ),
          error
            ? React.createElement("p", { className: "dshl_error", role: "status" }, error)
            : null,
          React.createElement("hr", { className: "dshl_divider" }),
          React.createElement(
            "div",
            { className: "dshl_form" },
            React.createElement(
              "div",
              { className: "dshl_formHead" },
              React.createElement("p", { className: "dshl_formTitle" }, t("formTitle")),
              React.createElement("p", { className: "dshl_formHint" }, t("formHint")),
            ),
            formState.ready
              ? null
              : React.createElement("p", { className: "dshl_hint" }, t("formUnavailable")),
            formDisabled
              ? React.createElement("p", { className: "dshl_hint" }, t("readOnly"))
              : null,
            React.createElement(Field, {
              id: "dshl-auth-mode",
              label: t("authMode"),
              select: true,
              text: formState.authMode,
              disabled: formDisabled,
              options: [
                { value: "oauth", label: t("authModeOauth") },
                { value: "apiKey", label: t("authModeApiKey") },
              ],
              t,
              onEdit: (text) => form.edit("authMode", text),
            }),
            oauthMode
              ? React.createElement(
                  "div",
                  { style: { display: "flex", flexDirection: "column", gap: 12 } },
                  React.createElement(Field, {
                    id: "dshl-client-id",
                    label: t("oauthClientId"),
                    ...field("oauthClientId"),
                    t,
                    disabled: formDisabled,
                    onEdit: (text) => form.edit("oauthClientId", text),
                    onReset: () => resetField("oauthClientId"),
                  }),
                  React.createElement(Field, {
                    id: "dshl-client-secret",
                    label: t("oauthClientSecret"),
                    hint: t("oauthClientSecretHint"),
                    secret: true,
                    ...field("oauthClientSecret"),
                    t,
                    disabled: formDisabled,
                    onEdit: (text) => form.edit("oauthClientSecret", text),
                  }),
                  React.createElement(Field, {
                    id: "dshl-redirect-uri",
                    label: t("redirectUri"),
                    hint: t("redirectUriHint"),
                    ...field("redirectUri"),
                    t,
                    disabled: formDisabled,
                    onEdit: (text) => form.edit("redirectUri", text),
                    onReset: () => resetField("redirectUri"),
                  }),
                )
              : React.createElement(
                  "div",
                  { style: { display: "flex", flexDirection: "column", gap: 12 } },
                  React.createElement(Field, {
                    id: "dshl-api-key",
                    label: t("apiKey"),
                    hint: t("apiKeyHint"),
                    secret: true,
                    text: formState.staged.get("apiKey") ?? "",
                    overridden: false,
                    t,
                    disabled: formDisabled,
                    onEdit: (text) => form.edit("apiKey", text),
                  }),
                  React.createElement(
                    "div",
                    { className: "dshl_fieldHead" },
                    React.createElement(
                      "span",
                      {
                        className: `dshl_badge${formState.apiKeyConfigured ? " dshl_badgeOk" : ""}`,
                      },
                      formState.apiKeyConfigured ? t("apiKeyConfigured") : t("apiKeyNotConfigured"),
                    ),
                  ),
                ),
            React.createElement(
              "div",
              { className: "dshl_footer" },
              formState.saved
                ? React.createElement(
                    "p",
                    { className: "dshl_footerNote dshl_footerNoteOk" },
                    t("savedNote"),
                  )
                : formState.failed
                  ? React.createElement(
                      "p",
                      { className: "dshl_footerNote dshl_footerNoteFail" },
                      t("saveFailed"),
                    )
                  : React.createElement("p", { className: "dshl_footerNote" }, t("formHint")),
              React.createElement(
                "button",
                {
                  type: "button",
                  className: "dshl_button dshl_ghost",
                  disabled: !formState.dirty || formState.saving || formDisabled,
                  onClick: () => form.discard(),
                },
                t("discard"),
              ),
              React.createElement(
                "button",
                {
                  type: "button",
                  className: "dshl_button",
                  disabled: !formState.dirty || formState.saving || formDisabled,
                  onClick: () => form.save(),
                },
                formState.saving ? t("saving") : t("save"),
              ),
            ),
          ),
        )
      : null,
  );
}

/** Client services this plugin consumes (Cordis inject). */
export const inject = ["slots", "locale", "connection"];

/** Register the connector card into the Settings → Plugins item slot. */
export function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), "dsh-linear: card dictionaries");
  const { api } = ctx.get("connection");
  const form = new LinearSettingsForm(api);
  ctx.slots.inject("settings.plugin.item", function* () {
    yield ctx.slots.register(
      {
        name: "settings.plugin.item",
        id: "linear",
        order: 30,
        locale: NS,
        inject: () => ({ linearForm: form }),
      },
      LinearCard,
    );
  });
}
