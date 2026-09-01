import { useCallback, useEffect, useMemo, useState } from "react";
import { api, legacyUrl } from "../../api/client";
import NotificationCard from "./components/NotificationCard";
import NotificationTopbar from "./components/NotificationTopbar";
import { FILTERS } from "./notification.utils";
import "./notifications.css";

export default function NotificationsPage({ channel }) {
  const inbox = channel === "inbox";
  const [user, setUser] = useState(null),
    [items, setItems] = useState([]),
    [alerts, setAlerts] = useState([]);
  const [unread, setUnread] = useState(0),
    [filter, setFilter] = useState("all"),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const load = useCallback(
    async (active = "all", session = user) => {
      if (!session) return;
      setLoading(true);
      setError("");
      try {
        const count = await api(
          `/api/notifications/unread-count?channel=${channel}`,
        ).catch(() => ({ count: 0 }));
        const params = new URLSearchParams({ limit: "150", channel });
        if (active === "unread") params.set("unread_only", "1");
        else if (active !== "all") params.set("type", active);
        if (session.role === "superadmin") params.set("include_archived", "1");
        const list = await api(`/api/notifications?${params}`);
        const inventory =
          session.role === "superadmin"
            ? []
            : inbox
              ? list.filter((x) => x.type === "inventory")
              : await api(
                  "/api/notifications?limit=150&channel=inbox&type=inventory",
                ).catch(() => []);
        setUnread(Number(count.count || 0));
        setItems(Array.isArray(list) ? list : []);
        setAlerts(Array.isArray(inventory) ? inventory : []);
      } catch (e) {
        setError(e.message || "Failed to load notifications.");
      } finally {
        setLoading(false);
      }
    },
    [channel, inbox, user],
  );
  /* The initial loader intentionally receives the freshly authenticated user. */
  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    api("/api/auth/me")
      .then(({ user: current }) => {
        if (inbox && current.role === "superadmin") {
          location.replace("/app/notifications");
          return;
        }
        if (
          !inbox &&
          current.role !== "superadmin" &&
          !current.permissions?.includes("notifications.view")
        ) {
          setError("You do not have permission to view Notifications.");
          setLoading(false);
          return;
        }
        setUser(current);
        load("all", current);
      })
      .catch((e) => {
        if (e.status === 401) location.replace(legacyUrl("/"));
        else {
          setError(e.message);
          setLoading(false);
        }
      });
  }, [inbox]);
  /* eslint-enable react-hooks/exhaustive-deps */
  const counts = useMemo(
    () => ({
      assignment: items.filter((x) => x.type === "assignment").length,
      release: items.filter((x) => x.type === "release").length,
      system: items.filter((x) => x.type === "system").length,
    }),
    [items],
  );
  function select(next) {
    setFilter(next);
    load(next);
  }
  async function read(id) {
    await api(`/api/notifications/${id}/read`, {
      method: "PATCH",
      body: { channel },
    });
    load(filter);
  }
  async function readAll() {
    await api("/api/notifications/read-all", {
      method: "PATCH",
      body: { channel },
    });
    load(filter);
  }
  async function archive(id) {
    if (confirm("Archive this notification? Shops will no longer see it.")) {
      await api(`/api/notifications/${id}`, { method: "DELETE" });
      load(filter);
    }
  }
  if (!user && !loading)
    return (
      <main className={"notification-state"}>
        <h1>Could not load Notifications</h1>
        <p>{error}</p>
        <a href={"/app/lobby"}>Return to shop lobby</a>
      </main>
    );
  return (
    <main className={"notifications-page"}>
      <NotificationTopbar user={user} unread={unread} channel={channel} />
      <div className={"notification-shell"}>
        <header className={"notification-heading"}>
          <div>
            <small>
              {inbox ? "Personal Operations" : "Restaurant Communication"}
            </small>
            <h1>{inbox ? "My Notification Inbox" : "Notification Center"}</h1>
            <p>
              {inbox
                ? "Private order updates and messages from people in your restaurant, visible only when relevant to you."
                : "Platform notices, assigned work, release updates, billing reminders, and messages from the master owner."}
            </p>
          </div>
          {!inbox && user?.role === "superadmin" ? (
            <a className={"new-notice"} href={"/dashboard#notifications"}>
              New Notice
            </a>
          ) : (
            <button onClick={readAll}>Mark All Read</button>
          )}
        </header>
        {alerts.length > 0 && (
          <section className={"inventory-alert"}>
            <div>
              <small>Inventory Alert Panel</small>
              <h2>{alerts.length} active stock or expiry alerts</h2>
              <p>
                {alerts.filter((x) => x.priority === "urgent").length} urgent.
                Review low stock, out-of-stock items, near-expiry batches, and
                expired batches.
              </p>
            </div>
            <button
              onClick={() =>
                inbox
                  ? select("inventory")
                  : location.assign("/app/notification-inbox")
              }
            >
              Review Inventory Alerts
            </button>
          </section>
        )}
        <section className={"notification-stats"}>
          <div>
            <small>Unread</small>
            <b>{unread}</b>
          </div>
          <div>
            <small>{inbox ? "Order Updates" : "Assignments"}</small>
            <b>{inbox ? counts.system : counts.assignment}</b>
          </div>
          <div>
            <small>{inbox ? "Assignments" : "Releases"}</small>
            <b>{inbox ? counts.assignment : counts.release}</b>
          </div>
          {alerts.length > 0 && (
            <div>
              <small>Inventory Alerts</small>
              <b>{alerts.length}</b>
            </div>
          )}
        </section>
        <section className={"notification-filters"}>
          {FILTERS[channel].map(([id, label]) => (
            <button
              key={id}
              className={filter === id ? "active" : ""}
              onClick={() => select(id)}
            >
              {label}
              {id === "unread" ? ` ${unread}` : ""}
            </button>
          ))}
        </section>
        {loading ? (
          <div className={"notification-loading"}>Loading notifications...</div>
        ) : error ? (
          <div className={"notification-error"}>{error}</div>
        ) : (
          <section className={"notification-list"}>
            {items.length ? (
              items.map((item) => (
                <NotificationCard
                  key={item.id}
                  item={item}
                  canArchive={user.role === "superadmin"}
                  onRead={read}
                  onArchive={archive}
                />
              ))
            ) : (
              <div className={"notification-empty"}>
                <h2>No notifications found</h2>
                <p>
                  New platform releases, assignments, and restaurant notices
                  will appear here.
                </p>
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
