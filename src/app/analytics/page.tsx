"use client";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { BarChart3, Eye, Heart, Trophy, Upload } from "lucide-react";
import StatCard from "@/components/shared/StatCard";
import PlatformBadge from "@/components/shared/PlatformBadge";
import { LoadingState, ErrorState } from "@/components/shared/States";
import { formatNumber, formatRelativeTime } from "@/lib/format";

const PLATFORMS = [
  { value: "YOUTUBE", label: "YouTube" },
  { value: "TIKTOK", label: "TikTok" },
  { value: "ALL", label: "All platforms" },
];
const RANGES = [
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
];

export default function AnalyticsPage() {
  const [platform, setPlatform] = useState("YOUTUBE");
  const [range, setRange] = useState("30d");
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
    setError(null);
    const params = new URLSearchParams({ platform, range });
    fetch("/api/analytics?" + params)
      .then((r) => r.json())
      .then(setData)
      .catch(() => setError("Failed to load analytics."));
  }, [platform, range]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-white">Analytics</h1>
          <p className="text-sm text-muted mt-0.5">Creator output, views, and velocity for competitor tracking.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <select className="input" value={platform} onChange={(e) => setPlatform(e.target.value)}>
            {PLATFORMS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          <select className="input" value={range} onChange={(e) => setRange(e.target.value)}>
            {RANGES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </div>
      </div>

      {error && <ErrorState message={error} />}
      {!data && !error && <LoadingState label="Loading analytics..." />}
      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Creators posted" value={data.totals.creators} accent="blue" />
            <StatCard label="Posts tracked" value={data.totals.posts} accent="green" />
            <StatCard label="Total views" value={formatNumber(data.totals.views)} accent="purple" />
            <StatCard label="Total likes" value={formatNumber(data.totals.likes)} accent="orange" />
          </div>

          <Leaderboard
            title="Most Active Creators"
            icon={<Upload size={15} />}
            rows={data.mostActive}
            metric="posts"
            metricLabel="Posts"
          />
          <Leaderboard
            title="Top Creators By Views"
            icon={<Eye size={15} />}
            rows={data.topByViews}
            metric="views"
            metricLabel="Views"
          />
          <Leaderboard
            title="Best Average Views Per Post"
            icon={<Trophy size={15} />}
            rows={data.topByAvgViews}
            metric="avgViews"
            metricLabel="Avg views"
          />
          <Leaderboard
            title="Highest Best-Post VPH"
            icon={<BarChart3 size={15} />}
            rows={data.topByVph}
            metric="bestVph"
            metricLabel="Best VPH"
          />
        </>
      )}
    </div>
  );
}

function Leaderboard({ title, icon, rows, metric, metricLabel }: {
  title: string;
  icon: ReactNode;
  rows: any[];
  metric: "posts" | "views" | "avgViews" | "bestVph";
  metricLabel: string;
}) {
  return (
    <section className="card overflow-hidden">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-accent-green">{icon}</span>
        <h2 className="text-sm font-semibold text-white">{title}</h2>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted py-4">No creator activity in this range.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted border-b border-border">
                <th className="pb-2 font-medium">Creator</th>
                <th className="pb-2 font-medium text-right">{metricLabel}</th>
                <th className="pb-2 font-medium text-right">Views</th>
                <th className="pb-2 font-medium text-right">Avg views</th>
                <th className="pb-2 font-medium text-right">Likes</th>
                <th className="pb-2 font-medium text-right">Last post</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.slice(0, 12).map((row) => (
                <tr key={row.id}>
                  <td className="py-3 pr-3">
                    <div className="flex items-center gap-2 min-w-48">
                      <PlatformBadge platform={row.platform} />
                      <div className="min-w-0">
                        <p className="text-white font-medium truncate">{row.displayName}</p>
                        <p className="text-xs text-muted truncate">{row.username}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 text-right text-accent-green font-medium">{formatMetric(row[metric], metric)}</td>
                  <td className="py-3 text-right text-muted">{formatNumber(row.views)}</td>
                  <td className="py-3 text-right text-muted">{formatNumber(row.avgViews)}</td>
                  <td className="py-3 text-right text-muted"><span className="inline-flex items-center gap-1 justify-end"><Heart size={12} />{formatNumber(row.likes)}</span></td>
                  <td className="py-3 text-right text-muted">{row.latestPostAt ? formatRelativeTime(row.latestPostAt) : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function formatMetric(value: number | string, metric: string) {
  if (metric === "posts") return String(value);
  return formatNumber(value);
}
