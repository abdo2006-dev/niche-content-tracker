"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import PlatformBadge from "@/components/shared/PlatformBadge";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/States";
import { Check, ExternalLink, ListPlus, Plus, Trash2 } from "lucide-react";
import { formatNumber, formatRelativeTime } from "@/lib/format";

function videoTitle(item: any) {
  return item.post?.title ?? item.title ?? "Untitled video";
}

function videoUrl(item: any) {
  return item.post?.url ?? item.url ?? "#";
}

export default function TodoPage() {
  const [groups, setGroups] = useState<any[]>([]);
  const [ungrouped, setUngrouped] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string|null>(null);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [groupTitle, setGroupTitle] = useState("");
  const [notes, setNotes] = useState("");

  function load() {
    setLoading(true);
    fetch("/api/todos")
      .then(r=>r.json())
      .then(d=>{setGroups(d.groups??[]); setUngrouped(d.ungrouped??[]); setLoading(false);})
      .catch(()=>{setError("Failed to load to-do videos."); setLoading(false);});
  }
  useEffect(()=>{load();},[]);

  async function addManual(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/todos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, url, groupTitle: groupTitle || undefined, notes: notes || undefined }),
    });
    if (!res.ok) { setError("Could not add video."); return; }
    setTitle(""); setUrl(""); setGroupTitle(""); setNotes(""); load();
  }

  async function patch(id: string, body: any) {
    await fetch("/api/todos/" + id, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    load();
  }

  async function remove(id: string) {
    if (!confirm("Remove this video from your to-do list?")) return;
    await fetch("/api/todos/" + id, { method: "DELETE" });
    load();
  }

  const total = groups.reduce((n,g)=>n+(g.videos?.length??0), ungrouped.length);
  const done = [...groups.flatMap(g=>g.videos??[]), ...ungrouped].filter((v:any)=>v.done).length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-white">To-Do Videos</h1>
        <p className="text-sm text-muted">{done} done · {total} saved · grouped by reusable content idea</p>
      </div>

      <form onSubmit={addManual} className="card space-y-3">
        <div className="flex items-center gap-2 text-sm text-muted"><ListPlus size={14}/><span>Add video URL manually</span></div>
        <div className="grid md:grid-cols-2 gap-3">
          <input className="input w-full" placeholder="Video title or idea" value={title} onChange={e=>setTitle(e.target.value)} required />
          <input className="input w-full" placeholder="https://..." value={url} onChange={e=>setUrl(e.target.value)} required />
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          <input className="input w-full" placeholder="Group, e.g. Admin abuse codes" value={groupTitle} onChange={e=>setGroupTitle(e.target.value)} />
          <input className="input w-full" placeholder="Notes" value={notes} onChange={e=>setNotes(e.target.value)} />
        </div>
        <button className="btn-primary" type="submit"><Plus size={15}/>Add video</button>
      </form>

      {error && <ErrorState message={error}/>}
      {loading && <LoadingState/>}
      {!loading && total === 0 && <EmptyState label="No saved video ideas yet. Add videos from Posts or paste a video URL here."/>}

      {!loading && ungrouped.length > 0 && (
        <TodoGroup title="Ungrouped" videos={ungrouped} groups={groups} onPatch={patch} onRemove={remove}/>
      )}

      {!loading && groups.map(group => (
        <TodoGroup key={group.id} title={group.title} videos={group.videos??[]} groups={groups} onPatch={patch} onRemove={remove}/>
      ))}
    </div>
  );
}

function TodoGroup({ title, videos, groups, onPatch, onRemove }: { title: string; videos: any[]; groups: any[]; onPatch: (id:string, body:any)=>void; onRemove: (id:string)=>void }) {
  if (!videos.length) return null;
  const done = videos.filter(v=>v.done).length;
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-white">{title}</h2>
        <p className="text-xs text-muted">{done}/{videos.length} done</p>
      </div>
      <div className="grid lg:grid-cols-2 gap-3">
        {videos.map(item => <TodoItem key={item.id} item={item} groups={groups} onPatch={onPatch} onRemove={onRemove}/>)}
      </div>
    </section>
  );
}

function TodoItem({ item, groups, onPatch, onRemove }: { item: any; groups: any[]; onPatch: (id:string, body:any)=>void; onRemove: (id:string)=>void }) {
  const post = item.post;
  return (
    <div className={"card flex gap-3 " + (item.done ? "opacity-60" : "")}>
      <div className="relative w-32 h-20 shrink-0 rounded-lg overflow-hidden bg-surface2">
        {post?.thumbnailUrl && <Image src={post.thumbnailUrl} alt={videoTitle(item)} fill className="object-cover" unoptimized/>}
      </div>
      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              {post?.platform && <PlatformBadge platform={post.platform}/>}
              {post?.viewCount && <span className="text-xs text-muted">{formatNumber(post.viewCount)} views</span>}
            </div>
            <a href={videoUrl(item)} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-white line-clamp-2 hover:text-accent-blue transition-colors">
              {videoTitle(item)}
            </a>
            <p className="text-xs text-muted">
              {post?.creator?.displayName ?? "Manual"}{post?.publishedAt ? " · " + formatRelativeTime(post.publishedAt) : ""}
            </p>
          </div>
          <div className="flex gap-1 shrink-0">
            <button onClick={()=>onPatch(item.id, { done: !item.done })} className={item.done ? "btn-primary text-xs px-2 py-1" : "btn-secondary text-xs px-2 py-1"} title={item.done ? "Mark not done" : "Mark done"}><Check size={13}/></button>
            <a href={videoUrl(item)} target="_blank" rel="noopener noreferrer" className="btn-secondary text-xs px-2 py-1" title="Open video"><ExternalLink size={13}/></a>
            <button onClick={()=>onRemove(item.id)} className="btn-danger text-xs px-2 py-1" title="Remove"><Trash2 size={13}/></button>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <select className="input text-xs py-1" value={item.groupId ?? ""} onChange={e=>onPatch(item.id, { groupId: e.target.value || null })}>
            <option value="">Ungrouped</option>
            {groups.map(g=><option key={g.id} value={g.id}>{g.title}</option>)}
          </select>
          <input className="input text-xs py-1 flex-1 min-w-[180px]" placeholder="Notes" defaultValue={item.notes ?? ""} onBlur={e=>onPatch(item.id, { notes: e.target.value })}/>
        </div>
      </div>
    </div>
  );
}
