import { TYPES, dateText, openAction, targetText } from "../notification.utils";
export default function NotificationCard({
  item,
  canArchive,
  onRead,
  onArchive,
}) {
  const unread = !item.read_at;
  const tone = (TYPES[item.type] || TYPES.announcement)[1];
  return (
    <article className={`notification-card ${unread ? "is-unread" : ""}`}>
      <div className={`notification-dot ${tone}`} />
      <div className={"notification-body"}>
        <h3>{item.title}</h3>
        <p>{item.message}</p>
        <small>
          {targetText(item)} · {dateText(item.created_at)}
        </small>
      </div>
      <div className={"notification-actions"}>
        {item.action_url && (
          <button onClick={() => openAction(item)}>
            {item.action_label || "Open"}
          </button>
        )}
        {unread && <button onClick={() => onRead(item.id)}>Mark Read</button>}
        {canArchive && (
          <button onClick={() => onArchive(item.id)}>Archive</button>
        )}
      </div>
    </article>
  );
}
