import type { Platform } from "@prisma/client";

const META: Record<Platform, { label: string; color: string; bg: string }> = {
  YOUTUBE:   { label: "YouTube",   color: "#ff4444", bg: "#ff000020" },
  TIKTOK:    { label: "TikTok",    color: "#69c9d0", bg: "#69c9d020" },
  INSTAGRAM: { label: "Instagram", color: "#e1306c", bg: "#e1306c20" },
};

export default function PlatformBadge({ platform }: { platform: Platform }) {
  const m = META[platform];
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold rounded-full px-2 py-0.5 border" style={{ color: m.color, backgroundColor: m.bg, borderColor: m.color + "44" }}>
      {platform === "YOUTUBE" && <YoutubeIcon />}
      {platform === "TIKTOK" && <TikTokIcon />}
      {platform === "INSTAGRAM" && <InstagramIcon />}
      {m.label}
    </span>
  );
}

function YoutubeIcon() { return <svg width="10" height="10" viewBox="0 0 24 24" fill="#ff4444"><path d="M23.5 6.2a3 3 0 00-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 00.5 6.2C0 8.1 0 12 0 12s0 3.9.5 5.8a3 3 0 002.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 002.1-2.1C24 15.9 24 12 24 12s0-3.9-.5-5.8zM9.5 15.6V8.4l6.3 3.6-6.3 3.6z"/></svg>; }
function TikTokIcon() { return <svg width="10" height="10" viewBox="0 0 24 24" fill="#69c9d0"><path d="M19.6 3.3A4.5 4.5 0 0115.2 0h-3.3v15.6a2.2 2.2 0 01-2.2 2.1 2.2 2.2 0 01-2.2-2.2 2.2 2.2 0 012.2-2.2c.3 0 .6 0 .8.1V9.9a5.5 5.5 0 00-.8-.1A5.5 5.5 0 004.2 15.4a5.5 5.5 0 005.5 5.5 5.5 5.5 0 005.5-5.5V7.8A7.8 7.8 0 0019.6 9V5.7a4.5 4.5 0 01-4-.7v-1.7z"/></svg>; }
function InstagramIcon() { return <svg width="10" height="10" viewBox="0 0 24 24" fill="#e1306c"><path d="M12 2.2c3.2 0 3.6 0 4.9.1 3.3.1 4.8 1.7 4.9 4.9.1 1.3.1 1.6.1 4.8 0 3.2 0 3.6-.1 4.8-.1 3.2-1.7 4.8-4.9 4.9-1.3.1-1.6.1-4.9.1-3.2 0-3.6 0-4.8-.1-3.3-.1-4.8-1.7-4.9-4.9C2.2 15.6 2.2 15.2 2.2 12c0-3.2 0-3.6.1-4.8C2.4 3.9 4 2.3 7.2 2.3 8.4 2.2 8.8 2.2 12 2.2zM12 0C8.7 0 8.3 0 7.1.1 2.7.3.3 2.7.1 7.1 0 8.3 0 8.7 0 12c0 3.3 0 3.7.1 4.9.2 4.4 2.6 6.8 7 7C8.3 24 8.7 24 12 24c3.3 0 3.7 0 4.9-.1 4.4-.2 6.8-2.6 7-7 .1-1.2.1-1.6.1-4.9 0-3.3 0-3.7-.1-4.9C23.7 2.7 21.3.3 16.9.1 15.7 0 15.3 0 12 0zm0 5.8a6.2 6.2 0 100 12.4A6.2 6.2 0 0012 5.8zM12 16a4 4 0 110-8 4 4 0 010 8zm6.4-11.8a1.4 1.4 0 100 2.9 1.4 1.4 0 000-2.9z"/></svg>; }
