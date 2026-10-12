"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { cn } from "@/lib/utils";
import { GitCompare, LayoutDashboard, History, FolderGit2, Settings } from "lucide-react";

const NAV = [
  { href: "/overview", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/reviews", label: "Reviews", icon: History, exact: false },
  { href: "/repositories", label: "Repositories", icon: FolderGit2, exact: false },
  { href: "/settings", label: "Settings", icon: Settings, exact: false },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-neutral-800 bg-neutral-950 max-md:hidden">
      <Link href="/overview" className="flex items-center gap-2 px-5 pb-5 pt-6">
        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-neutral-100 text-neutral-950"><GitCompare size={18} /></span>
        <span className="text-base font-semibold tracking-tight">ReviewKit</span>
      </Link>
      <nav className="flex flex-col gap-1 px-3" aria-label="Primary">
        {NAV.map((n) => {
          const active = n.exact ? pathname === n.href : pathname.startsWith(n.href);
          return (
            <Link key={n.href} href={n.href}
              className={cn("flex items-center gap-2.5 rounded-md px-3 py-2 text-sm",
                active ? "bg-neutral-900 text-neutral-50" : "text-neutral-400 hover:bg-neutral-900/60 hover:text-neutral-100")}
              aria-current={active ? "page" : undefined}>
              <n.icon size={16} />{n.label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto flex items-center justify-between px-5 py-4">
        <p className="text-[11px] leading-relaxed text-neutral-600">Automatic PR reviews.</p>
        <UserButton />
      </div>
    </aside>
  );
}

export function MobileNav() {
  const pathname = usePathname();
  return (
    <nav className="flex items-center gap-1 overflow-x-auto border-b border-neutral-800 bg-neutral-950 px-3 py-2 md:hidden" aria-label="Primary">
      {NAV.map((n) => {
        const active = n.exact ? pathname === n.href : pathname.startsWith(n.href);
        return <Link key={n.href} href={n.href} className={cn("whitespace-nowrap rounded-md px-3 py-1.5 text-sm", active ? "bg-neutral-900 text-neutral-50" : "text-neutral-400")}>{n.label}</Link>;
      })}
      <span className="ml-auto"><UserButton /></span>
    </nav>
  );
}
