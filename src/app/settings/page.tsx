"use client";
import { useEffect, useState } from "react";
import { LoadingState, ErrorState } from "@/components/shared/States";
import { RefreshCw, CheckCircle, XCircle, Info } from "lucide-react";

interface Settings {
  youtubeApiKeyConfigured: boolean;
  refreshInterval_creatorSync: string;
  refreshInterval_statsUpdate: string;
  refreshInterval_keywordRefresh: string;
  maxPostsPerKeyword: string;
  maxTrendingDays: string;
  postRetentionDays: string;
  cronEnabled: string;
}

interface UsageData {
  last24h: { byEndpoint: { endpoint: string; calls: number; units: number }[]; totalUnits: number };
}

const FIELDS = [
  { key: "refreshInterval_creatorSync",   label: "Creator sync interval (hours)",        min: 1,  max: 24,  hint: "How often to check for new posts per creator." },
  { key: "refreshInterval_statsUpdate",   label: "Stats update interval (hours)",        min: 1,  max: 12,  hint: "How often to re-fetch view/like counts for recent posts." },
  { key: "refreshInterval_keywordRefresh",label: "Keyword refresh interval (hours)",     min: 6,  max: 72,  hint: "YouTube search costs 100 quota units — keep at 12h+." },
  { key: "maxPostsPerKeyword",            label: "Max posts per keyword search",         min: 5,  max: 50,  hint: "How many posts to grab per keyword tracker run." },
  { key: "maxTrendingDays",              label: "Max trending age (days)",              min: 7,  max: 365, hint: "Posts older than this are archived from keyword trackers." },
  { key: "postRetentionDays",             label: "Delete tracked posts after (days)",    min: 7,  max: 365, hint: "Old posts and their stats snapshots are deleted during the daily archive job." },
];

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [updatingStats, setUpdatingStats] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  function load() {
    setLoading(true);
    Promise.all([fetch("/api/settings").then(r=>r.json()), fetch("/api/usage").then(r=>r.json())])
      .then(([s,u]) => { setSettings(s); setUsage(u); setLoading(false); })
      .catch(() => { setError("Failed to load settings."); setLoading(false); });
  }
  useEffect(() => { load(); }, []);

  async function save(key: string, value: string) {
    setSavingKey(key);
    await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, value }) });
    setSavingKey(null);
    load();
  }

  async function manualSync() {
    setSyncing(true); setMsg(null);
    const res = await fetch("/api/creators/sync-all?force=true", { method: "POST" });
    const d = await res.json(); setSyncing(false);
    setMsg(`Synced ${d.results?.filter((r: any) => !r.skipped).length ?? 0} creator(s).`);
  }

  async function manualStats() {
    setUpdatingStats(true); setMsg(null);
    const res = await fetch("/api/posts/stats-update", { method: "POST" });
    const d = await res.json(); setUpdatingStats(false);
    setMsg(`Updated stats for ${d.updated ?? 0} post(s).`);
  }

  if (loading) return <LoadingState />;
  if (error || !settings) return <ErrorState message={error ?? "Failed to load."} />;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-semibold text-white">Settings</h1>
        <p className="text-sm text-muted mt-0.5">Configure sync intervals, view API usage, and run manual updates.</p>
      </div>

      {/* Platform status */}
      <div className="card space-y-3">
        <h2 className="text-sm font-semibold text-white">Platform status</h2>
        <div className="space-y-2">
          <StatusRow
            ok={settings.youtubeApiKeyConfigured}
            label="YouTube"
            okText="YouTube Data API key configured"
            failText="YOUTUBE_API_KEY missing"
            failHint="Get a free key in 5 min: console.cloud.google.com → YouTube Data API v3 → Credentials → Create API Key. Needs only a Google account."
          />
          <StatusRow
            ok={true}
            label="TikTok"
            okText="Scraper active — no API key needed. Works for any public TikTok account."
          />
          <StatusRow
            ok={true}
            label="Instagram"
            okText="Scraper active — no API key needed. Works for any public Instagram account."
          />
        </div>
        <div className="flex items-start gap-2 bg-accent-blue/5 border border-accent-blue/20 rounded-lg p-3 text-xs text-muted">
          <Info size={13} className="text-accent-blue mt-0.5 shrink-0" />
          <span>
            TikTok and Instagram are tracked by scraping their public web interfaces — no API
            approval or business account needed. If scraping temporarily fails (rate limit or HTML
            change), the sync skips gracefully and retries next interval.
          </span>
        </div>
      </div>

      {/* Cron toggle */}
      <div className="card space-y-2">
        <h2 className="text-sm font-semibold text-white">Cron jobs</h2>
        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" checked={settings.cronEnabled === "true"}
            onChange={e => save("cronEnabled", String(e.target.checked))} className="w-4 h-4" />
          <span className="text-sm text-muted">Enable scheduled sync (daily creator sync + stats update + archive trending)</span>
        </label>
        <p className="text-xs text-muted/70">Schedules are in vercel.json. Disabling here stops them from doing work even if triggered.</p>
      </div>

      {/* Refresh intervals */}
      <div className="card space-y-4">
        <h2 className="text-sm font-semibold text-white">Refresh intervals</h2>
        {FIELDS.map(({ key, label, min, max, hint }) => (
          <div key={key} className="space-y-1">
            <label className="text-xs text-muted block">{label}</label>
            <div className="flex items-center gap-2">
              <input type="number" min={min} max={max} className="input w-24"
                defaultValue={String((settings as any)[key] ?? "")}
                onBlur={e => { const v = Number(e.target.value); if (v >= min && v <= max) save(key, String(v)); }} />
              {savingKey === key && <RefreshCw size={13} className="text-muted animate-spin" />}
            </div>
            <p className="text-xs text-muted/60">{hint}</p>
          </div>
        ))}
      </div>

      {/* Manual controls */}
      <div className="card space-y-3">
        <h2 className="text-sm font-semibold text-white">Manual controls</h2>
        <div className="flex flex-wrap gap-2">
          <button onClick={manualSync} disabled={syncing} className="btn-secondary text-sm">
            <RefreshCw size={13} className={syncing ? "animate-spin" : ""} />
            {syncing ? "Syncing…" : "Sync all creators now"}
          </button>
          <button onClick={manualStats} disabled={updatingStats} className="btn-secondary text-sm">
            <RefreshCw size={13} className={updatingStats ? "animate-spin" : ""} />
            {updatingStats ? "Updating…" : "Update all post stats now"}
          </button>
        </div>
        {msg && <p className="text-xs text-accent-green">{msg}</p>}
      </div>

      {/* API usage */}
      {usage && (
        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">YouTube API usage (last 24h)</h2>
            <span className="text-sm font-medium text-accent-blue">{usage.last24h.totalUnits} / ~10,000 units</span>
          </div>
          {usage.last24h.byEndpoint.length === 0 ? (
            <p className="text-xs text-muted">No API calls in the last 24 hours.</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted text-left">
                  <th className="pb-2 font-medium">Platform / Endpoint</th>
                  <th className="pb-2 font-medium text-right">Calls</th>
                  <th className="pb-2 font-medium text-right">Units</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {usage.last24h.byEndpoint.map(row => (
                  <tr key={row.endpoint}>
                    <td className="py-1.5 text-white">{row.endpoint}</td>
                    <td className="py-1.5 text-right text-muted">{row.calls}</td>
                    <td className="py-1.5 text-right text-muted">{row.units}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

function StatusRow({ ok, label, okText, failText, failHint }: {
  ok: boolean; label: string; okText: string; failText?: string; failHint?: string;
}) {
  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-2 text-sm">
        {ok
          ? <CheckCircle size={15} className="text-accent-green shrink-0" />
          : <XCircle size={15} className="text-red-400 shrink-0" />}
        <span className="font-medium text-white w-24">{label}</span>
        <span className={ok ? "text-muted" : "text-red-400"}>{ok ? okText : (failText ?? "")}</span>
      </div>
      {!ok && failHint && (
        <p className="text-xs text-muted/70 ml-7">{failHint}</p>
      )}
    </div>
  );
}
