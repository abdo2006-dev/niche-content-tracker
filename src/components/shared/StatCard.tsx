export default function StatCard({ label, value, accent = "green" }: { label: string; value: string | number; accent?: "green"|"blue"|"purple"|"orange" }) {
  const cls = { green: "text-accent-green", blue: "text-accent-blue", purple: "text-accent-purple", orange: "text-accent-orange" }[accent];
  return (
    <div className="card">
      <p className="text-xs text-muted uppercase tracking-wide">{label}</p>
      <p className={"text-2xl font-semibold mt-1.5 " + cls}>{value}</p>
    </div>
  );
}
