import { Fragment, useMemo, useState } from "react";

const TIME_ZONE = "Asia/Karachi";

const formatDate = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE }).format(date);
};

const formatAmount = (sub) => {
  const amount = Number(
    sub?.finalAmount !== undefined && sub?.finalAmount !== null ? sub.finalAmount : sub?.price || 0
  );
  const rawCurrency = sub?.currency || "MVR";
  const currency = rawCurrency === "USD" ? "MVR" : rawCurrency;
  const formatted = Number.isFinite(amount)
    ? amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "0.00";
  return `${currency} ${formatted}`;
};

const formatDiscount = (sub) => {
  const price = Number(sub?.price || 0);
  const actual = Number(
    sub?.finalAmount !== undefined && sub?.finalAmount !== null ? sub.finalAmount : sub?.price || 0
  );
  if (!Number.isFinite(price) || !Number.isFinite(actual)) return "-";
  const diff = price - actual;
  if (diff <= 0) return "-";
  const rawCurrency = sub?.currency || "MVR";
  const currency = rawCurrency === "USD" ? "MVR" : rawCurrency;
  const formatted = diff.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${currency} ${formatted}`;
};

export default function PaymentsReceivedPage({
  subscriptions = [],
  plans = [],
  users = [],
  onDeletePayment,
  onUploadSlip,
  onUpdatePaymentAmount,
  onAddManualPayment,
}) {
  const [openSlip, setOpenSlip] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [amountDrafts, setAmountDrafts] = useState({});
  const [manualForm, setManualForm] = useState({
    username: "",
    planId: "",
    amount: "",
    startDate: "",
    endDate: "",
    slipName: "",
    slipData: "",
  });
  const [manualMessage, setManualMessage] = useState("");

  const approved = useMemo(
    () =>
      subscriptions
        .filter((sub) => {
          const status = String(sub.status || "").toLowerCase();
          return status === "approved" || status === "expired" || status === "rejected";
        })
        .sort(
          (a, b) =>
            new Date(b.reviewedAt || b.approvedAt || b.updatedAt || b.submittedAt || 0) -
            new Date(a.reviewedAt || a.approvedAt || a.updatedAt || a.submittedAt || 0)
        ),
    [subscriptions]
  );

  const handleSlipUpload = (sub, event) => {
    const file = event.target.files?.[0];
    if (!file || !onUploadSlip) return;
    const reader = new FileReader();
    reader.onload = () => {
      onUploadSlip(sub.id, {
        slipName: file.name,
        slipData: reader.result || "",
      });
      event.target.value = "";
    };
    reader.readAsDataURL(file);
  };

  const handleAmountChange = (subId, value) => {
    setAmountDrafts((prev) => ({ ...prev, [subId]: value }));
  };

  const commitAmount = (sub) => {
    if (!onUpdatePaymentAmount) return;
    const raw = amountDrafts[sub.id];
    const actualPaid = raw === "" || raw === undefined ? null : Number(raw);
    if (actualPaid === null || !Number.isFinite(actualPaid)) return;
    onUpdatePaymentAmount(sub.id, actualPaid);
  };

  const handleManualSlip = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setManualForm((prev) => ({
        ...prev,
        slipName: file.name,
        slipData: reader.result || "",
      }));
      event.target.value = "";
    };
    reader.readAsDataURL(file);
  };

  const handleManualSubmit = (event) => {
    event.preventDefault();
    if (!onAddManualPayment) return;
    setManualMessage("");
    const username = manualForm.username.trim();
    if (!username) {
      setManualMessage("Username is required.");
      return;
    }
    if (!manualForm.planId) {
      setManualMessage("Select a plan.");
      return;
    }
    const amount = Number(manualForm.amount);
    if (!Number.isFinite(amount)) {
      setManualMessage("Enter a valid paid amount.");
      return;
    }
    if (!manualForm.startDate || !manualForm.endDate) {
      setManualMessage("Start and end dates are required.");
      return;
    }

    const plan = plans.find((item) => item.id === manualForm.planId);
    if (!plan) {
      setManualMessage("Plan not found.");
      return;
    }

    const matchedUser = users.find(
      (user) =>
        String(user?.Name || user?.name || "").toLowerCase() === username.toLowerCase()
    );

    onAddManualPayment({
      userKey: username.toLowerCase(),
      userId: matchedUser?.Id || matchedUser?.id || "",
      username,
      planId: plan.id,
      planName: plan.name,
      durationDays: Number(plan.durationDays || plan.duration || 0),
      price: plan.price,
      currency: plan.currency || "MVR",
      finalAmount: amount,
      startDate: new Date(manualForm.startDate).toISOString(),
      endDate: new Date(manualForm.endDate).toISOString(),
      slipName: manualForm.slipName,
      slipData: manualForm.slipData,
    });

    setManualForm({
      username: "",
      planId: "",
      amount: "",
      startDate: "",
      endDate: "",
      slipName: "",
      slipData: "",
    });
    setManualMessage("Manual payment saved.");
  };

  return (
    <section className="card payments-received-page">
      <div className="card-header">
        <h2>Payments Received</h2>
        <div className="count">{approved.length} total</div>
      </div>

      {onAddManualPayment && (
        <div className="form-card">
          <div className="section-title">Add Manual Payment</div>
          <form className="stack" onSubmit={handleManualSubmit}>
            <div className="grid-2">
              <label>
                Username
                <input
                  type="text"
                  value={manualForm.username}
                  onChange={(event) =>
                    setManualForm((prev) => ({ ...prev, username: event.target.value }))
                  }
                  placeholder="User name"
                  list="manual-payment-users"
                />
              </label>
              <datalist id="manual-payment-users">
                {users.map((user) => {
                  const name = user?.Name || user?.name || "";
                  if (!name) return null;
                  return <option key={user.Id || user.id || name} value={name} />;
                })}
              </datalist>
              <label>
                Plan
                <select
                  className="select"
                  value={manualForm.planId}
                  onChange={(event) =>
                    setManualForm((prev) => {
                      const nextPlanId = event.target.value;
                      const plan = plans.find((item) => item.id === nextPlanId);
                      const days = Number(plan?.durationDays || plan?.duration || 0);
                      let nextEnd = prev.endDate;
                      if (prev.startDate && days) {
                        const start = new Date(prev.startDate);
                        if (!Number.isNaN(start.getTime())) {
                          const end = new Date(start.getTime() + days * 24 * 60 * 60 * 1000);
                          nextEnd = end.toISOString().slice(0, 10);
                        }
                      }
                      return { ...prev, planId: nextPlanId, endDate: nextEnd };
                    })
                  }
                >
                  <option value="">Select plan</option>
                  {plans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name} ({plan.durationDays || plan.duration || 0} days)
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Amount Paid
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={manualForm.amount}
                  onChange={(event) =>
                    setManualForm((prev) => ({ ...prev, amount: event.target.value }))
                  }
                  placeholder="0.00"
                />
              </label>
              <label>
                Start Date
                <input
                  type="date"
                  value={manualForm.startDate}
                  onChange={(event) =>
                    setManualForm((prev) => {
                      const nextStart = event.target.value;
                      const plan = plans.find((item) => item.id === prev.planId);
                      const days = Number(plan?.durationDays || plan?.duration || 0);
                      let nextEnd = prev.endDate;
                      if (nextStart && days) {
                        const start = new Date(nextStart);
                        if (!Number.isNaN(start.getTime())) {
                          const end = new Date(start.getTime() + days * 24 * 60 * 60 * 1000);
                          nextEnd = end.toISOString().slice(0, 10);
                        }
                      }
                      return { ...prev, startDate: nextStart, endDate: nextEnd };
                    })
                  }
                />
              </label>
              <label>
                End Date
                <input
                  type="date"
                  value={manualForm.endDate}
                  onChange={(event) =>
                    setManualForm((prev) => ({ ...prev, endDate: event.target.value }))
                  }
                />
              </label>
            </div>
            <div className="row">
              <label className="btn ghost small">
                {manualForm.slipName ? "Replace Slip" : "Upload Slip"}
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  className="file-input"
                  onChange={handleManualSlip}
                  hidden
                />
              </label>
              {manualForm.slipName && <span className="muted">{manualForm.slipName}</span>}
            </div>
            {manualMessage && <div className="note">{manualMessage}</div>}
            <div className="row">
              <button className="btn small" type="submit">
                Save Manual Payment
              </button>
            </div>
          </form>
        </div>
      )}
      <div className="table-wrap payments-received-table">
        <div className="table-scroll">
          <table className="table">
          <colgroup>
            <col className="col-received-date" />
            <col className="col-received-user" />
            <col className="col-received-plan" />
            <col className="col-received-amount" />
            <col className="col-received-discount" />
            <col className="col-received-status" />
            <col className="col-received-slip" />
            <col className="col-received-actions" />
          </colgroup>
          <thead>
            <tr>
              <th>Date</th>
              <th>User</th>
              <th>Plan</th>
              <th>Amount</th>
              <th>Discount</th>
              <th>Status</th>
              <th>Slip</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {approved.map((sub) => {
              const rowId =
                sub.id || `${sub.submittedAt || "no-date"}-${sub.planId || sub.planName || ""}`;
              const slipUrl = sub.slipData || sub.slipUrl || "";
              const currentAmount =
                amountDrafts[sub.id] ??
                (sub.finalAmount !== undefined && sub.finalAmount !== null
                  ? String(sub.finalAmount)
                  : String(sub.price || ""));
              return (
                <Fragment key={rowId}>
                  <tr>
                    <td className="col-received-date" data-label="Date">
                      {formatDate(sub.reviewedAt || sub.approvedAt || sub.submittedAt)}
                    </td>
                    <td className="col-received-user" data-label="User">
                      {sub.username || sub.userId || "-"}
                    </td>
                    <td className="col-received-plan" data-label="Plan">
                      {sub.planName || "-"}
                    </td>
                    <td className="col-received-amount" data-label="Amount">
                      {onUpdatePaymentAmount ? (
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className="table-input"
                          value={currentAmount}
                          onChange={(event) => handleAmountChange(sub.id, event.target.value)}
                          onBlur={() => commitAmount(sub)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              commitAmount(sub);
                            }
                          }}
                        />
                      ) : (
                        formatAmount(sub)
                      )}
                    </td>
                    <td className="col-received-discount" data-label="Discount">
                      {formatDiscount({
                        ...sub,
                        finalAmount:
                          amountDrafts[sub.id] ?? sub.finalAmount ?? sub.price ?? 0,
                      })}
                    </td>
                    <td className="col-received-status" data-label="Status">
                      {String(sub.status || "-").toUpperCase()}
                    </td>
                    <td className="col-received-slip" data-label="Slip">
                      {slipUrl ? (
                        <div className="row">
                          <button
                            type="button"
                            className="btn ghost tiny"
                            onClick={() => setOpenSlip({ url: slipUrl, name: sub.slipName })}
                          >
                            View
                          </button>
                          {onUploadSlip && (
                            <>
                              <label className="btn ghost tiny">
                                Replace
                                <input
                                  type="file"
                                  accept="image/*,application/pdf"
                                  className="file-input"
                                  onChange={(event) => handleSlipUpload(sub, event)}
                                  hidden
                                />
                              </label>
                            </>
                          )}
                        </div>
                      ) : (
                        <>
                          {onUploadSlip ? (
                            <label className="btn ghost tiny">
                              Upload
                              <input
                                type="file"
                                accept="image/*,application/pdf"
                                className="file-input"
                                onChange={(event) => handleSlipUpload(sub, event)}
                                hidden
                              />
                            </label>
                          ) : (
                            <span className="muted">-</span>
                          )}
                        </>
                      )}
                    </td>
                    <td className="col-received-actions" data-label="Actions">
                      <button
                        type="button"
                        className="btn ghost tiny"
                        onClick={() => setDeleteTarget(sub)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                </Fragment>
              );
            })}
            {approved.length === 0 && (
              <tr>
                <td colSpan={8}>
                  <div className="empty-state">
                    <div className="empty-icon" aria-hidden="true">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 12h18" />
                        <path d="M12 3v18" />
                      </svg>
                    </div>
                    <div className="empty-title">No payments received yet</div>
                    <div className="empty-subtitle">Approved payments will appear here.</div>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
          </table>
        </div>
      </div>

      {deleteTarget && (
        <div className="modal-backdrop" role="presentation" onClick={() => setDeleteTarget(null)}>
          <div
            className="modal-card delete-modal"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <h3>Delete payment?</h3>
                <div className="muted">
                  {deleteTarget.username || deleteTarget.userId || "Unknown"} •{" "}
                  {deleteTarget.planName || "-"}
                </div>
              </div>
            </div>
            <div className="modal-body">
              This will permanently remove the payment record from history.
            </div>
            <div className="modal-actions">
              <button type="button" className="btn ghost" onClick={() => setDeleteTarget(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn danger"
                onClick={() => {
                  if (onDeletePayment && deleteTarget?.id) {
                    onDeletePayment(deleteTarget.id);
                  }
                  setDeleteTarget(null);
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {openSlip && (
        <div className="modal-backdrop" role="presentation" onClick={() => setOpenSlip(null)}>
          <div
            className="modal-card slip-modal"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <h3>Payment Slip</h3>
                {openSlip.name && <div className="muted">{openSlip.name}</div>}
              </div>
            </div>
            <div className="slip-preview">
              {openSlip.url.startsWith("data:application/pdf") ? (
                <iframe title="Payment slip" src={openSlip.url} />
              ) : (
                <img src={openSlip.url} alt="Payment slip" />
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
