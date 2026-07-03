"use client";
import { useEffect, useState } from "react";
import PostCard from "@/components/shared/PostCard";
import TagSelector from "@/components/shared/TagSelector";
import TagPill from "@/components/shared/TagPill";
import { LoadingState, EmptyState, ErrorState } from "@/components/shared/States";
import { formatRelativeTime } from "@/lib/format";
import { Plus, RefreshCw, Trash2, X, ChevronDown, ChevronUp } from "lucide-react";

const PLATFORMS = [{ value:"YOUTUBE",label:"YouTube" },{ value:"TIKTOK",label:"TikTok" },{ value:"INSTAGRAM",label:"Instagram" }];
const SORT_OPTIONS = [{ value:"vph",label:"VPH" },{ value:"views",label:"Most views" },{ value:"shares",label:"Most shares" },{ value:"gained24h",label:"+24h views" },{ value:"gained7d",label:"+7d views" },{ value:"newest",label:"Newest" }];

export default function TrendingPage() {
  const [trackers, setTrackers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [error, setError] = useState<string|null>(null);
  function load() { setLoading(true); fetch("/api/keywords").then(r=>r.json()).then(d=>{setTrackers(d);setLoading(false);}).catch(()=>{setError("Failed.");setLoading(false);}); }
  useEffect(()=>{load();},[]);
  async function del(id:string, q:string) {
    if (!confirm("Archive tracker for \"" + q + "\"?")) return;
    await fetch("/api/keywords/" + id, { method:"DELETE" }); load();
  }
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div><h1 className="text-xl font-semibold text-white">Trending</h1><p className="text-sm text-muted">Track keywords and hashtags across YouTube, TikTok, and Instagram.</p></div>
        <button className="btn-primary" onClick={()=>setShowAdd(true)}><Plus size={15}/>Add keyword</button>
      </div>
      {showAdd && <AddKeywordForm onClose={()=>setShowAdd(false)} onAdded={load}/>}
      {error && <ErrorState message={error}/>}
      {loading && <LoadingState/>}
      {!loading && trackers.length===0 && <EmptyState label="No keyword trackers yet. Add a hashtag like #mm2 to get started."/>}
      {trackers.map(t=><TrackerPanel key={t.id} tracker={t} onDelete={()=>del(t.id,t.query)} onRefreshed={load}/>)}
    </div>
  );
}

function TrackerPanel({ tracker, onDelete, onRefreshed }: { tracker:any; onDelete:()=>void; onRefreshed:()=>void }) {
  const [expanded, setExpanded] = useState(false);
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string|null>(null);
  const [sort, setSort] = useState("vph");

  function loadPosts() {
    setLoading(true);
    fetch("/api/keywords/" + tracker.id + "?sort=" + sort).then(r=>r.json()).then(d=>{setPosts(d);setLoading(false);}).catch(()=>setLoading(false));
  }
  useEffect(()=>{ if (expanded) loadPosts(); },[expanded, sort]);

  async function refresh() {
    setRefreshing(true); setRefreshError(null);
    const res = await fetch("/api/keywords/" + tracker.id + "/refresh", { method:"POST" });
    const d = await res.json(); setRefreshing(false);
    if (!res.ok) { setRefreshError(d.error ?? "Failed."); return; }
    onRefreshed(); if (expanded) loadPosts();
  }

  return (
    <div className="card space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-white">{tracker.query}</span>
            <div className="flex gap-1">
              {(tracker.platforms ?? []).map((p:string)=>(
                <span key={p} className={"text-[10px] font-semibold rounded-full px-2 py-0.5 border " + (p==="YOUTUBE"?"text-red-400 border-red-400/30 bg-red-400/10":p==="TIKTOK"?"text-tiktok border-tiktok/30 bg-tiktok/10":"text-instagram border-instagram/30 bg-instagram/10")}>{p==="YOUTUBE"?"YT":p==="TIKTOK"?"TK":"IG"}</span>
              ))}
            </div>
            {tracker.tags.map((tt:any)=><TagPill key={tt.tag.id} name={tt.tag.name} color={tt.tag.color}/>)}
          </div>
          <p className="text-xs text-muted mt-0.5">{tracker._count.posts} post(s) · {tracker.lastFetchedAt ? "Last refreshed " + formatRelativeTime(tracker.lastFetchedAt) : "Never refreshed"}</p>
          {refreshError && <p className="text-xs text-red-400 mt-1">{refreshError}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={refresh} disabled={refreshing} className="btn-secondary text-xs px-2 py-1"><RefreshCw size={13} className={refreshing?"animate-spin":""}/>Refresh</button>
          <button onClick={onDelete} className="btn-danger text-xs px-2 py-1"><Trash2 size={13}/></button>
          <button onClick={()=>setExpanded(!expanded)} className="btn-secondary text-xs px-2 py-1">{expanded?<ChevronUp size={13}/>:<ChevronDown size={13}/>}{expanded?"Collapse":"Show posts"}</button>
        </div>
      </div>
      {expanded && (
        <div className="space-y-3 border-t border-border pt-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted">Sort by:</span>
            <select className="input text-xs py-1" value={sort} onChange={e=>setSort(e.target.value)}>{SORT_OPTIONS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select>
          </div>
          {loading && <LoadingState/>}
          {!loading && posts.length===0 && <EmptyState label="No posts yet. Click Refresh to fetch."/>}
          {!loading && posts.length>0 && <div className="grid md:grid-cols-2 gap-3">{posts.map((p:any)=><PostCard key={p.id} post={p}/>)}</div>}
        </div>
      )}
    </div>
  );
}

function AddKeywordForm({ onClose, onAdded }: { onClose:()=>void; onAdded:()=>void }) {
  const [query, setQuery] = useState("");
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(["YOUTUBE","TIKTOK","INSTAGRAM"]);
  const [shortsOnly, setShortsOnly] = useState(false);
  const [maxAgeDays, setMaxAgeDays] = useState(30);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string|null>(null);

  function togglePlatform(p:string) {
    setSelectedPlatforms(prev => prev.includes(p) ? prev.filter(x=>x!==p) : [...prev, p]);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setError(null);
    const res = await fetch("/api/keywords", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ query, platforms:selectedPlatforms, shortsOnly, maxAgeDays, tagIds }) });
    const d = await res.json(); setLoading(false);
    if (!res.ok) { setError(d.error ?? "Failed."); return; }
    onAdded(); onClose();
  }

  return (
    <div className="card border-accent-purple/30 space-y-4">
      <div className="flex items-center justify-between"><h2 className="text-sm font-semibold text-white">Add keyword tracker</h2><button onClick={onClose} className="text-muted hover:text-white"><X size={16}/></button></div>
      <p className="text-xs text-muted">Each platform search costs API quota. TikTok/Instagram require their APIs to be configured in environment variables.</p>
      <form onSubmit={submit} className="space-y-4">
        <div><label className="text-xs text-muted block mb-1.5">Keyword or hashtag</label><input className="input w-full" placeholder="#mm2, grow a garden roblox, …" value={query} onChange={e=>setQuery(e.target.value)} required/></div>
        <div>
          <label className="text-xs text-muted block mb-1.5">Search on platforms</label>
          <div className="flex gap-2">
            {PLATFORMS.map(p=>(
              <button key={p.value} type="button" onClick={()=>togglePlatform(p.value)} className={"btn text-xs py-1.5 px-3 " + (selectedPlatforms.includes(p.value)?"btn-primary":"btn-secondary")}>{p.label}</button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-muted cursor-pointer"><input type="checkbox" checked={shortsOnly} onChange={e=>setShortsOnly(e.target.checked)}/> Short-form only</label>
          <div className="flex items-center gap-2"><label className="text-xs text-muted">Track for</label><input type="number" min={1} max={365} className="input w-16 text-center" value={maxAgeDays} onChange={e=>setMaxAgeDays(Number(e.target.value))}/><span className="text-xs text-muted">days</span></div>
        </div>
        <div><label className="text-xs text-muted block mb-1.5">Tags</label><TagSelector selected={tagIds} onChange={setTagIds}/></div>
        {error && <p className="text-xs text-red-400">{error}</p>}
        <div className="flex gap-2">
          <button type="submit" disabled={loading||selectedPlatforms.length===0} className="btn-primary">{loading?"Adding…":"Add tracker"}</button>
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
        </div>
      </form>
    </div>
  );
}
