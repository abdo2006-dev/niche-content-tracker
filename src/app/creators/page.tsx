"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import TagPill from "@/components/shared/TagPill";
import TagSelector from "@/components/shared/TagSelector";
import PlatformBadge from "@/components/shared/PlatformBadge";
import { LoadingState, ErrorState, EmptyState } from "@/components/shared/States";
import { formatNumber, formatRelativeTime } from "@/lib/format";
import { RefreshCw, Trash2, Plus, X, Check } from "lucide-react";
import type { Platform } from "@prisma/client";

const PLATFORMS = [
  { value: "YOUTUBE",   label: "YouTube",   hint: "Channel URL, handle (@name), or channel ID (UC...)" },
  { value: "TIKTOK",    label: "TikTok",    hint: "Profile URL (tiktok.com/@name) or @username" },
  { value: "INSTAGRAM", label: "Instagram", hint: "Profile URL (instagram.com/name) or @username" },
];

async function readResponse(res: Response) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { error: text.slice(0, 300) };
  }
}

export default function CreatorsPage() {
  const [creators, setCreators] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string|null>(null);
  const [sort, setSort] = useState("lastPost");
  const [filterPlatform, setFilterPlatform] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [syncing, setSyncing] = useState<string|null>(null);
  const [editingTagsFor, setEditingTagsFor] = useState<string|null>(null);
  const [editingTagIds, setEditingTagIds] = useState<string[]>([]);

  function load() {
    setLoading(true);
    const p = new URLSearchParams({ sort, ...(filterPlatform && { platform: filterPlatform }) });
    fetch("/api/creators?" + p)
      .then(async (r) => {
        const d = await readResponse(r);
        if (!r.ok) throw new Error(d?.error ?? "Failed to load creators.");
        return d;
      })
      .then(d=>{setCreators(Array.isArray(d) ? d : []);setLoading(false);})
      .catch((err)=>{setError(err.message ?? "Failed.");setLoading(false);});
  }
  useEffect(()=>{load();},[sort, filterPlatform]);

  async function sync(id: string) {
    setSyncing(id);
    const res = await fetch("/api/creators/" + id + "/sync", { method: "POST" });
    const d = await readResponse(res); setSyncing(null);
    if (!res.ok) { alert(d?.error ?? "Sync failed."); return; }
    if ((d?.checked ?? 0) === 0) alert("Sync ran, but no public post list was available for this creator. TikTok may be hiding this account's video grid from server-side scraping.");
    else alert("Synced " + (d?.checked ?? 0) + " recent post(s). " + (d?.created ?? 0) + " new post(s).");
    load();
  }
  async function del(id: string, name: string) {
    if (!confirm("Delete \"" + name + "\" and all their tracked posts?")) return;
    await fetch("/api/creators/" + id, { method: "DELETE" }); load();
  }
  async function saveTags(id: string) {
    await fetch("/api/creators/" + id, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tagIds: editingTagIds }) });
    setEditingTagsFor(null); load();
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
      <div><h1 className="text-xl font-semibold text-white">Creators</h1><p className="text-sm text-muted">{creators.length} tracked · new creators fetch up to 14 days of posts</p></div>
        <div className="flex gap-2">
          <select value={filterPlatform} onChange={e=>setFilterPlatform(e.target.value)} className="input">
            <option value="">All platforms</option>
            {PLATFORMS.map(p=><option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          <select value={sort} onChange={e=>setSort(e.target.value)} className="input">
            <option value="lastPost">Latest post</option>
            <option value="followers">Followers</option>
            <option value="name">Name</option>
          </select>
          <button className="btn-primary" onClick={()=>setShowAdd(true)}><Plus size={15}/>Add creator</button>
        </div>
      </div>

      {showAdd && <AddCreatorForm onClose={()=>setShowAdd(false)} onAdded={load} />}
      {error && <div className="card border-red-500/30 text-red-400 text-sm py-4 text-center">{error}</div>}
      {loading && <LoadingState />}
      {!loading && creators.length === 0 && <EmptyState label="No creators tracked yet. Add a YouTube channel, TikToker, or Instagrammer to get started." />}

      <div className="space-y-3">
        {creators.map(c=>(
          <div key={c.id} className="card flex flex-col gap-3">
            <div className="flex items-start gap-3">
              <div className="relative w-10 h-10 rounded-full overflow-hidden bg-surface2 shrink-0">
                {c.avatarUrl && <Image src={c.avatarUrl} alt={c.displayName} fill className="object-cover" unoptimized />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <a href={c.profileUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-white hover:text-accent-blue transition-colors text-sm">{c.displayName}</a>
                  <PlatformBadge platform={c.platform} />
                </div>
                <p className="text-xs text-muted">{c.username}{c.followerCount ? " · " + formatNumber(c.followerCount) + " followers" : ""}{c.lastSyncedAt ? " · Synced " + formatRelativeTime(c.lastSyncedAt) : ""}</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button onClick={()=>sync(c.id)} disabled={syncing===c.id} className="btn-secondary text-xs px-2 py-1">
                  <RefreshCw size={13} className={syncing===c.id?"animate-spin":""}/> Sync
                </button>
                <button onClick={()=>del(c.id,c.displayName)} className="btn-danger text-xs px-2 py-1"><Trash2 size={13}/></button>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              {[{label:"Total posts",value:c._count?.posts??0},{label:"Today",value:c.postsToday},{label:"This week",value:c.postsWeek},{label:"Total views",value:formatNumber(c.totalTrackedViews??0)}].map(({label,value})=>(
                <div key={label} className="bg-surface2 rounded-lg px-3 py-2"><p className="text-muted">{label}</p><p className="text-white font-medium">{value}</p></div>
              ))}
            </div>
            {editingTagsFor===c.id ? (
              <div className="space-y-2">
                <TagSelector selected={editingTagIds} onChange={setEditingTagIds}/>
                <div className="flex gap-2">
                  <button onClick={()=>saveTags(c.id)} className="btn-primary text-xs px-3 py-1.5"><Check size={13}/>Save</button>
                  <button onClick={()=>setEditingTagsFor(null)} className="btn-secondary text-xs px-3 py-1.5"><X size={13}/>Cancel</button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 flex-wrap">
                {c.tags.map((ct:any)=><TagPill key={ct.tag.id} name={ct.tag.name} color={ct.tag.color}/>)}
                <button onClick={()=>{setEditingTagsFor(c.id);setEditingTagIds(c.tags.map((ct:any)=>ct.tag.id));}} className="text-xs text-muted hover:text-white transition-colors">{c.tags.length?"Edit tags":"+ Add tags"}</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function AddCreatorForm({ onClose, onAdded }: { onClose: ()=>void; onAdded: ()=>void }) {
  const [platform, setPlatform] = useState<Platform>("YOUTUBE");
  const [input, setInput] = useState("");
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [fetchRecent, setFetchRecent] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string|null>(null);
  const hint = PLATFORMS.find(p=>p.value===platform)?.hint ?? "";

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setError(null);
    const res = await fetch("/api/creators", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ platform, input, tagIds, fetchRecent }) });
    const data = await readResponse(res); setLoading(false);
    if (!res.ok) { setError(data?.error ?? "Failed to add."); return; }
    onAdded(); onClose();
    if (fetchRecent) {
      if (data?.syncError) alert("Creator added, but initial post fetch failed: " + data.syncError);
      else if ((data?.postsChecked ?? 0) === 0) alert("Creator added, but no public posts were found in the recent fetch window.");
      else alert("Creator added. Fetched " + (data?.postsCreated ?? 0) + " new post(s) from " + (data?.postsChecked ?? 0) + " recent post(s).");
    }
  }

  return (
    <div className="card border-accent-blue/30 space-y-4">
      <div className="flex items-center justify-between"><h2 className="text-sm font-semibold text-white">Add creator</h2><button onClick={onClose} className="text-muted hover:text-white"><X size={16}/></button></div>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="text-xs text-muted block mb-1.5">Platform</label>
          <div className="flex gap-2">
            {PLATFORMS.map(p=>(
              <button key={p.value} type="button" onClick={()=>setPlatform(p.value as Platform)}
                className={"btn text-xs py-1.5 px-3 " + (platform===p.value ? "btn-primary" : "btn-secondary")}>
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-xs text-muted block mb-1.5">Profile URL or handle</label>
          <input className="input w-full" placeholder={hint} value={input} onChange={e=>setInput(e.target.value)} required />
        </div>
        <div><label className="text-xs text-muted block mb-1.5">Tags</label><TagSelector selected={tagIds} onChange={setTagIds}/></div>
        <label className="flex items-center gap-2 text-sm text-muted cursor-pointer">
          <input type="checkbox" checked={fetchRecent} onChange={e=>setFetchRecent(e.target.checked)}/> Fetch recent posts when adding
        </label>
        {error && <p className="text-xs text-red-400">{error}</p>}
        <div className="flex gap-2">
          <button type="submit" disabled={loading} className="btn-primary">{loading?"Adding…":"Add creator"}</button>
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
        </div>
      </form>
    </div>
  );
}
