"use client";
import { useEffect, useState } from "react";
import TagPill from "./TagPill";
interface Tag { id: string; name: string; color: string | null; }
export default function TagSelector({ selected, onChange }: { selected: string[]; onChange: (ids: string[]) => void }) {
  const [tags, setTags] = useState<Tag[]>([]);
  useEffect(() => { fetch("/api/tags").then(r=>r.json()).then(setTags).catch(()=>{}); }, []);
  if (!tags.length) return <p className="text-xs text-muted">No tags yet — create some on the Tags page.</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map(tag => (
        <button key={tag.id} type="button" onClick={() => onChange(selected.includes(tag.id) ? selected.filter(t=>t!==tag.id) : [...selected, tag.id])} className={selected.includes(tag.id) ? "opacity-100" : "opacity-40 hover:opacity-70"}>
          <TagPill name={tag.name} color={tag.color} />
        </button>
      ))}
    </div>
  );
}
