export const STATUSES = [
  "pending_browse",
  "pending_deep",
  "browsing",
  "deep_reading",
  "browsed",
  "deep_read",
] as const;

export type ReadingStatus = (typeof STATUSES)[number];

export const LABELS: Record<ReadingStatus, string> = {
  pending_browse: "待泛读",
  pending_deep: "待精读",
  browsing: "泛读中",
  deep_reading: "精读中",
  browsed: "已泛读",
  deep_read: "已精读",
};

export const FILTERS = [
  { value: "all", label: "全部" },
  { value: "unread", label: "待读" },
  { value: "reading", label: "阅读中" },
  { value: "read", label: "已读" },
  { value: "pending_browse", label: "待泛读" },
  { value: "pending_deep", label: "待精读" },
  { value: "browsing", label: "泛读中" },
  { value: "deep_reading", label: "精读中" },
  { value: "browsed", label: "已泛读" },
  { value: "deep_read", label: "已精读" },
] as const;
