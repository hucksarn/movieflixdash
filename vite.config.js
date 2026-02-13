import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "fs";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  base: "/emby/",
  plugins: [
    react(),
    {
      name: "settings-api",
      configureServer(server) {
        const settingsFile = path.resolve(process.cwd(), "settings.json");
        const subscriptionsFile = path.resolve(process.cwd(), "subscriptions.json");
        const plansFile = path.resolve(process.cwd(), "plans.json");
        const movieRequestsFile = path.resolve(process.cwd(), "movie-requests.json");
        const mediaRequestsFile = path.resolve(process.cwd(), "media-requests.json");
        const unlimitedFile = path.resolve(process.cwd(), "unlimited-users.json");
        const tagsFile = path.resolve(process.cwd(), "user-tags.json");
        const shouldServeSpa = (reqUrl) => {
          if (!reqUrl || !reqUrl.startsWith("/emby")) return false;
          if (reqUrl.startsWith("/emby/api")) return false;
          if (reqUrl.startsWith("/emby/@") || reqUrl.startsWith("/emby/assets")) return false;
          return !reqUrl.includes(".");
        };

        server.middlewares.use((req, _res, next) => {
          if (req.url && req.url.startsWith("/emby/api/")) {
            req.url = req.url.replace(/^\/emby/, "");
          }
          next();
        });

        server.middlewares.use("/api/settings", (req, res, next) => {
          if (req.method === "GET") {
            let data = {};
            if (fs.existsSync(settingsFile)) {
              try {
                const raw = fs.readFileSync(settingsFile, "utf-8");
                data = raw ? JSON.parse(raw) : {};
              } catch {
                data = {};
              }
            }
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(data));
            return;
          }

          if (req.method === "POST") {
            let body = "";
            req.on("data", (chunk) => {
              body += chunk;
              if (body.length > 1_000_000) req.destroy();
            });
            req.on("end", () => {
              let data = {};
              try {
                data = body ? JSON.parse(body) : {};
              } catch {
                data = {};
              }
              fs.writeFileSync(settingsFile, JSON.stringify(data, null, 2));
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ ok: true }));
            });
            return;
          }

          next();
        });

        server.middlewares.use("/api/subscriptions", (req, res, next) => {
          if (req.method === "GET") {
            let data = [];
            if (fs.existsSync(subscriptionsFile)) {
              try {
                const raw = fs.readFileSync(subscriptionsFile, "utf-8");
                data = raw ? JSON.parse(raw) : [];
              } catch {
                data = [];
              }
            }
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(data));
            return;
          }

          if (req.method === "POST") {
            let body = "";
            req.on("data", (chunk) => {
              body += chunk;
              if (body.length > 5_000_000) req.destroy();
            });
            req.on("end", () => {
              let data = [];
              try {
                data = body ? JSON.parse(body) : [];
              } catch {
                data = [];
              }
              fs.writeFileSync(subscriptionsFile, JSON.stringify(data, null, 2));
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ ok: true }));
            });
            return;
          }

          next();
        });

        server.middlewares.use("/api/plans", (req, res, next) => {
          if (req.method === "GET") {
            let data = [];
            if (fs.existsSync(plansFile)) {
              try {
                const raw = fs.readFileSync(plansFile, "utf-8");
                data = raw ? JSON.parse(raw) : [];
              } catch {
                data = [];
              }
            }
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(data));
            return;
          }

          if (req.method === "POST") {
            let body = "";
            req.on("data", (chunk) => {
              body += chunk;
              if (body.length > 1_000_000) req.destroy();
            });
            req.on("end", () => {
              let data = [];
              try {
                data = body ? JSON.parse(body) : [];
              } catch {
                data = [];
              }
              fs.writeFileSync(plansFile, JSON.stringify(data, null, 2));
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ ok: true }));
            });
            return;
          }

          next();
        });

        server.middlewares.use("/api/movie-requests", (req, res, next) => {
          if (req.method === "GET") {
            let data = [];
            if (fs.existsSync(movieRequestsFile)) {
              try {
                const raw = fs.readFileSync(movieRequestsFile, "utf-8");
                data = raw ? JSON.parse(raw) : [];
              } catch {
                data = [];
              }
            }
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(data));
            return;
          }

          if (req.method === "POST") {
            let body = "";
            req.on("data", (chunk) => {
              body += chunk;
              if (body.length > 1_000_000) req.destroy();
            });
            req.on("end", () => {
              let data = [];
              try {
                data = body ? JSON.parse(body) : [];
              } catch {
                data = [];
              }
              fs.writeFileSync(movieRequestsFile, JSON.stringify(data, null, 2));
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ ok: true }));
            });
            return;
          }

          next();
        });

        server.middlewares.use("/api/media-requests", async (req, res, next) => {
          const readData = () => {
            if (!fs.existsSync(mediaRequestsFile)) return [];
            try {
              const raw = fs.readFileSync(mediaRequestsFile, "utf-8");
              return raw ? JSON.parse(raw) : [];
            } catch {
              return [];
            }
          };
          const writeData = (data) => {
            fs.writeFileSync(mediaRequestsFile, JSON.stringify(data, null, 2));
          };

          const sendJson = (payload, status = 200) => {
            res.statusCode = status;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(payload));
          };

          const getBody = async () =>
            await new Promise((resolve) => {
              const chunks = [];
              req.on("data", (chunk) => chunks.push(chunk));
              req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
              req.on("error", () => resolve(""));
            });

          const parts = (req.url || "/").split("/").filter(Boolean);
          const method = req.method || "GET";

          const loadSettings = () => {
            let settings = {};
            if (fs.existsSync(settingsFile)) {
              try {
                const raw = fs.readFileSync(settingsFile, "utf-8");
                settings = raw ? JSON.parse(raw) : {};
              } catch {
                settings = {};
              }
            }
            return settings;
          };

          const getSetting = (settings, key, envKey) =>
            process.env[envKey] || settings?.[key] || "";

          const safeFetch = async (url, options = {}) => {
            try {
              const response = await fetch(url, options);
              const text = await response.text();
              return { ok: response.ok, status: response.status, text, headers: response.headers };
            } catch (err) {
              return { ok: false, status: 0, text: err?.message || "fetch_failed" };
            }
          };

          if (method === "GET" && parts.length === 0) {
            sendJson(readData());
            return;
          }

          if (method === "POST" && parts.length === 0) {
            const raw = await getBody();
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
            sendJson(record, 201);
            return;
          }

          if (method === "PATCH" && parts.length === 1) {
            const id = parts[0];
            const raw = await getBody();
            let payload = {};
            try {
              payload = raw ? JSON.parse(raw) : {};
            } catch {
              payload = {};
            }
            const next = readData();
            const index = next.findIndex((item) => item.id === id);
            if (index === -1) {
              sendJson({ error: "Not found" }, 404);
              return;
            }
            next[index] = {
              ...next[index],
              ...payload,
              updated_at: new Date().toISOString(),
            };
            writeData(next);
            sendJson(next[index]);
            return;
          }

          if (method === "POST" && parts.length === 2 && parts[1] === "approve") {
            const id = parts[0];
            const next = readData();
            const index = next.findIndex((item) => item.id === id);
            if (index === -1) {
              sendJson({ error: "Not found" }, 404);
              return;
            }
            const record = next[index];
            const rawBody = await getBody();
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
              approvePayload?.serverId ||
              approvePayload?.server_id ||
              approvePayload?.serverID ||
              "";
            const profileIdRaw =
              approvePayload?.profileId ||
              approvePayload?.profile_id ||
              approvePayload?.qualityProfileId ||
              "";
            const profileId =
              profileIdRaw !== "" && !Number.isNaN(Number(profileIdRaw))
                ? Number(profileIdRaw)
                : null;

            let settings = {};
            if (fs.existsSync(settingsFile)) {
              try {
                const raw = fs.readFileSync(settingsFile, "utf-8");
                settings = raw ? JSON.parse(raw) : {};
              } catch {
                settings = {};
              }
            }
            const baseUrl = settings?.jellyseerrUrl;
            const apiKey = settings?.jellyseerrApiKey;
            if (!baseUrl || !apiKey) {
              sendJson({ error: "Jellyseerr settings missing." }, 400);
              return;
            }
            try {
              const base = baseUrl.replace(/\/+$/, "");
              const mediaId = record?.tmdb_id ? Number(record.tmdb_id) : null;
              if (!Number.isFinite(mediaId)) {
                sendJson({ error: "Invalid TMDB id for this request." }, 400);
                return;
              }
              const requestPayload = {
                mediaType: record.media_type,
                mediaId,
              };
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
              const extractPublicBase = (text) => {
                if (!text) return "";
                const match = text.match(/public base URL of\s+([^\s]+)/i);
                if (!match) return "";
                const raw = match[1].replace(/['"]/g, "");
                if (!raw) return "";
                const normalized = raw.startsWith("/") ? raw : `/${raw}`;
                return normalized.replace(/\/+$/, "");
              };

              let response = await doRequest(`${base}/api/v1/request`);
              if (!response.ok) {
                const text = await response.text();
                const publicBase = extractPublicBase(text);
                if (publicBase) {
                  response = await doRequest(`${base}${publicBase}/api/v1/request`);
                } else {
                  sendJson({ error: text || "Jellyseerr request failed." }, response.status);
                  return;
                }
              }
              if (!response.ok) {
                const text = await response.text();
                sendJson({ error: text || "Jellyseerr request failed." }, response.status);
                return;
              }
              const data = await response.json();
              next[index] = {
                ...record,
                status: "approved",
                jellyseerr_request_id: data?.id || data?.requestId || record.jellyseerr_request_id,
                updated_at: new Date().toISOString(),
              };
              writeData(next);
              sendJson(next[index]);
              return;
            } catch {
              sendJson({ error: "Failed to reach Jellyseerr." }, 502);
              return;
            }
          }

          if (method === "POST" && parts.length === 2 && parts[1] === "reject") {
            const id = parts[0];
            const next = readData();
            const index = next.findIndex((item) => item.id === id);
            if (index === -1) {
              sendJson({ error: "Not found" }, 404);
              return;
            }
            const record = next[index];
            let settings = {};
            if (fs.existsSync(settingsFile)) {
              try {
                const raw = fs.readFileSync(settingsFile, "utf-8");
                settings = raw ? JSON.parse(raw) : {};
              } catch {
                settings = {};
              }
            }
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
            next[index] = {
              ...record,
              status: "rejected",
              updated_at: new Date().toISOString(),
            };
            writeData(next);
            sendJson(next[index]);
            return;
          }

          if (
            (method === "POST" || method === "DELETE") &&
            parts.length === 2 &&
            parts[1] === "delete"
          ) {
            const id = parts[0];
            const next = readData();
            const index = next.findIndex((item) => item.id === id);
            if (index === -1) {
              sendJson({ error: "Not found" }, 404);
              return;
            }
            const record = next[index];
            let settings = {};
            if (fs.existsSync(settingsFile)) {
              try {
                const raw = fs.readFileSync(settingsFile, "utf-8");
                settings = raw ? JSON.parse(raw) : {};
              } catch {
                settings = {};
              }
            }
            const getSetting = (key, envKey) => process.env[envKey] || settings?.[key];
            const jellyseerrUrl = getSetting("jellyseerrUrl", "JELLYSEERR_URL");
            const jellyseerrKey = getSetting("jellyseerrApiKey", "JELLYSEERR_API_KEY");
            const radarrUrl = getSetting("radarrUrl", "RADARR_URL");
            const radarrKey = getSetting("radarrApiKey", "RADARR_API_KEY");
            const sonarrUrl = getSetting("sonarrUrl", "SONARR_URL");
            const sonarrKey = getSetting("sonarrApiKey", "SONARR_API_KEY");

            const results = {
              jellyseerr: null,
              radarr: null,
              sonarr: null,
            };

            const safeFetch = async (url, options) => {
              try {
                const response = await fetch(url, options);
                const text = await response.text();
                return { ok: response.ok, status: response.status, text };
              } catch (err) {
                return { ok: false, status: 0, text: err?.message || "fetch_failed" };
              }
            };

            if (jellyseerrUrl && jellyseerrKey && record?.jellyseerr_request_id) {
              const base = jellyseerrUrl.replace(/\/+$/, "");
              const targetUrl = `${base}/api/v1/request/${record.jellyseerr_request_id}`;
              results.jellyseerr = await safeFetch(targetUrl, {
                method: "DELETE",
                headers: { "X-Api-Key": jellyseerrKey },
              });
            }

            const mediaType = String(record?.media_type || "").toLowerCase();
            const tmdbId = record?.tmdb_id;
            if (mediaType === "movie" && radarrUrl && radarrKey && tmdbId) {
              const base = radarrUrl.replace(/\/+$/, "");
              const lookupUrl = `${base}/api/v3/movie?tmdbId=${encodeURIComponent(tmdbId)}`;
              const lookup = await safeFetch(lookupUrl, {
                method: "GET",
                headers: { "X-Api-Key": radarrKey },
              });
              if (lookup.ok) {
                try {
                  const list = lookup.text ? JSON.parse(lookup.text) : [];
                  const movieId = Array.isArray(list) && list[0]?.id ? list[0].id : null;
                  if (movieId) {
                    const delUrl = `${base}/api/v3/movie/${movieId}?deleteFiles=false&addExclusion=false`;
                    results.radarr = await safeFetch(delUrl, {
                      method: "DELETE",
                      headers: { "X-Api-Key": radarrKey },
                    });
                  } else {
                    results.radarr = { ok: true, status: 204, text: "not_found" };
                  }
                } catch {
                  results.radarr = { ok: false, status: 0, text: "parse_error" };
                }
              } else {
                results.radarr = lookup;
              }
            }

            if (mediaType === "tv" && sonarrUrl && sonarrKey) {
              results.sonarr = { ok: false, status: 0, text: "tv_delete_not_supported" };
            }

            next.splice(index, 1);
            writeData(next);
            sendJson({ ok: true, results });
            return;
          }

          if (method === "POST" && parts.length === 1 && parts[0] === "check-status") {
            const settings = loadSettings();
            const jellyseerrUrl = getSetting(settings, "jellyseerrUrl", "JELLYSEERR_URL");
            const jellyseerrApiKey = getSetting(settings, "jellyseerrApiKey", "JELLYSEERR_API_KEY");
            const radarrUrl = getSetting(settings, "radarrUrl", "RADARR_URL");
            const radarrKey = getSetting(settings, "radarrApiKey", "RADARR_API_KEY");
            const sonarrUrl = getSetting(settings, "sonarrUrl", "SONARR_URL");
            const sonarrKey = getSetting(settings, "sonarrApiKey", "SONARR_API_KEY");
            if (!jellyseerrUrl || !jellyseerrApiKey) {
              sendJson({ error: "Jellyseerr settings missing." }, 400);
              return;
            }
            const base = jellyseerrUrl.replace(/\/+$/, "");
            const records = readData();
            let updated = 0;
            const results = [];
            for (const record of records) {
              const mediaType = String(record?.media_type || "").toLowerCase();
              const tmdbId = record?.tmdb_id ? Number(record.tmdb_id) : null;
              if (!tmdbId) continue;
              if (!["approved", "unreleased", "in_cinemas"].includes(record.status)) continue;
              const endpoint = mediaType === "tv" ? "tv" : "movie";
              const detailUrl = `${base}/api/v1/${endpoint}/${tmdbId}`;
              const detail = await safeFetch(detailUrl, {
                headers: {
                  "X-Api-Key": jellyseerrApiKey,
                  Accept: "application/json",
                },
              });
              if (!detail.ok) continue;
              let data = null;
              try {
                data = detail.text ? JSON.parse(detail.text) : null;
              } catch {
                data = null;
              }
              if (!data) continue;

              const mediaStatus = data?.mediaInfo?.status;
              const now = new Date();
              let isUnreleased = false;
              let isInCinemas = false;
              if (mediaType === "movie") {
                const releaseDate = data?.releaseDate ? new Date(data.releaseDate) : null;
                if (releaseDate && releaseDate > now) {
                  isUnreleased = true;
                }
              } else {
                const firstAirDate = data?.firstAirDate ? new Date(data.firstAirDate) : null;
                if (firstAirDate && firstAirDate > now) {
                  isUnreleased = true;
                }
              }

              let nextStatus = record.status;
              let nextProgress = record.download_progress ?? null;
              if (mediaStatus === 5 || mediaStatus === 4) {
                nextStatus = "available";
                nextProgress = 100;
              } else if (mediaStatus === 3) {
                const downloadStatus = data?.mediaInfo?.downloadStatus || [];
                if (Array.isArray(downloadStatus) && downloadStatus.length > 0) {
                  const total = downloadStatus.reduce((sum, d) => sum + (d.size || 0), 0);
                  const downloaded = downloadStatus.reduce(
                    (sum, d) => sum + ((d.size || 0) - (d.sizeleft || 0)),
                    0
                  );
                  if (total > 0) {
                    nextProgress = Math.round((downloaded / total) * 100);
                  }
                }
              }

              if (isUnreleased) {
                nextStatus = "unreleased";
                nextProgress = null;
              } else if (isInCinemas) {
                nextStatus = "in_cinemas";
                nextProgress = null;
              }

              // Radarr/Sonarr fallback for progress if Jellyseerr has no progress info
              if (
                nextStatus === "approved" &&
                (nextProgress === null || nextProgress === 0) &&
                mediaType === "movie" &&
                radarrUrl &&
                radarrKey
              ) {
                const radarrBase = radarrUrl.replace(/\/+$/, "");
                const movieLookup = await safeFetch(
                  `${radarrBase}/api/v3/movie?tmdbId=${tmdbId}`,
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
            if (updated > 0) {
              writeData(records);
            }
            sendJson({ ok: true, updated, results });
            return;
          }

          if (method === "POST" && parts.length === 1 && parts[0] === "check-availability") {
            const settings = loadSettings();
            const sonarrUrl = getSetting(settings, "sonarrUrl", "SONARR_URL");
            const sonarrKey = getSetting(settings, "sonarrApiKey", "SONARR_API_KEY");
            const radarrUrl = getSetting(settings, "radarrUrl", "RADARR_URL");
            const radarrKey = getSetting(settings, "radarrApiKey", "RADARR_API_KEY");
            if (!sonarrUrl || !sonarrKey || !radarrUrl || !radarrKey) {
              sendJson({ error: "Sonarr/Radarr settings missing." }, 400);
              return;
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
            if (updated > 0) {
              writeData(records);
            }
            sendJson({ ok: true, updated });
            return;
          }

          next();
        });

        server.middlewares.use("/api/unlimited-users", (req, res, next) => {
          if (req.method === "GET") {
            let data = [];
            if (fs.existsSync(unlimitedFile)) {
              try {
                const raw = fs.readFileSync(unlimitedFile, "utf-8");
                data = raw ? JSON.parse(raw) : [];
              } catch {
                data = [];
              }
            }
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(data));
            return;
          }

          if (req.method === "POST") {
            let body = "";
            req.on("data", (chunk) => {
              body += chunk;
              if (body.length > 1_000_000) req.destroy();
            });
            req.on("end", () => {
              let data = [];
              try {
                data = body ? JSON.parse(body) : [];
              } catch {
                data = [];
              }
              fs.writeFileSync(unlimitedFile, JSON.stringify(data, null, 2));
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ ok: true }));
            });
            return;
          }

          next();
        });

        server.middlewares.use("/api/user-tags", (req, res, next) => {
          if (req.method === "GET") {
            let data = {};
            if (fs.existsSync(tagsFile)) {
              try {
                const raw = fs.readFileSync(tagsFile, "utf-8");
                data = raw ? JSON.parse(raw) : {};
              } catch {
                data = {};
              }
            }
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(data));
            return;
          }

          if (req.method === "POST") {
            let body = "";
            req.on("data", (chunk) => {
              body += chunk;
              if (body.length > 1_000_000) req.destroy();
            });
            req.on("end", () => {
              let data = {};
              try {
                data = body ? JSON.parse(body) : {};
              } catch {
                data = {};
              }
              fs.writeFileSync(tagsFile, JSON.stringify(data, null, 2));
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ ok: true }));
            });
            return;
          }

          next();
        });

        server.middlewares.use("/api/client-errors", (req, res, next) => {
          if (req.method !== "POST") return next();
          let body = "";
          req.on("data", (chunk) => {
            body += chunk;
            if (body.length > 500_000) req.destroy();
          });
          req.on("end", () => {
            let payload = {};
            try {
              payload = body ? JSON.parse(body) : {};
            } catch {
              payload = { raw: body };
            }
            const entry = {
              timestamp: new Date().toISOString(),
              ...payload,
            };
            try {
              fs.appendFileSync(
                path.resolve(process.cwd(), "client-errors.log"),
                `${JSON.stringify(entry)}\n`
              );
            } catch {
              // ignore log errors
            }
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ ok: true }));
          });
        });

        server.middlewares.use("/api/emby", async (req, res) => {
          let settings = {};
          if (fs.existsSync(settingsFile)) {
            try {
              const raw = fs.readFileSync(settingsFile, "utf-8");
              settings = raw ? JSON.parse(raw) : {};
            } catch {
              settings = {};
            }
          }

          const baseUrl = settings?.embyUrl;
          if (!baseUrl) {
            res.statusCode = 400;
            res.end("Emby URL not set.");
            return;
          }

          const reqPath = req.url || "/";
          const base = baseUrl.replace(/\/+$/, "");
          const targetUrl = `${base}${reqPath.startsWith("/") ? "" : "/"}${reqPath}`;
          const method = req.method || "GET";
          const logLine = (line) => {
            try {
              fs.appendFileSync(
                path.resolve(process.cwd(), "emby-proxy.log"),
                `${new Date().toISOString()} ${line}\n`
              );
            } catch {
              // ignore log errors
            }
          };

          const headers = {};
          if (req.headers["content-type"]) {
            headers["content-type"] = req.headers["content-type"];
          }
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
            const upstream = await fetch(targetUrl, {
              method,
              headers,
              body,
            });
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
            logLine(`${method} ${reqPath} -> ${upstream.status}`);
          } catch {
            res.statusCode = 502;
            res.end("Failed to reach Emby server.");
            logLine(`${method} ${reqPath} -> 502 proxy_error`);
          }
        });

        server.middlewares.use("/api/jellyseerr", async (req, res) => {
          let settings = {};
          if (fs.existsSync(settingsFile)) {
            try {
              const raw = fs.readFileSync(settingsFile, "utf-8");
              settings = raw ? JSON.parse(raw) : {};
            } catch {
              settings = {};
            }
          }

          const baseUrl = settings?.jellyseerrUrl;
          const apiKey = settings?.jellyseerrApiKey;
          const isUserAuth = req.headers["x-jellyseerr-auth"] === "user";
          if (!baseUrl) {
            res.statusCode = 400;
            res.end("Jellyseerr URL not set.");
            return;
          }
          if (!apiKey && !isUserAuth) {
            res.statusCode = 400;
            res.end("Jellyseerr API key not set.");
            return;
          }

          const reqPath = req.url || "/";
          const base = baseUrl.replace(/\/+$/, "");
          const targetUrl = `${base}${reqPath.startsWith("/") ? "" : "/"}${reqPath}`;
          const method = req.method || "GET";

          const headers = {};
          if (!isUserAuth && apiKey) {
            headers["x-api-key"] = apiKey;
          }
          if (req.headers["content-type"]) {
            headers["content-type"] = req.headers["content-type"];
          }
          if (req.headers.cookie) {
            headers.cookie = req.headers.cookie;
          }
          if (req.headers.authorization) {
            headers.authorization = req.headers.authorization;
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

          const rewriteSetCookie = (value) => {
            if (!value) return value;
            let next = value.replace(/;\s*Domain=[^;]+/gi, "");
            next = next.replace(/;\s*Secure/gi, "");
            next = next.replace(/SameSite=None/gi, "SameSite=Lax");
            return next;
          };

          try {
            const upstream = await fetch(targetUrl, {
              method,
              headers,
              body,
            });
            res.statusCode = upstream.status;
            const setCookieList =
              typeof upstream.headers.getSetCookie === "function"
                ? upstream.headers.getSetCookie()
                : null;
            if (setCookieList && setCookieList.length > 0) {
              res.setHeader(
                "set-cookie",
                setCookieList.map((cookie) => rewriteSetCookie(cookie))
              );
            }
            if ((reqPath || "").startsWith("/api/v1/auth/emby")) {
              try {
                const logLine = `[jellyseerr-auth] ${method} ${reqPath} -> ${
                  upstream.status
                } cookies=${setCookieList ? setCookieList.length : 0}`;
                fs.appendFileSync(
                  path.resolve(process.cwd(), "emby-proxy.log"),
                  `${new Date().toISOString()} ${logLine}\n`
                );
              } catch {
                // ignore log errors
              }
            }
            upstream.headers.forEach((value, key) => {
              if (key.toLowerCase() === "set-cookie") return;
              res.setHeader(key, value);
            });
            const buffer = Buffer.from(await upstream.arrayBuffer());
            res.end(buffer);
          } catch {
            res.statusCode = 502;
            res.end("Failed to reach Jellyseerr server.");
          }
        });

        const proxyToService = async (req, res, { urlKey, apiKeyKey, label, envUrlKey, envApiKeyKey }) => {
          const logLine = (line) => {
            try {
              fs.appendFileSync(
                path.resolve(process.cwd(), "service-proxy.log"),
                `${new Date().toISOString()} ${line}\n`
              );
            } catch {
              // ignore log errors
            }
          };
          let settings = {};
          if (fs.existsSync(settingsFile)) {
            try {
              const raw = fs.readFileSync(settingsFile, "utf-8");
              settings = raw ? JSON.parse(raw) : {};
            } catch {
              settings = {};
            }
          }
          let baseUrl = process.env[envUrlKey] || settings?.[urlKey];
          if (baseUrl && !String(baseUrl).includes("://")) {
            baseUrl = `http://${baseUrl}`;
          }
          const apiKey = process.env[envApiKeyKey] || settings?.[apiKeyKey];
          if (!baseUrl) {
            res.statusCode = 400;
            res.end(`${label} URL not set.`);
            return;
          }
          if (!apiKey) {
            res.statusCode = 400;
            res.end(`${label} API key not set.`);
            return;
          }
          const reqPath = req.url || "/";
          let base = baseUrl.replace(/\/+$/, "");
          let targetUrl = `${base}${reqPath.startsWith("/") ? "" : "/"}${reqPath}`;
          const tryRequest = async (url) =>
            await fetch(url, { method, headers, body });
          const withHttpFallback = (url) => {
            if (url.startsWith("https://")) {
              return `http://${url.slice("https://".length)}`;
            }
            return url;
          };
          const method = req.method || "GET";
          const headers = {
            "X-Api-Key": apiKey,
            "accept-encoding": "identity",
          };
          if (req.headers["content-type"]) {
            headers["content-type"] = req.headers["content-type"];
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
            logLine(`${label} ${method} ${reqPath} -> ${targetUrl}`);
            let upstream = await tryRequest(targetUrl);
            if (!upstream.ok) {
              const fallbackUrl = withHttpFallback(targetUrl);
              if (fallbackUrl !== targetUrl) {
                logLine(`${label} retry ${method} ${reqPath} -> ${fallbackUrl}`);
                upstream = await tryRequest(fallbackUrl);
              }
            }
            res.statusCode = upstream.status;
            logLine(`${label} ${method} ${reqPath} <- ${upstream.status}`);
            upstream.headers.forEach((value, key) => {
              if (key.toLowerCase() === "set-cookie") return;
              res.setHeader(key, value);
            });
            const buffer = Buffer.from(await upstream.arrayBuffer());
            const contentType = upstream.headers.get("content-type") || "";
            const preview = buffer.toString("utf8", 0, 200).replace(/\s+/g, " ").trim();
            logLine(`${label} ${method} ${reqPath} content-type=${contentType}`);
            if (preview) {
              logLine(`${label} ${method} ${reqPath} preview=${preview}`);
            }
            res.end(buffer);
          } catch (err) {
            const message = err?.message || String(err || "unknown_error");
            res.statusCode = 502;
            res.end(`Failed to reach ${label} server at ${targetUrl}: ${message}`);
            logLine(`${label} ${method} ${reqPath} !! ${message}`);
          }
        };

        server.middlewares.use("/api/sonarr", (req, res) =>
          proxyToService(req, res, {
            urlKey: "sonarrUrl",
            apiKeyKey: "sonarrApiKey",
            envUrlKey: "SONARR_URL",
            envApiKeyKey: "SONARR_API_KEY",
            label: "Sonarr",
          })
        );

        server.middlewares.use("/api/radarr", (req, res) =>
          proxyToService(req, res, {
            urlKey: "radarrUrl",
            apiKeyKey: "radarrApiKey",
            envUrlKey: "RADARR_URL",
            envApiKeyKey: "RADARR_API_KEY",
            label: "Radarr",
          })
        );

        server.middlewares.use((req, _res, next) => {
          if (req.method === "GET" && shouldServeSpa(req.url || "")) {
            req.url = "/emby/";
          }
          next();
        });
      },
    },
  ],
  server: {
    port: 5173,
    strictPort: true,
    host: "0.0.0.0",
  },
});
