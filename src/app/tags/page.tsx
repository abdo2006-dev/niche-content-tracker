"use client";
import { useEffect, useState } from "react";
import TagPill from "@/components/shared/TagPill";
import { LoadingState, EmptyState, ErrorState } from "@/components/shared/States";
import { Plus, Trash2, Pencil, Check, X } from "lucide-react";
const COLORS = ["#34d399","#60a5fa","#a78bfa","#f59e0b","#f87171","#fb923c","#38bdf8","#e1306c","#4ade80","#69c9d0"];
export default function TagsPage() {
  const [tags, setTags] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string|null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<string|null>(null);
  const [editName, setEditName] = useState(""); const [editColor, setEditColor] = useState("");
  const [newName, setNewName] = useState(""); const [newColor, setNewColor] = useState(COLORS[0]);
  const [creating, setCreating] = useState(false); const [createErr, setCreateErr] = useState<string|null>(null);
  function load() { setLoading(true); fetch("/api/tags").then(r=>r.json()).then(d=>{setTags(d);setLoading(false);}).catch(()=>{setError("Failed.");setLoading(false);}); }
  useEffect(()=>{load();},[]);
  async function create(e:React.FormEvent) {
    e.preventDefault(); setCreating(true); setCreateErr(null);
    const res = await fetch("/api/tags",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:newName,color:newColor})});
    const d = await res.json(); setCreating(false);
    if (!res.ok) { setCreateErr(d.error??"Failed."); return; }
    setNewName(""); setShowAdd(false); load();
  }
  async function saveEdit(id:string) {
    await fetch("/api/tags/"+id,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:editName,color:editColor})});
    setEditing(null); load();
  }
  async function del(id:string,name:string) {
    if (!confirm("Delete \""+name+"\"?")) return;
    await fetch("/api/tags/"+id,{method:"DELETE"}); load();
  }
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div><h1 className="text-xl font-semibold text-white">Tags</h1><p className="text-sm text-muted">{tags.length} tag(s)</p></div>
        <button className="btn-primary" onClick={()=>setShowAdd(!showAdd)}><Plus size={15}/>New tag</button>
      </div>
      {showAdd && (
        <form onSubmit={create} className="card border-accent-green/30 flex flex-wrap items-end gap-3">
          <div><label className="text-xs text-muted block mb-1.5">Name</label><input className="input" placeholder="MM2, Competitor…" value={newName} onChange={e=>setNewName(e.target.value)} required/></div>
          <div><label className="text-xs text-muted block mb-1.5">Color</label><div className="flex gap-1.5">{COLORS.map(c=><button key={c} type="button" onClick={()=>setNewColor(c)} className="w-6 h-6 rounded-full border-2 hover:scale-110 transition-transform" style={{backgroundColor:c,borderColor:newColor===c?"white":"transparent"}}/>)}</div></div>
          {newName && <div><label className="text-xs text-muted block mb-1.5">Preview</label><TagPill name={newName} color={newColor}/></div>}
          {createErr && <p className="text-xs text-red-400 w-full">{createErr}</p>}
          <div className="flex gap-2"><button type="submit" disabled={creating} className="btn-primary">{creating?"Creating…":"Create"}</button><button type="button" onClick={()=>setShowAdd(false)} className="btn-secondary"><X size={14}/>Cancel</button></div>
        </form>
      )}
      {error && <ErrorState message={error}/>}
      {loading && <LoadingState/>}
      {!loading && tags.length===0 && <EmptyState label="No tags yet."/>}
      {!loading && tags.length>0 && (
        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
          {tags.map(tag=>(
            <div key={tag.id} className="card space-y-3">
              {editing===tag.id ? (
                <div className="space-y-3">
                  <input className="input w-full" value={editName} onChange={e=>setEditName(e.target.value)} autoFocus/>
                  <div className="flex gap-1.5">{COLORS.map(c=><button key={c} type="button" onClick={()=>setEditColor(c)} className="w-5 h-5 rounded-full border-2 hover:scale-110 transition-transform" style={{backgroundColor:c,borderColor:editColor===c?"white":"transparent"}}/>)}</div>
                  <div className="flex gap-2"><button onClick={()=>saveEdit(tag.id)} className="btn-primary text-xs px-2 py-1"><Check size={13}/>Save</button><button onClick={()=>setEditing(null)} className="btn-secondary text-xs px-2 py-1"><X size={13}/>Cancel</button></div>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <TagPill name={tag.name} color={tag.color}/>
                    <div className="flex gap-1">
                      <button onClick={()=>{setEditing(tag.id);setEditName(tag.name);setEditColor(tag.color??COLORS[0]);}} className="text-muted hover:text-white p-1"><Pencil size={13}/></button>
                      <button onClick={()=>del(tag.id,tag.name)} className="text-muted hover:text-red-400 p-1"><Trash2 size={13}/></button>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    {[{label:"Creators",value:tag._count?.creatorTags??0},{label:"Posts",value:tag._count?.postTags??0},{label:"Keywords",value:tag._count?.keywordTags??0}].map(({label,value})=>(
                      <div key={label} className="bg-surface2 rounded px-2 py-1.5"><p className="text-muted">{label}</p><p className="text-white font-medium">{value}</p></div>
                    ))}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
