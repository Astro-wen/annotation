import { useNavigate } from "react-router-dom";
import {
  Bot,
  BriefcaseBusiness,
  ClipboardCheck,
  GraduationCap,
  Headphones,
  MessageSquareMore,
  Pin,
  ShieldCheck,
} from "lucide-react";
import { getUserOption, USER_OPTIONS, useCurrentUserStore } from "@/lib/currentUser";

export default function Layout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const currentEmail = useCurrentUserStore((s) => s.currentEmail);
  const setCurrentEmail = useCurrentUserStore((s) => s.setCurrentEmail);
  const currentUser = getUserOption(currentEmail);
  const sidebarItems = [
    { label: "Manual Annotation", icon: Pin, active: true },
    { label: "Service", icon: Headphones },
    { label: "AI Functions", icon: Bot, highlight: true },
    { label: "Management", icon: BriefcaseBusiness },
    { label: "Quality Assurance", icon: ShieldCheck },
    { label: "Messages", icon: MessageSquareMore },
    { label: "Knowledge Base", icon: GraduationCap },
  ];

  return (
    <div className="min-h-screen bg-page text-ink">
      {/* Header */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-white px-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/home")}
            className="flex items-center gap-2"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand text-sm font-bold text-white shadow-sm">
              B
            </span>
            <span className="text-sm font-semibold tracking-tight">
              ByteHi Manual Annotation
            </span>
          </button>
          <span className="inline-flex items-center gap-1 rounded-md bg-brand-light px-2 py-0.5 text-xs font-semibold text-brand">
            New Rule
          </span>
        </div>
        <div className="flex items-center gap-4 text-xs text-subtle">
          <span className="hidden md:inline">Config v2026.06.23</span>
          <div className="flex items-center gap-2 rounded-md border border-line bg-page px-2 py-1">
            <span className="hidden text-[11px] uppercase tracking-wide md:inline">Account</span>
            <select
              value={currentEmail}
              onChange={(e) => setCurrentEmail(e.target.value)}
              className="h-7 rounded-md border border-line bg-white px-2 text-xs font-medium text-ink outline-none focus:border-brand"
            >
              {USER_OPTIONS.map((user) => (
                <option key={user.email} value={user.email}>
                  {user.label} · {user.email}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4 text-brand" />
            <span className="font-medium text-ink">
              {currentUser.shortName} · {currentUser.email}
            </span>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-[220px] shrink-0 border-r border-[#223246] bg-[#1E293B] text-white md:block">
          <div className="flex h-full flex-col">
            <div className="flex items-center gap-3 border-b border-white/10 px-4 py-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#19D3D7] to-[#0D7C88] shadow-lg">
                <span className="text-lg font-bold text-white">B</span>
              </div>
              <div>
                <p className="text-sm font-semibold text-white">ByteHi</p>
                <p className="text-[11px] text-white/60">Manual Annotation</p>
              </div>
            </div>

            <nav className="flex-1 space-y-1 px-3 py-4">
              {sidebarItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.label}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                      item.active
                        ? "bg-[#1F4F5B] text-white"
                        : item.highlight
                          ? "bg-[#183F4A] text-[#9DEBF0]"
                          : "text-white/70 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>

            <div className="border-t border-white/10 px-3 py-4">
              <div className="rounded-xl bg-white/5 px-3 py-3">
                <p className="text-xs font-medium text-white">{currentUser.label}</p>
                <p className="mt-1 truncate text-[11px] text-white/60">{currentUser.email}</p>
                <p className="mt-1 text-[11px] text-[#8BE4EA]">Test account switch enabled</p>
              </div>
            </div>
          </div>
        </aside>

        {/* Main */}
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
