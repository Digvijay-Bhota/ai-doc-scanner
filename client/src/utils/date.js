/**
 * Human-readable relative time (no external dep needed)
 */
export function formatDistanceToNow(dateStr) {
  if (!dateStr) return '';
  const now  = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.floor((now - then) / 1000); // seconds

  if (diff < 60)   return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  const d = Math.floor(diff / 86400);
  if (d < 30) return `${d}d ago`;
  return new Date(dateStr).toLocaleDateString();
}
