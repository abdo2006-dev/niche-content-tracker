export function formatNumber(value: number | string | bigint): string {
  const n = Number(value);
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

export function formatRelativeTime(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  const units: [number, string][] = [[60,"second"],[60,"minute"],[24,"hour"],[7,"day"],[4.345,"week"],[12,"month"],[Infinity,"year"]];
  let v = s;
  for (const [div, label] of units) {
    if (v < div) { const r = Math.floor(v); return r <= 1 ? `1 ${label} ago` : `${r} ${label}s ago`; }
    v /= div;
  }
  return d.toLocaleDateString();
}

export function formatDuration(sec?: number | null): string {
  if (!sec) return "";
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h > 0 ? `${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}` : `${m}:${String(s).padStart(2,"0")}`;
}
