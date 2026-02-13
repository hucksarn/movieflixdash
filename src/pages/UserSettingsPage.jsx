import { useMemo } from "react";

const TIME_ZONE = "Asia/Karachi";

const formatDate = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE }).format(date);
};

const getUserKey = (user) => user?.userId || user?.username || "";

const getActiveSubscription = (subscriptions, userKey) => {
  if (!userKey) return null;
  const now = Date.now();
  return (
    subscriptions
      .filter((sub) => sub.userKey === userKey || sub.userId === userKey)
      .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt))
      .find((sub) => {
        if (sub.status !== "approved") return false;
        if (!sub.endDate) return true;
        return new Date(sub.endDate).getTime() >= now;
      }) || null
  );
};

export default function UserSettingsPage({ currentUser, subscriptions = [] }) {
  const userKey = getUserKey(currentUser);
  const activeSub = useMemo(
    () => getActiveSubscription(subscriptions, userKey),
    [subscriptions, userKey]
  );
  const statusLabel = activeSub ? "Active" : "Not subscribed";

  return (
    <section className="card settings-page user-settings-page">
      <div className="card-header">
        <h2>Settings</h2>
        <div className="pill">user</div>
      </div>
      <div className="user-detail-grid">
        <div className="detail-item">
          <span className="detail-label">Username</span>
          <span className="detail-value">{currentUser?.username || "-"}</span>
        </div>
        <div className="detail-item">
          <span className="detail-label">Role</span>
          <span className="detail-value">User</span>
        </div>
        <div className="detail-item">
          <span className="detail-label">Subscription</span>
          <span className="detail-value">{statusLabel}</span>
        </div>
        <div className="detail-item">
          <span className="detail-label">Plan</span>
          <span className="detail-value">{activeSub?.planName || "-"}</span>
        </div>
        <div className="detail-item">
          <span className="detail-label">Start</span>
          <span className="detail-value">{formatDate(activeSub?.startDate)}</span>
        </div>
        <div className="detail-item">
          <span className="detail-label">End</span>
          <span className="detail-value">{formatDate(activeSub?.endDate)}</span>
        </div>
      </div>
    </section>
  );
}
