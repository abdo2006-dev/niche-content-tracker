"use client";
import { useEffect, useState } from "react";
import StatCard from "@/components/shared/StatCard";
import PostCard from "@/components/shared/PostCard";
import { LoadingState, ErrorState } from "@/components/shared/States";

const RANGES = [{ value:"day",label:"Today" },{ value:"week",label:"This week" },{ value:"month",label:"This month" },{ value:"all",label:"All time" }];

export default function DashboardPage() {
  const [range, setRange] = useState("week");
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string|null>(null);
  useEffect(() => {
    setData(null); setError(null);
    fetch("/api/dashboard?range=" + range).then(r=>r.json()).then(setData).catch(()=>setError("Failed to load dashboard."));
  }, [range]);
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white">Dashboard</h1>
          <p className="text-sm text-muted mt-0.5">Across all platforms and tracked creators.</p>
        </div>
        <div className="flex gap-1 bg-surface border border-border rounded-lg p-1">
          {RANGES.map(r => (
            <button key={r.value} onClick={()=>setRange(r.value)} className={"px-3 py-1.5 text-sm rounded-md transition-colors " + (range===r.value ? "bg-surface2 text-white" : "text-muted hover:text-white")}>
              {r.label}
            </button>
          ))}
        </div>
      </div>
      {error && <div className="card border-red-500/30 bg-red-500/5 text-sm text-red-400 text-center py-4">{error}</div>}
      {!data && !error && <LoadingState label="Loading dashboard…" />}
      {data && <>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Tracked creators" value={data.totalCreators} accent="blue" />
          <StatCard label="Tracked posts" value={data.totalPosts} accent="purple" />
          <StatCard label="Posted today" value={data.postedToday} accent="green" />
          <StatCard label="Posted this week" value={data.postedThisWeek} accent="green" />
        </div>
        <Section title="Top posts by views">{data.topByViews.map((p:any)=><PostCard key={p.id} post={p} />)}</Section>
        <Section title="Top posts by VPH">{data.topByVph.map((p:any)=><PostCard key={p.id} post={p} />)}</Section>
        <Section title="Fastest growing (24h)">{data.fastestGrowing.map((p:any)=><PostCard key={p.id} post={p} />)}</Section>
        <Section title="Recent posts">{data.recent.map((p:any)=><PostCard key={p.id} post={p} />)}</Section>
      </>}
    </div>
  );
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div><h2 className="text-sm font-medium text-white mb-3">{title}</h2><div className="grid md:grid-cols-2 gap-3">{children}</div></div>;
}
