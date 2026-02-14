import { useMemo } from "react";
import { useNavigate } from "react-router-dom";

const TIME_ZONE = "Asia/Karachi";

const formatDate = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE }).format(date);
};

const getLatestSubsByUser = (subscriptions) => {
  const latest = new Map();
  (subscriptions || []).forEach((sub) => {
    const key = sub.userId || sub.userKey || "";
    if (!key) return;
    const prev = latest.get(key);
    const prevTime = prev ? new Date(prev.endDate || prev.submittedAt || 0).getTime() : 0;
    const nextTime = new Date(sub.endDate || sub.submittedAt || 0).getTime();
    if (!prev || nextTime >= prevTime) {
      latest.set(key, sub);
    }
  });
  return latest;
};

const formatMoney = (amount, currency) => {
  const value = Number(amount || 0);
  const safeCurrency = currency || "MVR";
  const normalized = safeCurrency === "USD" ? "MVR" : safeCurrency;
  const formatted = Number.isFinite(value)
    ? value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "0.00";
  return `${normalized} ${formatted}`;
};

const sumByCurrency = (subs) => {
  const totals = {};
  (subs || []).forEach((sub) => {
    const rawCurrency = sub?.currency || "MVR";
    const currency = rawCurrency === "USD" ? "MVR" : rawCurrency;
    const amount =
      sub?.finalAmount !== undefined && sub?.finalAmount !== null ? sub.finalAmount : sub?.price;
    const value = Number(amount || 0);
    if (!Number.isFinite(value)) return;
    totals[currency] = (totals[currency] || 0) + value;
  });
  return totals;
};

export default function DashboardPage({ users = [], subscriptions = [], movieRequests = [] }) {
  const navigate = useNavigate();
  const pendingApprovals = useMemo(
    () => (subscriptions || []).filter((sub) => sub.status === "pending"),
    [subscriptions]
  );
  const openRequests = useMemo(
    () => (movieRequests || []).filter((req) => req.status !== "done"),
    [movieRequests]
  );
  const expiredUsers = useMemo(() => {
    const latest = getLatestSubsByUser(subscriptions);
    const now = new Date();
    const nowUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const results = [];
    latest.forEach((sub, key) => {
      const endTime = sub?.endDate ? new Date(sub.endDate).getTime() : null;
      const isExpired =
        (sub?.status === "approved" || sub?.status === "expired") &&
        typeof endTime === "number" &&
        endTime < nowUtc;
      if (!isExpired) return;
      const user = users.find((item) => (item.Id || item.id) === key);
      results.push({
        userId: key,
        username: user?.Name || user?.name || sub?.username || "Unknown",
        endDate: sub?.endDate,
        planName: sub?.planName || "-",
      });
    });
    return results;
  }, [subscriptions, users]);

  const paymentsReceived = useMemo(
    () =>
      (subscriptions || [])
        .filter((sub) => {
          const status = String(sub.status || "").toLowerCase();
          if (!["approved", "expired"].includes(status)) return false;
          return Number(sub.price || sub.finalAmount || 0) > 0;
        }),
    [subscriptions]
  );
  const paymentsTotals = useMemo(() => sumByCurrency(paymentsReceived), [paymentsReceived]);
  const recentTotals = useMemo(() => {
    const since = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const recent = paymentsReceived.filter((sub) => {
      const ts = new Date(sub.approvedAt || sub.reviewedAt || sub.submittedAt || 0).getTime();
      return ts >= since;
    });
    return sumByCurrency(recent);
  }, [paymentsReceived]);

  const userCount = users.length;

  return (
    <section className="card dashboard-page">
      <div className="card-header">
        <h2>Dashboard</h2>
        <div className="count">{userCount} users</div>
      </div>

      <div className="dashboard-cards">
        <button
          type="button"
          className="mini-card"
          onClick={() => navigate("/approvals")}
        >
          <div className="mini-header">
            <div className="mini-title">Pending Approvals</div>
            <div className="mini-pill">{pendingApprovals.length}</div>
          </div>
          <div className="mini-body">Payments waiting for approval.</div>
        </button>
        <button
          type="button"
          className="mini-card"
          onClick={() => navigate("/media-requests")}
        >
          <div className="mini-header">
            <div className="mini-title">Open Requests</div>
            <div className="mini-pill">{openRequests.length}</div>
          </div>
          <div className="mini-body">Movie/TV requests not completed yet.</div>
        </button>
        <button
          type="button"
          className="mini-card"
          onClick={() => navigate("/payments-received")}
        >
          <div className="mini-header">
            <div className="mini-title">Payments Received</div>
            <div className="mini-pill">{paymentsReceived.length}</div>
          </div>
          <div className="mini-body">View total collected payments.</div>
        </button>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>Payments Report</h3>
          <div className="count">{paymentsReceived.length} total</div>
        </div>
        <div className="status-grid">
          <div className="status-item">
            <div className="status-label">Total Received</div>
            <div className="status-value">
              {Object.keys(paymentsTotals).length === 0
                ? "-"
                : Object.entries(paymentsTotals)
                    .map(([currency, total]) => formatMoney(total, currency))
                    .join(" • ")}
            </div>
          </div>
          <div className="status-item">
            <div className="status-label">Last 30 Days</div>
            <div className="status-value">
              {Object.keys(recentTotals).length === 0
                ? "-"
                : Object.entries(recentTotals)
                    .map(([currency, total]) => formatMoney(total, currency))
                    .join(" • ")}
            </div>
          </div>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="card">
          <div className="card-header">
            <h3>Pending Payments</h3>
            <div className="count">{pendingApprovals.length}</div>
          </div>
          <div className="table-wrap">
            <table className="table">
              <colgroup>
                <col className="col-dash-user" />
                <col className="col-dash-plan" />
                <col className="col-dash-date" />
              </colgroup>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Plan</th>
                  <th>Submitted</th>
                </tr>
              </thead>
              <tbody>
                {pendingApprovals.map((sub) => (
                  <tr key={sub.id || sub.submittedAt}>
                    <td>{sub.username || "Unknown"}</td>
                    <td>{sub.planName || "-"}</td>
                    <td>{formatDate(sub.submittedAt)}</td>
                  </tr>
                ))}
                {pendingApprovals.length === 0 && (
                  <tr>
                    <td colSpan={3}>
                      <div className="empty-state">
                        <div className="empty-icon" aria-hidden="true">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M9 12l2 2 4-4" />
                            <circle cx="12" cy="12" r="9" />
                          </svg>
                        </div>
                        <div className="empty-title">No pending approvals</div>
                        <div className="empty-subtitle">You're all caught up.</div>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h3>Open Requests</h3>
            <div className="count">{openRequests.length}</div>
          </div>
          <div className="table-wrap">
            <table className="table">
              <colgroup>
                <col className="col-dash-user" />
                <col className="col-dash-plan" />
                <col className="col-dash-date" />
              </colgroup>
              <thead>
                <tr>
                  <th>Title</th>
                  <th>User</th>
                  <th>Requested</th>
                </tr>
              </thead>
              <tbody>
                {openRequests.map((req) => (
                  <tr key={req.id || req.requestedAt}>
                    <td>{req.title || "Untitled"}</td>
                    <td>{req.requestedBy || "-"}</td>
                    <td>{formatDate(req.requestedAt)}</td>
                  </tr>
                ))}
                {openRequests.length === 0 && (
                  <tr>
                    <td colSpan={3}>
                      <div className="empty-state">
                        <div className="empty-icon" aria-hidden="true">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
                          </svg>
                        </div>
                        <div className="empty-title">No open requests</div>
                        <div className="empty-subtitle">New requests will show here.</div>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </section>
  );
}
