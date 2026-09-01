export const FILTERS = {
  inbox: [
    ["all", "All"],
    ["unread", "Unread"],
    ["assignment", "Assignments"],
    ["system", "Order Updates"],
    ["inventory", "Inventory Alerts"],
    ["announcement", "Announcements"],
    ["support", "Support"],
  ],
  platform: [
    ["all", "All"],
    ["unread", "Unread"],
    ["assignment", "Assignments"],
    ["release", "Releases"],
    ["announcement", "Announcements"],
    ["billing", "Billing"],
    ["maintenance", "Maintenance"],
  ],
};
export const TYPES = {
  announcement: ["Announcement", "sky"],
  assignment: ["Assignment", "violet"],
  release: ["Release", "emerald"],
  billing: ["Billing", "amber"],
  maintenance: ["Maintenance", "orange"],
  support: ["Support", "indigo"],
  inventory: ["Inventory", "rose"],
  system: ["System", "slate"],
};
export function dateText(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
}
export function targetText(item) {
  return item.target_user_name || item.target_user_username
    ? `Assigned to ${item.target_user_name || item.target_user_username}`
    : item.shop_name || "All restaurants";
}
export function openAction(item) {
  const url = String(item.action_url || "").trim();
  if (!url) return;
  if (url.startsWith("page:"))
    window.location.href = `/dashboard#${url.slice(5)}`;
  else if (url.startsWith("/")) window.location.href = url;
  else window.open(url, "_blank", "noopener");
}
