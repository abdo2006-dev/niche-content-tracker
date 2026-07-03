export default function TagPill({ name, color }: { name: string; color?: string | null }) {
  const c = color ?? "#34d399";
  return <span className="tag-pill" style={{ color: c, borderColor: c + "55", backgroundColor: c + "1a" }}>{name}</span>;
}
