export function prefersMobileViewer(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (/Mobile|iPhone|iPod|iPad|Windows Phone|Android|Tablet|Silk/i.test(ua)) return true;
  const data = (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData;
  return data?.mobile === true;
}
