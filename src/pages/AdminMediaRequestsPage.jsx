import { Fragment, useEffect, useMemo, useState } from "react";

const TIME_ZONE = "Asia/Karachi";

const apiUrl = (path) => {
  const base = (import.meta.env.BASE_URL || "/").replace(/\/+$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
};

const normalizeMediaType = (value) => {
  const raw = String(value || "").toLowerCase();
  if (raw === "tv" || raw === "show" || raw === "series") return "tv";
  return "movie";
};

const formatLanguage = (value) => {
  if (!value) return "";
  const code = String(value).trim();
  try {
    if (typeof Intl !== "undefined" && Intl.DisplayNames) {
      const display = new Intl.DisplayNames(["en"], { type: "language" });
      const name = display.of(code.toLowerCase());
      return name || code.toUpperCase();
    }
  } catch {
    // ignore
  }
  return code.toUpperCase();
};

const fetchJellyseerrDetails = async (mediaType, mediaId) => {
  const endpoint =
    normalizeMediaType(mediaType) === "tv"
      ? `/api/jellyseerr/api/v1/tv/${mediaId}`
      : `/api/jellyseerr/api/v1/movie/${mediaId}`;
  const response = await fetch(apiUrl(endpoint));
  if (!response.ok) return null;
  return response.json();
};

const logClientError = async (payload) => {
  try {
    await fetch(apiUrl("/api/client-errors"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    // ignore logging errors
  }
};

const fetchServerJson = async (path) => {
  try {
    const response = await fetch(apiUrl(path));
    if (!response.ok) {
      const text = await response.text();
      const message = text || `Failed to load ${path}.`;
      await logClientError({ type: "fetch_error", path, status: response.status, message });
      throw new Error(message);
    }
    return response.json();
  } catch (err) {
    const message = err?.message || String(err || "unknown_error");
    await logClientError({ type: "fetch_exception", path, message });
    throw new Error(`Failed to load ${path}: ${message}`);
  }
};

const formatDate = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE }).format(date);
};

const normalizeStatus = (request) => {
  const rawStatus = String(request?.status || request?.request_status || "").toLowerCase();
  const releaseStatus = String(
    request?.release_status || request?.releaseStatus || request?.release_state || ""
  ).toLowerCase();
  const progressValue =
    typeof request?.download_progress === "number"
      ? request.download_progress
      : typeof request?.downloadProgress === "number"
      ? request.downloadProgress
      : typeof request?.progress === "number"
      ? request.progress
      : null;

  if (rawStatus === "available") return { label: "Available", tone: "done" };
  if (releaseStatus === "in_cinemas") return { label: "In Cinemas", tone: "open" };
  if (releaseStatus === "unreleased") return { label: "Unreleased", tone: "open" };
  if (typeof progressValue === "number" && progressValue > 0 && progressValue < 100) {
    return { label: `Downloading ${Math.round(progressValue)}%`, tone: "open" };
  }
  if (rawStatus === "approved") return { label: "Approved", tone: "done" };
  if (rawStatus === "rejected" || rawStatus === "declined") {
    return { label: "Rejected", tone: "declined" };
  }
  if (rawStatus === "pending") return { label: "Pending", tone: "open" };
  return { label: rawStatus ? rawStatus.toUpperCase() : "Pending", tone: "open" };
};

export default function AdminMediaRequestsPage() {
  const [requests, setRequests] = useState([]);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [actionStatus, setActionStatus] = useState({});
  const [approveTarget, setApproveTarget] = useState(null);
  const [serverStatus, setServerStatus] = useState("idle");
  const [serverError, setServerError] = useState("");
  const [rootOptions, setRootOptions] = useState([]);
  const [profileOptions, setProfileOptions] = useState([]);
  const [rootStatus, setRootStatus] = useState("idle");
  const [rootError, setRootError] = useState("");
  const [selectedRootKey, setSelectedRootKey] = useState("");
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [manualRoot, setManualRoot] = useState("");
  const [manualProfileId, setManualProfileId] = useState("");
  const [detailsById, setDetailsById] = useState({});
  const [deleteTarget, setDeleteTarget] = useState(null);

  const fetchRequests = async ({ background = false } = {}) => {
    setStatus((prev) => (background && prev === "success" ? prev : "loading"));
    if (!background) setError("");
    try {
      const response = await fetch(apiUrl("/api/media-requests"));
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Failed to load media requests.");
      }
      const data = await response.json();
      setRequests(Array.isArray(data) ? data : []);
      setStatus("success");
    } catch (err) {
      if (!background) {
        setStatus("error");
        setError(err?.message || "Failed to load media requests.");
      }
    }
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      fetchRequests({ background: true });
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        await fetch(apiUrl("/api/media-requests/check-status"), { method: "POST" });
        await fetch(apiUrl("/api/media-requests/check-availability"), { method: "POST" });
      } catch {
        // ignore polling errors
      }
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleApprove = async (request, rootPayload = {}) => {
    const id = request?.id;
    if (!id) return;
    setActionStatus((prev) => ({ ...prev, [id]: "approving" }));
    try {
      const response = await fetch(apiUrl(`/api/media-requests/${id}/approve`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rootPayload),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Failed to approve.");
      }
      await fetchRequests();
      setActionStatus((prev) => ({ ...prev, [id]: "" }));
    } catch (err) {
      setActionStatus((prev) => ({ ...prev, [id]: "error" }));
      setError(err?.message || "Failed to approve.");
    }
  };

  const handleReject = async (request) => {
    const id = request?.id;
    if (!id) return;
    setActionStatus((prev) => ({ ...prev, [id]: "rejecting" }));
    try {
      const response = await fetch(apiUrl(`/api/media-requests/${id}/reject`), {
        method: "POST",
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Failed to reject.");
      }
      await fetchRequests();
      setActionStatus((prev) => ({ ...prev, [id]: "" }));
    } catch (err) {
      setActionStatus((prev) => ({ ...prev, [id]: "error" }));
      setError(err?.message || "Failed to reject.");
    }
  };

  const handleDelete = async (request) => {
    const id = request?.id;
    if (!id) return;
    setActionStatus((prev) => ({ ...prev, [id]: "deleting" }));
    try {
      const response = await fetch(apiUrl(`/api/media-requests/${id}/delete`), {
        method: "POST",
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Failed to delete.");
      }
      await fetchRequests();
      setActionStatus((prev) => ({ ...prev, [id]: "" }));
    } catch (err) {
      setActionStatus((prev) => ({ ...prev, [id]: "error" }));
      setError(err?.message || "Failed to delete.");
    }
  };

  const confirmDelete = (request) => {
    if (!request) return;
    setDeleteTarget(request);
  };

  const closeDelete = () => {
    setDeleteTarget(null);
  };

  const normalizeProfileList = (data) => {
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.profiles)) return data.profiles;
    if (Array.isArray(data?.qualityProfiles)) return data.qualityProfiles;
    if (Array.isArray(data?.data)) return data.data;
    return [];
  };

  const loadDownloadOptions = async (request) => {
    setServerStatus("loading");
    setServerError("");
    setRootStatus("idle");
    setRootError("");
    setRootOptions([]);
    setProfileOptions([]);
    setSelectedRootKey("");
    setSelectedProfileId("");
    setManualRoot("");
    setManualProfileId("");
    try {
      const isSeries = String(request?.media_type || "").toLowerCase() === "tv";
      const base = isSeries ? "sonarr" : "radarr";
      const [rootFoldersRaw, profilesRaw] = await Promise.all([
        fetchServerJson(`/api/${base}/api/v3/rootfolder`),
        fetchServerJson(`/api/${base}/api/v3/qualityprofile`),
      ]);
      await logClientError({
        type: "download_options_success",
        mediaType: isSeries ? "tv" : "movie",
        rootCount: Array.isArray(rootFoldersRaw) ? rootFoldersRaw.length : -1,
        profileCount: Array.isArray(profilesRaw) ? profilesRaw.length : -1,
      });
      const rootFolders = Array.isArray(rootFoldersRaw) ? rootFoldersRaw : [];
      const profiles = normalizeProfileList(profilesRaw);
      const nextRoots = rootFolders.map((root) => ({
        path: root?.path || "",
      }));
      const nextProfiles = normalizeProfileList(profiles).map((profile) => ({
        id: profile?.id ?? profile?.profileId ?? profile?.profile_id ?? "",
        name: profile?.name || profile?.profileName || "Profile",
      }));
      setServerStatus("success");
      setRootOptions(nextRoots.filter((root) => root.path));
      setProfileOptions(nextProfiles.filter((profile) => profile.id !== ""));
      setSelectedRootKey(nextRoots[0]?.path || "");
      setSelectedProfileId(
        nextProfiles.length > 0 ? String(nextProfiles[0].id) : ""
      );
      if (nextRoots.length === 0) {
        setRootError("No root folders found. You can enter one manually.");
      }
      setRootStatus("success");
    } catch (err) {
      const message = err?.message || String(err || "Failed to load download options.");
      await logClientError({ type: "download_options_error", message });
      setServerStatus("error");
      setServerError(message);
      setRootStatus("error");
      setRootError(message);
    }
  };

  const openApproveModal = (request) => {
    if (!request) return;
    setApproveTarget(request);
    logClientError({
      type: "approve_open",
      requestId: request?.id || "",
      mediaType: request?.media_type || "",
    });
    loadDownloadOptions(request);
  };

  const closeApproveModal = () => {
    setApproveTarget(null);
    setServerStatus("idle");
    setServerError("");
    setRootOptions([]);
    setProfileOptions([]);
    setRootStatus("idle");
    setRootError("");
    setSelectedRootKey("");
    setSelectedProfileId("");
    setManualRoot("");
    setManualProfileId("");
  };

  const confirmApprove = async () => {
    if (!approveTarget) return;
    const rootFolder = selectedRootKey || manualRoot.trim();
    const profileValue = selectedProfileId || manualProfileId.trim();
    const profileId =
      profileValue && !Number.isNaN(Number(profileValue)) ? Number(profileValue) : null;
    const payload = {};
    if (rootFolder) payload.rootFolder = rootFolder;
    if (Number.isFinite(profileId)) payload.profileId = profileId;
    await handleApprove(approveTarget, payload);
    closeApproveModal();
  };

  const canApprove = useMemo(() => {
    const rootFolder = selectedRootKey || manualRoot.trim();
    const profileValue = selectedProfileId || manualProfileId.trim();
    const hasProfile =
      profileValue !== "" && !Number.isNaN(Number(profileValue)) && Number(profileValue) >= 0;
    return Boolean(rootFolder) && hasProfile;
  }, [manualProfileId, manualRoot, selectedProfileId, selectedRootKey]);

  useEffect(() => {
    let cancelled = false;
    const loadMissingDetails = async () => {
      const missing = (requests || []).filter((entry) => {
        const mediaId = entry?.tmdb_id || entry?.tmdbId || entry?.media_id || entry?.mediaId;
        return mediaId && !detailsById[entry.id];
      });
      if (missing.length === 0) return;
      for (const entry of missing) {
        if (cancelled) return;
        try {
          const mediaId = entry?.tmdb_id || entry?.tmdbId || entry?.media_id || entry?.mediaId;
          if (!mediaId) continue;
          const details = await fetchJellyseerrDetails(entry.media_type, mediaId);
          if (!details) continue;
          const detailType = normalizeMediaType(details?.mediaType || entry?.media_type);
          const rawDate =
            details?.releaseDate || details?.firstAirDate || details?.release_date || "";
          const year = rawDate ? String(rawDate).slice(0, 4) : "";
          const overview = details?.overview || details?.summary || "";
          setDetailsById((prev) => ({
            ...prev,
            [entry.id]: {
              year,
              type: detailType === "tv" ? "TV" : "Movie",
              overview,
              language:
                details?.originalLanguage ||
                details?.original_language ||
                details?.language ||
                "",
            },
          }));
        } catch {
          // ignore detail fetch errors
        }
      }
    };
    loadMissingDetails();
    return () => {
      cancelled = true;
    };
  }, [detailsById, requests]);

  const normalized = useMemo(() => {
    return (requests || []).map((entry) => {
      const statusInfo = normalizeStatus(entry);
      const posterPath = entry?.poster_path || entry?.posterPath || "";
      const posterUrl = entry?.poster_url || entry?.posterUrl || "";
      const posterSrc = posterUrl
        ? posterUrl
        : posterPath
        ? apiUrl(`/api/jellyseerr/api/v1/image?path=${encodeURIComponent(posterPath)}`)
        : "";
      const details = detailsById[entry.id] || {};
      const language = entry?.language || details.language || "";
      return {
        ...entry,
        statusInfo,
        posterSrc,
        detailYear: details.year || "",
        detailType: details.type || (normalizeMediaType(entry?.media_type) === "tv" ? "TV" : "Movie"),
        detailOverview: details.overview || "",
        detailLanguage: formatLanguage(language),
        requestedBy:
          entry?.requested_by_username ||
          entry?.requestedByUsername ||
          entry?.requested_by_name ||
          entry?.requestedByName ||
          entry?.username ||
          "-",
        requestedAt:
          entry?.requested_at || entry?.created_at || entry?.createdAt || entry?.requestedAt || "",
      };
    });
  }, [requests]);

  return (
    <section className="card admin-requests-page">
      <div className="card-header">
        <h2>Media Requests</h2>
        <div className="count">{requests.length} total</div>
      </div>
      {error && <div className="note">{error}</div>}
      <div className="table-wrap">
        <table className="table">
          <colgroup>
            <col className="col-request-title" />
            <col className="col-request-lang" />
            <col className="col-request-user" />
            <col className="col-request-status" />
            <col className="col-request-actions" />
          </colgroup>
          <thead>
            <tr>
              <th>Title</th>
              <th>Language</th>
              <th>User</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {normalized.map((request) => {
      const isExpanded = expandedId === request.id;
              return (
                <Fragment key={request.id}>
                  <tr>
                    <td className="col-request-title">
                      <button
                        type="button"
                        className="request-expand"
                        onClick={() =>
                          setExpandedId((prev) => (prev === request.id ? null : request.id))
                        }
                        aria-expanded={isExpanded}
                        title="Toggle request details"
                      >
                        <span className="request-thumb">
                          {request.posterSrc ? (
                            <img
                              src={request.posterSrc}
                              alt=""
                              loading="lazy"
                              onError={(event) => {
                                event.currentTarget.style.display = "none";
                              }}
                            />
                          ) : (
                            <span className="request-thumb-fallback">No poster</span>
                          )}
                        </span>
                        <span className="request-title">
                          <span className="request-title-text">
                            {request.title || request.media_title || "Untitled"}
                          </span>
                          <span className="request-meta-line">
                            <span className="request-chip">{request.detailType}</span>
                            {request.detailYear && (
                              <span className="request-chip">{request.detailYear}</span>
                            )}
                          </span>
                        </span>
                        <span
                          className={`request-caret ${isExpanded ? "is-open" : ""}`}
                          aria-hidden="true"
                        >
                          ›
                        </span>
                      </button>
                    </td>
                    <td className="col-request-lang">
                      {request.detailLanguage || "-"}
                    </td>
                    <td className="col-request-user">{request.requestedBy || "-"}</td>
                    <td className="col-request-status">
                      <button
                        type="button"
                        className={`btn tiny request-status ${request.statusInfo.tone}`}
                        tabIndex={-1}
                        aria-label={`Status ${request.statusInfo.label}`}
                      >
                        {request.statusInfo.label}
                      </button>
                    </td>
                    <td className="col-request-actions">
                      <button
                        className="btn ghost tiny"
                        type="button"
                        onClick={() => confirmDelete(request)}
                        disabled={actionStatus[request.id] === "deleting"}
                      >
                        {actionStatus[request.id] === "deleting" ? "Deleting..." : "Delete"}
                      </button>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="request-detail-row">
                      <td colSpan={3}>
                        <div className="request-detail-grid">
                          <div className="detail-item">
                            <span className="detail-label">Requested</span>
                            <span className="detail-value">{formatDate(request.requestedAt)}</span>
                          </div>
                          <div className="detail-item">
                            <span className="detail-label">Status</span>
                            <span className="detail-value">{request.statusInfo.label}</span>
                          </div>
                          <div className="detail-item">
                            <span className="detail-label">Type</span>
                            <span className="detail-value">{request.detailType || "-"}</span>
                          </div>
                          <div className="detail-item">
                            <span className="detail-label">Year</span>
                            <span className="detail-value">{request.detailYear || "-"}</span>
                          </div>
                          <div className="detail-item detail-overview">
                            <span className="detail-label">Overview</span>
                            <span className="detail-value">
                              {request.detailOverview || "No overview available."}
                            </span>
                          </div>
                          <div className="detail-item">
                            <span className="detail-label">Actions</span>
                            <span className="detail-value">
                              <div className="actions">
                                <button
                                  className="btn small"
                                  type="button"
                                  onClick={() => openApproveModal(request)}
                                  disabled={actionStatus[request.id] === "approving"}
                                >
                                  {actionStatus[request.id] === "approving"
                                    ? "Approving..."
                                    : "Approve"}
                                </button>
                                <button
                                  className="btn ghost small"
                                  type="button"
                                  onClick={() => handleReject(request)}
                                  disabled={actionStatus[request.id] === "rejecting"}
                                >
                                  {actionStatus[request.id] === "rejecting"
                                    ? "Rejecting..."
                                    : "Reject"}
                                </button>
                                <button
                                  className="btn ghost small"
                                  type="button"
                                  onClick={() => confirmDelete(request)}
                                  disabled={actionStatus[request.id] === "deleting"}
                                >
                                  {actionStatus[request.id] === "deleting"
                                    ? "Deleting..."
                                    : "Delete"}
                                </button>
                              </div>
                            </span>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {status === "loading" && (
              <>
                {Array.from({ length: 5 }).map((_, index) => (
                  <tr className="table-skeleton-row" key={`req-skel-${index}`}>
                    <td><div className="table-skeleton" /></td>
                    <td><div className="table-skeleton" /></td>
                    <td><div className="table-skeleton" /></td>
                    <td><div className="table-skeleton" /></td>
                  </tr>
                ))}
              </>
            )}
            {status === "success" && normalized.length === 0 && (
              <tr>
                <td colSpan={4}>
                  <div className="empty-state">
                    <div className="empty-icon" aria-hidden="true">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="4" width="18" height="16" rx="2" />
                        <path d="M8 4v16M16 4v16" />
                      </svg>
                    </div>
                    <div className="empty-title">No media requests</div>
                    <div className="empty-subtitle">New requests will appear here.</div>
                  </div>
                </td>
              </tr>
            )}
            {status === "error" && (
              <tr>
                <td colSpan={4}>Unable to load media requests.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {approveTarget && (
        <div className="request-modal" role="dialog" aria-modal="true">
          <div className="request-modal-backdrop" onClick={closeApproveModal} />
          <div className="request-modal-card">
            <div className="request-modal-header">
              <div className="request-modal-title">Choose Root Folder</div>
            </div>
            <div className="request-modal-body">
              <div className="muted">
                Select where to save{" "}
                <strong>{approveTarget.title || approveTarget.media_title || "this request"}</strong>.
              </div>
              {serverStatus === "loading" && (
                <div className="muted">Loading download options...</div>
              )}
              {serverError && <div className="note">{serverError}</div>}
              {rootStatus === "loading" && <div className="muted">Loading root folders...</div>}
              {rootError && <div className="note">{rootError}</div>}
              {rootOptions.length > 0 ? (
                <label>
                  Root Folder
                  <select
                    className="request-root-select"
                    value={selectedRootKey}
                    onChange={(event) => setSelectedRootKey(event.target.value)}
                  >
                    {rootOptions.map((option) => (
                      <option key={option.path} value={option.path}>
                        {option.path}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <label>
                  Root Folder
                  <input
                    type="text"
                    className="request-root-input"
                    value={manualRoot}
                    onChange={(event) => setManualRoot(event.target.value)}
                    placeholder="/media/movies"
                  />
                </label>
              )}
              {profileOptions.length > 0 ? (
                <label>
                  Quality Profile
                  <select
                    className="request-profile-select"
                    value={selectedProfileId}
                    onChange={(event) => setSelectedProfileId(event.target.value)}
                  >
                    {profileOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <label>
                  Quality Profile Id
                  <input
                    type="number"
                    className="request-profile-input"
                    value={manualProfileId}
                    onChange={(event) => setManualProfileId(event.target.value)}
                    placeholder="1"
                  />
                </label>
              )}
              <div className="row">
                <button className="btn" type="button" onClick={confirmApprove} disabled={!canApprove}>
                  Approve Request
                </button>
                <button className="btn ghost" type="button" onClick={closeApproveModal}>
                  Cancel
                </button>
              </div>
              {!canApprove && (
                <div className="note">
                  Root folder and quality profile are required to approve.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="request-modal" role="dialog" aria-modal="true">
          <div className="request-modal-backdrop" onClick={closeDelete} />
          <div className="request-modal-card delete-dialog">
            <div className="request-modal-header">
              <div className="request-modal-title">Delete Request</div>
            </div>
            <div className="request-modal-body">
              <div className="muted">
                This will remove{" "}
                <strong>{deleteTarget.title || deleteTarget.media_title || "this request"}</strong>{" "}
                from the dashboard and also delete it from Jellyseerr and Radarr.
              </div>
              <div className="row">
                <button
                  className="btn danger"
                  type="button"
                  onClick={async () => {
                    await handleDelete(deleteTarget);
                    closeDelete();
                  }}
                >
                  Delete Now
                </button>
                <button className="btn ghost" type="button" onClick={closeDelete}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
