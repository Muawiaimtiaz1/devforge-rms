import { useCallback, useEffect, useMemo, useState } from "react";
import { api, legacyUrl } from "../../api/client";
import { formatShopCurrency } from "../../currency";
import { AnalyticsTopbar } from "../analytics/AnalyticsTopbar";
import "../analytics/analytics.generated.css";
import "./sales.css";

const PAGE_SIZE = 25;
const emptyPage = { page: 1, total_records: 0, total_pages: 1 };
const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

function orderTypeLabel(value) {
  return (
    {
      dine_in: "Dine-in",
      takeaway: "Takeaway",
      delivery: "Delivery",
      walk_in: "Walk-in",
    }[value] || String(value || "").replaceAll("_", " ")
  );
}

function dateBounds(range, fromDate, toDate) {
  if (range === "all") return {};
  if (range === "custom")
    return {
      from: fromDate ? fromDate + " 00:00:00.000" : "",
      to: toDate ? toDate + " 23:59:59.999" : "",
    };
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  if (range === "last_week") from.setDate(from.getDate() - 7);
  if (range === "last_month") from.setMonth(from.getMonth() - 1);
  if (range === "6_month") from.setMonth(from.getMonth() - 6);
  if (range === "last_year") from.setFullYear(from.getFullYear() - 1);
  const pad = (value) => String(value).padStart(2, "0");
  return {
    from:
      from.getFullYear() +
      "-" +
      pad(from.getMonth() + 1) +
      "-" +
      pad(from.getDate()) +
      " 00:00:00.000",
    to: "",
  };
}

function Modal({ title, wide = false, children, onClose }) {
  useEffect(() => {
    const close = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);
  return (
    <div
      className="sales-modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className={"sales-modal " + (wide ? "wide" : "")}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header>
          <h3>{title}</h3>
          <button type="button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div className="sales-modal-body">{children}</div>
      </section>
    </div>
  );
}

function OrderDetails({ data }) {
  const sale = data.sale || {};
  const items = data.items || [];
  const kitchens = data.kitchens || data.kitchen_statuses || [];
  return (
    <div className="sales-stack">
      {Object.keys(sale).length > 2 && (
        <div className="sales-summary">
          <div>
            <span>Order type</span>
            <strong>{orderTypeLabel(sale.order_type)}</strong>
          </div>
          <div>
            <span>Customer</span>
            <strong>{sale.customer_name || "Walk-in"}</strong>
          </div>
          <div>
            <span>Payment</span>
            <strong>
              {String(sale.payment_method || "cash").replaceAll("_", " ")}
            </strong>
          </div>
          <div>
            <span>Served by</span>
            <strong>
              {sale.served_by_name || sale.served_by_username || "Staff"}
            </strong>
          </div>
        </div>
      )}
      {Number(sale.tip_amount || 0) > 0 && (
        <div className="sales-tip">
          Tip: {formatShopCurrency(sale.tip_amount)} · {String(sale.tip_payment_method || sale.payment_method || "cash").replaceAll("_", " ")}
        </div>
      )}
      {kitchens.length > 0 && (
        <div className="sales-kitchens">
          <h4>Kitchen status</h4>
          {kitchens.map((entry, index) => (
            <div key={entry.kitchen_id || index}>
              <b>{entry.kitchen_name || "Kitchen #" + entry.kitchen_id}</b>
              <span>{entry.status || "pending"}</span>
            </div>
          ))}
        </div>
      )}
      <div className="sales-items">
        {items.map((item, index) => (
          <div key={item.id || index}>
            <b>{Number(item.quantity || 0)}</b>
            <span>
              <strong>{item.product_name || item.name}</strong>
              {item.special_instructions && (
                <small>{item.special_instructions}</small>
              )}
            </span>
            {Object.keys(sale).length > 2 && (
              <strong>
                {formatShopCurrency(
                  Number(item.price || item.unit_price || 0) *
                    Number(item.quantity || 0),
                )}
              </strong>
            )}
          </div>
        ))}
      </div>
      {Object.keys(sale).length > 2 && (
        <div className="sales-total">
          <span>Total</span>
          <span>{formatShopCurrency(sale.total)}</span>
        </div>
      )}
    </div>
  );
}

function DueDetails({ data }) {
  const sale = data.sale || {};
  const payments = data.payments || [];
  const balance = Number(sale.total || 0) - Number(sale.amount_received || 0);
  return (
    <div className="sales-stack">
      <div className="sales-due-summary">
        <div>
          <span>Total bill</span>
          <strong>{formatShopCurrency(sale.total)}</strong>
        </div>
        <div>
          <span>Remaining due</span>
          <strong>{formatShopCurrency(balance)}</strong>
        </div>
      </div>
      <div>
        <span className="sales-section-label">Payment history</span>
        <div className="sales-history">
          {payments.length ? (
            payments.map((payment) => (
              <div key={payment.id}>
                <span>
                  <strong>{formatShopCurrency(payment.amount)}</strong>
                  <small>{new Date(payment.created_at).toLocaleString()}</small>
                </span>
                <em>{payment.note || "No note"}</em>
              </div>
            ))
          ) : (
            <p>No installment payments recorded yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function CollectPayment({ sale, onDone, onClose }) {
  const due = Math.max(
    0,
    Number(sale.total || 0) - Number(sale.amount_received || 0),
  );
  const [amount, setAmount] = useState(due.toFixed(2));
  const [method, setMethod] = useState("cash");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function submit(event) {
    event.preventDefault();
    const adding = Number(amount);
    if (adding <= 0 || adding > due + 0.01)
      return setError("Enter an amount up to the remaining due.");
    try {
      setSaving(true);
      setError("");
      await api("/api/sales/" + sale.id + "/pay?view=sales_panel", {
        method: "PATCH",
        body: {
          amount: Number(sale.amount_received || 0) + adding,
          payment_method: method,
          note,
        },
      });
      await onDone("Dues updated successfully.");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <form className="sales-form" onSubmit={submit}>
      <p>
        Total remaining due is <strong>{formatShopCurrency(due)}</strong>.
      </p>
      {error && <div className="sales-error">{error}</div>}
      <label>
        How much is being received now?
        <input
          type="number"
          min="0.01"
          max={due.toFixed(2)}
          step="0.01"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
        />
      </label>
      <label>
        Payment method
        <select
          value={method}
          onChange={(event) => setMethod(event.target.value)}
        >
          <option value="cash">Cash</option>
          <option value="card">Card</option>
          <option value="online">Online Transfer</option>
        </select>
      </label>
      <label>
        Payment note (optional)
        <input
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="e.g. Cash received at counter"
        />
      </label>
      <div className="sales-modal-actions">
        <button type="button" onClick={onClose}>
          Cancel
        </button>
        <button className="sales-primary" disabled={saving}>
          {saving ? "Saving…" : "Confirm Received"}
        </button>
      </div>
    </form>
  );
}

function ReturnItems({ data, onDone, onClose }) {
  const [reason, setReason] = useState("");
  const [method, setMethod] = useState("cash");
  const [items, setItems] = useState(() =>
    (data.items || []).map((item) => {
      const available = Math.max(
        0,
        Number(item.quantity || 0) - Number(item.returned_qty || 0),
      );
      return {
        ...item,
        selected: false,
        return_quantity: available,
        refund_price: Number(
          item.price_at_sale || item.price || item.unit_price || 0,
        ),
        is_damage: false,
      };
    }),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const selected = items.filter((item) => item.selected);
  async function submit(event) {
    event.preventDefault();
    if (!selected.length)
      return setError("Please select at least one item to return.");
    const invalid = selected.find(
      (item) =>
        Number(item.return_quantity) <= 0 ||
        Number(item.return_quantity) >
          Math.max(
            0,
            Number(item.quantity || 0) - Number(item.returned_qty || 0),
          ),
    );
    if (invalid)
      return setError(
        "Return quantity must be between 1 and the available sold quantity.",
      );
    try {
      setSaving(true);
      setError("");
      const response = await api(
        "/api/sales/" + data.sale.id + "/return?view=sales_panel",
        {
          method: "POST",
          body: {
            reason,
            payment_method: method,
            items: selected.map((item) => ({
              sale_item_id: item.id,
              product_id: item.product_id,
              quantity: Number(item.return_quantity),
              refund_price: Number(item.refund_price),
              is_damage: Boolean(item.is_damage),
            })),
          },
        },
      );
      await onDone(response);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <form className="sales-form" onSubmit={submit}>
      <div className="sales-return-note">
        Select the items you wish to return. Quantities will be restocked
        automatically unless marked as damaged.
      </div>
      {error && <div className="sales-error">{error}</div>}
      <div className="sales-return-list">
        {items.map((item, index) => {
          const available = Math.max(
            0,
            Number(item.quantity || 0) - Number(item.returned_qty || 0),
          );
          return (
            <div className={available ? "" : "disabled"} key={item.id || index}>
              <label className="sales-return-name">
                <input
                  type="checkbox"
                  checked={item.selected}
                  disabled={!available}
                  onChange={(event) =>
                    setItems((current) =>
                      current.map((entry, itemIndex) =>
                        itemIndex === index
                          ? { ...entry, selected: event.target.checked }
                          : entry,
                      ),
                    )
                  }
                />
                <span>
                  <strong>{item.product_name || item.name}</strong>
                  <small>
                    Sold: {item.quantity} @{" "}
                    {formatShopCurrency(item.price_at_sale || item.price || 0)}
                  </small>
                  {Number(item.returned_qty || 0) > 0 && (
                    <em>Already returned: {item.returned_qty}</em>
                  )}
                </span>
              </label>
              <label>
                Quantity
                <input
                  type="number"
                  min="1"
                  max={available}
                  value={item.return_quantity}
                  disabled={!available || !item.selected}
                  onChange={(event) =>
                    setItems((current) =>
                      current.map((entry, itemIndex) =>
                        itemIndex === index
                          ? { ...entry, return_quantity: event.target.value }
                          : entry,
                      ),
                    )
                  }
                />
              </label>
              <label>
                Refund / unit
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={item.refund_price}
                  disabled={!available || !item.selected}
                  onChange={(event) =>
                    setItems((current) =>
                      current.map((entry, itemIndex) =>
                        itemIndex === index
                          ? { ...entry, refund_price: event.target.value }
                          : entry,
                      ),
                    )
                  }
                />
              </label>
              <label className="sales-return-damage">
                Damage?
                <input
                  type="checkbox"
                  checked={item.is_damage}
                  disabled={!available || !item.selected}
                  onChange={(event) =>
                    setItems((current) =>
                      current.map((entry, itemIndex) =>
                        itemIndex === index
                          ? { ...entry, is_damage: event.target.checked }
                          : entry,
                      ),
                    )
                  }
                />
              </label>
            </div>
          );
        })}
      </div>
      <label>
        Refund method
        <select
          value={method}
          onChange={(event) => setMethod(event.target.value)}
        >
          <option value="cash">Cash Refund</option>
          <option value="online">Bank Transfer / Online</option>
          <option value="ledger">
            Credit to Customer Account (Store Credit)
          </option>
        </select>
      </label>
      <label>
        Reason for return
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Optional notes..."
        />
      </label>
      <div className="sales-modal-actions">
        <button type="button" onClick={onClose}>
          Cancel
        </button>
        <button className="danger" disabled={saving}>
          {saving ? "Processing…" : "Process Return"}
        </button>
      </div>
    </form>
  );
}

function PaymentBadge({ method }) {
  const value = String(method || "cash").toLowerCase();
  return (
    <span className={"sales-payment " + value}>
      {value.replaceAll("_", " ")}
    </span>
  );
}

function Pagination({ page, visible, onPage }) {
  if (Number(page.total_pages || 1) <= 1) return null;
  return (
    <div className="sales-pagination">
      <span>
        Showing <b>{visible}</b> of <b>{page.total_records}</b> sales
      </span>
      <div>
        <button disabled={page.page <= 1} onClick={() => onPage(page.page - 1)}>
          Previous
        </button>
        <span>
          Page {page.page} of {page.total_pages}
        </span>
        <button
          disabled={page.page >= page.total_pages}
          onClick={() => onPage(page.page + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}

export default function SalesPage() {
  const [session, setSession] = useState(null);
  const [authError, setAuthError] = useState("");
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState(emptyPage);
  const [summary, setSummary] = useState({});
  const [page, setPage] = useState(1);
  const [pending, setPending] = useState(
    () => new URLSearchParams(window.location.search).get("pending") === "1",
  );
  const [range, setRange] = useState("today");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [orderType, setOrderType] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState(null);
  const restricted = ["waiter", "order_taker"].includes(
    String(session?.role || "").toLowerCase(),
  );
  const has = useCallback(
    (permission) =>
      session?.role === "superadmin" ||
      session?.permissions?.includes(permission),
    [session],
  );

  useEffect(() => {
    document.title = "Sales — DevForge RMS";
    api("/api/auth/me")
      .then(({ user }) => {
        if (
          user.role !== "superadmin" &&
          !user.permissions?.includes("sales.view")
        )
          throw new Error("You do not have permission to view Sales.");
        setSession(user);
      })
      .catch((requestError) => {
        if (requestError.status === 401)
          window.location.replace(legacyUrl("/"));
        else setAuthError(requestError.message);
      })
      .finally(() => setLoadingAuth(false));
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const load = useCallback(async () => {
    if (!session) return;
    const params = new URLSearchParams({
      view: "sales_panel",
      page: String(page),
      page_size: String(PAGE_SIZE),
    });
    if (!restricted) params.set("payment_status", pending ? "pending" : "paid");
    if (search) params.set("search", search);
    if (orderType) params.set("order_type", orderType);
    const bounds = dateBounds(range, fromDate, toDate);
    if (bounds.from) params.set("from_date", bounds.from);
    if (bounds.to) params.set("to_date", bounds.to);
    try {
      setLoading(true);
      setError("");
      const result = await api("/api/sales?" + params.toString());
      setRows(Array.isArray(result.rows) ? result.rows : []);
      setPagination(result.pagination || emptyPage);
      setSummary(result.summary || {});
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [
    session,
    page,
    restricted,
    pending,
    search,
    orderType,
    range,
    fromDate,
    toDate,
  ]);

  useEffect(() => {
    const timer = window.setTimeout(load, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (pending && !restricted) url.searchParams.set("pending", "1");
    else url.searchParams.delete("pending");
    window.history.replaceState({}, "", url);
  }, [pending, restricted]);

  const notify = useCallback((message, type = "success") => {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 3500);
  }, []);

  async function billFor(sale, kind) {
    try {
      setError("");
      const data = await api(
        "/api/sales/" + sale.id + "/bill?view=sales_panel",
      );
      setModal({ kind, sale, data });
    } catch (requestError) {
      notify(requestError.message, "error");
    }
  }

  async function done(message) {
    setModal(null);
    notify(message);
    await load();
  }

  async function returnDone(result) {
    setModal({ kind: "return-complete", result });
    notify(
      "Return process completed. Total refund: " +
        formatShopCurrency(result.totalRefund || 0),
    );
    await load();
  }

  async function printReturnReceipt(returnId) {
    const popup = window.open("", "_blank", "width=420,height=700");
    if (!popup)
      return notify("Allow pop-ups to print the return receipt.", "error");
    try {
      popup.document.write("<p>Loading return receipt...</p>");
      const data = await api(
        "/api/sales/returns/" + returnId + "/receipt?view=sales_panel",
      );
      const ret = data.return || {};
      const shop = data.shop || {};
      const rows = (data.items || [])
        .map(
          (item) =>
            "<tr><td>" +
            escapeHtml(item.product_name || "Item") +
            "</td><td>" +
            Number(item.quantity || 0) +
            "</td><td>" +
            formatShopCurrency(item.refund_price) +
            "</td><td>" +
            formatShopCurrency(
              Number(item.refund_price || 0) * Number(item.quantity || 0),
            ) +
            "</td></tr>",
        )
        .join("");
      popup.document.open();
      popup.document.write(
        "<!doctype html><html><head><title>Return Receipt #" +
          escapeHtml(returnId) +
          "</title><style>@page{margin:6mm}body{font:12px Arial;color:#111;max-width:80mm;margin:auto}h1,h2,p{text-align:center;margin:4px}table{width:100%;border-collapse:collapse;margin:14px 0}th,td{padding:5px 2px;border-bottom:1px dashed #999;text-align:right}th:first-child,td:first-child{text-align:left}.total{font-size:16px;font-weight:bold;text-align:right}.meta{margin:12px 0;line-height:1.6}</style></head><body><h1>" +
          escapeHtml(
            shop.receipt_header_text || shop.name || "RETURN RECEIPT",
          ) +
          "</h1><h2>Return #" +
          escapeHtml(returnId) +
          "</h2><p>Original sale #" +
          escapeHtml(data.sale?.order_number || ret.sale_id) +
          '</p><div class="meta">Method: ' +
          escapeHtml(ret.payment_method || "cash") +
          "<br>Reason: " +
          escapeHtml(ret.reason || "-") +
          "<br>Processed by: " +
          escapeHtml(data.user?.name || "Staff") +
          "</div><table><thead><tr><th>Item</th><th>Qty</th><th>Each</th><th>Total</th></tr></thead><tbody>" +
          rows +
          '</tbody></table><div class="total">TOTAL REFUND: ' +
          formatShopCurrency(ret.total_refund) +
          "</div><p>Thank you for your visit!</p><script>window.onload=()=>window.print()</script></body></html>",
      );
      popup.document.close();
    } catch (requestError) {
      popup.close();
      notify(requestError.message, "error");
    }
  }

  async function handover(sale) {
    try {
      await api("/api/kds/" + sale.id + "/status", {
        method: "PATCH",
        body: { status: "served" },
      });
      notify("Order marked as handed over.");
      await load();
    } catch (requestError) {
      notify(requestError.message, "error");
    }
  }

  async function openPrint(saleId, format) {
    try {
      const result = await api("/api/print-jobs/queue", {
        method: "POST",
        body: { sale_id: saleId, format, shop_id: session?.shop_id || null },
      });
      if (Number(result.queued || 0) > 0) {
        notify("Print sent to configured printer.");
        setModal(null);
        return;
      }
      if (format === "kitchen")
        throw new Error("No kitchen printer is assigned for this order");
      const params = new URLSearchParams({
        format,
        autoprint: "1",
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      if (session?.shop_id) params.set("shop_id", String(session.shop_id));
      window.open(
        "/print/sales/" + encodeURIComponent(saleId) + "?" + params.toString(),
        "_blank",
        "noopener",
      );
      setModal(null);
    } catch (requestError) {
      notify(requestError.message || "Print failed", "error");
    }
  }

  function changeFilter(setter, value) {
    setter(value);
    setPage(1);
  }

  const title = pending ? "PENDING DUES" : "PAID SLIPS";
  const totalDue = Number(summary.total_pending_due || 0);
  const tableRows = useMemo(
    () =>
      rows.map((sale) => ({
        ...sale,
        due: Number(sale.total || 0) - Number(sale.amount_received || 0),
      })),
    [rows],
  );

  if (loadingAuth)
    return (
      <main className="sales-state">
        <h1>Loading Sales…</h1>
      </main>
    );
  if (authError)
    return (
      <main className="sales-state">
        <h1>Sales unavailable</h1>
        <p>{authError}</p>
        <a href={legacyUrl("/dashboard#lobby")}>Back to modules</a>
      </main>
    );

  return (
    <div className="analytics-page sales-page">
      <AnalyticsTopbar user={session} />
      <main className="sales-shell">
        {restricted ? (
          <div className="sales-heading restricted">
            <div>
              <h2>Orders</h2>
              <p>Your placed and assigned orders, with their kitchen status</p>
            </div>
            <input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search Order ID..."
            />
          </div>
        ) : (
          <div className="sales-heading">
            <div>
              <div>
                <h2 className={pending ? "pending" : "paid"}>{title}</h2>
                <div className="sales-heading-summary">
                  <p>
                    Showing <b>{pagination.total_records || 0}</b> records
                  </p>
                  {pending && <b>Total Dues: {formatShopCurrency(totalDue)}</b>}
                </div>
              </div>
            </div>
            <div className="sales-filters">
              <label>
                <span>Range</span>
                <select
                  value={range}
                  onChange={(event) => {
                    changeFilter(setRange, event.target.value);
                    if (event.target.value !== "custom") {
                      setFromDate("");
                      setToDate("");
                    }
                  }}
                >
                  <option value="today">Today</option>
                  <option value="last_week">Last Week</option>
                  <option value="last_month">Last Month</option>
                  <option value="6_month">6 Months</option>
                  <option value="last_year">Last Year</option>
                  <option value="all">All Time</option>
                  <option value="custom">Custom Range</option>
                </select>
              </label>
              <label>
                <span>From</span>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(event) => {
                    setRange("custom");
                    changeFilter(setFromDate, event.target.value);
                  }}
                />
              </label>
              <label>
                <span>To</span>
                <input
                  type="date"
                  value={toDate}
                  onChange={(event) => {
                    setRange("custom");
                    changeFilter(setToDate, event.target.value);
                  }}
                />
              </label>
              <label>
                <span>Type</span>
                <select
                  value={orderType}
                  onChange={(event) =>
                    changeFilter(setOrderType, event.target.value)
                  }
                >
                  <option value="">All Types</option>
                  <option value="dine_in">Dine-in</option>
                  <option value="takeaway">Takeaway</option>
                  <option value="delivery">Delivery</option>
                  <option value="walk_in">Walk-in</option>
                </select>
              </label>
              <button
                className="sales-switch"
                onClick={() => {
                  setPending((value) => !value);
                  setPage(1);
                }}
              >
                {pending ? "📄 View Paid Slips" : "🔴 View Pending Dues"}
              </button>
              <input
                className="sales-search"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Search Bill #, Name, Phone..."
              />
            </div>
          </div>
        )}
        {error && (
          <div className="sales-error">
            <span>{error}</span>
            <button onClick={load}>Retry</button>
          </div>
        )}
        <div className="sales-table-card">
          <div className="sales-table-wrap">
            <table>
              {restricted ? (
                <>
                  <thead>
                    <tr>
                      <th>Order ID</th>
                      <th>Type</th>
                      <th>Status</th>
                      <th>Ordered Items</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tableRows.length ? (
                      tableRows.map((sale) => (
                        <tr key={sale.id}>
                          <td className="sales-id">
                            <b>#{sale.order_number || sale.id}</b>
                            {sale.order_type === "takeaway" &&
                              sale.token_number && (
                                <small>Token {sale.token_number}</small>
                              )}
                          </td>
                          <td>{orderTypeLabel(sale.order_type)}</td>
                          <td>
                            {String(sale.order_status || "pending").replaceAll(
                              "_",
                              " ",
                            )}
                          </td>
                          <td className="sales-actions">
                            {sale.order_type === "takeaway" &&
                              sale.order_status === "ready" && (
                                <button
                                  className="handover"
                                  onClick={() => handover(sale)}
                                >
                                  Mark Handed Over
                                </button>
                              )}
                            <button
                              className="view"
                              onClick={() => billFor(sale, "details")}
                            >
                              View Items
                            </button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="4" className="sales-empty">
                          No orders found
                        </td>
                      </tr>
                    )}
                  </tbody>
                </>
              ) : (
                <>
                  <thead>
                    <tr>
                      <th>Inv #</th>
                      <th>Date</th>
                      <th>Customer</th>
                      <th>Total</th>
                      <th>Tax</th>
                      <th>Paid</th>
                      <th>Payment</th>
                      <th>Pending</th>
                      <th>Served By</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tableRows.length ? (
                      tableRows.map((sale) => (
                        <tr key={sale.id}>
                          <td className="sales-id">
                            <b>#{sale.order_number || sale.id}</b>
                            {Number(sale.items_returned || 0) > 0 && (
                              <small className="returned">
                                Returned ({sale.items_returned})
                              </small>
                            )}
                          </td>
                          <td>
                            <b>
                              {new Date(sale.created_at).toLocaleDateString()}
                            </b>
                            <small>
                              {new Date(sale.created_at).toLocaleTimeString(
                                [],
                                { hour: "2-digit", minute: "2-digit" },
                              )}
                            </small>
                          </td>
                          <td>
                            <b>{sale.customer_name || "Walk-in"}</b>
                            <small>{sale.customer_phone || "No phone"}</small>
                          </td>
                          <td>
                            <b>{formatShopCurrency(sale.total)}</b>
                          </td>
                          <td className="tax">
                            {formatShopCurrency(sale.tax_amount)}
                          </td>
                          <td className="paid-amount">
                            {formatShopCurrency(sale.amount_received)}
                            {Number(sale.tip_amount || 0) > 0 && (
                              <small>
                                Tip: {formatShopCurrency(sale.tip_amount)} · {String(sale.tip_payment_method || sale.payment_method || "cash").replaceAll("_", " ")}
                              </small>
                            )}
                          </td>
                          <td>
                            <PaymentBadge method={sale.payment_method} />
                          </td>
                          <td className={sale.due > 0.01 ? "due" : "none"}>
                            {sale.due > 0.01
                              ? formatShopCurrency(sale.due)
                              : "None"}
                          </td>
                          <td>
                            <span className="sales-staff">
                              {sale.served_by_name ||
                                sale.served_by_username ||
                                "Staff"}
                            </span>
                          </td>
                          <td className="sales-actions">
                            <button
                              className="view"
                              onClick={() => billFor(sale, "details")}
                            >
                              View
                            </button>
                            {sale.due > 0.01 && has("sales.take_payment") && (
                              <button
                                className="collect"
                                title="Collect Payment"
                                onClick={() =>
                                  setModal({ kind: "collect", sale })
                                }
                              >
                                $
                              </button>
                            )}
                            <button
                              className="info"
                              title="Due Details"
                              onClick={() => billFor(sale, "dues")}
                            >
                              i
                            </button>
                            {has("sales.return") && (
                              <button
                                className="return"
                                title="Return Items"
                                onClick={() => billFor(sale, "return")}
                              >
                                ↩
                              </button>
                            )}
                            <button
                              className="print"
                              title="Print Receipt"
                              onClick={() => setModal({ kind: "print", sale })}
                            >
                              Print
                            </button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="10" className="sales-empty">
                          {loading
                            ? "Loading sales…"
                            : "No sales found for this filter."}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </>
              )}
            </table>
          </div>
          <Pagination
            page={pagination}
            visible={rows.length}
            onPage={setPage}
          />
        </div>
      </main>
      {modal?.kind === "details" && (
        <Modal
          wide
          title={
            "Order #" +
            (modal.data.sale?.order_number || modal.sale.id) +
            " - Details"
          }
          onClose={() => setModal(null)}
        >
          <OrderDetails data={modal.data} />
        </Modal>
      )}
      {modal?.kind === "dues" && (
        <Modal
          title={"Payment Details: Bill #" + (modal.sale.order_number || modal.sale.id)}
          onClose={() => setModal(null)}
        >
          <DueDetails data={modal.data} />
        </Modal>
      )}
      {modal?.kind === "collect" && (
        <Modal
          title={"Collect Dues: Bill #" + (modal.sale.order_number || modal.sale.id)}
          onClose={() => setModal(null)}
        >
          <CollectPayment
            sale={modal.sale}
            onDone={done}
            onClose={() => setModal(null)}
          />
        </Modal>
      )}
      {modal?.kind === "return" && (
        <Modal
          wide
          title={"Return Items: Bill #" + (modal.sale.order_number || modal.sale.id)}
          onClose={() => setModal(null)}
        >
          <ReturnItems
            data={modal.data}
            onDone={returnDone}
            onClose={() => setModal(null)}
          />
        </Modal>
      )}
      {modal?.kind === "return-complete" && (
        <Modal title="Return Complete!" onClose={() => setModal(null)}>
          <div className="sales-return-complete">
            <strong>✓</strong>
            <p>
              Return processed successfully —{" "}
              <b>Refund: {formatShopCurrency(modal.result.totalRefund || 0)}</b>
            </p>
            <div className="sales-modal-actions">
              <button
                className="sales-primary"
                onClick={() =>
                  printReturnReceipt(
                    modal.result.returnId || modal.result.return_id,
                  )
                }
              >
                Print Return Receipt
              </button>
              <button onClick={() => setModal(null)}>Back to History</button>
            </div>
          </div>
        </Modal>
      )}
      {modal?.kind === "print" && (
        <Modal title="Print Receipt" onClose={() => setModal(null)}>
          <div className="sales-print-menu">
            {String(session?.shop_type || "").toLowerCase() ===
              "restaurant" && (
              <button
                className="kitchen"
                onClick={() => openPrint(modal.sale.id, "kitchen")}
              >
                <strong>Kitchen Order</strong>
                <span>
                  Preparation ticket with quantities, notes, table/token, and no
                  prices.
                </span>
              </button>
            )}
            <button
              className="customer"
              onClick={() => openPrint(modal.sale.id, "customer")}
            >
              <strong>Customer Bill</strong>
              <span>
                Customer copy with items, totals, received amount, due, and
                change.
              </span>
            </button>
            <button
              className="unpaid"
              onClick={() => openPrint(modal.sale.id, "unpaid")}
            >
              <strong>Unpaid Bill</strong>
              <span>Pending-payment copy for the customer.</span>
            </button>
          </div>
        </Modal>
      )}
      {toast && (
        <div className={"sales-toast " + toast.type}>
          <span>{toast.message}</span>
          <button onClick={() => setToast(null)}>×</button>
        </div>
      )}
    </div>
  );
}
