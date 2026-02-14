import fs from "fs";
import http from "http";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";
import { execFileSync, spawn } from "child_process";
import fetch from "node-fetch";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.resolve(__dirname, "..");
const DIST = path.resolve(ROOT, "dist");

const settingsFile = path.resolve(ROOT, "settings.json");
const subscriptionsFile = path.resolve(ROOT, "subscriptions.json");
const plansFile = path.resolve(ROOT, "plans.json");
const movieRequestsFile = path.resolve(ROOT, "movie-requests.json");
const mediaRequestsFile = path.resolve(ROOT, "media-requests.json");
const unlimitedFile = path.resolve(ROOT, "unlimited-users.json");
const tagsFile = path.resolve(ROOT, "user-tags.json");
const telegramPidFile = path.resolve(ROOT, ".pids", "telegram-bot.pid");
const telegramLockFile = path.resolve(ROOT, "telegram-bot.lock");
const cloudflaredPidFile = path.resolve(ROOT, ".pids", "cloudflared.pid");
const cloudflaredLockFile = path.resolve(ROOT, "cloudflared.lock");
const cloudflaredLogFile = path.resolve("/tmp", "cloudflared.log");
const cloudflaredBin =
  process.env.CLOUDFLARED_BIN || path.resolve(os.homedir(), "bin", "cloudflared");
const cloudflaredTunnelName = process.env.CLOUDFLARED_TUNNEL || "movieflix";

const clientErrorsLog = path.resolve(ROOT, "client-errors.log");
const embyProxyLog = path.resolve(ROOT, "emby-proxy.log");
const serviceProxyLog = path.resolve(ROOT, "service-proxy.log");
const errorLogFile = path.resolve("/tmp", "movieflix-error.log");

const PORT = Number(process.env.PORT || 5001);
const POLICY_SYNC_INTERVAL_MS = 10 * 1000;
const POLICY_SYNC_DEBOUNCE_MS = 500;

const loadEnv = () => {
  const envPath = path.resolve(ROOT, ".env");
  if (!fs.existsSync(envPath)) return;
  const raw = fs.readFileSync(envPath, "utf-8");
  raw.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const idx = trimmed.indexOf("=");
    if (idx === -1) return;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  });
};

loadEnv();

const readJson = (filePath, fallback) => {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

const writeJson = (filePath, data) => {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
};

const sendJson = (res, payload, status = 200) => {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
};

const getBody = async (req) =>
  await new Promise((resolve) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", () => resolve(""));
  });

const safeFetch = async (url, options = {}) => {
  try {
    const response = await fetch(url, options);
    const text = await response.text();
    return { ok: response.ok, status: response.status, text, headers: response.headers };
  } catch (err) {
    return { ok: false, status: 0, text: err?.message || "fetch_failed" };
  }
};

const extractPublicBase = (text) => {
  if (!text) return "";
  const match = text.match(/public base URL of\s+([^\s]+)/i);
  if (!match) return "";
  const raw = match[1].replace(/['"]/g, "");
  if (!raw) return "";
  const normalized = raw.startsWith("/") ? raw : `/${raw}`;
  return normalized.replace(/\/+$/, "");
};

const loadSettings = () => readJson(settingsFile, {});
const getSetting = (settings, key, envKey) => process.env[envKey] || settings?.[key] || "";

const writeLog = (filePath, line) => {
  try {
    fs.appendFileSync(filePath, `${new Date().toISOString()} ${line}\n`);
  } catch {
    // ignore log errors
  }
};

const logServerError = (label, err) => {
  const message =
    err && typeof err === "object"
      ? `${label} ${err.message || ""} ${err.stack || ""}`.trim()
      : `${label} ${String(err)}`;
  writeLog(errorLogFile, message);
};

process.on("uncaughtException", (err) => {
  logServerError("uncaughtException", err);
});

process.on("unhandledRejection", (err) => {
  logServerError("unhandledRejection", err);
});

const isProcessRunning = (pid) => {
  if (!pid || Number.isNaN(Number(pid))) return false;
  try {
    process.kill(Number(pid), 0);
    return true;
  } catch {
    return false;
  }
};

const ensurePidDir = () => {
  const dir = path.resolve(ROOT, ".pids");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
};

const isTelegramBotRunning = () => {
  if (fs.existsSync(telegramPidFile)) {
    try {
      const pid = Number(fs.readFileSync(telegramPidFile, "utf-8").trim());
      if (isProcessRunning(pid)) return true;
    } catch {
      // ignore pid read errors
    }
  }
  if (fs.existsSync(telegramLockFile)) {
    try {
      const stat = fs.statSync(telegramLockFile);
      const ageMs = Date.now() - stat.mtimeMs;
      return ageMs < 10 * 60 * 1000;
    } catch {
      // ignore stat errors
    }
  }
  try {
    const output = execFileSync("ps", ["-ef"], { encoding: "utf-8" });
    return output
      .split("\n")
      .some((line) => line.includes("telegram-bot.js") && line.includes("node"));
  } catch {
    // ignore ps errors
  }
  return false;
};

const isCloudflaredRunning = () => {
  if (fs.existsSync(cloudflaredPidFile)) {
    try {
      const pid = Number(fs.readFileSync(cloudflaredPidFile, "utf-8").trim());
      if (isProcessRunning(pid)) return true;
    } catch {
      // ignore
    }
  }
  if (fs.existsSync(cloudflaredLockFile)) {
    try {
      const stat = fs.statSync(cloudflaredLockFile);
      const ageMs = Date.now() - stat.mtimeMs;
      return ageMs < 10 * 60 * 1000;
    } catch {
      // ignore
    }
  }
  try {
    const output = execFileSync("ps", ["-ef"], { encoding: "utf-8" });
    return output
      .split("\n")
      .some(
        (line) =>
          line.includes("cloudflared") &&
          line.includes("tunnel") &&
          line.includes("run") &&
          !line.includes("grep")
      );
  } catch {
    // ignore ps errors
  }
  return false;
};

const isUnlimitedUser = (user, unlimitedList) => {
  const name = String(user?.Name || user?.name || "").toLowerCase();
  const userId = user?.Id || user?.id || "";
  return (unlimitedList || []).some(
    (item) =>
      item?.key === userId ||
      (item?.userId && item.userId === userId) ||
      (item?.username || "").toLowerCase() === name
  );
};

const getUserSubscriptionStatus = (subs, user) => {
  const userId = user?.Id || user?.id || "";
  const nameKey = String(user?.Name || user?.name || "").toLowerCase();
  const matching = (subs || []).filter((sub) => {
    const subUserId = sub?.userId || sub?.userKey || "";
    const subName = String(sub?.username || "").toLowerCase();
    return (userId && subUserId === userId) || (nameKey && subName === nameKey);
  });

  if (matching.length === 0) return { status: "expired" };

  const latest = matching
    .filter((sub) => sub?.endDate)
    .sort(
      (a, b) =>
        new Date(b.endDate || b.submittedAt || 0) -
        new Date(a.endDate || a.submittedAt || 0)
    )[0];

  if (!latest?.endDate) return { status: "expired" };

  const end = new Date(latest.endDate);
  if (Number.isNaN(end.getTime())) return { status: "expired" };
  const endUtc = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  const now = new Date();
  const nowUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return endUtc >= nowUtc ? { status: "active" } : { status: "expired" };
};

const syncPlaybackLibraries = async () => {
  const settings = loadSettings();
  const embyUrl = settings?.embyUrl;
  const apiKey = settings?.apiKey;
  if (!embyUrl || !apiKey) return;

  const base = embyUrl.replace(/\/+$/, "");
  const headers = { "X-Emby-Token": apiKey };

  const libsRes = await safeFetch(
    `${base}/Library/SelectableMediaFolders?api_key=${apiKey}`,
    { headers }
  );
  if (!libsRes.ok) {
    writeLog(embyProxyLog, `policy-sync libs failed ${libsRes.status}`);
    return;
  }
  let libs = [];
  try {
    libs = libsRes.text ? JSON.parse(libsRes.text) : [];
  } catch {
    libs = [];
  }
  const allGuids = (Array.isArray(libs) ? libs : [])
    .map((item) => item?.Guid || item?.Id || "")
    .filter(Boolean);
  const subscription = (Array.isArray(libs) ? libs : []).find(
    (item) => String(item?.Name || "").trim().toLowerCase() === "subscription"
  );
  const subscriptionGuid = subscription?.Guid || subscription?.Id || null;

  const usersRes = await safeFetch(`${base}/Users?api_key=${apiKey}`, { headers });
  if (!usersRes.ok) {
    writeLog(embyProxyLog, `policy-sync users failed ${usersRes.status}`);
    return;
  }
  let users = [];
  try {
    users = usersRes.text ? JSON.parse(usersRes.text) : [];
  } catch {
    users = [];
  }

  const currentIds = new Set(
    (users || []).map((user) => user?.Id || user?.id || "").filter(Boolean)
  );
  const currentNames = new Set(
    (users || [])
      .map((user) => String(user?.Name || user?.name || "").toLowerCase())
      .filter(Boolean)
  );

  const subscriptions = readJson(subscriptionsFile, []);
  const unlimitedUsers = readJson(unlimitedFile, []);
  const userTags = readJson(tagsFile, {});
  const movieRequests = readJson(movieRequestsFile, []);

  const pruneByUsers = () => {
    let changed = false;

    const nextSubs = (subscriptions || []).filter((sub) => {
      const key = sub?.userId || sub?.userKey || "";
      const name = String(sub?.username || "").toLowerCase();
      if (key && !currentIds.has(key)) return false;
      if (!key && name && !currentNames.has(name)) return false;
      return true;
    });
    if (nextSubs.length !== (subscriptions || []).length) {
      writeJson(subscriptionsFile, nextSubs);
      changed = true;
    }

    const nextUnlimited = (unlimitedUsers || []).filter((item) => {
      const key = item?.userId || item?.key || "";
      const name = String(item?.username || "").toLowerCase();
      if (key && !currentIds.has(key)) return false;
      if (!item?.userId && name && !currentNames.has(name)) return false;
      return true;
    });
    if (nextUnlimited.length !== (unlimitedUsers || []).length) {
      writeJson(unlimitedFile, nextUnlimited);
      changed = true;
    }

    if (userTags && typeof userTags === "object") {
      const nextTags = { ...userTags };
      let tagsChanged = false;
      Object.keys(nextTags).forEach((key) => {
        const lower = key.toLowerCase();
        const isId = currentIds.has(key);
        const isName = currentNames.has(lower);
        if (!isId && !isName) {
          delete nextTags[key];
          tagsChanged = true;
        }
      });
      if (tagsChanged) {
        writeJson(tagsFile, nextTags);
        changed = true;
      }
    }

    const nextRequests = (movieRequests || []).filter((req) => {
      const name = String(req?.requestedBy || "").toLowerCase();
      if (name && !currentNames.has(name)) return false;
      return true;
    });
    if (nextRequests.length !== (movieRequests || []).length) {
      writeJson(movieRequestsFile, nextRequests);
      changed = true;
    }

    if (changed) {
      writeLog(embyProxyLog, "policy-sync pruned deleted users from dashboard data");
    }
  };

  pruneByUsers();

  const normalizeList = (value) =>
    (Array.isArray(value) ? value : []).map(String).filter(Boolean).sort();

  let updated = 0;
  const disableAutoTrial = Boolean(settings?.disableAutoTrial);
  const nowIso = new Date().toISOString();
  const addDays = (iso, days) => {
    const base = new Date(iso);
    if (Number.isNaN(base.getTime())) return iso;
    base.setUTCDate(base.getUTCDate() + days);
    return base.toISOString();
  };
  const subscriptionsByUser = new Map();
  (subscriptions || []).forEach((sub) => {
    const key = sub?.userId || sub?.userKey || "";
    if (!key) return;
    const time = new Date(sub.endDate || sub.submittedAt || 0).getTime();
    const existing = subscriptionsByUser.get(key);
    if (!existing || time >= existing.time) {
      subscriptionsByUser.set(key, { sub, time });
    }
  });
  const hasAnySubscription = (userId, username) => {
    const nameKey = String(username || "").toLowerCase();
    return (subscriptions || []).some((sub) => {
      const key = sub?.userId || sub?.userKey || "";
      const name = String(sub?.username || "").toLowerCase();
      return (userId && key === userId) || (nameKey && name === nameKey);
    });
  };
  for (const user of users) {
    const userId = user?.Id || user?.id;
    const policy = user?.Policy || {};
    if (!userId) continue;

    if (!disableAutoTrial && !isUnlimitedUser(user, unlimitedUsers)) {
      const username = user?.Name || user?.name || "";
      if (hasAnySubscription(userId, username)) {
        // Never touch existing users' subscription history.
      } else {
      const latest = subscriptionsByUser.get(userId)?.sub;
      const hasApproved = latest?.status === "approved" || latest?.status === "active";
      if (!hasApproved) {
        const trial = {
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          userKey: userId,
          userId,
          username: user?.Name || user?.name || "Unknown",
          planId: "auto-trial-7",
          planName: "Auto Trial",
          durationDays: 7,
          price: 0,
          currency: "MVR",
          status: "approved",
          submittedAt: nowIso,
          startDate: nowIso,
          endDate: addDays(nowIso, 7),
          source: "auto",
        };
        subscriptions.push(trial);
        subscriptionsByUser.set(userId, {
          sub: trial,
          time: new Date(trial.endDate).getTime(),
        });
        writeJson(subscriptionsFile, subscriptions);
      }
      }
    }

    const status = getUserSubscriptionStatus(subscriptions, user);
    const unlimited = isUnlimitedUser(user, unlimitedUsers);
    const isAdmin =
      user?.Policy?.IsAdministrator === true || user?.Configuration?.IsAdministrator === true;
    const shouldEnableLibraries = unlimited || isAdmin || status.status === "active";

    let target = {};
    if (shouldEnableLibraries) {
      target = {
        EnableAllFolders: false,
        EnabledFolders: subscriptionGuid
          ? allGuids.filter((guid) => guid !== subscriptionGuid)
          : allGuids,
        EnableAllChannels: true,
        EnabledChannels: [],
      };
    } else {
      target = {
        EnableAllFolders: false,
        EnabledFolders: subscriptionGuid ? [subscriptionGuid] : [],
        EnableAllChannels: false,
        EnabledChannels: [],
      };
    }

    const needsUpdate =
      Boolean(policy.EnableAllFolders) !== Boolean(target.EnableAllFolders) ||
      Boolean(policy.EnableAllChannels) !== Boolean(target.EnableAllChannels) ||
      normalizeList(policy.EnabledFolders).join("|") !==
        normalizeList(target.EnabledFolders).join("|") ||
      normalizeList(policy.EnabledChannels).join("|") !==
        normalizeList(target.EnabledChannels).join("|");

    if (!needsUpdate) continue;

    const nextPolicy = { ...policy, EnableMediaPlayback: true, ...target };
    const policyUrl = `${base}/Users/${userId}/Policy?api_key=${apiKey}`;
    let resp = await safeFetch(policyUrl, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(nextPolicy),
    });
    if (!resp.ok) {
      resp = await safeFetch(policyUrl, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(nextPolicy),
      });
    }
    if (resp.ok) updated += 1;
  }

  if (updated > 0) {
    writeLog(embyProxyLog, `policy-sync updated=${updated}`);
  }
};

const handleSettings = async (req, res) => {
  if (req.method === "GET") {
    sendJson(res, readJson(settingsFile, {}));
    return true;
  }
  if (req.method === "POST") {
    const body = await getBody(req);
    let data = {};
    try {
      data = body ? JSON.parse(body) : {};
    } catch {
      data = {};
    }
    writeJson(settingsFile, data);
    sendJson(res, { ok: true });
    return true;
  }
  return false;
};

const handleSubscriptions = async (req, res) => {
  if (req.method === "GET") {
    sendJson(res, readJson(subscriptionsFile, []));
    return true;
  }
  if (req.method === "POST") {
    const body = await getBody(req);
    let data = [];
    try {
      data = body ? JSON.parse(body) : [];
    } catch {
      data = [];
    }
    writeJson(subscriptionsFile, data);
    sendJson(res, { ok: true });
    return true;
  }
  return false;
};

const handlePlans = async (req, res) => {
  if (req.method === "GET") {
    sendJson(res, readJson(plansFile, []));
    return true;
  }
  if (req.method === "POST") {
    const body = await getBody(req);
    let data = [];
    try {
      data = body ? JSON.parse(body) : [];
    } catch {
      data = [];
    }
    writeJson(plansFile, data);
    sendJson(res, { ok: true });
    return true;
  }
  return false;
};

const handleMovieRequests = async (req, res) => {
  if (req.method === "GET") {
    sendJson(res, readJson(movieRequestsFile, []));
    return true;
  }
  if (req.method === "POST") {
    const body = await getBody(req);
    let data = [];
    try {
      data = body ? JSON.parse(body) : [];
    } catch {
      data = [];
    }
    writeJson(movieRequestsFile, data);
    sendJson(res, { ok: true });
    return true;
  }
  return false;
};

const handleUnlimitedUsers = async (req, res) => {
  if (req.method === "GET") {
    sendJson(res, readJson(unlimitedFile, []));
    return true;
  }
  if (req.method === "POST") {
    const body = await getBody(req);
    let data = [];
    try {
      data = body ? JSON.parse(body) : [];
    } catch {
      data = [];
    }
    writeJson(unlimitedFile, data);
    sendJson(res, { ok: true });
    return true;
  }
  return false;
};

const handleUserTags = async (req, res) => {
  if (req.method === "GET") {
    sendJson(res, readJson(tagsFile, {}));
    return true;
  }
  if (req.method === "POST") {
    const body = await getBody(req);
    let data = {};
    try {
      data = body ? JSON.parse(body) : {};
    } catch {
      data = {};
    }
    writeJson(tagsFile, data);
    sendJson(res, { ok: true });
    return true;
  }
  return false;
};

const handleClientErrors = async (req, res) => {
  if (req.method !== "POST") return false;
  const body = await getBody(req);
  let payload = {};
  try {
    payload = body ? JSON.parse(body) : {};
  } catch {
    payload = { raw: body };
  }
  const entry = { timestamp: new Date().toISOString(), ...payload };
  try {
    fs.appendFileSync(clientErrorsLog, `${JSON.stringify(entry)}\n`);
  } catch {
    // ignore log errors
  }
  sendJson(res, { ok: true });
  return true;
};

const handleStatus = async (req, res) => {
  if (req.method !== "GET") return false;
  const settings = loadSettings();
  const status = {
    telegramBot: { running: isTelegramBotRunning() },
    tunnel: { running: isCloudflaredRunning() },
    emby: { ok: false, message: "Emby URL not set." },
    jellyseerr: { ok: false, message: "Jellyseerr URL not set." },
    sonarr: { ok: false, message: "Sonarr URL not set." },
    radarr: { ok: false, message: "Radarr URL not set." },
  };

  if (settings?.embyUrl && settings?.apiKey) {
    const base = settings.embyUrl.replace(/\/+$/, "");
    const resp = await safeFetch(`${base}/System/Info/Public?api_key=${settings.apiKey}`);
    status.emby = resp.ok
      ? { ok: true, message: "OK" }
      : { ok: false, message: resp.text || `HTTP ${resp.status}` };
  }

  if (settings?.jellyseerrUrl && settings?.jellyseerrApiKey) {
    const base = settings.jellyseerrUrl.replace(/\/+$/, "");
    const resp = await safeFetch(`${base}/api/v1/status`, {
      headers: { "X-Api-Key": settings.jellyseerrApiKey },
    });
    status.jellyseerr = resp.ok
      ? { ok: true, message: "OK" }
      : { ok: false, message: resp.text || `HTTP ${resp.status}` };
  }

  if (settings?.sonarrUrl && settings?.sonarrApiKey) {
    const base = settings.sonarrUrl.replace(/\/+$/, "");
    const resp = await safeFetch(`${base}/api/v3/system/status`, {
      headers: { "X-Api-Key": settings.sonarrApiKey },
    });
    status.sonarr = resp.ok
      ? { ok: true, message: "OK" }
      : { ok: false, message: resp.text || `HTTP ${resp.status}` };
  }

  if (settings?.radarrUrl && settings?.radarrApiKey) {
    const base = settings.radarrUrl.replace(/\/+$/, "");
    const resp = await safeFetch(`${base}/api/v3/system/status`, {
      headers: { "X-Api-Key": settings.radarrApiKey },
    });
    status.radarr = resp.ok
      ? { ok: true, message: "OK" }
      : { ok: false, message: resp.text || `HTTP ${resp.status}` };
  }

  sendJson(res, status);
  return true;
};

const handleTunnel = async (req, res) => {
  if (req.method === "GET") {
    sendJson(res, { running: isCloudflaredRunning() });
    return true;
  }

  if (req.method === "POST") {
    const action = String(req.url || "").includes("stop") ? "stop" : "start";
    if (action === "stop") {
      let stopped = false;
      if (fs.existsSync(cloudflaredPidFile)) {
        try {
          const pid = Number(fs.readFileSync(cloudflaredPidFile, "utf-8").trim());
          if (isProcessRunning(pid)) {
            process.kill(pid);
            stopped = true;
          }
        } catch {
          // ignore stop errors
        }
      }
      try {
        if (fs.existsSync(cloudflaredPidFile)) fs.unlinkSync(cloudflaredPidFile);
        if (fs.existsSync(cloudflaredLockFile)) fs.unlinkSync(cloudflaredLockFile);
      } catch {
        // ignore cleanup errors
      }
      sendJson(res, { ok: true, running: isCloudflaredRunning(), stopped });
      return true;
    }

    if (isCloudflaredRunning()) {
      sendJson(res, { ok: true, running: true, alreadyRunning: true });
      return true;
    }

    try {
      ensurePidDir();
      const out = fs.openSync(cloudflaredLogFile, "a");
      const err = fs.openSync(cloudflaredLogFile, "a");
      const child = spawn(
        cloudflaredBin,
        ["tunnel", "run", cloudflaredTunnelName],
        {
          detached: true,
          stdio: ["ignore", out, err],
        }
      );
      fs.writeFileSync(cloudflaredPidFile, String(child.pid));
      fs.writeFileSync(cloudflaredLockFile, new Date().toISOString());
      child.unref();
      sendJson(res, { ok: true, running: true, pid: child.pid });
      return true;
    } catch (err) {
      sendJson(res, { ok: false, running: false, error: err?.message || "start_failed" });
      return true;
    }
  }
  return false;
};

const handleMediaRequests = async (req, res, urlParts) => {
  const readData = () => readJson(mediaRequestsFile, []);
  const writeData = (data) => writeJson(mediaRequestsFile, data);

  const method = req.method || "GET";
  const parts = urlParts;

  if (method === "GET" && parts.length === 0) {
    sendJson(res, readData());
    return true;
  }

  if (method === "POST" && parts.length === 0) {
    const raw = await getBody(req);
    let payload = {};
    try {
      payload = raw ? JSON.parse(raw) : {};
    } catch {
      payload = {};
    }
    const next = readData();
    const now = new Date().toISOString();
    const id = payload.id || crypto.randomUUID();
    const record = {
      id,
      title: payload.title || payload.media_title || payload.name || "Untitled",
      media_type: payload.media_type || payload.mediaType || payload.type || "movie",
      tmdb_id: payload.tmdb_id || payload.tmdbId || payload.media_id || payload.mediaId || "",
      imdb_id: payload.imdb_id || payload.imdbId || "",
      poster_path: payload.poster_path || payload.posterPath || "",
      poster_url: payload.poster_url || payload.posterUrl || "",
      language: payload.language || payload.originalLanguage || payload.original_language || "",
      requested_by: payload.requested_by || payload.requestedBy || "",
      requested_by_username:
        payload.requested_by_username || payload.requestedByUsername || payload.username || "",
      status: payload.status || "pending",
      requested_at: payload.requested_at || payload.requestedAt || now,
      notes: payload.notes || "",
      jellyseerr_request_id:
        payload.jellyseerr_request_id || payload.jellyseerrRequestId || null,
      download_progress:
        typeof payload.download_progress === "number"
          ? payload.download_progress
          : payload.downloadProgress ?? null,
      release_status: payload.release_status || payload.releaseStatus || "",
      created_at: now,
      updated_at: now,
    };
    next.unshift(record);
    writeData(next);
    sendJson(res, record, 201);
    return true;
  }

  if (method === "PATCH" && parts.length === 1) {
    const id = parts[0];
    const raw = await getBody(req);
    let payload = {};
    try {
      payload = raw ? JSON.parse(raw) : {};
    } catch {
      payload = {};
    }
    const next = readData();
    const index = next.findIndex((item) => item.id === id);
    if (index === -1) {
      sendJson(res, { error: "Not found" }, 404);
      return true;
    }
    next[index] = { ...next[index], ...payload, updated_at: new Date().toISOString() };
    writeData(next);
    sendJson(res, next[index]);
    return true;
  }

  if (method === "POST" && parts.length === 2 && parts[1] === "approve") {
    const id = parts[0];
    const next = readData();
    const index = next.findIndex((item) => item.id === id);
    if (index === -1) {
      sendJson(res, { error: "Not found" }, 404);
      return true;
    }
    const record = next[index];
    const rawBody = await getBody(req);
    let approvePayload = {};
    try {
      approvePayload = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      approvePayload = {};
    }
    const rootFolder =
      approvePayload?.rootFolder ||
      approvePayload?.root_folder ||
      approvePayload?.rootFolderPath ||
      "";
    const serverId =
      approvePayload?.serverId || approvePayload?.server_id || approvePayload?.serverID || "";
    const profileIdRaw =
      approvePayload?.profileId ||
      approvePayload?.profile_id ||
      approvePayload?.qualityProfileId ||
      "";
    const profileId =
      profileIdRaw !== "" && !Number.isNaN(Number(profileIdRaw)) ? Number(profileIdRaw) : null;

    const settings = loadSettings();
    const baseUrl = settings?.jellyseerrUrl;
    const apiKey = settings?.jellyseerrApiKey;
    if (!baseUrl || !apiKey) {
      sendJson(res, { error: "Jellyseerr settings missing." }, 400);
      return true;
    }
    try {
      const base = baseUrl.replace(/\/+$/, "");
      const mediaId = record?.tmdb_id ? Number(record.tmdb_id) : null;
      if (!Number.isFinite(mediaId)) {
        sendJson(res, { error: "Invalid TMDB id for this request." }, 400);
        return true;
      }
      const requestPayload = { mediaType: record.media_type, mediaId };
      if (String(record.media_type).toLowerCase() === "tv") {
        requestPayload.seasons = "all";
      }
      if (rootFolder) requestPayload.rootFolder = rootFolder;
      if (serverId) requestPayload.serverId = serverId;
      if (Number.isFinite(profileId)) requestPayload.profileId = profileId;
      const payload = JSON.stringify(requestPayload);
      const doRequest = async (url) =>
        await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Api-Key": apiKey,
          },
          body: payload,
        });

      let response = await doRequest(`${base}/api/v1/request`);
      if (!response.ok) {
        const text = await response.text();
        const publicBase = extractPublicBase(text);
        if (publicBase) {
          response = await doRequest(`${base}${publicBase}/api/v1/request`);
        } else {
          sendJson(res, { error: text || "Jellyseerr request failed." }, response.status);
          return true;
        }
      }
      if (!response.ok) {
        const text = await response.text();
        sendJson(res, { error: text || "Jellyseerr request failed." }, response.status);
        return true;
      }
      const data = await response.json();
      next[index] = {
        ...record,
        status: "approved",
        jellyseerr_request_id: data?.id || data?.requestId || record.jellyseerr_request_id,
        updated_at: new Date().toISOString(),
      };
      writeData(next);
      sendJson(res, next[index]);
      return true;
    } catch {
      sendJson(res, { error: "Failed to reach Jellyseerr." }, 502);
      return true;
    }
  }

  if (method === "POST" && parts.length === 2 && parts[1] === "reject") {
    const id = parts[0];
    const next = readData();
    const index = next.findIndex((item) => item.id === id);
    if (index === -1) {
      sendJson(res, { error: "Not found" }, 404);
      return true;
    }
    const record = next[index];
    const settings = loadSettings();
    const jellyseerrUrl = getSetting(settings, "jellyseerrUrl", "JELLYSEERR_URL");
    const jellyseerrKey = getSetting(settings, "jellyseerrApiKey", "JELLYSEERR_API_KEY");
    if (jellyseerrUrl && jellyseerrKey && record?.jellyseerr_request_id) {
      const base = jellyseerrUrl.replace(/\/+$/, "");
      const targetUrl = `${base}/api/v1/request/${record.jellyseerr_request_id}`;
      const response = await safeFetch(targetUrl, {
        method: "DELETE",
        headers: { "X-Api-Key": jellyseerrKey },
      });
      if (!response.ok) {
        const publicBase = extractPublicBase(response.text);
        if (publicBase) {
          await safeFetch(`${base}${publicBase}/api/v1/request/${record.jellyseerr_request_id}`, {
            method: "DELETE",
            headers: { "X-Api-Key": jellyseerrKey },
          });
        }
      }
    }
    next[index] = { ...record, status: "rejected", updated_at: new Date().toISOString() };
    writeData(next);
    sendJson(res, next[index]);
    return true;
  }

  if ((method === "POST" || method === "DELETE") && parts.length === 2 && parts[1] === "delete") {
    const id = parts[0];
    const next = readData();
    const index = next.findIndex((item) => item.id === id);
    if (index === -1) {
      sendJson(res, { error: "Not found" }, 404);
      return true;
    }
    const record = next[index];
    const settings = loadSettings();
    const jellyseerrUrl = getSetting(settings, "jellyseerrUrl", "JELLYSEERR_URL");
    const jellyseerrKey = getSetting(settings, "jellyseerrApiKey", "JELLYSEERR_API_KEY");
    const radarrUrl = getSetting(settings, "radarrUrl", "RADARR_URL");
    const radarrKey = getSetting(settings, "radarrApiKey", "RADARR_API_KEY");
    const sonarrUrl = getSetting(settings, "sonarrUrl", "SONARR_URL");
    const sonarrKey = getSetting(settings, "sonarrApiKey", "SONARR_API_KEY");

    const results = { jellyseerr: null, radarr: null, sonarr: null };

    const runDelete = async (url, label, headers) => {
      const response = await safeFetch(url, { method: "DELETE", headers });
      results[label] = response.ok ? "ok" : response.text || "error";
      return response;
    };

    if (jellyseerrUrl && jellyseerrKey && record?.jellyseerr_request_id) {
      const base = jellyseerrUrl.replace(/\/+$/, "");
      const targetUrl = `${base}/api/v1/request/${record.jellyseerr_request_id}`;
      let response = await runDelete(targetUrl, "jellyseerr", { "X-Api-Key": jellyseerrKey });
      if (!response.ok) {
        const publicBase = extractPublicBase(response.text);
        if (publicBase) {
          response = await runDelete(
            `${base}${publicBase}/api/v1/request/${record.jellyseerr_request_id}`,
            "jellyseerr",
            { "X-Api-Key": jellyseerrKey }
          );
        }
      }
    }

    if (record?.media_type === "movie" && radarrUrl && radarrKey && record?.tmdb_id) {
      const base = radarrUrl.replace(/\/+$/, "");
      const lookup = await safeFetch(`${base}/api/v3/movie?tmdbId=${record.tmdb_id}`, {
        headers: { "X-Api-Key": radarrKey, Accept: "application/json" },
      });
      if (lookup.ok) {
        try {
          const list = lookup.text ? JSON.parse(lookup.text) : [];
          const movie = Array.isArray(list) ? list[0] : null;
          if (movie?.id) {
            await runDelete(`${base}/api/v3/movie/${movie.id}?deleteFiles=true`, "radarr", {
              "X-Api-Key": radarrKey,
            });
          }
        } catch {
          // ignore parse errors
        }
      }
    }

    if (record?.media_type === "tv" && sonarrUrl && sonarrKey && record?.imdb_id) {
      const base = sonarrUrl.replace(/\/+$/, "");
      const lookup = await safeFetch(
        `${base}/api/v3/series/lookup?term=${encodeURIComponent(`imdb:${record.imdb_id}`)}`,
        { headers: { "X-Api-Key": sonarrKey, Accept: "application/json" } }
      );
      if (lookup.ok) {
        try {
          const list = lookup.text ? JSON.parse(lookup.text) : [];
          const series = Array.isArray(list) ? list[0] : null;
          if (series?.id) {
            await runDelete(`${base}/api/v3/series/${series.id}?deleteFiles=true`, "sonarr", {
              "X-Api-Key": sonarrKey,
            });
          }
        } catch {
          // ignore parse errors
        }
      }
    }

    next.splice(index, 1);
    writeData(next);
    sendJson(res, { ok: true, results });
    return true;
  }

  if (method === "POST" && parts.length === 1 && parts[0] === "check-status") {
    const records = readData();
    let updated = 0;
    const results = [];
    const settings = loadSettings();
    const jellyseerrUrl = getSetting(settings, "jellyseerrUrl", "JELLYSEERR_URL");
    const jellyseerrKey = getSetting(settings, "jellyseerrApiKey", "JELLYSEERR_API_KEY");
    const radarrUrl = getSetting(settings, "radarrUrl", "RADARR_URL");
    const radarrKey = getSetting(settings, "radarrApiKey", "RADARR_API_KEY");
    const sonarrUrl = getSetting(settings, "sonarrUrl", "SONARR_URL");
    const sonarrKey = getSetting(settings, "sonarrApiKey", "SONARR_API_KEY");

    for (const record of records) {
      if (!record?.jellyseerr_request_id) continue;
      if (!jellyseerrUrl || !jellyseerrKey) continue;
      const base = jellyseerrUrl.replace(/\/+$/, "");
      const response = await safeFetch(
        `${base}/api/v1/request/${record.jellyseerr_request_id}`,
        { headers: { "X-Api-Key": jellyseerrKey } }
      );
      if (!response.ok) continue;
      let data = null;
      try {
        data = response.text ? JSON.parse(response.text) : null;
      } catch {
        data = null;
      }
      if (!data) continue;
      const rawStatus = String(data?.status || "").toLowerCase();
      let nextStatus = record.status;
      let nextProgress = record.download_progress ?? null;

      if (rawStatus === "approved" || rawStatus === "available") {
        nextStatus = rawStatus;
      }

      if (record.media_type === "tv" && sonarrUrl && sonarrKey && record?.imdb_id) {
        const sonarrBase = sonarrUrl.replace(/\/+$/, "");
        const showLookup = await safeFetch(
          `${sonarrBase}/api/v3/series/lookup?term=${encodeURIComponent(`imdb:${record.imdb_id}`)}`,
          { headers: { "X-Api-Key": sonarrKey, Accept: "application/json" } }
        );
        if (showLookup.ok) {
          try {
            const list = showLookup.text ? JSON.parse(showLookup.text) : [];
            const show = Array.isArray(list) ? list[0] : null;
            if (show?.statistics?.episodeFileCount > 0) {
              nextStatus = "available";
              nextProgress = 100;
            }
          } catch {
            // ignore parse errors
          }
        }
      }

      if (record.media_type === "movie" && radarrUrl && radarrKey && record?.tmdb_id) {
        const radarrBase = radarrUrl.replace(/\/+$/, "");
        const movieLookup = await safeFetch(
          `${radarrBase}/api/v3/movie?tmdbId=${record.tmdb_id}`,
          { headers: { "X-Api-Key": radarrKey, Accept: "application/json" } }
        );
        if (movieLookup.ok) {
          try {
            const list = movieLookup.text ? JSON.parse(movieLookup.text) : [];
            const movie = Array.isArray(list) ? list[0] : null;
            if (movie?.hasFile) {
              nextStatus = "available";
              nextProgress = 100;
            } else if (movie?.id) {
              const queue = await safeFetch(
                `${radarrBase}/api/v3/queue?movieId=${movie.id}&page=1&pageSize=20`,
                { headers: { "X-Api-Key": radarrKey, Accept: "application/json" } }
              );
              if (queue.ok) {
                const queueData = queue.text ? JSON.parse(queue.text) : null;
                const records = queueData?.records || [];
                if (Array.isArray(records) && records.length > 0) {
                  const total = records.reduce((sum, q) => sum + (q.size || 0), 0);
                  const downloaded = records.reduce(
                    (sum, q) => sum + ((q.size || 0) - (q.sizeleft || 0)),
                    0
                  );
                  if (total > 0) {
                    nextProgress = Math.round((downloaded / total) * 100);
                  }
                }
              }
            }
          } catch {
            // ignore radarr parse errors
          }
        }
      }

      if (nextStatus !== record.status || nextProgress !== record.download_progress) {
        record.status = nextStatus;
        record.download_progress = nextProgress;
        record.updated_at = new Date().toISOString();
        updated += 1;
        results.push({ id: record.id, status: nextStatus, progress: nextProgress });
      }
    }
    if (updated > 0) writeData(records);
    sendJson(res, { ok: true, updated, results });
    return true;
  }

  if (method === "POST" && parts.length === 1 && parts[0] === "check-availability") {
    const settings = loadSettings();
    const sonarrUrl = getSetting(settings, "sonarrUrl", "SONARR_URL");
    const sonarrKey = getSetting(settings, "sonarrApiKey", "SONARR_API_KEY");
    const radarrUrl = getSetting(settings, "radarrUrl", "RADARR_URL");
    const radarrKey = getSetting(settings, "radarrApiKey", "RADARR_API_KEY");
    if (!sonarrUrl || !sonarrKey || !radarrUrl || !radarrKey) {
      sendJson(res, { error: "Sonarr/Radarr settings missing." }, 400);
      return true;
    }
    const records = readData();
    let updated = 0;
    for (const record of records) {
      if (record.status !== "approved") continue;
      const mediaType = String(record?.media_type || "").toLowerCase();
      if (mediaType === "movie") {
        const tmdbId = record?.tmdb_id ? Number(record.tmdb_id) : null;
        if (!tmdbId) continue;
        const lookupUrl = `${radarrUrl.replace(/\/+$/, "")}/api/v3/movie?tmdbId=${tmdbId}`;
        const lookup = await safeFetch(lookupUrl, {
          headers: { "X-Api-Key": radarrKey, Accept: "application/json" },
        });
        if (!lookup.ok) continue;
        try {
          const list = lookup.text ? JSON.parse(lookup.text) : [];
          const movie = Array.isArray(list) ? list[0] : null;
          if (movie?.hasFile) {
            record.status = "available";
            record.updated_at = new Date().toISOString();
            updated += 1;
          }
        } catch {
          // ignore parse errors
        }
      } else if (mediaType === "tv") {
        const imdbId = record?.imdb_id;
        if (!imdbId) continue;
        const lookupUrl = `${sonarrUrl.replace(/\/+$/, "")}/api/v3/series/lookup?term=${encodeURIComponent(`imdb:${imdbId}`)}`;
        const lookup = await safeFetch(lookupUrl, {
          headers: { "X-Api-Key": sonarrKey, Accept: "application/json" },
        });
        if (!lookup.ok) continue;
        try {
          const list = lookup.text ? JSON.parse(lookup.text) : [];
          const show = Array.isArray(list) ? list[0] : null;
          if (show?.statistics?.episodeFileCount > 0) {
            record.status = "available";
            record.updated_at = new Date().toISOString();
            updated += 1;
          }
        } catch {
          // ignore parse errors
        }
      }
    }
    if (updated > 0) writeData(records);
    sendJson(res, { ok: true, updated });
    return true;
  }

  return false;
};

const proxyToService = async (req, res, { urlKey, apiKeyKey, label, envUrlKey, envApiKeyKey }) => {
  const settings = loadSettings();
  let baseUrl = process.env[envUrlKey] || settings?.[urlKey];
  if (baseUrl && !String(baseUrl).includes("://")) {
    baseUrl = `http://${baseUrl}`;
  }
  const apiKey = process.env[envApiKeyKey] || settings?.[apiKeyKey];
  if (!baseUrl) {
    res.statusCode = 400;
    res.end(`${label} URL not set.`);
    return true;
  }
  if (!apiKey) {
    res.statusCode = 400;
    res.end(`${label} API key not set.`);
    return true;
  }
  let reqPath = req.url || "/";
  if (reqPath.startsWith("/api/emby")) {
    reqPath = reqPath.replace(/^\/api\/emby/, "") || "/";
  }
  const base = baseUrl.replace(/\/+$/, "");
  let targetUrl = `${base}${reqPath.startsWith("/") ? "" : "/"}${reqPath}`;
  const method = req.method || "GET";
  const headers = {
    "X-Api-Key": apiKey,
    "accept-encoding": "identity",
  };
  if (req.headers["content-type"]) headers["content-type"] = req.headers["content-type"];
  let body = undefined;
  if (method !== "GET" && method !== "HEAD") {
    body = await new Promise((resolve) => {
      const chunks = [];
      req.on("data", (chunk) => chunks.push(chunk));
      req.on("end", () => resolve(Buffer.concat(chunks)));
      req.on("error", () => resolve(null));
    });
  }
  const tryRequest = async (url) => await fetch(url, { method, headers, body });
  const withHttpFallback = (url) =>
    url.startsWith("https://") ? `http://${url.slice("https://".length)}` : url;

  try {
    writeLog(serviceProxyLog, `${label} ${method} ${reqPath} -> ${targetUrl}`);
    let upstream = await tryRequest(targetUrl);
    if (!upstream.ok) {
      const fallbackUrl = withHttpFallback(targetUrl);
      if (fallbackUrl !== targetUrl) {
        writeLog(serviceProxyLog, `${label} retry ${method} ${reqPath} -> ${fallbackUrl}`);
        upstream = await tryRequest(fallbackUrl);
      }
    }
    res.statusCode = upstream.status;
    writeLog(serviceProxyLog, `${label} ${method} ${reqPath} <- ${upstream.status}`);
    upstream.headers.forEach((value, key) => {
      if (key.toLowerCase() === "set-cookie") return;
      res.setHeader(key, value);
    });
    const buffer = Buffer.from(await upstream.arrayBuffer());
    const contentType = upstream.headers.get("content-type") || "";
    const preview = buffer.toString("utf8", 0, 200).replace(/\s+/g, " ").trim();
    writeLog(serviceProxyLog, `${label} ${method} ${reqPath} content-type=${contentType}`);
    if (preview) {
      writeLog(serviceProxyLog, `${label} ${method} ${reqPath} preview=${preview}`);
    }
    res.end(buffer);
    return true;
  } catch (err) {
    const message = err?.message || String(err || "unknown_error");
    res.statusCode = 502;
    res.end(`Failed to reach ${label} server at ${targetUrl}: ${message}`);
    writeLog(serviceProxyLog, `${label} ${method} ${reqPath} !! ${message}`);
    return true;
  }
};

const handleEmbyProxy = async (req, res) => {
  const settings = loadSettings();
  const baseUrl = settings?.embyUrl;
  if (!baseUrl) {
    res.statusCode = 400;
    res.end("Emby URL not set.");
    return true;
  }
  let reqPath = req.url || "/";
  if (reqPath.startsWith("/api/emby")) {
    reqPath = reqPath.replace(/^\/api\/emby/, "") || "/";
  }
  const base = baseUrl.replace(/\/+$/, "");
  const targetUrl = `${base}${reqPath.startsWith("/") ? "" : "/"}${reqPath}`;
  const method = req.method || "GET";

  const headers = {};
  if (req.headers["content-type"]) headers["content-type"] = req.headers["content-type"];
  if (req.headers["x-emby-authorization"]) {
    headers["x-emby-authorization"] = req.headers["x-emby-authorization"];
  }

  let body = undefined;
  if (method !== "GET" && method !== "HEAD") {
    body = await new Promise((resolve) => {
      const chunks = [];
      req.on("data", (chunk) => chunks.push(chunk));
      req.on("end", () => resolve(Buffer.concat(chunks)));
      req.on("error", () => resolve(null));
    });
  }

  try {
    const upstream = await fetch(targetUrl, { method, headers, body });
    res.statusCode = upstream.status;
    upstream.headers.forEach((value, key) => {
      const lower = key.toLowerCase();
      if (lower === "set-cookie") return;
      if (lower === "content-encoding") return;
      if (lower === "content-length") return;
      res.setHeader(key, value);
    });
    const buffer = Buffer.from(await upstream.arrayBuffer());
    res.end(buffer);
    writeLog(embyProxyLog, `${method} ${reqPath} -> ${upstream.status}`);
    return true;
  } catch {
    res.statusCode = 502;
    res.end("Failed to reach Emby server.");
    writeLog(embyProxyLog, `${method} ${reqPath} -> 502 proxy_error`);
    return true;
  }
};

const handleJellyseerrProxy = async (req, res) => {
  const settings = loadSettings();
  const baseUrl = settings?.jellyseerrUrl;
  const apiKey = settings?.jellyseerrApiKey;
  const isUserAuth = req.headers["x-jellyseerr-auth"] === "user";
  if (!baseUrl) {
    res.statusCode = 400;
    res.end("Jellyseerr URL not set.");
    return true;
  }
  if (!apiKey && !isUserAuth) {
    res.statusCode = 400;
    res.end("Jellyseerr API key not set.");
    return true;
  }

  let reqPath = req.url || "/";
  if (reqPath.startsWith("/api/jellyseerr")) {
    reqPath = reqPath.replace(/^\/api\/jellyseerr/, "") || "/";
  }
  const base = baseUrl.replace(/\/+$/, "");
  const targetUrl = `${base}${reqPath.startsWith("/") ? "" : "/"}${reqPath}`;
  const method = req.method || "GET";

  const headers = {};
  if (!isUserAuth && apiKey) headers["x-api-key"] = apiKey;
  if (req.headers["content-type"]) headers["content-type"] = req.headers["content-type"];
  if (req.headers.cookie) headers.cookie = req.headers.cookie;
  if (req.headers.authorization) headers.authorization = req.headers.authorization;

  let body = undefined;
  if (method !== "GET" && method !== "HEAD") {
    body = await new Promise((resolve) => {
      const chunks = [];
      req.on("data", (chunk) => chunks.push(chunk));
      req.on("end", () => resolve(Buffer.concat(chunks)));
      req.on("error", () => resolve(null));
    });
  }

  const rewriteSetCookie = (value) => {
    if (!value) return value;
    let next = value.replace(/;\s*Domain=[^;]+/gi, "");
    next = next.replace(/;\s*Secure/gi, "");
    next = next.replace(/SameSite=None/gi, "SameSite=Lax");
    return next;
  };

  try {
    const upstream = await fetch(targetUrl, { method, headers, body });
    res.statusCode = upstream.status;
    const setCookieList =
      typeof upstream.headers.getSetCookie === "function"
        ? upstream.headers.getSetCookie()
        : null;
    if (setCookieList && setCookieList.length > 0) {
      res.setHeader("set-cookie", setCookieList.map((cookie) => rewriteSetCookie(cookie)));
    }
    if ((reqPath || "").startsWith("/api/v1/auth/emby")) {
      const logLine = `[jellyseerr-auth] ${method} ${reqPath} -> ${upstream.status} cookies=${
        setCookieList ? setCookieList.length : 0
      }`;
      writeLog(embyProxyLog, logLine);
    }
    upstream.headers.forEach((value, key) => {
      if (key.toLowerCase() === "set-cookie") return;
      res.setHeader(key, value);
    });
    const buffer = Buffer.from(await upstream.arrayBuffer());
    res.end(buffer);
    return true;
  } catch {
    res.statusCode = 502;
    res.end("Failed to reach Jellyseerr server.");
    return true;
  }
};

const getMimeType = (filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".html") return "text/html";
  if (ext === ".js") return "text/javascript";
  if (ext === ".css") return "text/css";
  if (ext === ".json") return "application/json";
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".ico") return "image/x-icon";
  if (ext === ".woff") return "font/woff";
  if (ext === ".woff2") return "font/woff2";
  return "application/octet-stream";
};

const serveStatic = (req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") return false;
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";
  const filePath = path.join(DIST, pathname);
  if (!filePath.startsWith(DIST)) return false;
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    res.statusCode = 200;
    res.setHeader("Content-Type", getMimeType(filePath));
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
    return true;
  }
  return false;
};

const serveSpa = (_req, res) => {
  const indexPath = path.join(DIST, "index.html");
  if (!fs.existsSync(indexPath)) {
    res.statusCode = 404;
    res.end("Not built yet. Run npm run build.");
    return true;
  }
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/html");
  fs.createReadStream(indexPath).pipe(res);
  return true;
};

const router = async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = url.pathname || "/";

  if (pathname.startsWith("/api/settings")) return await handleSettings(req, res);
  if (pathname.startsWith("/api/subscriptions")) return await handleSubscriptions(req, res);
  if (pathname.startsWith("/api/plans")) return await handlePlans(req, res);
  if (pathname.startsWith("/api/movie-requests")) return await handleMovieRequests(req, res);
  if (pathname.startsWith("/api/unlimited-users")) return await handleUnlimitedUsers(req, res);
  if (pathname.startsWith("/api/user-tags")) return await handleUserTags(req, res);
  if (pathname.startsWith("/api/client-errors")) return await handleClientErrors(req, res);
  if (pathname.startsWith("/api/tunnel")) return await handleTunnel(req, res);
  if (pathname.startsWith("/api/status")) return await handleStatus(req, res);
  if (pathname.startsWith("/api/emby")) return await handleEmbyProxy(req, res);
  if (pathname.startsWith("/api/jellyseerr")) return await handleJellyseerrProxy(req, res);
  if (pathname.startsWith("/api/sonarr")) {
    return await proxyToService(req, res, {
      urlKey: "sonarrUrl",
      apiKeyKey: "sonarrApiKey",
      envUrlKey: "SONARR_URL",
      envApiKeyKey: "SONARR_API_KEY",
      label: "Sonarr",
    });
  }
  if (pathname.startsWith("/api/radarr")) {
    return await proxyToService(req, res, {
      urlKey: "radarrUrl",
      apiKeyKey: "radarrApiKey",
      envUrlKey: "RADARR_URL",
      envApiKeyKey: "RADARR_API_KEY",
      label: "Radarr",
    });
  }

  if (pathname.startsWith("/api/media-requests")) {
    const subPath = pathname.replace(/^\/api\/media-requests\/?/, "");
    const parts = subPath ? subPath.split("/").filter(Boolean) : [];
    return await handleMediaRequests(req, res, parts);
  }

  if (serveStatic(req, res)) return true;
  return serveSpa(req, res);
};

const server = http.createServer(async (req, res) => {
  try {
    const handled = await router(req, res);
    if (!handled && !res.writableEnded) {
      res.statusCode = 404;
      res.end("Not found");
    }
  } catch (err) {
    res.statusCode = 500;
    res.end(err?.message || "Server error");
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server listening on http://0.0.0.0:${PORT}`);
});

let syncTimer = null;
const schedulePolicySync = () => {
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncPlaybackLibraries().catch(() => {});
  }, POLICY_SYNC_DEBOUNCE_MS);
};

try {
  fs.watch(subscriptionsFile, schedulePolicySync);
  fs.watch(unlimitedFile, schedulePolicySync);
  fs.watch(settingsFile, schedulePolicySync);
} catch {
  // ignore watch errors; interval fallback below
}

schedulePolicySync();
setInterval(() => {
  syncPlaybackLibraries().catch(() => {});
}, POLICY_SYNC_INTERVAL_MS);
