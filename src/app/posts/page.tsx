"use client";
import { useEffect, useState, useCallback } from "react";
import PostCard from "@/components/shared/PostCard";
import { LoadingState, EmptyState, ErrorState } from "@/components/shared/States";
import { Search, SlidersHorizontal } from "lucide-react";

const PLATFORMS = [{ value:"",label:"All platforms" },{ value:"YOUTUBE",label:"YouTube" },{ value:"TIKTOK",label:"TikTok" },{ value:"INSTAGRAM",label:"Instagram" }];
const SORT_OPTIONS = [
  { value:"newest",label:"Newest" },{ value:"views",label:"Most views" },{ value:"likes",label:"Most likes" },
  { value:"vph",label:"Highest VPH" },{ value:"shares",label:"Most shares" },
  { value:"gained24h",label:"Views +24h" },{ value:"gained7d",label:"Views +7d" },{ value:"gained30d",label:"Views +30d" },
];
const DATE_RANGES = [
  { value:"",label:"All time" },{ value:"today",label:"Today" },{ value:"yesterday",label:"Yesterday" },
  { value:"7d",label:"Last 7 days" },{ value:"30d",label:"Last 30 days" },
];

export default function PostsPage() {
  const [posts, setPosts] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string|null>(null);
  const [tags, setTags] = useState<any[]>([]);
  const [creators, setCreators] = useState<any[]>([]);
  const [platform, setPlatform] = useState("");
  const [sort, setSort] = useState("newest");
  const [range, setRange] = useState("");
  const [tagId, setTagId] = useState("");
  const [creatorId, setCreatorId] = useState("");
  const [keyword, setKeyword] = useState("");
  const [shortsOnly, setShortsOnly] = useState(false);
  const [debouncedKeyword, setDebouncedKeyword] = useState("");

  useEffect(()=>{ const t=setTimeout(()=>setDebouncedKeyword(keyword),350); return ()=>clearTimeout(t); },[keyword]);
  useEffect(()=>{ fetch("/api/tags").then(r=>r.json()).then(setTags).catch(()=>{}); fetch("/api/creators").then(r=>r.json()).then(setCreators).catch(()=>{}); },[]);
  useEffect(()=>setPage(1),[platform,sort,range,tagId,creatorId,debouncedKeyword,shortsOnly]);

  const load = useCallback(()=>{
    setLoading(true);
    const p = new URLSearchParams({ sort, page:String(page), pageSize:"30", ...(platform&&{platform}), ...(range&&{range}), ...(tagId&&{tagId}), ...(creatorId&&{creatorId}), ...(debouncedKeyword&&{q:debouncedKeyword}), ...(shortsOnly&&{shortsOnly:"true"}) });
    fetch("/api/posts?" + p).then(r=>r.json()).then(d=>{setPosts(d.posts??[]);setTotal(d.total??0);setLoading(false);}).catch(()=>{setError("Failed.");setLoading(false);});
  },[platform,sort,page,range,tagId,creatorId,debouncedKeyword,shortsOnly]);
  useEffect(()=>{load();},[load]);

  const totalPages = Math.ceil(total/30);
  return (
    <div className="space-y-5">
      <div><h1 className="text-xl font-semibold text-white">Posts</h1><p className="text-sm text-muted">{total.toLocaleString()} post(s) tracked</p></div>
      <div className="card space-y-3">
        <div className="flex items-center gap-2 text-sm text-muted"><SlidersHorizontal size={14}/><span>Filters</span></div>
        <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-3">
          <div className="relative"><Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted"/><input className="input w-full pl-8" placeholder="Search titles…" value={keyword} onChange={e=>setKeyword(e.target.value)}/></div>
          <select className="input" value={platform} onChange={e=>setPlatform(e.target.value)}>{PLATFORMS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select>
          <select className="input" value={sort} onChange={e=>setSort(e.target.value)}>{SORT_OPTIONS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select>
          <select className="input" value={range} onChange={e=>setRange(e.target.value)}>{DATE_RANGES.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <select className="input" value={tagId} onChange={e=>setTagId(e.target.value)}>
            <option value="">All tags</option>{tags.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <select className="input" value={creatorId} onChange={e=>setCreatorId(e.target.value)}>
            <option value="">All creators</option>{creators.map(c=><option key={c.id} value={c.id}>{c.displayName}</option>)}
          </select>
          <label className="flex items-center gap-2 text-sm text-muted cursor-pointer">
            <input type="checkbox" checked={shortsOnly} onChange={e=>setShortsOnly(e.target.checked)}/> Short-form only
          </label>
        </div>
      </div>
      {error && <ErrorState message={error}/>}
      {loading && <LoadingState/>}
      {!loading && posts.length===0 && <EmptyState label="No posts match these filters."/>}
      {!loading && posts.length>0 && <>
        <div className="grid md:grid-cols-2 gap-3">{posts.map(p=><PostCard key={p.id} post={p}/>)}</div>
        {totalPages>1 && (
          <div className="flex justify-center gap-2 pt-2">
            <button disabled={page<=1} onClick={()=>setPage(page-1)} className="btn-secondary text-xs">← Prev</button>
            <span className="text-xs text-muted self-center">Page {page} of {totalPages}</span>
            <button disabled={page>=totalPages} onClick={()=>setPage(page+1)} className="btn-secondary text-xs">Next →</button>
          </div>
        )}
      </>}
    </div>
  );
}
