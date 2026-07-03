export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return <p className="text-sm text-muted py-8 text-center">{label}</p>;
}
export function EmptyState({ label }: { label: string }) {
  return <div className="card text-center py-10"><p className="text-sm text-muted">{label}</p></div>;
}
export function ErrorState({ message }: { message: string }) {
  return <div className="card border-red-500/30 bg-red-500/5 text-center py-6"><p className="text-sm text-red-400">{message}</p></div>;
}
