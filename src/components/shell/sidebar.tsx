'use client';

import { Boxes, LogOut, PanelLeftClose, PanelLeftOpen } from 'lucide-react';

import { useLayout } from '@/components/prefs-provider';
import { NavList } from '@/components/shell/nav-list';
import { UserMenu } from '@/components/shell/user-menu';
import { ThemeToggle } from '@/components/theme-toggle';
import { clearAllTitleDrafts } from '@/components/title/title-drafts';
import { logoutAction } from '@/lib/actions/auth';
import type { NavGroup } from '@/lib/nav-model';
import { cn } from '@/lib/utils';

/**
 * The persistent desktop sidebar (Classic, Minimal, Organised). Collapses to
 * an icon rail via the header button or Ctrl/Cmd+B (the shell owns the state
 * and stores it in a cookie). Hidden below `md`, where MobileBar's top bar +
 * drawer takes over.
 *
 * Classic is the pre-layouts sidebar, with its "Signed in as" block opening
 * the user menu; Organised ends in a compact account row; Minimal keeps the
 * account in its top bar.
 */
export function Sidebar({
  groups,
  collapsed,
  onToggle,
}: {
  groups: NavGroup[];
  collapsed: boolean;
  onToggle: () => void;
}) {
  const { id: layout } = useLayout();
  const ToggleIcon = collapsed ? PanelLeftOpen : PanelLeftClose;
  const toggleLabel = collapsed ? 'Expand sidebar (Ctrl+B)' : 'Collapse sidebar (Ctrl+B)';

  return (
    <aside
      data-shell=""
      className={cn(
        'sticky top-0 hidden h-screen shrink-0 flex-col border-r border-border bg-muted/40 transition-[width] duration-200 md:flex',
        'minimal:bg-background organised:bg-card',
        collapsed ? 'w-16' : 'w-64 organised:w-60',
      )}
    >
      {/* Brand + collapse toggle */}
      <div
        className={cn(
          'flex items-center py-5',
          collapsed ? 'flex-col gap-3 px-2' : 'justify-between gap-2 pl-5 pr-3',
          'minimal:py-6 organised:py-4',
        )}
      >
        <div className="flex items-center gap-2">
          <Boxes className="h-6 w-6 shrink-0 text-primary" />
          {!collapsed && (
            <span className="text-lg font-bold tracking-widest minimal:font-display minimal:font-semibold minimal:tracking-[0.2em]">
              HOARD
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onToggle}
          title={toggleLabel}
          aria-label={toggleLabel}
          aria-expanded={!collapsed}
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ToggleIcon className="h-4 w-4" />
        </button>
      </div>

      {/* Navigation */}
      <nav
        aria-label="Main"
        className={cn('flex-1 space-y-1 overflow-y-auto py-2', collapsed ? 'px-2' : 'px-3', 'minimal:py-4')}
      >
        <NavList groups={groups} collapsed={collapsed} />
      </nav>

      {layout === 'classic' && <ClassicFooter collapsed={collapsed} />}
      {layout === 'organised' && (
        <div className={cn('border-t border-border', collapsed ? 'flex justify-center px-2 py-3' : 'p-2')}>
          <UserMenu trigger={collapsed ? 'avatar' : 'row'} side={collapsed ? 'right' : 'top'} align={collapsed ? 'end' : 'start'} />
        </div>
      )}
    </aside>
  );
}

/** Classic's footer as before: the "Signed in as" block (now the user menu), the theme toggle and Log out. */
function ClassicFooter({ collapsed }: { collapsed: boolean }) {
  return (
    <div className={cn('border-t border-border py-3', collapsed ? 'px-2' : 'px-3')}>
      {collapsed ? (
        <div className="flex flex-col items-center gap-2">
          <UserMenu trigger="avatar" side="right" align="end" />
          <ThemeToggle />
        </div>
      ) : (
        <div className="flex items-center justify-between gap-1 pb-2 pr-2 text-sm">
          <UserMenu trigger="signed-in" side="top" align="start" />
          <ThemeToggle />
        </div>
      )}
      {/* Logging out forgets this tab's unsaved title edits, as the user menu's Log out does. */}
      <form action={logoutAction} onSubmit={clearAllTitleDrafts}>
        <button
          type="submit"
          title={collapsed ? 'Log out' : undefined}
          aria-label={collapsed ? 'Log out' : undefined}
          className={cn(
            'flex w-full items-center gap-3 rounded-md py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground',
            collapsed ? 'mt-1 justify-center' : 'px-3',
          )}
        >
          <LogOut className="h-4 w-4" />
          {!collapsed && <span>Log out</span>}
        </button>
      </form>
    </div>
  );
}
