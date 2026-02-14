import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import SettingsPage from "./pages/SettingsPage";
import SubscriptionsPage from "./pages/SubscriptionsPage";
import ApprovalsPage from "./pages/ApprovalsPage";
import PaymentsReceivedPage from "./pages/PaymentsReceivedPage";
import PlansPage from "./pages/PlansPage";
import UsersPage from "./pages/UsersPage";
import RequestsPage from "./pages/RequestsPage";
import PaymentHistoryPage from "./pages/PaymentHistoryPage";
import UserSettingsPage from "./pages/UserSettingsPage";
import DashboardPage from "./pages/DashboardPage";
import AdminMediaRequestsPage from "./pages/AdminMediaRequestsPage";
import "./App.css";

const ADMIN_CREDENTIALS = { username: "admin", password: "Hucks4rn" };
const EMBY_ADMIN_USERNAME = "hucksarn";
const LS_SETTINGS = "movieflix_settings";
const LS_USERS = "movieflix_synced_users";
const LS_SESSION = "movieflix_session";
const LS_PLANS = "movieflix_subscription_plans";
const LS_SUBSCRIPTIONS = "movieflix_subscriptions";
const LS_UNLIMITED_USERS = "movieflix_unlimited_users";
const LS_USER_TAGS = "movieflix_user_tags";
const LS_MOVIE_REQUESTS = "movieflix_movie_requests";
const TIME_ZONE_OFFSET = "+05:00";
const BASE_URL = import.meta.env.BASE_URL || "/";
const API_BASE = BASE_URL.replace(/\/+$/, "");
const SETTINGS_ENDPOINT = `${API_BASE}/api/settings`;
const SUBSCRIPTIONS_ENDPOINT = `${API_BASE}/api/subscriptions`;
const PLANS_ENDPOINT = `${API_BASE}/api/plans`;
const MOVIE_REQUESTS_ENDPOINT = `${API_BASE}/api/movie-requests`;
const UNLIMITED_ENDPOINT = `${API_BASE}/api/unlimited-users`;
const TAGS_ENDPOINT = `${API_BASE}/api/user-tags`;
const logClientError = async (payload) => {
  try {
    await fetch(`${API_BASE}/api/client-errors`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    // ignore logging errors
  }
};

const getSettings = () => JSON.parse(localStorage.getItem(LS_SETTINGS) || "{}");
const saveSettings = (settings) => localStorage.setItem(LS_SETTINGS, JSON.stringify(settings));
const clearSettings = () => localStorage.removeItem(LS_SETTINGS);
const getSyncedUsers = () => JSON.parse(localStorage.getItem(LS_USERS) || "[]");
const saveSyncedUsers = (users) => localStorage.setItem(LS_USERS, JSON.stringify(users));
const getSession = () => JSON.parse(localStorage.getItem(LS_SESSION) || "null");
const saveSession = (session) => localStorage.setItem(LS_SESSION, JSON.stringify(session));
const clearSession = () => localStorage.removeItem(LS_SESSION);
const getPlans = () => JSON.parse(localStorage.getItem(LS_PLANS) || "[]");
const savePlans = (plans) => localStorage.setItem(LS_PLANS, JSON.stringify(plans));
const normalizeSubscriptions = (subs) => {
  if (!Array.isArray(subs)) return [];
  const normalized = subs.map((sub) => ({
    ...sub,
    currency: sub?.currency === "USD" || !sub?.currency ? "MVR" : sub.currency,
  }));
  const latestByUser = new Map();
  const getKey = (sub) =>
    sub?.userId || sub?.userKey || (sub?.username || "").toLowerCase() || "";
  normalized.forEach((sub) => {
    const key = getKey(sub);
    if (!key) return;
    const prev = latestByUser.get(key);
    const prevTime = prev ? new Date(prev.submittedAt || prev.endDate || 0).getTime() : 0;
    const nextTime = new Date(sub.submittedAt || sub.endDate || 0).getTime();
    if (!prev || nextTime >= prevTime) {
      latestByUser.set(key, sub);
    }
  });
  return normalized.map((sub) => {
    const key = getKey(sub);
    if (!key || sub?.status !== "pending") return sub;
    const latest = latestByUser.get(key);
    if (latest && latest.id !== sub.id) {
      return { ...sub, status: "expired" };
    }
    return sub;
  });
};

const getSubscriptions = () =>
  normalizeSubscriptions(JSON.parse(localStorage.getItem(LS_SUBSCRIPTIONS) || "[]"));
const saveSubscriptions = (subs) =>
  localStorage.setItem(LS_SUBSCRIPTIONS, JSON.stringify(subs));
const getUnlimitedUsers = () =>
  JSON.parse(localStorage.getItem(LS_UNLIMITED_USERS) || "[]");
const saveUnlimitedUsers = (list) =>
  localStorage.setItem(LS_UNLIMITED_USERS, JSON.stringify(list));
const getUserTags = () => {
  const raw = localStorage.getItem(LS_USER_TAGS) || "{}";
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};
const saveUserTags = (tags) =>
  localStorage.setItem(LS_USER_TAGS, JSON.stringify(tags));
const getMovieRequests = () =>
  JSON.parse(localStorage.getItem(LS_MOVIE_REQUESTS) || "[]");
const saveMovieRequests = (requests) =>
  localStorage.setItem(LS_MOVIE_REQUESTS, JSON.stringify(requests));

const normalizeUrl = (value) => value.replace(/\/+$/, "");
const safeUUID = () => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const normalizeAccounts = (settings) => {
  if (Array.isArray(settings.accounts) && settings.accounts.length > 0) {
    return settings.accounts;
  }
  if (settings.accountName || settings.accountNumber || settings.bankName) {
    return [
      {
        id: safeUUID(),
        accountName: settings.accountName || "",
        accountNumber: settings.accountNumber || "",
        bankName: settings.bankName || "",
      },
    ];
  }
  return [];
};
const addDays = (dateValue, days) => {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "";
  date.setDate(date.getDate() + Number(days || 0));
  return date.toISOString();
};
const toIsoFromDateInput = (value) => {
  if (!value) return "";
  const date = new Date(`${value}T12:00:00${TIME_ZONE_OFFSET}`);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString();
};
const diffInDays = (startIso, endIso) => {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)));
};

const fetchServerSettings = async () => {
  const response = await fetch(SETTINGS_ENDPOINT, { cache: "no-store" });
  if (!response.ok) return null;
  return response.json();
};

const saveServerSettings = async (payload) => {
  const response = await fetch(SETTINGS_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Failed to persist settings.");
  }
};

const fetchServerSubscriptions = async () => {
  const response = await fetch(SUBSCRIPTIONS_ENDPOINT, { cache: "no-store" });
  if (!response.ok) return null;
  return response.json();
};

const saveServerSubscriptions = async (payload) => {
  const response = await fetch(SUBSCRIPTIONS_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Failed to persist subscriptions.");
  }
};

const fetchServerPlans = async () => {
  const response = await fetch(PLANS_ENDPOINT, { cache: "no-store" });
  if (!response.ok) return null;
  return response.json();
};

const fetchServerMovieRequests = async () => {
  const response = await fetch(MOVIE_REQUESTS_ENDPOINT, { cache: "no-store" });
  if (!response.ok) return null;
  return response.json();
};

const saveServerPlans = async (payload) => {
  const response = await fetch(PLANS_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Failed to persist plans.");
  }
};

const saveServerMovieRequests = async (payload) => {
  const response = await fetch(MOVIE_REQUESTS_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Failed to persist movie requests.");
  }
};

const fetchServerUnlimitedUsers = async () => {
  const response = await fetch(UNLIMITED_ENDPOINT, { cache: "no-store" });
  if (!response.ok) return null;
  return response.json();
};

const saveServerUnlimitedUsers = async (payload) => {
  const response = await fetch(UNLIMITED_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Failed to persist unlimited users.");
  }
};

const fetchServerUserTags = async () => {
  const response = await fetch(TAGS_ENDPOINT, { cache: "no-store" });
  if (!response.ok) return null;
  return response.json();
};

const saveServerUserTags = async (payload) => {
  const response = await fetch(TAGS_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Failed to persist user tags.");
  }
};

const getUtcMidnight = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).getTime();
};

const getExpiredUserCount = (subscriptions) => {
  if (!Array.isArray(subscriptions) || subscriptions.length === 0) return 0;
  const latestByUser = new Map();
  subscriptions.forEach((sub) => {
    const key = sub.userKey || sub.userId || "";
    if (!key) return;
    const prev = latestByUser.get(key);
    const prevTime = prev ? new Date(prev.endDate || prev.submittedAt || 0).getTime() : 0;
    const nextTime = new Date(sub.endDate || sub.submittedAt || 0).getTime();
    if (!prev || nextTime >= prevTime) {
      latestByUser.set(key, sub);
    }
  });
  const todayUtc = getUtcMidnight();
  let count = 0;
  latestByUser.forEach((sub) => {
    const endTime = sub?.endDate ? new Date(sub.endDate).getTime() : null;
    const isExpired = typeof endTime === "number" && endTime < todayUtc;
    if (isExpired) count += 1;
  });
  return count;
};

const buildEmbyUrl = (_settings, path) => {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE}/api/emby${normalized}`;
};

const authenticateEmby = async (username, password, settings) => {
  const response = await fetch(buildEmbyUrl(settings, "/Users/AuthenticateByName"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Emby-Authorization":
        'Emby Client="MovieFlix Dashboard", Device="Web", DeviceId="movieflix-web", Version="1.0.0"',
    },
    body: JSON.stringify({ Username: username, Pw: password }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Emby authentication failed.");
  }

  return response.json();
};

const fetchJellyseerrJson = async (path, options = {}) => {
  const response = await fetch(`${API_BASE}/api/jellyseerr${path}`, options);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Jellyseerr request failed.");
  }
  return response.json();
};

let cachedLibraryGuids = null;
let cachedSubscriptionGuid = null;
const fetchLibraryGuids = async () => {
  if (cachedLibraryGuids) {
    return { all: cachedLibraryGuids, subscription: cachedSubscriptionGuid };
  }
  const response = await fetch(`${API_BASE}/api/emby/Library/SelectableMediaFolders`);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Failed to load libraries.");
  }
  const data = await response.json();
  const allGuids = (Array.isArray(data) ? data : [])
    .map((item) => item?.Guid || item?.Id || "")
    .filter(Boolean);
  const subscription = (Array.isArray(data) ? data : []).find(
    (item) => String(item?.Name || "").trim().toLowerCase() === "subscription"
  );
  cachedLibraryGuids = allGuids;
  cachedSubscriptionGuid = subscription?.Guid || subscription?.Id || null;
  return { all: cachedLibraryGuids, subscription: cachedSubscriptionGuid };
};

const normalizeGuidList = (value) =>
  (Array.isArray(value) ? value : []).map(String).filter(Boolean).sort();

const libraryPolicyForPlayback = async (enablePlayback) => {
  const { all, subscription } = await fetchLibraryGuids();
  if (enablePlayback) {
    return {
      EnableAllFolders: false,
      EnabledFolders: subscription ? all.filter((guid) => guid !== subscription) : all,
      EnableAllChannels: true,
      EnabledChannels: [],
    };
  }
  return {
    EnableAllFolders: false,
    EnabledFolders: subscription ? [subscription] : [],
    EnableAllChannels: false,
    EnabledChannels: [],
  };
};

const shouldUpdateLibraryPolicy = (policy, target) => {
  if (!policy) return true;
  if (Boolean(policy.EnableAllFolders) !== Boolean(target.EnableAllFolders)) return true;
  if (Boolean(policy.EnableAllChannels) !== Boolean(target.EnableAllChannels)) return true;
  const leftFolders = normalizeGuidList(policy.EnabledFolders);
  const rightFolders = normalizeGuidList(target.EnabledFolders);
  if (leftFolders.length !== rightFolders.length) return true;
  for (let i = 0; i < leftFolders.length; i += 1) {
    if (leftFolders[i] !== rightFolders[i]) return true;
  }
  const leftChannels = normalizeGuidList(policy.EnabledChannels);
  const rightChannels = normalizeGuidList(target.EnabledChannels);
  if (leftChannels.length !== rightChannels.length) return true;
  for (let i = 0; i < leftChannels.length; i += 1) {
    if (leftChannels[i] !== rightChannels[i]) return true;
  }
  return false;
};

export default function App() {
  useEffect(() => {
    const handleError = (event) => {
      logClientError({
        type: "error",
        message: event?.message || "unknown_error",
        source: event?.filename || "",
        lineno: event?.lineno || null,
        colno: event?.colno || null,
        stack: event?.error?.stack || "",
        href: window.location.href,
      });
    };

    const handleRejection = (event) => {
      const reason = event?.reason;
      logClientError({
        type: "unhandledrejection",
        message: reason?.message || String(reason || "unknown_rejection"),
        stack: reason?.stack || "",
        href: window.location.href,
      });
    };

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleRejection);
    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleRejection);
    };
  }, []);
  const navigate = useNavigate();
  const location = useLocation();
  const routePath = (location?.pathname || "").replace(/^\/emby/, "") || "/";
  const isPaymentsReceived = routePath === "/payments-received";
  const tableRoutes = [
    "/users",
    "/approvals",
    "/payments-received",
    "/plans",
    "/media-requests",
  ];
  const isTableRoute = tableRoutes.includes(routePath);
  const [session, setSession] = useState(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return true;
    return !window.matchMedia("(max-width: 1100px)").matches;
  });
  const [loginUser, setLoginUser] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [loginMessage, setLoginMessage] = useState("");
  const [settingsMessage, setSettingsMessage] = useState("");
  const [serverStatus, setServerStatus] = useState(null);
  const [serverStatusError, setServerStatusError] = useState("");
  const [themeMode, setThemeMode] = useState(() => {
    if (typeof window === "undefined") return "dark";
    return localStorage.getItem("movieflix_theme") || "dark";
  });
  const [settings, setSettingsState] = useState(() => {
    const base = getSettings();
    return { ...base, accounts: normalizeAccounts(base) };
  });
  const [savedSettings, setSavedSettings] = useState(() => {
    const base = getSettings();
    return { ...base, accounts: normalizeAccounts(base) };
  });
  const fetchServerStatus = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/status`, { cache: "no-store" });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Status check failed.");
      }
      const data = await response.json();
      setServerStatus(data);
      setServerStatusError("");
    } catch (err) {
      setServerStatusError(err?.message || "Status check failed.");
    }
  }, []);
  const [syncedUsers, setSyncedUsersState] = useState(() => getSyncedUsers());
  const [plans, setPlans] = useState(() => getPlans());
  const [subscriptions, setSubscriptions] = useState(() => getSubscriptions());
  const [unlimitedUsers, setUnlimitedUsers] = useState(() => getUnlimitedUsers());
  const [userTags, setUserTags] = useState(() => getUserTags());
  const [movieRequests, setMovieRequests] = useState(() => getMovieRequests());
  const [toasts, setToasts] = useState([]);
  const subscriptionsRef = useRef(subscriptions);
  const toastInitRef = useRef(false);
  const plansRef = useRef(plans);
  const unlimitedRef = useRef(unlimitedUsers);
  const tagsRef = useRef(userTags);
  const movieRequestsRef = useRef(movieRequests);
  const isAdmin = session?.role === "admin";
  const dashboardAlerts = useMemo(() => {
    const pendingApprovals = subscriptions.filter((sub) => sub.status === "pending").length;
    const openRequests = movieRequests.filter((req) => req.status !== "done").length;
    return {
      total: pendingApprovals + openRequests,
      pendingApprovals,
      openRequests,
    };
  }, [subscriptions, movieRequests]);

  useEffect(() => {
    if (!session || typeof window === "undefined" || !window.matchMedia) return;
    const media = window.matchMedia("(max-width: 1100px)");
    const handle = (event) => {
      if (event.matches) {
        setSidebarOpen(false);
      } else {
        setSidebarOpen(true);
      }
    };
    handle(media);
    if (media.addEventListener) {
      media.addEventListener("change", handle);
    } else if (media.addListener) {
      media.addListener(handle);
    }
    return () => {
      if (media.removeEventListener) {
        media.removeEventListener("change", handle);
      } else if (media.removeListener) {
        media.removeListener(handle);
      }
    };
  }, [session]);

  const syncJellyseerrUser = useCallback(
    async ({ username, password, embyUserId }) => {
      if (!settings.jellyseerrUrl || !settings.jellyseerrApiKey) return null;
      const lowerName = String(username || "").toLowerCase();

      let userList = [];
      try {
        const data = await fetchJellyseerrJson("/api/v1/user?take=1000&skip=0");
        userList = Array.isArray(data?.results) ? data.results : Array.isArray(data) ? data : [];
      } catch {
        userList = [];
      }

      const hasUser = userList.some((user) => {
        const jellyfinId =
          user?.jellyfinUserId || user?.jellyfinId || user?.jellyfin_id || "";
        const name = String(user?.displayName || user?.username || user?.name || "").toLowerCase();
        return (embyUserId && jellyfinId === embyUserId) || (lowerName && name === lowerName);
      });

      if (!hasUser) {
        try {
          const jellyfinUsers = await fetchJellyseerrJson("/api/v1/settings/jellyfin/users");
          const candidates = Array.isArray(jellyfinUsers) ? jellyfinUsers : [];
          const match = candidates.find((user) => {
            const id = user?.Id || user?.id || user?.jellyfinUserId || "";
            const name = String(user?.Name || user?.name || user?.Username || "").toLowerCase();
            return (embyUserId && id === embyUserId) || (lowerName && name === lowerName);
          });
          if (match) {
            const jellyfinUserId = match?.Id || match?.id || match?.jellyfinUserId;
            await fetch(`${API_BASE}/api/jellyseerr/api/v1/user/import-from-jellyfin`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                jellyfinUserId,
                userId: jellyfinUserId,
              }),
            });
          }
        } catch {
          // ignore import failures
        }
      }

      try {
          const authResponse = await fetch(`${API_BASE}/api/jellyseerr/api/v1/auth/jellyfin`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-jellyseerr-auth": "user",
          },
          credentials: "include",
          body: JSON.stringify({ username, password, rememberMe: true }),
        });
        if (!authResponse.ok) {
          const text = await authResponse.text();
          throw new Error(text || "Jellyseerr auth failed.");
        }
        const data = await authResponse.json();
        return data?.accessToken || data?.token || data?.jwt || null;
      } catch {
        return null;
      }
    },
    [settings.jellyseerrUrl, settings.jellyseerrApiKey]
  );

  useEffect(() => {
    const savedSession = getSession();
    if (savedSession) {
      setSession(savedSession);
    }
    setSessionReady(true);
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.classList.toggle("theme-light", themeMode === "light");
    if (typeof window !== "undefined") {
      localStorage.setItem("movieflix_theme", themeMode);
    }
  }, [themeMode]);

  useEffect(() => {
    let mounted = true;
    const loadServerSettings = async () => {
      try {
        const data = await fetchServerSettings();
        if (!mounted || !data) return;
        if (Object.keys(data).length === 0) {
          clearSettings();
          const empty = { accounts: [] };
          if (mounted) {
            setSettingsState(empty);
            setSavedSettings(empty);
          }
          return;
        }
        const next = { ...getSettings(), ...data };
        if (!next.accounts || next.accounts.length === 0) {
          next.accounts = normalizeAccounts(next);
        }
        saveSettings(next);
        if (mounted) {
          setSettingsState(next);
          setSavedSettings(next);
        }
      } catch {
        // Ignore server settings failures; fallback to local storage.
      }
    };
    loadServerSettings();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    const loadServerTags = async () => {
      try {
        const serverData = await fetchServerUserTags();
        if (!mounted || !serverData || typeof serverData !== "object") return;
        const localData = getUserTags();
        const serverHasKeys = Object.keys(serverData).length > 0;
        const next = serverHasKeys ? serverData : localData;
        if (next && Object.keys(next).length > 0 && !serverHasKeys) {
          saveServerUserTags(next).catch(() => {});
        }
        saveUserTags(next || {});
        if (mounted) setUserTags(next || {});
      } catch {
        // Ignore failures; fallback to local storage.
      }
    };
    loadServerTags();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    const loadServerPlans = async () => {
      try {
        const serverData = await fetchServerPlans();
        if (!mounted || !Array.isArray(serverData)) return;
        const localData = getPlans();
        const next = normalizeSubscriptions(serverData.length > 0 ? serverData : localData);
        if (next && next.length > 0 && serverData.length === 0) {
          saveServerPlans(next).catch(() => {});
        }
        savePlans(next || []);
        if (mounted) setPlans(next || []);
      } catch {
        // Ignore failures; fallback to local storage.
      }
    };
    loadServerPlans();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    const loadServerMovieRequests = async () => {
      try {
        const serverData = await fetchServerMovieRequests();
        if (!mounted || !Array.isArray(serverData)) return;
        const localData = getMovieRequests();
        const next = serverData.length > 0 ? serverData : localData;
        if (next && next.length > 0 && serverData.length === 0) {
          saveServerMovieRequests(next).catch(() => {});
        }
        saveMovieRequests(next || []);
        if (mounted) setMovieRequests(next || []);
      } catch {
        // Ignore failures; fallback to local storage.
      }
    };
    loadServerMovieRequests();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    const loadServerUnlimited = async () => {
      try {
        const serverData = await fetchServerUnlimitedUsers();
        if (!mounted || !Array.isArray(serverData)) return;
        const localData = getUnlimitedUsers();
        const next = serverData.length > 0 ? serverData : localData;
        if (next && next.length > 0 && serverData.length === 0) {
          saveServerUnlimitedUsers(next).catch(() => {});
        }
        saveUnlimitedUsers(next || []);
        if (mounted) setUnlimitedUsers(next || []);
      } catch {
        // Ignore failures; fallback to local storage.
      }
    };
    loadServerUnlimited();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    const loadServerSubscriptions = async () => {
      try {
        const serverData = await fetchServerSubscriptions();
        if (!mounted || !Array.isArray(serverData)) return;
        const next = normalizeSubscriptions(serverData);
        saveSubscriptions(next || []);
        if (mounted) setSubscriptions(next || []);
      } catch {
        // Ignore failures; fallback to local storage.
      }
    };
    loadServerSubscriptions();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const base = getSettings();
    const normalized = { ...base, accounts: normalizeAccounts(base) };
    setSettingsState(normalized);
    setSavedSettings(normalized);
    setSyncedUsersState(getSyncedUsers());
    setPlans(getPlans());
    setSubscriptions(getSubscriptions());
    setUnlimitedUsers(getUnlimitedUsers());
    setUserTags(getUserTags());
    setMovieRequests(getMovieRequests());
  }, [session]);

  useEffect(() => {
    subscriptionsRef.current = subscriptions;
  }, [subscriptions]);

  const pushToast = useCallback((toast) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const nextToast = {
      id,
      title: toast.title || "",
      message: toast.message || "",
      tone: toast.tone || "info",
    };
    setToasts((prev) => [nextToast, ...prev].slice(0, 4));
    setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 4500);
  }, []);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const serverData = await fetchServerSubscriptions();
        if (cancelled || !Array.isArray(serverData)) return;
        const next = normalizeSubscriptions(serverData);
        const prev = subscriptionsRef.current || [];
        const prevById = new Map(prev.map((sub) => [sub.id, sub]));
        const userKey = session?.userId || session?.username || "";
        if (toastInitRef.current) {
          next.forEach((sub) => {
            const prevSub = prevById.get(sub.id);
            if (!prevSub) {
              if (isAdmin && sub.status === "pending") {
                pushToast({
                  title: "New payment submitted",
                  message: `${sub.username || sub.userId || "User"} • ${sub.planName || "Plan"}`,
                  tone: "info",
                });
              }
              return;
            }
            if (prevSub.status !== sub.status) {
              const status = String(sub.status || "").toLowerCase();
              const label = status.charAt(0).toUpperCase() + status.slice(1);
              if (isAdmin) {
                pushToast({
                  title: `Payment ${label}`,
                  message: `${sub.username || sub.userId || "User"} • ${sub.planName || "Plan"}`,
                  tone: status === "approved" ? "success" : status === "rejected" ? "danger" : "info",
                });
              }
            }
          });
        }
        toastInitRef.current = true;
        saveSubscriptions(next || []);
        setSubscriptions(next || []);
      } catch {
        // ignore polling errors
      }
    };
    const interval = setInterval(poll, 5000);
    poll();
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [session, isAdmin, pushToast]);

  useEffect(() => {
    plansRef.current = plans;
  }, [plans]);

  useEffect(() => {
    unlimitedRef.current = unlimitedUsers;
  }, [unlimitedUsers]);

  useEffect(() => {
    tagsRef.current = userTags;
  }, [userTags]);

  useEffect(() => {
    movieRequestsRef.current = movieRequests;
  }, [movieRequests]);


  const sortedUsers = useMemo(() => {
    return [...syncedUsers].sort((a, b) => {
      const nameA = (a.Name || a.name || "").toLowerCase();
      const nameB = (b.Name || b.name || "").toLowerCase();
      return nameA.localeCompare(nameB);
    });
  }, [syncedUsers]);

  const ensureSettings = async () => {
    if (settings.embyUrl && settings.apiKey) return settings;
    try {
      const serverSettings = await fetchServerSettings();
      if (serverSettings && (serverSettings.embyUrl || serverSettings.apiKey)) {
        const next = { ...getSettings(), ...serverSettings };
        saveSettings(next);
        setSettingsState(next);
        return next.embyUrl && next.apiKey ? next : null;
      }
    } catch {
      // Ignore failures; handled below.
    }
    setLoginMessage("Admin must save Emby URL + API key before Emby login.");
    return null;
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    setLoginMessage("");

    const username = loginUser.trim();
    const password = loginPass;
    const isLocalAdmin = username.toLowerCase() === ADMIN_CREDENTIALS.username.toLowerCase();
    const isEmbyAdmin = username.toLowerCase() === EMBY_ADMIN_USERNAME.toLowerCase();

    if (!username || !password) {
      setLoginMessage("Enter both username and password.");
      return;
    }

    if (isLocalAdmin && password === ADMIN_CREDENTIALS.password) {
      const newSession = { username, role: "admin" };
      saveSession(newSession);
      setSession(newSession);
      setLoginUser("");
      setLoginPass("");
      navigate("/dashboard", { replace: true });
      return;
    }

    if (isEmbyAdmin) {
      const readySettings = await ensureSettings();
      if (!readySettings) return;

      try {
        const result = await authenticateEmby(username, password, readySettings);
        const newSession = {
          username,
          role: "admin",
          token: result.AccessToken,
          userId: result.User?.Id,
        };
        const jellyseerrToken = await syncJellyseerrUser({
          username,
          password,
          embyUserId: result.User?.Id,
        });
        if (jellyseerrToken) {
          newSession.jellyseerrToken = jellyseerrToken;
        }
        saveSession(newSession);
        setSession(newSession);
        setLoginUser("");
        setLoginPass("");
        navigate("/dashboard", { replace: true });
      } catch (error) {
        setLoginMessage(error.message || "Login failed.");
      }
      return;
    }

    const readySettings = await ensureSettings();
    if (!readySettings) return;

    try {
      const result = await authenticateEmby(username, password, readySettings);
      const userId = result.User?.Id;
      const isSynced = syncedUsers.some(
        (user) =>
          (user.Id || user.id) === userId ||
          (user.Name || user.name || "").toLowerCase() === username.toLowerCase()
      );

      if (!isSynced && result.User) {
        const nextUsers = [result.User, ...syncedUsers];
        saveSyncedUsers(nextUsers);
        setSyncedUsersState(nextUsers);
      }

      const newSession = {
        username,
        role: "user",
        token: result.AccessToken,
        userId,
      };
      const jellyseerrToken = await syncJellyseerrUser({
        username,
        password,
        embyUserId: userId,
      });
      if (jellyseerrToken) {
        newSession.jellyseerrToken = jellyseerrToken;
      }
      saveSession(newSession);
      setSession(newSession);
      setLoginUser("");
      setLoginPass("");
      navigate("/dashboard", { replace: true });
    } catch (error) {
      setLoginMessage(error.message || "Login failed.");
    }
  };

  const handleLogout = () => {
    clearSession();
    setSession(null);
    setLoginMessage("");
    navigate("/", { replace: true });
  };

  const handleSettingsSave = (event) => {
    event.preventDefault();
    const embyUrl = normalizeUrl(settings.embyUrl || "");
    const apiKey = (settings.apiKey || "").trim();

    if (!embyUrl || !apiKey) {
      setSettingsMessage("Emby URL and API key are required.");
      return;
    }

    const nextSettings = {
      ...settings,
      embyUrl,
      apiKey,
      jellyseerrUrl: settings.jellyseerrUrl || "",
      jellyseerrApiKey: settings.jellyseerrApiKey || "",
      allowUserThemeToggle: Boolean(settings.allowUserThemeToggle),
      disableAutoTrial: Boolean(settings.disableAutoTrial),
      telegramBotToken: settings.telegramBotToken || "",
      telegramAdminIds: settings.telegramAdminIds || "",
      telegramSetupComplete: Boolean(settings.telegramSetupComplete),
      accounts: normalizeAccounts(settings),
      accountName: settings.accountName || "",
      accountNumber: settings.accountNumber || "",
      bankName: settings.bankName || "",
      instructions: settings.instructions || "",
    };
    saveSettings(nextSettings);
    setSettingsState(nextSettings);
    setSavedSettings(nextSettings);
    saveServerSettings(nextSettings)
      .then(() => setSettingsMessage("Settings saved."))
      .catch(() => setSettingsMessage("Settings saved locally, but server sync failed."));
  };

  const handleSettingsSaveNow = () => {
    handleSettingsSave({ preventDefault: () => {} });
  };

  const handleSettingsDiscard = (section) => {
    const base = savedSettings || {};
    setSettingsState((prev) => {
      if (section === "emby") {
        return {
          ...prev,
          embyUrl: base.embyUrl || "",
          embyHomeUrl: base.embyHomeUrl || "",
          apiKey: base.apiKey || "",
        };
      }
      if (section === "jellyseerr") {
        return {
          ...prev,
          jellyseerrUrl: base.jellyseerrUrl || "",
          jellyseerrApiKey: base.jellyseerrApiKey || "",
        };
      }
      if (section === "servers") {
        return {
          ...prev,
          sonarrUrl: base.sonarrUrl || "",
          sonarrApiKey: base.sonarrApiKey || "",
          radarrUrl: base.radarrUrl || "",
          radarrApiKey: base.radarrApiKey || "",
        };
      }
      if (section === "accounts") {
        return {
          ...prev,
          accounts: normalizeAccounts(base),
          instructions: base.instructions || "",
        };
      }
      if (section === "appearance") {
        return {
          ...prev,
          allowUserThemeToggle: Boolean(base.allowUserThemeToggle),
        };
      }
      return prev;
    });
  };

  const handleAddPlan = (plan) => {
    if (!isAdmin) return;
    const nextPlan = {
      id: safeUUID(),
      durationDays: Number(plan.durationDays),
      ...plan,
    };
    const nextPlans = [nextPlan, ...plans];
    savePlans(nextPlans);
    setPlans(nextPlans);
    saveServerPlans(nextPlans).catch(() => {});
  };

  const handleAddMovieRequest = (request) => {
    const nextRequest = {
      id: safeUUID(),
      title: String(request.title || "").trim(),
      requestedBy: String(request.requestedBy || "").trim(),
      notes: String(request.notes || "").trim(),
      status: request.status || "open",
      requestedAt: new Date().toISOString(),
    };
    if (!nextRequest.title) return;
    const nextRequests = [nextRequest, ...movieRequests];
    saveMovieRequests(nextRequests);
    setMovieRequests(nextRequests);
    saveServerMovieRequests(nextRequests).catch(() => {});
  };

  const handleUpdateMovieRequest = (id, updates) => {
    const nextRequests = movieRequests.map((request) =>
      request.id === id ? { ...request, ...updates } : request
    );
    saveMovieRequests(nextRequests);
    setMovieRequests(nextRequests);
    saveServerMovieRequests(nextRequests).catch(() => {});
  };

  const handleRemoveMovieRequest = (id) => {
    const nextRequests = movieRequests.filter((request) => request.id !== id);
    saveMovieRequests(nextRequests);
    setMovieRequests(nextRequests);
    saveServerMovieRequests(nextRequests).catch(() => {});
  };

  const updateEmbyPolicy = async (userId, policy) => {
    const url = buildEmbyUrl(settings, `/Users/${userId}/Policy?api_key=${settings.apiKey}`);
    const payload = JSON.stringify(policy);
    const options = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
    };
    let response = await fetch(url, options);
    if (!response.ok) {
      response = await fetch(url, { ...options, method: "PUT" });
    }
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || "Failed to update Emby policy.");
    }
  };

  const fetchEmbyUser = async (userId) => {
    const response = await fetch(
      buildEmbyUrl(settings, `/Users/${userId}?api_key=${settings.apiKey}`)
    );
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || "Failed to fetch Emby user.");
    }
    return response.json();
  };

  const setUserPlayback = async (userId, enable) => {
    if (!settings.embyUrl || !settings.apiKey || !userId) return false;
    let user = syncedUsers.find((item) => (item.Id || item.id) === userId);
    if (!user) {
      user = await fetchEmbyUser(userId);
    }
    if (!user?.Policy) return false;
    const policy = { ...user.Policy, EnableMediaPlayback: true };
    try {
      const { all, subscription } = await fetchLibraryGuids();
      if (enable) {
        policy.EnableAllFolders = false;
        policy.EnabledFolders = subscription
          ? all.filter((guid) => guid !== subscription)
          : all;
        policy.EnableAllChannels = true;
        policy.EnabledChannels = [];
      } else {
        policy.EnableAllFolders = false;
        policy.EnabledFolders = subscription ? [subscription] : [];
        policy.EnableAllChannels = false;
        policy.EnabledChannels = [];
      }
    } catch {
      policy.EnableAllFolders = true;
      policy.EnabledFolders = [];
      policy.EnableAllChannels = true;
      policy.EnabledChannels = [];
    }
    await updateEmbyPolicy(userId, policy);
    setSyncedUsersState((prev) =>
      prev.map((item) =>
        (item.Id || item.id) === userId
          ? { ...item, Policy: { ...item.Policy, ...policy } }
          : item
      )
    );
    return true;
  };

  const handleUpdateSubscriptionDates = ({ user, startDate, endDate }) => {
    if (!isAdmin) return;
    const startIso = toIsoFromDateInput(startDate);
    const endIso = toIsoFromDateInput(endDate);
    if (!startIso || !endIso) return;

    const startMs = new Date(startIso).getTime();
    const endMs = new Date(endIso).getTime();
    if (endMs < startMs) return;

    const userId = user?.Id || user?.id || "";
    const username = user?.Name || user?.name || "";
    const durationDays = diffInDays(startIso, endIso);
    const status = endMs < Date.now() ? "expired" : "approved";

    const matching = subscriptions
      .filter(
        (sub) =>
          (userId && (sub.userId === userId || sub.userKey === userId)) ||
          (username && (sub.username || "").toLowerCase() === username.toLowerCase())
      )
      .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));

    const activeMatch = matching.find((sub) => {
      if (!sub?.endDate) return false;
      const end = new Date(sub.endDate);
      const endUtc = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
      const now = new Date();
      const nowUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
      return endUtc >= nowUtc;
    });

    let nextSubs = [...subscriptions];
    if (matching.length > 0) {
      const targetId = (activeMatch || matching[0]).id;
      nextSubs = nextSubs.map((sub) =>
        sub.id === targetId
          ? {
              ...sub,
              status,
              startDate: startIso,
              endDate: endIso,
              durationDays,
            }
          : sub
      );
    } else {
      nextSubs.unshift({
        id: safeUUID(),
        userKey: userId || username,
        userId,
        username,
        planId: "manual",
        planName: "Manual",
        durationDays,
        price: 0,
        currency: "MVR",
        status,
        submittedAt: new Date().toISOString(),
        startDate: startIso,
        endDate: endIso,
      });
    }

    saveSubscriptions(nextSubs);
    setSubscriptions(nextSubs);
    saveServerSubscriptions(nextSubs).catch(() => {});

    if (status === "expired" && userId) {
      setUserPlayback(userId, false).catch(() => {});
    }
    if (status === "approved" && userId) {
      setUserPlayback(userId, true).catch(() => {});
    }
  };

  const handleRemovePlan = (planId) => {
    if (!isAdmin) return;
    const nextPlans = plans.filter((plan) => plan.id !== planId);
    savePlans(nextPlans);
    setPlans(nextPlans);
    saveServerPlans(nextPlans).catch(() => {});
  };

  const handleUpdatePlan = (planId, updates) => {
    if (!isAdmin) return;
    const nextPlans = plans.map((plan) =>
      plan.id === planId
        ? {
            ...plan,
            ...updates,
            durationDays: Number(updates.durationDays ?? plan.durationDays ?? plan.duration ?? 0),
          }
        : plan
    );
    savePlans(nextPlans);
    setPlans(nextPlans);
    saveServerPlans(nextPlans).catch(() => {});
  };

  const handleSubmitPayment = (payload) => {
    const userKey = payload.userId || payload.userKey || payload.username || "";
    const next = subscriptions.map((sub) => {
      const sameUser =
        userKey &&
        (sub.userId === userKey ||
          sub.userKey === userKey ||
          (payload.username &&
            (sub.username || "").toLowerCase() === String(payload.username).toLowerCase()));
      if (!sameUser) return sub;
      if (sub.status === "pending") {
        return { ...sub, status: "rejected" };
      }
      return sub;
    });
    const nextSub = {
      id: safeUUID(),
      ...payload,
    };
    next.unshift(nextSub);
    saveSubscriptions(next);
    setSubscriptions(next);
    saveServerSubscriptions(next).catch(() => {});
    saveServerSubscriptions(next).catch(() => {});
    pushToast({
      title: "Payment submitted",
      message: `${payload.planName || "Plan"} • ${payload.currency || "MVR"} ${Number(payload.price || 0).toFixed(2)}`,
      tone: "info",
    });
  };

  const handleApproveSubscription = (subId) => {
    const target = subscriptions.find((sub) => sub.id === subId);
    if (!target) return;
    const days = Number(target.durationDays || target.duration || 0) || 30;
    const userKey = target.userId || target.userKey || "";
    const now = Date.now();
    const related = subscriptions.filter(
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
    const next = subscriptions.map((sub) => {
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
    setSubscriptions(next);
    saveServerSubscriptions(next).catch(() => {});
    const approved = next.find((sub) => sub.id === subId);
    if (approved?.userId) {
      setUserPlayback(approved.userId, true).catch(() => {});
    }
  };

  const handleRejectSubscription = (subId) => {
    const next = subscriptions.map((sub) =>
      sub.id === subId ? { ...sub, status: "rejected" } : sub
    );
    saveSubscriptions(next);
    setSubscriptions(next);
    saveServerSubscriptions(next).catch(() => {});
  };

  const handleDeletePayment = (subId) => {
    if (!isAdmin) return;
    const next = subscriptions.filter((sub) => sub.id !== subId);
    saveSubscriptions(next);
    setSubscriptions(next);
    saveServerSubscriptions(next).catch(() => {});
    pushToast({
      title: "Payment deleted",
      message: "The payment record was removed.",
      tone: "info",
    });
  };

  const handleAddUnlimitedUser = (user) => {
    if (!isAdmin || !user) return;
    const userId = user.Id || user.id || "";
    const username = (user.Name || user.name || "").trim();
    if (!userId && !username) return;
    const key = userId || username.toLowerCase();
    const exists = unlimitedUsers.some(
      (item) => item.key === key || (item.userId && item.userId === userId)
    );
    if (exists) return;
    const next = [
      { key, userId: userId || null, username: username || key },
      ...unlimitedUsers,
    ];
    saveUnlimitedUsers(next);
    setUnlimitedUsers(next);
    saveServerUnlimitedUsers(next).catch(() => {});
    if (userId) {
      setUserPlayback(userId, true).catch(() => {});
    }
  };

  const handleRemoveUnlimitedUser = (userKey) => {
    if (!isAdmin) return;
    const next = unlimitedUsers.filter((item) => item.key !== userKey);
    saveUnlimitedUsers(next);
    setUnlimitedUsers(next);
    saveServerUnlimitedUsers(next).catch(() => {});
  };

  const handleUpdateUserTags = (key, tags) => {
    if (!isAdmin || !key) return;
    const normalized = Array.from(
      new Set(
        (tags || [])
          .map((tag) => String(tag || "").trim())
          .filter(Boolean)
      )
    );
    const next = { ...(userTags || {}) };
    if (normalized.length > 0) {
      next[key] = normalized;
    } else {
      delete next[key];
    }
    saveUserTags(next);
    setUserTags(next);
    saveServerUserTags(next).catch(() => {});
  };

  const syncUsers = useCallback(
    async ({ showMessage = true } = {}) => {
      if (!isAdmin) {
        if (showMessage) setSettingsMessage("Only admin can sync users.");
        return;
      }

      if (!settings.embyUrl || !settings.apiKey) {
        if (showMessage) setSettingsMessage("Save Emby URL + API key first.");
        return;
      }

      if (showMessage) {
        setSettingsMessage("Syncing users...");
        pushToast({
          title: "Sync started",
          message: "Fetching Emby users…",
          tone: "info",
        });
      }

      try {
        const response = await fetch(
          buildEmbyUrl(settings, `/Users?api_key=${settings.apiKey}`)
        );
        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || "Failed to fetch users.");
        }
        const users = await response.json();
        const existingById = new Map(
          syncedUsers
            .map((user) => [user.Id || user.id, user])
            .filter(([id]) => Boolean(id))
        );
        const adminName = session?.username || "admin";
        const nowIso = new Date().toISOString();
        const mergedUsers = (users || []).map((user) => {
          const id = user.Id || user.id;
          const existing = id ? existingById.get(id) : null;
          return {
            ...user,
            createdBy: existing?.createdBy || adminName,
            createdAt: existing?.createdAt || nowIso,
          };
        });
        const adjustedUsers = [];
        for (const user of mergedUsers) {
          const userId = user.Id || user.id;
          const playback = user?.Policy?.EnableMediaPlayback;
          if (!userId || (playback !== true && playback !== false)) {
            adjustedUsers.push(user);
            continue;
          }
          try {
            const target = await libraryPolicyForPlayback(playback);
            if (shouldUpdateLibraryPolicy(user.Policy, target)) {
              await updateEmbyPolicy(userId, { ...user.Policy, ...target });
              adjustedUsers.push({
                ...user,
                Policy: { ...user.Policy, ...target },
              });
              continue;
            }
          } catch {
            // Ignore policy sync errors; keep current policy.
          }
          adjustedUsers.push(user);
        }
        const existingIds = new Set(
          syncedUsers.map((user) => user.Id || user.id).filter(Boolean)
        );
        const newUsers = mergedUsers.filter((user) => {
          const id = user.Id || user.id;
          return id && !existingIds.has(id);
        });
        if (newUsers.length > 0) {
          const nextSubs = [...subscriptions];
          let changed = false;
          newUsers.forEach((user) => {
            const userId = user.Id || user.id;
            if (!userId) return;
            const usernameKey = String(user.Name || user.name || "").toLowerCase();
            const hasAny = nextSubs.some((sub) => {
              const key = sub.userId || sub.userKey || "";
              const name = String(sub.username || "").toLowerCase();
              return (key && key === userId) || (usernameKey && name === usernameKey);
            });
            if (hasAny) return;
            if (settings?.disableAutoTrial) return;
            nextSubs.push({
              id: safeUUID(),
              userKey: userId,
              userId,
              username: user.Name || user.name || "Unknown",
              planId: "auto-trial-30",
              planName: "Auto Trial",
              durationDays: 7,
              price: 0,
              currency: "MVR",
              status: "approved",
              submittedAt: nowIso,
              startDate: nowIso,
              endDate: addDays(nowIso, 7),
              source: "auto",
            });
            changed = true;
          });
          if (changed) {
            saveSubscriptions(nextSubs);
            setSubscriptions(nextSubs);
            saveServerSubscriptions(nextSubs).catch(() => {});
          }
        }
        const currentIds = new Set(
          adjustedUsers.map((user) => user.Id || user.id).filter(Boolean)
        );
        const currentNames = new Set(
          adjustedUsers
            .map((user) => String(user?.Name || user?.name || "").toLowerCase())
            .filter(Boolean)
        );
        const prevNameToId = new Map();
        const currentNameToId = new Map();
        syncedUsers.forEach((user) => {
          const id = user?.Id || user?.id || "";
          const name = String(user?.Name || user?.name || "").toLowerCase();
          if (name && id) prevNameToId.set(name, id);
        });
        adjustedUsers.forEach((user) => {
          const id = user?.Id || user?.id || "";
          const name = String(user?.Name || user?.name || "").toLowerCase();
          if (name && id) currentNameToId.set(name, id);
        });

        const removedIds = new Set();
        const removedNames = new Set();
        const replacedNames = new Set();
        prevNameToId.forEach((prevId, name) => {
          const currentId = currentNameToId.get(name);
          if (currentId && currentId !== prevId) {
            removedIds.add(prevId);
            replacedNames.add(name);
          }
        });

        syncedUsers.forEach((user) => {
          const id = user?.Id || user?.id || "";
          const name = String(user?.Name || user?.name || "").toLowerCase();
          if (id && !currentIds.has(id)) removedIds.add(id);
          if (name && !currentNames.has(name)) removedNames.add(name);
        });

        if (removedIds.size > 0 || removedNames.size > 0) {
          const nextSubs = subscriptions.filter((sub) => {
            const key = sub?.userId || sub?.userKey || "";
            const name = String(sub?.username || "").toLowerCase();
            if (key && removedIds.has(key)) return false;
            if (!key && name && (removedNames.has(name) || replacedNames.has(name))) return false;
            return true;
          });
          if (nextSubs.length !== subscriptions.length) {
            saveSubscriptions(nextSubs);
            setSubscriptions(nextSubs);
            saveServerSubscriptions(nextSubs).catch(() => {});
          }

          const nextUnlimited = unlimitedUsers.filter((item) => {
            const key = item?.key || item?.userId || "";
            const name = String(item?.username || "").toLowerCase();
            if (key && removedIds.has(key)) return false;
            if (!item?.userId && name && (removedNames.has(name) || replacedNames.has(name))) {
              return false;
            }
            return true;
          });
          if (nextUnlimited.length !== unlimitedUsers.length) {
            saveUnlimitedUsers(nextUnlimited);
            setUnlimitedUsers(nextUnlimited);
            saveServerUnlimitedUsers(nextUnlimited).catch(() => {});
          }

          const nextTags = { ...(userTags || {}) };
          let tagsChanged = false;
          removedIds.forEach((id) => {
            if (nextTags[id]) {
              delete nextTags[id];
              tagsChanged = true;
            }
          });
          removedNames.forEach((name) => {
            if (nextTags[name]) {
              delete nextTags[name];
              tagsChanged = true;
            }
          });
          replacedNames.forEach((name) => {
            if (nextTags[name]) {
              delete nextTags[name];
              tagsChanged = true;
            }
          });
          if (tagsChanged) {
            saveUserTags(nextTags);
            setUserTags(nextTags);
            saveServerUserTags(nextTags).catch(() => {});
          }

          const nextRequests = movieRequests.filter((request) => {
            const name = String(request?.requestedBy || "").toLowerCase();
            if (name && (removedNames.has(name) || replacedNames.has(name))) return false;
            return true;
          });
          if (nextRequests.length !== movieRequests.length) {
            saveMovieRequests(nextRequests);
            setMovieRequests(nextRequests);
            saveServerMovieRequests(nextRequests).catch(() => {});
          }
        }

        saveSyncedUsers(adjustedUsers || []);
        setSyncedUsersState(adjustedUsers || []);
        if (showMessage) {
          setSettingsMessage("Users synced.");
          const addedCount = newUsers.length;
          pushToast({
            title: "Sync complete",
            message:
              addedCount > 0
                ? `${addedCount} new user${addedCount === 1 ? "" : "s"} added`
                : "No new users found",
            tone: "success",
          });
        }
      } catch (error) {
        if (showMessage) {
          setSettingsMessage(error.message || "Sync failed.");
          pushToast({
            title: "Sync failed",
            message: error.message || "Sync failed.",
            tone: "danger",
          });
        }
      }
    },
    [isAdmin, settings.embyUrl, settings.apiKey, syncedUsers, subscriptions, session]
  );

  const handleSyncUsers = async () => {
    await syncUsers({ showMessage: true });
  };

  useEffect(() => {
    if (!session || !isAdmin) return;
    if (!settings.embyUrl || !settings.apiKey) return;

    const runSync = () => syncUsers({ showMessage: false });
    runSync();

    const interval = setInterval(runSync, 3000);
    const handleFocus = () => runSync();
    const handleVisibility = () => {
      if (document.visibilityState === "visible") runSync();
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [session, isAdmin, settings.embyUrl, settings.apiKey, syncUsers]);

  useEffect(() => {
    if (!session || !isAdmin) return;
    fetchServerStatus();
    const interval = setInterval(fetchServerStatus, 30000);
    return () => clearInterval(interval);
  }, [session, isAdmin, fetchServerStatus]);

  useEffect(() => {
    if (!session || !isAdmin) return;
    if (!settings.embyUrl || !settings.apiKey) return;

    const now = Date.now();
    const latestByUser = new Map();
    subscriptions.forEach((sub) => {
      const key = sub.userId || sub.userKey || "";
      if (!key) return;
      const prev = latestByUser.get(key);
      const prevTime = prev ? new Date(prev.endDate || prev.submittedAt || 0).getTime() : 0;
      const nextTime = new Date(sub.endDate || sub.submittedAt || 0).getTime();
      if (!prev || nextTime >= prevTime) {
        latestByUser.set(key, sub);
      }
    });

    const toDisable = Array.from(latestByUser.values()).filter((sub) => {
      if (!sub.userId || !sub.endDate) return false;
      const endMs = new Date(sub.endDate).getTime();
      return endMs < now && !sub.playbackDisabledAt;
    });

    if (toDisable.length === 0) return;

    (async () => {
      let nextSubs = [...subscriptions];
      for (const sub of toDisable) {
        try {
          await setUserPlayback(sub.userId, false);
          nextSubs = nextSubs.map((item) =>
            item.id === sub.id ? { ...item, playbackDisabledAt: new Date().toISOString() } : item
          );
        } catch {
          // Ignore failures; keep trying on next render.
        }
      }
      saveSubscriptions(nextSubs);
      setSubscriptions(nextSubs);
      saveServerSubscriptions(nextSubs).catch(() => {});
    })();
  }, [session, isAdmin, settings.embyUrl, settings.apiKey, subscriptions, syncedUsers]);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;

    const pollSubscriptions = async () => {
      try {
        const serverData = await fetchServerSubscriptions();
        if (cancelled || !Array.isArray(serverData)) return;
        const current = subscriptionsRef.current || [];
        if (JSON.stringify(serverData) !== JSON.stringify(current)) {
          saveSubscriptions(serverData);
          setSubscriptions(serverData);
        }
      } catch {
        // Ignore polling errors.
      }
    };

    const interval = setInterval(pollSubscriptions, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [session]);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;

    const pollMovieRequests = async () => {
      try {
        const serverData = await fetchServerMovieRequests();
        if (cancelled || !Array.isArray(serverData)) return;
        const current = movieRequestsRef.current || [];
        if (JSON.stringify(serverData) !== JSON.stringify(current)) {
          saveMovieRequests(serverData);
          setMovieRequests(serverData);
        }
      } catch {
        // Ignore polling errors.
      }
    };

    const interval = setInterval(pollMovieRequests, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [session]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [location.pathname]);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;

    const pollTags = async () => {
      try {
        const serverData = await fetchServerUserTags();
        if (cancelled || !serverData || typeof serverData !== "object") return;
        const current = tagsRef.current || {};
        if (JSON.stringify(serverData) !== JSON.stringify(current)) {
          saveUserTags(serverData);
          setUserTags(serverData);
        }
      } catch {
        // Ignore polling errors.
      }
    };

    const interval = setInterval(pollTags, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [session]);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;

    const pollPlans = async () => {
      try {
        const serverData = await fetchServerPlans();
        if (cancelled || !Array.isArray(serverData)) return;
        const current = plansRef.current || [];
        if (JSON.stringify(serverData) !== JSON.stringify(current)) {
          savePlans(serverData);
          setPlans(serverData);
        }
      } catch {
        // Ignore polling errors.
      }
    };

    const interval = setInterval(pollPlans, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [session]);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;

    const pollUnlimited = async () => {
      try {
        const serverData = await fetchServerUnlimitedUsers();
        if (cancelled || !Array.isArray(serverData)) return;
        const current = unlimitedRef.current || [];
        if (JSON.stringify(serverData) !== JSON.stringify(current)) {
          saveUnlimitedUsers(serverData);
          setUnlimitedUsers(serverData);
        }
      } catch {
        // Ignore polling errors.
      }
    };

    const interval = setInterval(pollUnlimited, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [session]);

  return (
    <main className={`app ${isAdmin ? "role-admin" : "role-user"}`}>
      {/* Keep all routed pages inside app-shell so global mobile scaling applies. */}
      <div
        className={`app-shell ${session ? "has-session" : ""} ${
          session ? (sidebarOpen ? "sidebar-open" : "sidebar-collapsed") : ""
        } ${isPaymentsReceived ? "route-payments-received" : ""} ${
          isTableRoute ? "route-table-scroll" : ""
        }`}
      >
        <header className="topbar">
          <div className="topbar-left">
            {session && (
              <button
                type="button"
                className="btn ghost sidebar-toggle"
                onClick={() => setSidebarOpen((prev) => !prev)}
                aria-label="Toggle menu"
                aria-expanded={sidebarOpen}
              >
                <svg
                  className="bottom-icon"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </svg>
                Menu
              </button>
            )}
            <NavLink to="/dashboard" className="brand">
              MovieFlix Dashboard
            </NavLink>
          </div>
          {session && (
            <div className="topbar-user">
              <div className="session">Logged in as: {session.username}</div>
              <div className="topbar-actions">
                {(isAdmin || settings.allowUserThemeToggle) && (
                  <button
                    className="btn ghost theme-toggle"
                    type="button"
                    onClick={() => setThemeMode((prev) => (prev === "dark" ? "light" : "dark"))}
                  >
                    {themeMode === "dark" ? "Light mode" : "Dark mode"}
                  </button>
                )}
                <button className="btn ghost topbar-logout" type="button" onClick={handleLogout}>
                  Log out
                </button>
              </div>
            </div>
          )}
        </header>
        {session && (
          <aside className="sidebar">
            <nav className="nav">
              <NavLink to="/dashboard" className="nav-link" title="Dashboard">
                <span className="nav-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 12l9-9 9 9" />
                    <path d="M5 10v10h14V10" />
                  </svg>
                </span>
                <span className="nav-text">Dashboard</span>
                {isAdmin && dashboardAlerts.total > 0 && (
                  <span
                    className="nav-badge"
                    title={`Requests: ${dashboardAlerts.openRequests}, Approvals: ${dashboardAlerts.pendingApprovals}`}
                  >
                    {dashboardAlerts.total}
                  </span>
                )}
              </NavLink>
              {isAdmin && (
                <NavLink to="/users" className="nav-link" title="Users">
                  <span className="nav-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="8" cy="8" r="3" />
                      <circle cx="17" cy="8" r="3" />
                      <path d="M2 20c0-3 3-5 6-5" />
                      <path d="M22 20c0-3-3-5-6-5" />
                    </svg>
                  </span>
                  <span className="nav-text">Users</span>
                </NavLink>
              )}
              <NavLink to="/subscriptions" className="nav-link" title="Subscriptions">
                <span className="nav-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="5" width="18" height="14" rx="2" />
                    <path d="M3 10h18" />
                  </svg>
                </span>
                <span className="nav-text">Subscriptions</span>
              </NavLink>
              {!isAdmin && (
                <NavLink to="/requests" className="nav-link" title="Requests">
                  <span className="nav-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
                    </svg>
                  </span>
                  <span className="nav-text">Requests</span>
                </NavLink>
              )}
              {!isAdmin && (
                <NavLink to="/payment-history" className="nav-link" title="Payment History">
                  <span className="nav-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 5h18v14H3z" />
                      <path d="M7 9h10M7 13h6" />
                    </svg>
                  </span>
                  <span className="nav-text">Payment History</span>
                </NavLink>
              )}
              {isAdmin && (
                <NavLink to="/plans" className="nav-link" title="Plans">
                  <span className="nav-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M20 12a8 8 0 1 1-4-6.9" />
                      <path d="M20 4v6h-6" />
                    </svg>
                  </span>
                  <span className="nav-text">Plans</span>
                </NavLink>
              )}
              {isAdmin && (
                <NavLink to="/approvals" className="nav-link" title="Approvals">
                  <span className="nav-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M9 12l2 2 4-4" />
                      <circle cx="12" cy="12" r="9" />
                    </svg>
                  </span>
                  <span className="nav-text">Approvals</span>
                </NavLink>
              )}
              {isAdmin && (
                <NavLink to="/payments-received" className="nav-link" title="Payments Received">
                  <span className="nav-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="4" width="18" height="16" rx="2" />
                      <path d="M7 9h10M7 13h6" />
                    </svg>
                  </span>
                  <span className="nav-text">Payments Received</span>
                </NavLink>
              )}
              {isAdmin && (
                <NavLink to="/media-requests" className="nav-link" title="Media Requests">
                  <span className="nav-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="4" width="18" height="16" rx="2" />
                      <path d="M8 4v16M16 4v16" />
                    </svg>
                  </span>
                  <span className="nav-text">Media Requests</span>
                </NavLink>
              )}
              <NavLink to="/settings" className="nav-link" title="Settings">
                <span className="nav-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a7.7 7.7 0 0 0 .1-2l2-1-2-4-2 1a7.7 7.7 0 0 0-1.7-1l-.3-2h-4l-.3 2a7.7 7.7 0 0 0-1.7 1l-2-1-2 4 2 1a7.7 7.7 0 0 0 .1 2l-2 1 2 4 2-1a7.7 7.7 0 0 0 1.7 1l.3 2h4l.3-2a7.7 7.7 0 0 0 1.7-1l2 1 2-4z" />
                  </svg>
                </span>
                <span className="nav-text">Settings</span>
              </NavLink>
            </nav>
          </aside>
        )}

        {!session && sessionReady && (
          <section className="card">
            <h1>Sign in</h1>
            <p className="muted">Use Emby credentials or the local admin account.</p>
            <form onSubmit={handleLogin} className="stack" autoComplete="off">
              <label>
                Username
                <input
                  type="text"
                  value={loginUser}
                  onChange={(event) => setLoginUser(event.target.value)}
                  required
                />
              </label>
              <label>
                Password
                <input
                  type="password"
                  value={loginPass}
                  onChange={(event) => setLoginPass(event.target.value)}
                  required
                />
              </label>
              <button className="btn primary" type="submit">
                Log in
              </button>
              {loginMessage && <div className="note">{loginMessage}</div>}
            </form>
          </section>
        )}

        {!sessionReady && (
          <section className="card">
            <div className="muted">Loading...</div>
          </section>
        )}

        {session && (
          <section className="grid">
            <div className="page-transition" key={location.pathname}>
            <Routes>
            <Route
              path="/settings"
              element={
                isAdmin ? (
                  <SettingsPage
                    isAdmin={isAdmin}
                    settings={settings}
                    onSettingsChange={(key, value) =>
                      setSettingsState((prev) => ({ ...prev, [key]: value }))
                    }
                    onSave={handleSettingsSave}
                    onSaveNow={handleSettingsSaveNow}
                    onDiscard={handleSettingsDiscard}
                    savedSettings={savedSettings}
                    message={settingsMessage}
                    serverStatus={serverStatus}
                    serverStatusError={serverStatusError}
                    onRefreshStatus={fetchServerStatus}
                    onLogout={handleLogout}
                  />
                ) : (
                  <UserSettingsPage
                    currentUser={session}
                    subscriptions={subscriptions}
                    unlimitedUsers={unlimitedUsers}
                  />
                )
              }
            />
            <Route
              path="/dashboard"
              element={
                isAdmin ? (
                  <DashboardPage
                    users={sortedUsers}
                    subscriptions={subscriptions}
                    movieRequests={movieRequests}
                  />
                ) : (
                  <UsersPage
                    users={sortedUsers}
                    isAdmin={isAdmin}
                    currentUser={session}
                    settings={settings}
                    subscriptions={subscriptions}
                    plans={plans}
                    onUpdateDates={handleUpdateSubscriptionDates}
                    unlimitedUsers={unlimitedUsers}
                    userTags={userTags}
                    onUpdateUserTags={handleUpdateUserTags}
                    onAddUnlimitedUser={handleAddUnlimitedUser}
                    onRemoveUnlimitedUser={handleRemoveUnlimitedUser}
                    onSyncUsers={handleSyncUsers}
                  />
                )
              }
            />
            <Route
              path="/users"
              element={
                isAdmin ? (
                  <UsersPage
                    users={sortedUsers}
                    isAdmin={isAdmin}
                    currentUser={session}
                    settings={settings}
                    subscriptions={subscriptions}
                    plans={plans}
                    onUpdateDates={handleUpdateSubscriptionDates}
                    unlimitedUsers={unlimitedUsers}
                    userTags={userTags}
                    onUpdateUserTags={handleUpdateUserTags}
                    onAddUnlimitedUser={handleAddUnlimitedUser}
                    onRemoveUnlimitedUser={handleRemoveUnlimitedUser}
                    onSyncUsers={handleSyncUsers}
                  />
                ) : (
                  <Navigate to="/dashboard" replace />
                )
              }
            />
            <Route
              path="/subscriptions"
              element={
                <SubscriptionsPage
                  plans={plans}
                  subscriptions={subscriptions}
                  currentUser={session}
                  accounts={settings.accounts || normalizeAccounts(settings)}
                  onSubmitPayment={handleSubmitPayment}
                />
              }
            />
            <Route
              path="/requests"
              element={
                !isAdmin ? (
                  <RequestsPage
                    movieRequests={movieRequests}
                    currentUser={session}
                    jellyseerrToken={session?.jellyseerrToken || ""}
                    onAddMovieRequest={handleAddMovieRequest}
                    onUpdateMovieRequest={handleUpdateMovieRequest}
                    onRemoveMovieRequest={handleRemoveMovieRequest}
                  />
                ) : (
                  <Navigate to="/dashboard" replace />
                )
              }
            />
            <Route
              path="/payment-history"
              element={
                !isAdmin ? (
                  <PaymentHistoryPage
                    subscriptions={subscriptions}
                    currentUser={session}
                  />
                ) : (
                  <Navigate to="/dashboard" replace />
                )
              }
            />
            <Route
              path="/subscriptions/:planId"
              element={
                <SubscriptionsPage
                  plans={plans}
                  subscriptions={subscriptions}
                  currentUser={session}
                  accounts={settings.accounts || normalizeAccounts(settings)}
                  onSubmitPayment={handleSubmitPayment}
                />
              }
            />
            <Route
              path="/plans"
              element={
                isAdmin ? (
                  <PlansPage
                    plans={plans}
                    onAdd={handleAddPlan}
                    onRemove={handleRemovePlan}
                    onUpdate={handleUpdatePlan}
                  />
                ) : (
                  <Navigate to="/dashboard" replace />
                )
              }
            />
            <Route
              path="/media-requests"
              element={
                isAdmin ? <AdminMediaRequestsPage /> : <Navigate to="/dashboard" replace />
              }
            />
            <Route
              path="/approvals"
              element={
                isAdmin ? (
                  <ApprovalsPage
                    pending={subscriptions.filter((sub) => sub.status === "pending")}
                    onApprove={handleApproveSubscription}
                    onReject={handleRejectSubscription}
                  />
                ) : (
                  <Navigate to="/dashboard" replace />
                )
              }
            />
            <Route
              path="/payments-received"
              element={
                isAdmin ? (
                  <PaymentsReceivedPage
                    subscriptions={subscriptions}
                    onDeletePayment={handleDeletePayment}
                  />
                ) : (
                  <Navigate to="/dashboard" replace />
                )
              }
            />
            <Route
              path="/"
              element={<Navigate to="/dashboard" replace />}
            />
            <Route
              path="*"
              element={<Navigate to="/dashboard" replace />}
            />
            </Routes>
            </div>
          </section>
        )}
      </div>

      {session && (
        <nav className="bottom-nav">
          {isAdmin ? (
            <>
              <NavLink
                to="/dashboard"
                className={({ isActive }) => `bottom-link ${isActive ? "active" : ""}`}
              >
                <svg
                  className="bottom-icon"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" />
                  <path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                </svg>
                <span className="bottom-label">Home</span>
                {isAdmin && dashboardAlerts.total > 0 && (
                  <span
                    className="bottom-badge"
                    title={`Requests: ${dashboardAlerts.openRequests}, Approvals: ${dashboardAlerts.pendingApprovals}`}
                  >
                    {dashboardAlerts.total}
                  </span>
                )}
              </NavLink>
              <NavLink
                to="/users"
                className={({ isActive }) => `bottom-link ${isActive ? "active" : ""}`}
              >
                <svg
                  className="bottom-icon"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
                <span className="bottom-label">Users</span>
              </NavLink>
              <NavLink
                to="/plans"
                className={({ isActive }) => `bottom-link ${isActive ? "active" : ""}`}
              >
                <svg
                  className="bottom-icon"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polygon points="12 2 2 7 12 12 22 7 12 2" />
                  <polyline points="2 17 12 22 22 17" />
                  <polyline points="2 12 12 17 22 12" />
                </svg>
                <span className="bottom-label">Plans</span>
              </NavLink>
              <NavLink
                to="/approvals"
                className={({ isActive }) => `bottom-link ${isActive ? "active" : ""}`}
              >
                <svg
                  className="bottom-icon"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="9 11 12 14 22 4" />
                  <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                </svg>
                <span className="bottom-label">Approvals</span>
              </NavLink>
              <NavLink
                to="/payments-received"
                className={({ isActive }) => `bottom-link ${isActive ? "active" : ""}`}
              >
                <svg
                  className="bottom-icon"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="3" y="4" width="18" height="16" rx="2" />
                  <path d="M7 9h10M7 13h6" />
                </svg>
                <span className="bottom-label">Received</span>
              </NavLink>
              <NavLink
                to="/media-requests"
                className={({ isActive }) => `bottom-link ${isActive ? "active" : ""}`}
              >
                <svg
                  className="bottom-icon"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect width="14" height="20" x="5" y="2" rx="2" />
                  <path d="M9 6h6" />
                  <path d="M9 10h6" />
                  <path d="M9 14h4" />
                </svg>
                <span className="bottom-label">Requests</span>
              </NavLink>
              <NavLink
                to="/settings"
                className={({ isActive }) => `bottom-link ${isActive ? "active" : ""}`}
              >
                <svg
                  className="bottom-icon"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 3 15.4a1.65 1.65 0 0 0-1.51-1H1a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 2.6 8a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 6.6 3a1.65 1.65 0 0 0 1.51-1H8a2 2 0 1 1 4 0h-.09A1.65 1.65 0 0 0 13 2.6a1.65 1.65 0 0 0 1.82.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 20.6 8a1.65 1.65 0 0 0 1.51 1H22a2 2 0 1 1 0 4h-.09A1.65 1.65 0 0 0 19.4 15z" />
                </svg>
                <span className="bottom-label">Settings</span>
              </NavLink>
            </>
          ) : (
            <>
              <NavLink
                to="/dashboard"
                className={({ isActive }) => `bottom-link ${isActive ? "active" : ""}`}
              >
                <svg
                  className="bottom-icon"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" />
                  <path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                </svg>
                <span className="bottom-label">Home</span>
              </NavLink>
              <NavLink
                to="/requests"
                className={({ isActive }) => `bottom-link ${isActive ? "active" : ""}`}
              >
                <svg
                  className="bottom-icon"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.3-4.3" />
                </svg>
                <span className="bottom-label">Requests</span>
              </NavLink>
              <NavLink
                to="/payment-history"
                className={({ isActive }) => `bottom-link ${isActive ? "active" : ""}`}
              >
                <svg
                  className="bottom-icon"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M9 3h6a2 2 0 0 1 2 2v2H7V5a2 2 0 0 1 2-2z" />
                  <path d="M6 7h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z" />
                  <path d="M8 12h8" />
                  <path d="M8 16h5" />
                </svg>
                <span className="bottom-label">Payments</span>
              </NavLink>
              <NavLink
                to="/subscriptions"
                className={({ isActive }) => `bottom-link ${isActive ? "active" : ""}`}
              >
                <svg
                  className="bottom-icon"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect width="20" height="14" x="2" y="5" rx="2" />
                  <line x1="2" x2="22" y1="10" y2="10" />
                </svg>
                <span className="bottom-label">Subscribe</span>
              </NavLink>
              <NavLink
                to="/settings"
                className={({ isActive }) => `bottom-link ${isActive ? "active" : ""}`}
              >
                <svg
                  className="bottom-icon"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 3 15.4a1.65 1.65 0 0 0-1.51-1H1a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 2.6 8a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 6.6 3a1.65 1.65 0 0 0 1.51-1H8a2 2 0 1 1 4 0h-.09A1.65 1.65 0 0 0 13 2.6a1.65 1.65 0 0 0 1.82.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 20.6 8a1.65 1.65 0 0 0 1.51 1H22a2 2 0 1 1 0 4h-.09A1.65 1.65 0 0 0 19.4 15z" />
                </svg>
                <span className="bottom-label">Settings</span>
              </NavLink>
            </>
          )}
        </nav>
      )}

      <div className="toast-stack" aria-live="polite" aria-atomic="true">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast ${toast.tone}`}>
            {toast.title && <div className="toast-title">{toast.title}</div>}
            {toast.message && <div className="toast-message">{toast.message}</div>}
          </div>
        ))}
      </div>
    </main>
  );
}
