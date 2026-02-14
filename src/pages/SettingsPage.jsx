import { useState } from "react";

export default function SettingsPage({
  isAdmin,
  settings,
  savedSettings,
  onSettingsChange,
  onSave,
  onSaveNow,
  onDiscard,
  message,
  serverStatus,
  serverStatusError,
  onRefreshStatus,
  onLogout,
}) {
  const [copyNotice, setCopyNotice] = useState("");
  const [activeSettingsTab, setActiveSettingsTab] = useState("general");
  const base = savedSettings || {};
  const normalizeValue = (value) => String(value || "").trim();
  const normalizeAccounts = (accounts = []) =>
    (accounts || []).map((account) => ({
      bankName: normalizeValue(account.bankName),
      accountName: normalizeValue(account.accountName),
      accountNumber: normalizeValue(account.accountNumber),
    }));

  const isEmbyDirty =
    normalizeValue(settings.embyUrl) !== normalizeValue(base.embyUrl) ||
    normalizeValue(settings.embyHomeUrl) !== normalizeValue(base.embyHomeUrl) ||
    normalizeValue(settings.apiKey) !== normalizeValue(base.apiKey);

  const isJellyseerrDirty =
    normalizeValue(settings.jellyseerrUrl) !== normalizeValue(base.jellyseerrUrl) ||
    normalizeValue(settings.jellyseerrApiKey) !== normalizeValue(base.jellyseerrApiKey);

  const isServersDirty =
    normalizeValue(settings.sonarrUrl) !== normalizeValue(base.sonarrUrl) ||
    normalizeValue(settings.sonarrApiKey) !== normalizeValue(base.sonarrApiKey) ||
    normalizeValue(settings.radarrUrl) !== normalizeValue(base.radarrUrl) ||
    normalizeValue(settings.radarrApiKey) !== normalizeValue(base.radarrApiKey);

  const isAccountsDirty =
    JSON.stringify(normalizeAccounts(settings.accounts)) !==
      JSON.stringify(normalizeAccounts(base.accounts)) ||
    normalizeValue(settings.instructions) !== normalizeValue(base.instructions);

  const isAppearanceDirty =
    Boolean(settings.allowUserThemeToggle) !== Boolean(base.allowUserThemeToggle);

  const telegramToken = normalizeValue(settings.telegramBotToken);
  const telegramAdmins = normalizeValue(settings.telegramAdminIds);
  const wizardStep =
    !telegramToken ? 1 : !telegramAdmins ? 2 : !settings.telegramSetupComplete ? 3 : 4;

  const markTelegramComplete = () => {
    onSettingsChange("telegramSetupComplete", true);
    onSaveNow?.();
  };

  const safeUUID = () => {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  };

  const handleCopy = async (value) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopyNotice(value);
      window.setTimeout(() => setCopyNotice(""), 1500);
    } catch {
      // Ignore clipboard errors.
    }
  };
  return (
    <section className="card settings-page">
      <div className="card-header">
        <h2>Settings</h2>
        <div className="pill">{isAdmin ? "admin" : "user"}</div>
      </div>
      <div className="tab-row">
        <button
          className={`tab-button ${activeSettingsTab === "general" ? "active" : ""}`}
          type="button"
          onClick={() => setActiveSettingsTab("general")}
        >
          General
        </button>
        {isAdmin && (
          <button
            className={`tab-button ${activeSettingsTab === "wizard" ? "active" : ""}`}
            type="button"
            onClick={() => setActiveSettingsTab("wizard")}
          >
            Setup Wizard
          </button>
        )}
      </div>

      <form onSubmit={onSave} className="stack">
        {isAdmin && activeSettingsTab === "wizard" && (
          <div className="settings-group wizard-card">
            <div className="section-title">Setup Wizard</div>
            <div className="wizard-step">
              <div className="wizard-label">
                {wizardStep >= 4 ? "Step 3 of 3" : `Step ${wizardStep} of 3`}
              </div>
              {wizardStep === 1 && (
                <>
                  <div className="wizard-title">Create Telegram Bot</div>
                  <div className="wizard-body">
                    Open Telegram → chat <strong>@BotFather</strong> → send <code>/newbot</code> →
                    copy the bot token.
                  </div>
                  <label>
                    Bot Token
                    <input
                      type="password"
                      value={settings.telegramBotToken || ""}
                      onChange={(event) =>
                        onSettingsChange("telegramBotToken", event.target.value)
                      }
                      placeholder="Paste Telegram bot token"
                      disabled={!isAdmin}
                    />
                  </label>
                </>
              )}
              {wizardStep === 2 && (
                <>
                  <div className="wizard-title">Add Admin Telegram IDs</div>
                  <div className="wizard-body">
                    Use <strong>@userinfobot</strong> to get your Telegram ID. Paste one or more IDs
                    separated by commas.
                  </div>
                  <label>
                    Admin Telegram IDs
                    <input
                      type="text"
                      value={settings.telegramAdminIds || ""}
                      onChange={(event) =>
                        onSettingsChange("telegramAdminIds", event.target.value)
                      }
                      placeholder="123456789, 987654321"
                      disabled={!isAdmin}
                    />
                  </label>
                </>
              )}
              {wizardStep === 3 && (
                <>
                  <div className="wizard-title">Finish Telegram Setup</div>
                  <div className="wizard-body">
                    Telegram bot is configured. Save settings and mark as complete to unlock the
                    next step.
                  </div>
                  <div className="row">
                    <button className="btn small" type="submit" disabled={!isAdmin}>
                      Save Telegram
                    </button>
                    <button
                      className="btn ghost small"
                      type="button"
                      onClick={markTelegramComplete}
                      disabled={!isAdmin}
                    >
                      Mark Complete
                    </button>
                  </div>
                </>
              )}
              {wizardStep === 4 && (
                <>
                  <div className="wizard-title">Telegram Complete</div>
                  <div className="wizard-body">
                    Telegram bot is configured. You can now receive approvals and notifications.
                  </div>
                  <div className="row">
                    <button className="btn small" type="submit" disabled={!isAdmin}>
                      Save Telegram
                    </button>
                    <button
                      className="btn ghost small"
                      type="button"
                      onClick={() => {
                        onSettingsChange("telegramSetupComplete", false);
                        onSettingsChange("telegramBotToken", "");
                        onSettingsChange("telegramAdminIds", "");
                        onSaveNow?.();
                      }}
                      disabled={!isAdmin}
                    >
                      Reset Wizard
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      {activeSettingsTab === "general" && (
        <>
        {isAdmin && (
          <div className="settings-group">
            <div className="section-title">System Status</div>
            {serverStatusError && <div className="note">{serverStatusError}</div>}
            <div className="status-grid">
              <div className="status-item">
                <span className="status-label">Telegram Bot</span>
                <span className={`status-pill ${serverStatus?.telegramBot?.running ? "ok" : "bad"}`}>
                  {serverStatus?.telegramBot?.running ? "Running" : "Stopped"}
                </span>
              </div>
              <div className="status-item">
                <span className="status-label">Emby</span>
                <span className={`status-pill ${serverStatus?.emby?.ok ? "ok" : "bad"}`}>
                  {serverStatus?.emby?.ok ? "OK" : "Error"}
                </span>
                {!serverStatus?.emby?.ok && serverStatus?.emby?.message && (
                  <span className="status-note">{serverStatus.emby.message}</span>
                )}
              </div>
              <div className="status-item">
                <span className="status-label">Jellyseerr</span>
                <span className={`status-pill ${serverStatus?.jellyseerr?.ok ? "ok" : "bad"}`}>
                  {serverStatus?.jellyseerr?.ok ? "OK" : "Error"}
                </span>
                {!serverStatus?.jellyseerr?.ok && serverStatus?.jellyseerr?.message && (
                  <span className="status-note">{serverStatus.jellyseerr.message}</span>
                )}
              </div>
              <div className="status-item">
                <span className="status-label">Sonarr</span>
                <span className={`status-pill ${serverStatus?.sonarr?.ok ? "ok" : "bad"}`}>
                  {serverStatus?.sonarr?.ok ? "OK" : "Error"}
                </span>
                {!serverStatus?.sonarr?.ok && serverStatus?.sonarr?.message && (
                  <span className="status-note">{serverStatus.sonarr.message}</span>
                )}
              </div>
              <div className="status-item">
                <span className="status-label">Radarr</span>
                <span className={`status-pill ${serverStatus?.radarr?.ok ? "ok" : "bad"}`}>
                  {serverStatus?.radarr?.ok ? "OK" : "Error"}
                </span>
                {!serverStatus?.radarr?.ok && serverStatus?.radarr?.message && (
                  <span className="status-note">{serverStatus.radarr.message}</span>
                )}
              </div>
            </div>
            <div className="row">
              <button className="btn ghost small" type="button" onClick={onRefreshStatus}>
                Refresh Status
              </button>
            </div>
          </div>
        )}
        <div className="settings-group">
          <div className="section-title">Emby</div>
          <div className="grid-2">
            <label>
              Emby URL
              <div className="input-row">
                <input
                  type="url"
                  value={settings.embyUrl || ""}
                  onChange={(event) => onSettingsChange("embyUrl", event.target.value)}
                  placeholder="https://emby.yourdomain.com"
                  required
                  disabled={!isAdmin}
                />
                <button
                  type="button"
                  className={`btn ghost tiny account-copy ${
                    copyNotice === settings.embyUrl ? "copied" : ""
                  }`}
                  disabled={!settings.embyUrl}
                  onClick={() => handleCopy(settings.embyUrl)}
                >
                  {copyNotice === settings.embyUrl ? "(Copied)" : "(Click to copy)"}
                </button>
              </div>
            </label>
            <label>
              Emby Home URL
              <input
                type="url"
                value={settings.embyHomeUrl || ""}
                onChange={(event) => onSettingsChange("embyHomeUrl", event.target.value)}
                placeholder="https://movieflix.yourdomain.com"
                disabled={!isAdmin}
              />
            </label>
          </div>
          <label>
            Emby API Key
            <input
              type="password"
              value={settings.apiKey || ""}
              onChange={(event) => onSettingsChange("apiKey", event.target.value)}
              placeholder="Paste API key"
              required
              disabled={!isAdmin}
            />
          </label>
          {isEmbyDirty && (
            <div className="row">
              <button className="btn small" type="submit" disabled={!isAdmin}>
                Save Emby
              </button>
              <button
                className="btn ghost small"
                type="button"
                onClick={() => onDiscard?.("emby")}
                disabled={!isAdmin}
              >
                Discard
              </button>
            </div>
          )}
        </div>

        <div className="settings-group">
          <div className="section-title">Jellyseerr</div>
          <div className="grid-2">
            <label>
              Jellyseerr URL
              <input
                type="url"
                value={settings.jellyseerrUrl || ""}
                onChange={(event) => onSettingsChange("jellyseerrUrl", event.target.value)}
                placeholder="https://requests.yourdomain.com"
                disabled={!isAdmin}
              />
            </label>
            <label>
              Jellyseerr API Key
              <input
                type="password"
                value={settings.jellyseerrApiKey || ""}
                onChange={(event) => onSettingsChange("jellyseerrApiKey", event.target.value)}
                placeholder="Paste Jellyseerr API key"
                disabled={!isAdmin}
              />
            </label>
          </div>
          {isJellyseerrDirty && (
            <div className="row">
              <button className="btn small" type="submit" disabled={!isAdmin}>
                Save Jellyseerr
              </button>
              <button
                className="btn ghost small"
                type="button"
                onClick={() => onDiscard?.("jellyseerr")}
                disabled={!isAdmin}
              >
                Discard
              </button>
            </div>
          )}
        </div>

        <div className="settings-group">
          <div className="section-title">Download Servers</div>
          <div className="grid-2">
            <label>
              Sonarr URL
              <input
                type="url"
                value={settings.sonarrUrl || ""}
                onChange={(event) => onSettingsChange("sonarrUrl", event.target.value)}
                placeholder="https://sonarr.yourdomain.com"
                disabled={!isAdmin}
              />
            </label>
            <label>
              Sonarr API Key
              <input
                type="password"
                value={settings.sonarrApiKey || ""}
                onChange={(event) => onSettingsChange("sonarrApiKey", event.target.value)}
                placeholder="Paste Sonarr API key"
                disabled={!isAdmin}
              />
            </label>
            <label>
              Radarr URL
              <input
                type="url"
                value={settings.radarrUrl || ""}
                onChange={(event) => onSettingsChange("radarrUrl", event.target.value)}
                placeholder="https://radarr.yourdomain.com"
                disabled={!isAdmin}
              />
            </label>
            <label>
              Radarr API Key
              <input
                type="password"
                value={settings.radarrApiKey || ""}
                onChange={(event) => onSettingsChange("radarrApiKey", event.target.value)}
                placeholder="Paste Radarr API key"
                disabled={!isAdmin}
              />
            </label>
          </div>
          {isServersDirty && (
            <div className="row">
              <button className="btn small" type="submit" disabled={!isAdmin}>
                Save Servers
              </button>
              <button
                className="btn ghost small"
                type="button"
                onClick={() => onDiscard?.("servers")}
                disabled={!isAdmin}
              >
                Discard
              </button>
            </div>
          )}
        </div>

        <div className="settings-group">
          <div className="section-title">Appearance</div>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={Boolean(settings.allowUserThemeToggle)}
              onChange={(event) =>
                onSettingsChange("allowUserThemeToggle", event.target.checked)
              }
              disabled={!isAdmin}
            />
            <span>Allow users to toggle light mode</span>
          </label>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={Boolean(settings.disableAutoTrial)}
              onChange={(event) => onSettingsChange("disableAutoTrial", event.target.checked)}
              disabled={!isAdmin}
            />
            <span>Disable auto trial creation</span>
          </label>
          {isAppearanceDirty && (
            <div className="row">
              <button className="btn small" type="submit" disabled={!isAdmin}>
                Save Appearance
              </button>
              <button
                className="btn ghost small"
                type="button"
                onClick={() => onDiscard?.("appearance")}
                disabled={!isAdmin}
              >
                Discard
              </button>
            </div>
          )}
        </div>

        <div className="settings-group">
          <div className="section-title">Payment Accounts</div>
        {(settings.accounts || []).map((account, index) => (
          <div className="account-row" key={account.id || index}>
            <label className="account-field">
              Bank Name:
              <input
                type="text"
                value={account.bankName || ""}
                onChange={(event) => {
                  const next = [...(settings.accounts || [])];
                  next[index] = { ...next[index], bankName: event.target.value };
                  onSettingsChange("accounts", next);
                }}
                placeholder="Bank"
                disabled={!isAdmin}
              />
            </label>
            <label className="account-field">
              Account Name:
              <input
                type="text"
                value={account.accountName || ""}
                onChange={(event) => {
                  const next = [...(settings.accounts || [])];
                  next[index] = { ...next[index], accountName: event.target.value };
                  onSettingsChange("accounts", next);
                }}
                placeholder="Account holder name"
                disabled={!isAdmin}
              />
            </label>
            <label className="account-field">
              Account Number:
              <input
                type="text"
                value={account.accountNumber || ""}
                onChange={(event) => {
                  const next = [...(settings.accounts || [])];
                  next[index] = { ...next[index], accountNumber: event.target.value };
                  onSettingsChange("accounts", next);
                }}
                placeholder="Account number"
                disabled={!isAdmin}
              />
            </label>
            <button
              className="btn ghost small"
              type="button"
              onClick={() => {
                const next = (settings.accounts || []).filter((_, idx) => idx !== index);
                onSettingsChange("accounts", next);
              }}
              disabled={!isAdmin}
            >
              Remove
            </button>
          </div>
        ))}
        <div className="row">
          <button
            className="btn"
            type="button"
            onClick={() => {
              const next = [
                ...(settings.accounts || []),
                { id: safeUUID(), bankName: "", accountName: "", accountNumber: "" },
              ];
              onSettingsChange("accounts", next);
            }}
            disabled={!isAdmin}
          >
            Add Account
          </button>
        </div>
        <label>
          Payment Notes
          <textarea
            className="textarea"
            value={settings.instructions || ""}
            onChange={(event) => onSettingsChange("instructions", event.target.value)}
            placeholder="Any transfer notes or reference details"
            disabled={!isAdmin}
          />
        </label>
          {isAccountsDirty && (
            <div className="row">
              <button className="btn small" type="submit" disabled={!isAdmin}>
                Save Accounts
              </button>
              <button
                className="btn ghost small"
                type="button"
                onClick={() => onDiscard?.("accounts")}
                disabled={!isAdmin}
              >
                Discard
              </button>
            </div>
          )}
        </div>
        </>
        )}
        {message && <div className="note">{message}</div>}
      </form>
    </section>
  );
}
