import { Fragment, useMemo, useState } from "react";

const TIME_ZONE = "Asia/Karachi";

const formatDate = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE }).format(date);
};

const formatAmount = (sub) => {
  const amount = Number(sub?.price || sub?.finalAmount || 0);
  const rawCurrency = sub?.currency || "MVR";
  const currency = rawCurrency === "USD" ? "MVR" : rawCurrency;
  const formatted = Number.isFinite(amount)
    ? amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "0.00";
  return `${currency} ${formatted}`;
};

export default function PaymentsReceivedPage({
  subscriptions = [],
  onDeletePayment,
  onUploadSlip,
}) {
  const [openSlip, setOpenSlip] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

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

  return (
    <section className="card payments-received-page">
      <div className="card-header">
        <h2>Payments Received</h2>
        <div className="count">{approved.length} total</div>
      </div>
      <div className="table-wrap payments-received-table">
        <div className="table-scroll">
          <table className="table">
          <colgroup>
            <col className="col-received-date" />
            <col className="col-received-user" />
            <col className="col-received-plan" />
            <col className="col-received-amount" />
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
                      {formatAmount(sub)}
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
                <td colSpan={6}>
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
