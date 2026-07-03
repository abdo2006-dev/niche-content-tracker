"use client";
import { useEffect, useState } from "react";
import { LoadingState, ErrorState } from "@/components/shared/States";
import { RefreshCw, CheckCircle, XCircle } from "lucide-react";

const SETTING_FIELDS = [
  { key:"refreshInterval_creatorSync", label:"Creator sync interval (hours)", min:1, max:24, hint:"Min time between post syncs per creator." },
  { key:"refreshInterval_statsUpdate", label:"Stats update interval (hours)", min:1, max:12, hint:"How often views/likes are re-fetched." },
  { key:"refreshInterval_keywordRefresh", label:"Keyword refresh interval (hours)", min:6, max:72, hint:"search.list is expensive — keep at 12h+ for YouTube." },
  { key:"maxPostsPerKeyword", label:"Max posts per keyword search", min:5, max:50, hint:"Results returned per platform per tracker." },
  { key:"maxTrendingDays", label:"Max trending age (days)", min:7, max:365, hint:"Posts older than this are archived from trackers." },
];

export default function SettingsPage() {
  const [settings, setSettings] = useState<any>(null);
  const [usage, setUsage] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string|null>(null);
  const [savingKey, setSavingKey] = useState<string|null>(null);
  const [syncing, setSyncing] = useState(false);
  const [updatingStats, setUpdatingStats] = useState(false);
  const [msg, setMsg] = useState<string|null>(null);

  function loadAll() {
    setLoading(true);
    Promise.all([fetch("/api/settings").then(r=>r.json()), fetch("/api/usage").then(r=>r.json())])
      .then(([s,u])=>{setSettings(s);setUsage(u);setLoading(false);})
      .catch(()=>{setError("Failed.");setLoading(false);});
  }
  useEffect(()=>{loadAll();},[]);

  async function save(key:string, value:string) {
    setSavingKey(key);
    await fetch("/api/settings",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({key,value})});
    setSavingKey(null); loadAll();
  }
  async function syncAll() { setSyncing(true); setMsg(null); const r=await fetch("/api/creators/sync-all",{method:"POST"}).then(r=>r.json()); setSyncing(false); setMsg("Synced " + (r.results?.filter((x:any)=>!x.skipped).length??0) + " creator(s)."); }
  async function updateStats() { setUpdatingStats(true); setMsg(null); const r=await fetch("/api/posts/stats-update",{method:"POST"}).then(r=>r.json()); setUpdatingStats(false); setMsg("Updated stats for " + (r.updated??0) + " post(s)."); }

  if (loading) return <LoadingState/>;
  if (error) return <ErrorState message={error}/>;
  if (!settings) return null;

  const platforms = [
    { label:"YouTube", key:"youtubeConfigured", docsUrl:"https://console.cloud.google.com/apis/library/youtube.googleapis.com", envVars:["YOUTUBE_API_KEY"] },
    { label:"TikTok",  key:"tiktokConfigured",  docsUrl:"https://developers.tiktok.com/products/research-api", envVars:["TIKTOK_CLIENT_KEY","TIKTOK_CLIENT_SECRET"] },
    { label:"Instagram",key:"instagramConfigured",docsUrl:"https://developers.facebook.com/docs/instagram-api",envVars:["INSTAGRAM_ACCESS_TOKEN","INSTAGRAM_BUSINESS_ACCOUNT_ID"] },
  ];

  return (
    <div className="space-y-6 max-w-2xl">
      <div><h1 className="text-xl font-semibold text-white">Settings</h1><p className="text-sm text-muted">Platform configuration, refresh intervals, and API usage.</p></div>
      <div className="card space-y-3">
        <h2 className="text-sm font-semibold text-white">Platform API status</h2>
        {platforms.map(p=>(
          <div key={p.key} className="flex items-start gap-3 py-2 border-b border-border last:border-0">
            {settings[p.key] ? <CheckCircle size={16} className="text-accent-green shrink-0 mt-0.5"/> : <XCircle size={16} className="text-red-400 shrink-0 mt-0.5"/>}
            <div>
              <p className={"text-sm font-medium " + (settings[p.key]?"text-accent-green":"text-red-400")}>{p.label} {settings[p.key]?"configured":"not configured"}</p>
              {!settings[p.key] && <p className="text-xs text-muted mt-0.5">Required env vars: <code className="text-accent-blue">{p.envVars.join(", ")}</code> — <a href={p.docsUrl} target="_blank" rel="noopener noreferrer" className="underline">Setup docs</a></p>}
            </div>
          </div>
        ))}
      </div>
      <div className="card space-y-2">
        <h2 className="text-sm font-semibold text-white">Cron jobs</h2>
        <label className="flex items-center gap-3 cursor-pointer"><input type="checkbox" checked={settings.cronEnabled==="true"} onChange={e=>save("cronEnabled",String(e.target.checked))} className="w-4 h-4"/><span className="text-sm text-muted">Enable scheduled cron jobs</span></label>
      </div>
      <div className="card space-y-4">
        <h2 className="text-sm font-semibold text-white">Refresh intervals</h2>
        {SETTING_FIELDS.map(({key,label,min,max,hint})=>(
          <div key={key} className="space-y-1">
            <label className="text-xs text-muted block">{label}</label>
            <div className="flex items-center gap-2">
              <input type="number" min={min} max={max} className="input w-24" defaultValue={settings[key]??""} onBlur={e=>{const v=Number(e.target.value);if(v>=min&&v<=max)save(key,String(v));}}/>
              {savingKey===key && <RefreshCw size={13} className="text-muted animate-spin"/>}
            </div>
            <p className="text-xs text-muted/70">{hint}</p>
          </div>
        ))}
      </div>
      <div className="card space-y-3">
        <h2 className="text-sm font-semibold text-white">Manual controls</h2>
        <div className="flex flex-wrap gap-2">
          <button onClick={syncAll} disabled={syncing} className="btn-secondary text-sm"><RefreshCw size={13} className={syncing?"animate-spin":""}/>{syncing?"Syncing…":"Sync all creators now"}</button>
          <button onClick={updateStats} disabled={updatingStats} className="btn-secondary text-sm"><RefreshCw size={13} className={updatingStats?"animate-spin":""}/>{updatingStats?"Updating…":"Update all stats now"}</button>
        </div>
        {msg && <p className="text-xs text-accent-green">{msg}</p>}
      </div>
      {usage && (
        <div className="card space-y-3">
          <div className="flex items-center justify-between"><h2 className="text-sm font-semibold text-white">API usage (last 24h)</h2><span className="text-sm font-medium text-accent-blue">{usage.last24h.totalUnits} units</span></div>
          {usage.last24h.byEndpoint.length===0 ? <p className="text-xs text-muted">No API calls in the last 24 hours.</p> : (
            <table className="w-full text-xs">
              <thead><tr className="text-muted text-left"><th className="pb-2">Platform</th><th className="pb-2">Endpoint</th><th className="pb-2 text-right">Calls</th><th className="pb-2 text-right">Units</th></tr></thead>
              <tbody className="divide-y divide-border">
                {usage.last24h.byEndpoint.map((r:any,i:number)=>(
                  <tr key={i}><td className="py-1.5 text-accent-blue">{r.platform}</td><td className="py-1.5 text-white">{r.endpoint}</td><td className="py-1.5 text-right text-muted">{r.calls}</td><td className="py-1.5 text-right text-muted">{r.units}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
