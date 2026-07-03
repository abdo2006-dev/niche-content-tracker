"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Users, FileVideo, TrendingUp, Lightbulb, Tag, Settings, ListChecks } from "lucide-react";

const links = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/creators", label: "Creators", icon: Users },
  { href: "/posts", label: "Posts", icon: FileVideo },
  { href: "/todo", label: "To-Do Videos", icon: ListChecks },
  { href: "/trending", label: "Trending", icon: TrendingUp },
  { href: "/ideas", label: "Ideas", icon: Lightbulb },
  { href: "/tags", label: "Tags", icon: Tag },
  { href: "/settings", label: "Settings", icon: Settings },
];

export default function Nav() {
  const pathname = usePathname();
  return (
    <aside className="w-60 shrink-0 border-r border-border bg-surface hidden md:flex md:flex-col">
      <div className="px-5 py-5 border-b border-border">
        <p className="font-semibold text-white leading-tight">Content Tracker</p>
        <p className="text-xs text-muted mt-0.5">YouTube · TikTok · Instagram</p>
      </div>
      <nav className="flex-1 p-3 space-y-1">
        {links.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link key={href} href={href} className={"flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors " + (active ? "bg-surface2 text-white border border-border" : "text-muted hover:text-white hover:bg-surface2/60")}>
              <Icon size={16} />{label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
