import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import fetch from "node-fetch";
import FormData from "form-data";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SETTINGS_PATH = path.resolve(process.cwd(), "settings.json");
const SUBSCRIPTIONS_PATH = path.resolve(process.cwd(), "subscriptions.json");
const MEDIA_REQUESTS_PATH = path.resolve(process.cwd(), "media-requests.json");
const STATE_PATH = path.resolve(process.cwd(), "telegram-state.json");
const LOCK_PATH = path.resolve(process.cwd(), "telegram-bot.lock");
const WATCH_DEBOUNCE_MS = 300;
const DASHBOARD_BASE_URL = process.env.DASHBOARD_URL || "http://127.0.0.1:5002";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let pendingPaymentPing = false;
let paymentWatchTimer = null;
let pendingMediaPing = false;
let mediaWatchTimer = null;

const readJson = (filePath, fallback) => {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, "utf-8");
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

const writeJson = (filePath, data) => {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
};

const loadSettings = () => readJson(SETTINGS_PATH, {});
const loadSubscriptions = () => readJson(SUBSCRIPTIONS_PATH, []);
const saveSubscriptions = (data) => writeJson(SUBSCRIPTIONS_PATH, data);
const loadMediaRequests = () => readJson(MEDIA_REQUESTS_PATH, []);
const saveMediaRequests = (data) => writeJson(MEDIA_REQUESTS_PATH, data);

const loadState = () =>
  readJson(STATE_PATH, {
    lastUpdateId: 0,
    notifiedPayments: [],
    notifiedMedia: [],
    notifiedExpired: [],
    pendingMediaApprovals: {},
    paymentMessages: {},
  });

const saveState = (state) => writeJson(STATE_PATH, state);
const ensureStateShape = (state) => {
  if (!state || typeof state !== "object") return loadState();
  if (!state.pendingMediaApprovals || typeof state.pendingMediaApprovals !== "object") {
    state.pendingMediaApprovals = {};
  }
  if (!state.paymentMessages || typeof state.paymentMessages !== "object") {
    state.paymentMessages = {};
  }
  if (!Array.isArray(state.notifiedPayments)) state.notifiedPayments = [];
  if (!Array.isArray(state.notifiedMedia)) state.notifiedMedia = [];
  if (!Array.isArray(state.notifiedExpired)) state.notifiedExpired = [];
  if (typeof state.lastUpdateId !== "number") state.lastUpdateId = 0;
  return state;
};

const ensureSingleInstance = () => {
  try {
    if (fs.existsSync(LOCK_PATH)) {
      const existingPid = Number(String(fs.readFileSync(LOCK_PATH, "utf-8")).trim());
      if (existingPid && existingPid !== process.pid) {
        try {
          process.kill(existingPid, 0);
          console.log(`Telegram bot already running (pid ${existingPid}). Exiting.`);
          process.exit(0);
        } catch {
          // Stale lock; continue.
        }
      }
    }
    fs.writeFileSync(LOCK_PATH, String(process.pid));
  } catch {
    // Ignore lock failures.
  }
  const cleanup = () => {
    try {
      if (fs.existsSync(LOCK_PATH)) fs.unlinkSync(LOCK_PATH);
    } catch {
      // ignore
    }
  };
  process.on("exit", cleanup);
  process.on("SIGINT", () => process.exit(0));
  process.on("SIGTERM", () => process.exit(0));
};

const queuePaymentPing = () => {
  if (paymentWatchTimer) clearTimeout(paymentWatchTimer);
  paymentWatchTimer = setTimeout(() => {
    pendingPaymentPing = true;
  }, WATCH_DEBOUNCE_MS);
};

if (fs.existsSync(SUBSCRIPTIONS_PATH)) {
  fs.watch(SUBSCRIPTIONS_PATH, queuePaymentPing);
}

const queueMediaPing = () => {
  if (mediaWatchTimer) clearTimeout(mediaWatchTimer);
  mediaWatchTimer = setTimeout(() => {
    pendingMediaPing = true;
  }, WATCH_DEBOUNCE_MS);
};

if (fs.existsSync(MEDIA_REQUESTS_PATH)) {
  fs.watch(MEDIA_REQUESTS_PATH, queueMediaPing);
}

const getAdminIds = (settings) => {
  const raw = String(settings.telegramAdminIds || "");
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
};

const buildTelegramUrl = (token, method) =>
  `https://api.telegram.org/bot${token}/${method}`;

const sendTelegram = async (token, method, payload) => {
  const response = await fetch(buildTelegramUrl(token, method), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return response.json();
};

const sendMessage = (token, chatId, text, replyMarkup) =>
  sendTelegram(token, "sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });

const sendPhoto = (token, chatId, photo, caption, replyMarkup) =>
  sendTelegram(token, "sendPhoto", {
    chat_id: chatId,
    photo,
    caption,
    parse_mode: "HTML",
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });

const sendPhotoDataUri = async (token, chatId, dataUri, caption, replyMarkup) => {
  const match = String(dataUri).match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) throw new Error("Invalid image data.");
  const mime = match[1];
  const buffer = Buffer.from(match[2], "base64");
  const ext = mime.split("/")[1] || "jpg";
  const form = new FormData();
  form.append("chat_id", String(chatId));
  form.append("photo", buffer, { filename: `slip.${ext}`, contentType: mime });
  if (caption) form.append("caption", caption);
  form.append("parse_mode", "HTML");
  if (replyMarkup) form.append("reply_markup", JSON.stringify(replyMarkup));
  const response = await fetch(buildTelegramUrl(token, "sendPhoto"), {
    method: "POST",
    body: form,
    headers: form.getHeaders(),
  });
  return response.json();
};

const sendDocumentBuffer = async (token, chatId, buffer, filename, mime, caption, replyMarkup) => {
  const form = new FormData();
  form.append("chat_id", String(chatId));
  form.append("document", buffer, { filename, contentType: mime || "application/octet-stream" });
  if (caption) form.append("caption", caption);
  form.append("parse_mode", "HTML");
  if (replyMarkup) form.append("reply_markup", JSON.stringify(replyMarkup));
  const response = await fetch(buildTelegramUrl(token, "sendDocument"), {
    method: "POST",
    body: form,
    headers: form.getHeaders(),
  });
  return response.json();
};

const sendSlipFromUrl = async (token, chatId, slipUrl, caption, replyMarkup) => {
  const absoluteUrl = slipUrl.startsWith("http")
    ? slipUrl
    : `${DASHBOARD_BASE_URL.replace(/\/+$/, "")}${slipUrl}`;
  const response = await fetch(absoluteUrl);
  if (!response.ok) throw new Error(`Slip fetch failed (${response.status})`);
  const mime = response.headers.get("content-type") || "";
  const buffer = Buffer.from(await response.arrayBuffer());
  if (mime.startsWith("image/")) {
    const form = new FormData();
    form.append("chat_id", String(chatId));
    form.append("photo", buffer, { filename: "slip.jpg", contentType: mime });
    if (caption) form.append("caption", caption);
    form.append("parse_mode", "HTML");
    if (replyMarkup) form.append("reply_markup", JSON.stringify(replyMarkup));
    const result = await fetch(buildTelegramUrl(token, "sendPhoto"), {
      method: "POST",
      body: form,
      headers: form.getHeaders(),
    });
    return result.json();
  }
  return sendDocumentBuffer(token, chatId, buffer, "slip.pdf", mime, caption, replyMarkup);
};

const answerCallback = (token, callbackId, text) =>
  sendTelegram(token, "answerCallbackQuery", {
    callback_query_id: callbackId,
    text,
    show_alert: true,
  });

const editTelegramMessage = (token, message, text) => {
  if (!message) return Promise.resolve();
  const payload = {
    chat_id: message.chat?.id,
    message_id: message.message_id,
    reply_markup: { inline_keyboard: [] },
  };
  if (message.photo) {
    return sendTelegram(token, "editMessageCaption", {
      ...payload,
      caption: text,
      parse_mode: "HTML",
    });
  }
  return sendTelegram(token, "editMessageText", {
    ...payload,
    text,
    parse_mode: "HTML",
  });
};

const addDays = (isoDate, days) => {
  const base = new Date(isoDate || Date.now());
  const next = new Date(base.getTime() + Number(days || 0) * 24 * 60 * 60 * 1000);
  return next.toISOString();
};

const normalizeUrl = (value) => String(value || "").replace(/\/+$/, "");

const fetchJson = async (url, options) => {
  const response = await fetch(url, options);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed (${response.status})`);
  }
  return response.json();
};

const updateEmbyPlayback = async (settings, userId, enable) => {
  const embyUrl = normalizeUrl(settings.embyUrl);
  const apiKey = String(settings.apiKey || "").trim();
  if (!embyUrl || !apiKey || !userId) return;
  const user = await fetchJson(
    `${embyUrl}/Users/${userId}?api_key=${encodeURIComponent(apiKey)}`
  );
  if (!user?.Policy) return;
  const policy = { ...user.Policy, EnableMediaPlayback: enable };
  const url = `${embyUrl}/Users/${userId}/Policy?api_key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(policy),
  });
  if (!response.ok) {
    const retry = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(policy),
    });
    if (!retry.ok) {
      const text = await retry.text();
      throw new Error(text || "Failed to update Emby policy.");
    }
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

const formatDate = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toISOString().slice(0, 10);
};

const getLanguageLabel = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "-";
  if (raw.length > 3) return raw;
  const code = raw.toLowerCase();
  try {
    if (typeof Intl !== "undefined" && typeof Intl.DisplayNames === "function") {
      const display = new Intl.DisplayNames(["en"], { type: "language" });
      return display.of(code) || raw;
    }
  } catch {
    // ignore
  }
  const fallback = {
    en: "English",
    eng: "English",
    es: "Spanish",
    spa: "Spanish",
    fr: "French",
    fre: "French",
    de: "German",
    ger: "German",
    it: "Italian",
    pt: "Portuguese",
    ru: "Russian",
    ar: "Arabic",
    hi: "Hindi",
    dv: "Dhivehi",
    zh: "Chinese",
    ja: "Japanese",
    ko: "Korean",
    tr: "Turkish",
  };
  return fallback[code] || raw;
};

const getRequestedBy = (request) => {
  if (!request) return "-";
  const value =
    request.requested_by_username ||
    request.requestedByUsername ||
    request.requestedByUserName ||
    request.requestedBy ||
    request.requested_by ||
    request.requestedUser ||
    request.requested_user ||
    request.username ||
    request.userName ||
    request.user ||
    request.userId ||
    "";
  return String(value || "-");
};

const buildPaymentMessage = (sub, statusLine) => {
  const amount = Number(sub?.price || 0);
  const rawCurrency = sub?.currency || "MVR";
  const currency = rawCurrency === "USD" ? "MVR" : rawCurrency;
  const formatted = Number.isFinite(amount)
    ? amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "0.00";
  const days = Number(sub?.durationDays || sub?.duration || 0);
  const daysLabel = days ? `${days} days` : "-";
  return (
    `💳 <b>Payment Pending</b>\n` +
    `Date: ${formatDate(sub?.submittedAt)}\n` +
    `User: <b>${sub?.username || sub?.userId || "Unknown"}</b>\n` +
    `Plan: ${sub?.planName || "-"}\n` +
    `Amount: ${currency} ${formatted}\n` +
    `Days: ${daysLabel}\n\n` +
    statusLine
  );
};

const isImageSlip = (value) =>
  typeof value === "string" && value.startsWith("data:image");

const buildPaymentResultMessage = (sub, statusLabel, approvedBy) => {
  const days = Number(sub?.durationDays || sub?.duration || 0);
  const daysLabel = days ? String(days) : "-";
  const userLabel = sub?.username || sub?.userId || "Unknown";
  const submittedLabel = formatDate(sub?.submittedAt);
  return (
    `${statusLabel}\n\n` +
    `Date: ${submittedLabel}\n` +
    `User: ${userLabel}\n` +
    `Days Added: ${daysLabel}\n` +
    `Approved by: ${approvedBy || "admin"}`
  );
};

const approveMediaRequest = async (settings, record, rootFolder, profileId) => {
  const baseUrl = normalizeUrl(settings.jellyseerrUrl);
  const apiKey = String(settings.jellyseerrApiKey || "").trim();
  if (!baseUrl || !apiKey) throw new Error("Jellyseerr settings missing.");

  const mediaId = record?.tmdb_id ? Number(record.tmdb_id) : null;
  if (!Number.isFinite(mediaId)) {
    throw new Error("Invalid TMDB id for this request.");
  }
  const payload = {
    mediaType: record.media_type,
    mediaId,
  };
  if (String(record.media_type).toLowerCase() === "tv") {
    payload.seasons = "all";
  }
  if (rootFolder) payload.rootFolder = rootFolder;
  if (Number.isFinite(profileId)) payload.profileId = profileId;

  const doRequest = async (url) =>
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Api-Key": apiKey },
      body: JSON.stringify(payload),
    });

  let response = await doRequest(`${baseUrl}/api/v1/request`);
  if (!response.ok) {
    const text = await response.text();
    const publicBase = extractPublicBase(text);
    if (publicBase) {
      response = await doRequest(`${baseUrl}${publicBase}/api/v1/request`);
    } else {
      throw new Error(text || "Jellyseerr request failed.");
    }
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Jellyseerr request failed.");
  }

  return response.json();
};

const deleteJellyseerrRequest = async (settings, requestId) => {
  const baseUrl = normalizeUrl(settings.jellyseerrUrl);
  const apiKey = String(settings.jellyseerrApiKey || "").trim();
  if (!baseUrl || !apiKey || !requestId) return;
  const doDelete = async (url) =>
    fetch(url, {
      method: "DELETE",
      headers: { "X-Api-Key": apiKey },
    });
  let response = await doDelete(`${baseUrl}/api/v1/request/${requestId}`);
  if (!response.ok) {
    const text = await response.text();
    const publicBase = extractPublicBase(text);
    if (publicBase) {
      response = await doDelete(`${baseUrl}${publicBase}/api/v1/request/${requestId}`);
    }
  }
};

const getRootAndProfile = async (settings, mediaType) => {
  const isTv = String(mediaType || "").toLowerCase() === "tv";
  const baseUrl = normalizeUrl(isTv ? settings.sonarrUrl : settings.radarrUrl);
  const apiKey = String(isTv ? settings.sonarrApiKey : settings.radarrApiKey || "").trim();
  if (!baseUrl || !apiKey) return { rootFolder: "", profileId: null };

  const headers = { "X-Api-Key": apiKey };
  const rootFolders = await fetchJson(`${baseUrl}/api/v3/rootfolder`, { headers });
  const profiles = await fetchJson(`${baseUrl}/api/v3/qualityprofile`, { headers });
  const rootFolder = Array.isArray(rootFolders) && rootFolders[0]?.path ? rootFolders[0].path : "";
  const profileList = Array.isArray(profiles) ? profiles : [];
  const pickProfile = (matcher) =>
    profileList.find((profile) => matcher(String(profile?.name || "")));
  const preferred =
    pickProfile((name) => name.includes("1080")) ||
    pickProfile((name) => name.includes("720")) ||
    profileList[0] ||
    null;
  const profileId = preferred?.id ? Number(preferred.id) : null;
  return { rootFolder, profileId, rootFolders, profiles };
};

const approvePayment = async (settings, subId) => {
  const subs = loadSubscriptions();
  const target = subs.find((sub) => sub.id === subId);
  if (!target) throw new Error("Payment not found.");
  if (String(target.status).toLowerCase() !== "pending") {
    throw new Error("Payment is no longer pending.");
  }
  const days = Number(target.durationDays || target.duration || 0) || 30;
  const userKey = target.userId || target.userKey || "";
  const now = Date.now();
  const related = subs.filter(
    (sub) =>
      sub.userId === userKey ||
      sub.userKey === userKey ||
      (target.username && (sub.username || "").toLowerCase() === target.username.toLowerCase())
  );
  const byLatestEnd = related
    .filter((sub) => sub?.endDate)
    .sort(
      (a, b) =>
        new Date(b.endDate || b.submittedAt || 0) -
        new Date(a.endDate || a.submittedAt || 0)
    );
  const latestEndRecord = byLatestEnd[0] || null;
  const latestEndMs = latestEndRecord?.endDate
    ? new Date(latestEndRecord.endDate).getTime()
    : 0;
  const isActive = latestEndMs >= now;
  const baseEndIso = isActive && latestEndRecord?.endDate
    ? latestEndRecord.endDate
    : new Date().toISOString();
  const startDate =
    isActive && latestEndRecord?.startDate ? latestEndRecord.startDate : new Date().toISOString();
  const endDate = addDays(baseEndIso, days);

  const approvedAt = new Date().toISOString();
  const next = subs.map((sub) => {
    const matchesUser =
      sub.userId === userKey ||
      sub.userKey === userKey ||
      (target.username && (sub.username || "").toLowerCase() === target.username.toLowerCase());
    if (!matchesUser) return sub;
    if (sub.status === "pending" && sub.id !== subId) {
      return { ...sub, status: "rejected" };
    }
    if (sub.id !== subId) return sub;
    return {
      ...sub,
      status: "approved",
      approvedAt,
      startDate,
      endDate,
      playbackDisabledAt: null,
    };
  });
  saveSubscriptions(next);
  const approved = next.find((sub) => sub.id === subId);
  if (approved?.userId) {
    await updateEmbyPlayback(settings, approved.userId, true);
  }
  return approved;
};

const rejectPayment = (subId) => {
  const subs = loadSubscriptions();
  const next = subs.map((sub) =>
    sub.id === subId ? { ...sub, status: "rejected" } : sub
  );
  saveSubscriptions(next);
  return next.find((sub) => sub.id === subId);
};

const approveMedia = async (settings, requestId, rootFolderOverride, profileOverride) => {
  const list = loadMediaRequests();
  const index = list.findIndex((item) => item.id === requestId);
  if (index === -1) throw new Error("Media request not found.");
  const record = list[index];
  const { rootFolder, profileId } = await getRootAndProfile(settings, record.media_type);
  const chosenRoot = rootFolderOverride || rootFolder;
  const chosenProfile = Number.isFinite(profileOverride) ? profileOverride : profileId;
  const data = await approveMediaRequest(settings, record, chosenRoot, chosenProfile);
  list[index] = {
    ...record,
    status: "approved",
    jellyseerr_request_id: data?.id || data?.requestId || record.jellyseerr_request_id,
    updated_at: new Date().toISOString(),
    root_folder: chosenRoot || record.root_folder,
    quality_profile: Number.isFinite(chosenProfile) ? chosenProfile : record.quality_profile,
  };
  saveMediaRequests(list);
  return list[index];
};

const rejectMedia = async (settings, requestId) => {
  const list = loadMediaRequests();
  const index = list.findIndex((item) => item.id === requestId);
  if (index === -1) throw new Error("Media request not found.");
  const record = list[index];
  if (record?.jellyseerr_request_id) {
    await deleteJellyseerrRequest(settings, record.jellyseerr_request_id);
  }
  list[index] = { ...record, status: "rejected", updated_at: new Date().toISOString() };
  saveMediaRequests(list);
  return list[index];
};

const buildPosterUrl = (settings, request) => {
  if (request.poster_url) return request.poster_url;
  if (request.posterUrl) return request.posterUrl;
  if (request.poster_path) {
    const base = normalizeUrl(settings.jellyseerrUrl);
    if (!base) return "";
    return `${base}/api/v1/image?path=${encodeURIComponent(request.poster_path)}`;
  }
  return "";
};

const notifyPendingPayments = async (settings, token, state) => {
  const adminIds = getAdminIds(settings);
  if (adminIds.length === 0) return;
  const subs = loadSubscriptions();
  const pending = subs.filter((sub) => sub.status === "pending");
  const latestByUser = new Map();
  for (const sub of pending) {
    const key =
      sub.userId ||
      sub.userKey ||
      (sub.username ? String(sub.username).toLowerCase() : "");
    const submittedMs = new Date(sub.submittedAt || sub.createdAt || sub.updatedAt || 0).getTime();
    const existing = latestByUser.get(key);
    if (!existing || submittedMs > existing.submittedMs) {
      latestByUser.set(key, { sub, submittedMs });
    }
  }
  const latestPending = Array.from(latestByUser.values()).map((entry) => entry.sub);
  for (const sub of latestPending) {
    if (state.notifiedPayments.includes(sub.id)) continue;
    const text = `💳 <b>Payment Pending</b>\n` +
      `Date: ${formatDate(sub?.submittedAt)}\n` +
      `User: <b>${sub.username || sub.userId || "Unknown"}</b>\n` +
      `Plan: ${sub.planName || "-"}\n` +
      `Amount: ${sub.currency || ""} ${sub.price || 0}`;
    const keyboard = {
      inline_keyboard: [[
        { text: "✅ Approve", callback_data: `approve_payment:${sub.id}` },
        { text: "❌ Reject", callback_data: `reject_payment:${sub.id}` },
      ]],
    };
    const slip = sub.slipData || sub.slipUrl || "";
    let successCount = 0;
    for (const adminId of adminIds) {
      try {
        let result = null;
        if (isImageSlip(slip)) {
          result = await sendPhotoDataUri(token, adminId, slip, text, keyboard);
          if (!result?.ok) {
            console.error("Telegram photo send failed:", result);
            result = await sendMessage(token, adminId, text, keyboard);
          }
        } else if (slip) {
          result = await sendSlipFromUrl(token, adminId, slip, text, keyboard);
          if (!result?.ok) {
            console.error("Telegram slip send failed:", result);
            result = await sendMessage(token, adminId, text, keyboard);
          }
        } else {
          result = await sendMessage(token, adminId, text, keyboard);
        }
        if (result?.ok) {
          successCount += 1;
          const messageId = result?.result?.message_id;
          const chatId = result?.result?.chat?.id || adminId;
          if (messageId) {
            const list = state.paymentMessages[sub.id] || [];
            list.push({
              chatId,
              messageId,
              hasPhoto: Boolean(result?.result?.photo),
            });
            state.paymentMessages[sub.id] = list;
          }
        }
      } catch (err) {
        console.error("Telegram send error:", err?.message || err);
      }
    }
    if (successCount > 0) {
      state.notifiedPayments.push(sub.id);
    }
  }
};

const notifyPendingMedia = async (settings, token, state) => {
  const adminIds = getAdminIds(settings);
  if (adminIds.length === 0) return;
  const list = loadMediaRequests();
  const pending = list.filter((item) =>
    !["approved", "rejected", "available"].includes(String(item.status || "").toLowerCase())
  );
  for (const request of pending) {
    if (state.notifiedMedia.includes(request.id)) continue;
    const languageLabel = getLanguageLabel(
      request.language || request.original_language || request.lang
    );
    const text = `🎬 <b>Media Request</b>\n` +
      `Date: ${formatDate(request.requestedAt || request.created_at || request.createdAt)}\n` +
      `Title: <b>${request.title || request.media_title || "Untitled"}</b>\n` +
      `Type: ${String(request.media_type || "movie").toUpperCase()}\n` +
      `Language: ${languageLabel}\n` +
      `Requested by: ${getRequestedBy(request)}`;
    const keyboard = {
      inline_keyboard: [[
        { text: "✅ Approve", callback_data: `approve_media:${request.id}` },
        { text: "❌ Reject", callback_data: `reject_media:${request.id}` },
      ]],
    };
    const posterUrl = buildPosterUrl(settings, request);
    for (const adminId of adminIds) {
      if (posterUrl) {
        await sendPhoto(token, adminId, posterUrl, text, keyboard);
      } else {
        await sendMessage(token, adminId, text, keyboard);
      }
    }
    state.notifiedMedia.push(request.id);
  }
};

const notifyExpiredUsers = async (settings, token, state) => {
  const adminIds = getAdminIds(settings);
  if (adminIds.length === 0) return;
  const subs = loadSubscriptions();
  const now = Date.now();
  const expired = subs.filter((sub) => {
    if (!sub?.endDate) return false;
    const endMs = new Date(sub.endDate).getTime();
    return (sub.status === "approved" || sub.status === "expired") && endMs < now;
  });
  for (const sub of expired) {
    const key = sub.userId || sub.username || sub.id;
    if (state.notifiedExpired.includes(key)) continue;
    const text = `⏰ <b>Expired User</b>\n` +
      `User: <b>${sub.username || sub.userId || "Unknown"}</b>\n` +
      `Plan: ${sub.planName || "-"}\n` +
      `Ended: ${sub.endDate ? String(sub.endDate).slice(0, 10) : "-"}`;
    for (const adminId of adminIds) {
      await sendMessage(token, adminId, text);
    }
    state.notifiedExpired.push(key);
  }
};

const handleCallback = async (settings, token, callback) => {
  const data = String(callback.data || "");
  const [action, id, extra] = data.split(":");
  try {
    if (action === "approve_payment") {
      const approved = await approvePayment(settings, id);
      const approvedBy =
        callback?.from?.username || callback?.from?.first_name || "admin";
      const detailText = buildPaymentResultMessage(
        approved,
        "✅ <b>APPROVED</b>",
        approvedBy
      );
      await editTelegramMessage(token, callback.message, detailText);
      if (state.paymentMessages && state.paymentMessages[id]) {
        delete state.paymentMessages[id];
        saveState(state);
      }
      await answerCallback(token, callback.id, "Payment approved.");
      return;
    }
    if (action === "reject_payment") {
      const rejected = rejectPayment(id);
      const approvedBy =
        callback?.from?.username || callback?.from?.first_name || "admin";
      const detailText = buildPaymentResultMessage(
        rejected,
        "❌ <b>REJECTED</b>",
        approvedBy
      );
      await editTelegramMessage(token, callback.message, detailText);
      if (state.paymentMessages && state.paymentMessages[id]) {
        delete state.paymentMessages[id];
        saveState(state);
      }
      await answerCallback(token, callback.id, "Payment rejected.");
      return;
    }
    if (action === "approve_media") {
      const list = loadMediaRequests();
      const record = list.find((item) => item.id === id);
      if (!record) throw new Error("Media request not found.");
      const options = await getRootAndProfile(settings, record.media_type);
      const roots = Array.isArray(options?.rootFolders)
        ? options.rootFolders.map((item) => item?.path).filter(Boolean)
        : [];
      if (roots.length === 0) {
        const approved = await approveMedia(settings, id);
        const lang = getLanguageLabel(
          approved.language || approved.original_language || approved.lang
        );
      const approvedText =
        `✅ <b>APPROVED</b>\n\n` +
        `Date: ${formatDate(approved.updated_at)}\n` +
        `Title: ${approved.title || approved.media_title || "Untitled"}\n` +
        `Type: ${String(approved.media_type || "movie").toUpperCase()}\n` +
        `Language: ${lang}\n` +
        `Requested by: ${getRequestedBy(approved)}\n` +
        `Root folder: ${approved.root_folder || "-"}`;
        await editTelegramMessage(token, callback.message, approvedText);
        await answerCallback(token, callback.id, "Media request approved.");
        return;
      }

      const state = ensureStateShape(loadState());
      state.pendingMediaApprovals[id] = {
        requestId: id,
        roots,
        profileId: options.profileId ?? null,
      };
      saveState(state);

      const rows = roots.map((folder, index) => ([
        { text: folder, callback_data: `choose_root:${id}:${index}` },
      ]));
      const keyboard = { inline_keyboard: rows };
      await sendMessage(
        token,
        callback.message.chat.id,
        `Select root folder for <b>${record.title || record.media_title || "Untitled"}</b>.`,
        keyboard
      );
      await answerCallback(token, callback.id, "Select root folder.");
      return;
    }
    if (action === "choose_root") {
      const state = ensureStateShape(loadState());
      let pending = state.pendingMediaApprovals[id];
      if (!pending) {
        const list = loadMediaRequests();
        const record = list.find((item) => item.id === id);
        if (!record) throw new Error("Media request not found.");
        const options = await getRootAndProfile(settings, record.media_type);
        const roots = Array.isArray(options?.rootFolders)
          ? options.rootFolders.map((item) => item?.path).filter(Boolean)
          : [];
        pending = {
          requestId: id,
          roots,
          profileId: options.profileId ?? null,
        };
        state.pendingMediaApprovals[id] = pending;
        saveState(state);
      }
      const index = Number(extra);
      const chosenRoot = pending.roots?.[index] || "";
      if (!chosenRoot) throw new Error("Root folder not found.");
      const approved = await approveMedia(settings, id, chosenRoot, pending.profileId);
      delete state.pendingMediaApprovals[id];
      saveState(state);

      const lang = getLanguageLabel(
        approved.language || approved.original_language || approved.lang
      );
      const approvedText =
        `✅ <b>APPROVED</b>\n\n` +
        `Date: ${formatDate(approved.updated_at)}\n` +
        `Title: ${approved.title || approved.media_title || "Untitled"}\n` +
        `Type: ${String(approved.media_type || "movie").toUpperCase()}\n` +
        `Language: ${lang}\n` +
        `Requested by: ${getRequestedBy(approved)}\n` +
        `Root folder: ${chosenRoot}`;
      await editTelegramMessage(token, callback.message, approvedText);
      await answerCallback(token, callback.id, "Media request approved.");
      return;
    }
    if (action === "reject_media") {
      await rejectMedia(settings, id);
      await editTelegramMessage(
        token,
        callback.message,
        "❌ <b>Media Request Rejected</b>\nThis request has been rejected."
      );
      await answerCallback(token, callback.id, "Media request rejected.");
      return;
    }
    await answerCallback(token, callback.id, "Unknown action.");
  } catch (err) {
    await answerCallback(token, callback.id, `Error: ${err.message || "Failed"}`);
  }
};

const pollUpdates = async () => {
  while (true) {
    const settings = loadSettings();
    const token = String(settings.telegramBotToken || "").trim();
    if (!token) {
      await sleep(3000);
      continue;
    }

    const state = ensureStateShape(loadState());
    try {
      if (pendingPaymentPing) {
        pendingPaymentPing = false;
        await notifyPendingPayments(settings, token, state);
        saveState(state);
      }
      if (pendingMediaPing) {
        pendingMediaPing = false;
        await notifyPendingMedia(settings, token, state);
        saveState(state);
      }

      try {
        const url = `${buildTelegramUrl(token, "getUpdates")}?timeout=5&offset=${
          state.lastUpdateId + 1
        }`;
        const response = await fetch(url);
        const data = await response.json();
        if (!data?.ok) {
          console.error("Telegram getUpdates error:", data);
          if (String(data?.description || "").toLowerCase().includes("webhook")) {
            await fetch(buildTelegramUrl(token, "deleteWebhook"));
          }
        }
        if (data?.result?.length) {
          for (const update of data.result) {
            state.lastUpdateId = Math.max(state.lastUpdateId, update.update_id || 0);
            if (update.callback_query) {
              await handleCallback(settings, token, update.callback_query);
            } else if (update.message?.text === "/start") {
              await sendMessage(token, update.message.chat.id, "✅ MovieFlix bot connected.");
            }
          }
        }
      } catch (err) {
        console.error("Telegram getUpdates failed:", err?.message || err);
      }

      await notifyPendingPayments(settings, token, state);
      await notifyPendingMedia(settings, token, state);
      await notifyExpiredUsers(settings, token, state);
      saveState(state);
      await sleep(1000);
    } catch (err) {
      console.error("Telegram bot error:", err?.message || err);
      await sleep(3000);
    }
  }
};

ensureSingleInstance();
pollUpdates();
