"use client";
import { useEffect, useState } from "react";
import PostCard from "@/components/shared/PostCard";
import { LoadingState, EmptyState, ErrorState } from "@/components/shared/States";
import { formatNumber } from "@/lib/format";
import Image from "next/image";
import PlatformBadge from "@/components/shared/PlatformBadge";
import { Sparkles, TrendingUp, Zap, BarChart3, Hash, StickyNote } from "lucide-react";

export default function IdeasPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string|null>(null);
  useEffect(()=>{ fetch("/api/ideas").then(r=>r.json()).then(setData).catch(()=>setError("Failed.")).finally(()=>setLoading(false)); },[]);

  return (
    <div className="space-y-8">
      <div><h1 className="text-xl font-semibold text-white flex items-center gap-2"><Sparkles size={18} className="text-accent-purple"/>Ideas</h1><p className="text-sm text-muted">Outliers, trends, and inspiration across all tracked platforms.</p></div>
      {error && <ErrorState message={error}/>}
      {loading && <LoadingState label="Analysing posts…"/>}
      {data && <>
        <Section icon={<Zap size={15} className="text-accent-purple"/>} title="Outlier posts" subtitle="Performing 3× better than their creator average">
          {data.outliers.length===0 ? <EmptyState label="No outliers yet. Add more creators and let the tracker run." /> :
            <div className="grid md:grid-cols-2 gap-3">{data.outliers.map((p:any)=><OutlierCard key={p.id} post={p}/>)}</div>}
        </Section>
        <Section icon={<TrendingUp size={15} className="text-accent-green"/>} title="Fastest growing (24h)" subtitle="Posts gaining the most views right now">
          {data.fastestGrowing.length===0 ? <EmptyState label="No growth data yet."/> :
            <div className="grid md:grid-cols-2 gap-3">{data.fastestGrowing.map((p:any)=><PostCard key={p.id} post={p}/>)}</div>}
        </Section>
        <Section icon={<Zap size={15} className="text-accent-blue"/>} title="Highest VPH (7 days)" subtitle="Best views-per-hour recently">
          {data.topByVph.length===0 ? <EmptyState label="No VPH data yet."/> :
            <div className="grid md:grid-cols-2 gap-3">{data.topByVph.map((p:any)=><PostCard key={p.id} post={p}/>)}</div>}
        </Section>
        <Section icon={<Hash size={15} className="text-accent-purple"/>} title="Top keywords in titles/captions" subtitle="Most frequent words across tracked content (last 30 days)">
          {data.topKeywords.length===0 ? <EmptyState label="Not enough posts to analyse."/> :
            <div className="flex flex-wrap gap-2">{data.topKeywords.map(({word,count}:any)=>(
              <div key={word} className="bg-surface2 border border-border rounded-lg px-3 py-2 flex items-center gap-2">
                <span className="text-sm text-white font-medium">{word}</span>
                <span className="text-xs text-muted">{count}×</span>
              </div>
            ))}</div>}
        </Section>
        <Section icon={<BarChart3 size={15} className="text-accent-green"/>} title="Best creators by avg VPH" subtitle="Consistently high-performing creators (last 30 days)">
          {data.topCreatorsByVph.length===0 ? <EmptyState label="No creator data yet."/> :
            <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">{data.topCreatorsByVph.map((c:any)=>(
              <div key={c.id} className="card flex items-center gap-3">
                <div className="relative w-9 h-9 rounded-full overflow-hidden bg-surface2 shrink-0">
                  {c.avatarUrl && <Image src={c.avatarUrl} alt={c.displayName} fill className="object-cover" unoptimized/>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5"><p className="text-sm text-white font-medium truncate">{c.displayName}</p><PlatformBadge platform={c.platform}/></div>
                  <p className="text-xs text-muted">{c.recentPosts} posts (30d)</p>
                  <p className="text-xs text-accent-green mt-0.5">avg {formatNumber(c.avgVph)} VPH</p>
                </div>
              </div>
            ))}</div>}
        </Section>
      </>}
    </div>
  );
}

function Section({ icon, title, subtitle, children }: { icon:React.ReactNode; title:string; subtitle:string; children:React.ReactNode }) {
  return <div className="space-y-3"><div><h2 className="text-sm font-semibold text-white flex items-center gap-2">{icon}{title}</h2><p className="text-xs text-muted mt-0.5">{subtitle}</p></div>{children}</div>;
}

function OutlierCard({ post }: { post:any }) {
  const [note, setNote] = useState(post.ideaNotes?.[0]?.content ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  async function saveNote() {
    setSaving(true);
    const existing = post.ideaNotes?.[0];
    if (existing) await fetch("/api/notes/" + existing.id, { method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify({content:note}) });
    else await fetch("/api/notes", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({postId:post.id,content:note}) });
    setSaving(false); setSaved(true); setTimeout(()=>setSaved(false),2000);
  }
  return (
    <div className="card space-y-3">
      <PostCard post={post}/>
      <div>
        <label className="text-xs text-muted flex items-center gap-1.5 mb-1.5"><StickyNote size={12}/>Idea note</label>
        <textarea className="input w-full text-xs resize-none" rows={2} placeholder="Why is this interesting? What would you copy?" value={note} onChange={e=>setNote(e.target.value)}/>
        <button onClick={saveNote} disabled={saving||!note.trim()} className="btn-secondary text-xs mt-1.5 px-3 py-1">{saved?"✓ Saved":saving?"Saving…":"Save note"}</button>
      </div>
    </div>
  );
}
