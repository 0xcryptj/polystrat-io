import { PropsWithChildren } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "./ui/button";
import { cn } from "../lib/utils";

type NavItem = {
  key: string;
  label: string;
};

export function Shell(
  props: PropsWithChildren<{
    nav: NavItem[];
    active: string;
    onSelect: (key: string) => void;
  }>
) {
  const isDark = document.documentElement.classList.contains("dark");

  const toggleTheme = () => {
    const root = document.documentElement;
    root.classList.toggle("dark");
    localStorage.setItem("theme", root.classList.contains("dark") ? "dark" : "light");
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="flex">
        <aside className="hidden md:flex h-screen w-64 shrink-0 flex-col border-r border-border bg-card">
          <div className="p-4">
            <div className="text-sm font-semibold tracking-tight">polystrat.io</div>
            <div className="text-xs text-mutedForeground">paper mode platform</div>
          </div>
          <nav className="px-2">
            {props.nav.map((item) => (
              <button
                key={item.key}
                className={cn(
                  "w-full text-left px-3 py-2 rounded-lg text-sm text-mutedForeground hover:bg-muted hover:text-foreground",
                  props.active === item.key && "bg-muted text-foreground"
                )}
                onClick={() => props.onSelect(item.key)}
              >
                {item.label}
              </button>
            ))}
          </nav>
          <div className="mt-auto p-4 text-xs text-mutedForeground">
            No wallets. No payments. No live trades.
          </div>
        </aside>

        <div className="flex-1">
          <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur">
            <div className="flex items-center justify-between px-4 py-3">
              <div className="text-sm font-medium">Control Panel</div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" onClick={toggleTheme} aria-label="Toggle theme">
                  {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </header>

          <main className="p-4">{props.children}</main>
        </div>
      </div>
    </div>
  );
}
