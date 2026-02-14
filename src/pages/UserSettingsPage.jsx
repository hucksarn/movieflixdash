import { useMemo } from "react";

const TIME_ZONE = "Asia/Karachi";

const formatDate = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE }).format(date);
};

const getUserKey = (user) => user?.userId || user?.username || "";

const formatAmount = (amount, currency) => {
  const value = Number(amount || 0);
  const rawCurrency = currency || "MVR";
  const safeCurrency = rawCurrency === "USD" ? "MVR" : rawCurrency;
  const formatted = Number.isFinite(value)
    ? value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "0.00";
  return `${safeCurrency} ${formatted}`;
};

const isUnlimitedUser = (user, unlimitedList = []) => {
  const userId = user?.userId || user?.Id || user?.id || "";
  const username = String(user?.username || user?.Name || "").toLowerCase();
  return (unlimitedList || []).some(
    (item) =>
      item?.key === userId ||
      (item?.userId && item.userId === userId) ||
      (item?.username || "").toLowerCase() === username
  );
};

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

export default function UserSettingsPage({
  currentUser,
  subscriptions = [],
  unlimitedUsers = [],
}) {
  const userKey = getUserKey(currentUser);
  const unlimited = useMemo(
    () => isUnlimitedUser(currentUser, unlimitedUsers),
    [currentUser, unlimitedUsers]
  );
  const activeSub = useMemo(
    () => getActiveSubscription(subscriptions, userKey),
    [subscriptions, userKey]
  );
  const statusLabel = unlimited ? "Unlimited" : activeSub ? "Active" : "Not subscribed";
  const planLabel = unlimited ? "MovieFlixHD Premium" : activeSub?.planName || "-";
  const startLabel = unlimited ? "Unlimited" : formatDate(activeSub?.startDate);
  const endLabel = unlimited ? "Unlimited" : formatDate(activeSub?.endDate);
  const planPriceLabel = unlimited
    ? "-"
    : activeSub
      ? formatAmount(activeSub?.price, activeSub?.currency)
      : "-";
  const paidAmount = unlimited
    ? "-"
    : activeSub
      ? formatAmount(
          activeSub?.finalAmount !== undefined && activeSub?.finalAmount !== null
            ? activeSub.finalAmount
            : activeSub?.price,
          activeSub?.currency
        )
      : "-";
  const discountAmount = unlimited
    ? "-"
    : activeSub
      ? (() => {
          const price = Number(activeSub?.price || 0);
          const actual =
            activeSub?.finalAmount !== undefined && activeSub?.finalAmount !== null
              ? Number(activeSub.finalAmount)
              : price;
          const discount =
            typeof activeSub?.discountAmount === "number"
              ? Number(activeSub.discountAmount)
              : price - actual;
          if (!Number.isFinite(discount) || discount <= 0) return "-";
          return formatAmount(discount, activeSub?.currency);
        })()
      : "-";

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
          <span className="detail-value">{planLabel}</span>
        </div>
        <div className="detail-item">
          <span className="detail-label">Plan Price</span>
          <span className="detail-value">{planPriceLabel}</span>
        </div>
        <div className="detail-item">
          <span className="detail-label">Amount Paid</span>
          <span className="detail-value">{paidAmount}</span>
        </div>
        <div className="detail-item">
          <span className="detail-label">Discount</span>
          <span className="detail-value">{discountAmount}</span>
        </div>
        <div className="detail-item">
          <span className="detail-label">Start</span>
          <span className="detail-value">{startLabel}</span>
        </div>
        <div className="detail-item">
          <span className="detail-label">End</span>
          <span className="detail-value">{endLabel}</span>
        </div>
      </div>
    </section>
  );
}
