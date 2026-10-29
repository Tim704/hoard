'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { ChevronDown, ChevronRight } from 'lucide-react';

import { iconFor } from '@/components/icons';
import { usePersistentState } from '@/hooks/use-persistent-state';
import { isNavLinkActive, type NavGroup, type NavLink } from '@/lib/nav-model';
import { cn } from '@/lib/utils';

const isBool = (v: unknown): v is boolean => typeof v === 'boolean';

/**
 * The sidebar's (and the phone drawer's) links, in the layout's groups.
 * Classic is one unlabelled list, exactly the pre-layouts sidebar; Organised
 * heads each group in small caps; Minimal spaces the rows out. In the
 * collapsed rail only the icons show (groups are split by a rule).
 */
export function NavList({
  groups,
  collapsed = false,
  onNavigate,
}: {
  groups: NavGroup[];
  /** Icon-only rail mode (collapsed desktop sidebar). */
  collapsed?: boolean;
  /** Fired on any link click — lets the phone drawer close itself. */
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const view = useSearchParams().get('view');

  return (
    <>
      {groups.map((group, i) => (
        <div
          key={group.id}
          role={group.label ? 'group' : undefined}
          aria-label={group.label ?? undefined}
          className={cn(
            'space-y-1',
            i > 0 && 'mt-2 organised:mt-4',
            i > 0 && collapsed && 'border-t border-border pt-2 organised:mt-2',
            'organised:space-y-0.5',
          )}
        >
          {group.label && !collapsed && (
            <p className="px-3 pb-1 text-xs font-semibold tracking-wider text-muted-foreground [font-variant-caps:all-small-caps]">
              {group.label}
            </p>
          )}
          {group.links.map((link) =>
            link.children && !collapsed ? (
              <ViewsGroup key={link.id} link={link} pathname={pathname} view={view} onNavigate={onNavigate} />
            ) : (
              <NavRow
                key={link.id}
                link={link}
                active={isNavLinkActive(link, pathname, view)}
                collapsed={collapsed}
                onNavigate={onNavigate}
              />
            ),
          )}
        </div>
      ))}
    </>
  );
}

function rowClass(active: boolean, collapsed: boolean) {
  return cn(
    'flex items-center gap-3 rounded-md py-2 text-sm font-medium transition-colors',
    'minimal:rounded-lg minimal:py-2.5 organised:py-1.5',
    collapsed ? 'justify-center px-0' : 'px-3',
    active ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
  );
}

function NavRow({
  link,
  active,
  collapsed,
  onNavigate,
}: {
  link: NavLink;
  active: boolean;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const Icon = iconFor(link.icon);
  return (
    <Link
      href={link.href}
      onClick={onNavigate}
      title={collapsed ? link.label : undefined}
      aria-label={collapsed ? link.label : undefined}
      aria-current={active ? 'page' : undefined}
      className={rowClass(active, collapsed)}
    >
      {/* Every nav icon is the same muted gray (active highlights via bg/label);
          Organised tints the current one. */}
      <Icon className={cn('h-4 w-4 shrink-0 text-muted-foreground', active && 'organised:text-primary')} />
      {!collapsed && <span>{link.label}</span>}
    </Link>
  );
}

/** Views with the saved views under it, folding away (remembered per browser). */
function ViewsGroup({
  link,
  pathname,
  view,
  onNavigate,
}: {
  link: NavLink;
  pathname: string;
  view: string | null;
  onNavigate?: () => void;
}) {
  const [open, setOpen] = usePersistentState<boolean>('hoard:nav:views-open', true, isBool);
  const Icon = iconFor(link.icon);
  const active = isNavLinkActive(link, pathname, view);
  const children = link.children ?? [];
  return (
    <div>
      <div className={cn(rowClass(active, false), 'gap-0 p-0 minimal:p-0 organised:p-0')}>
        <Link
          href={link.href}
          onClick={onNavigate}
          aria-current={active ? 'page' : undefined}
          className="flex min-w-0 flex-1 items-center gap-3 py-2 pl-3 organised:py-1.5"
        >
          <Icon className={cn('h-4 w-4 shrink-0 text-muted-foreground', active && 'organised:text-primary')} />
          <span>{link.label}</span>
        </Link>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-label={open ? 'Hide saved views' : 'Show saved views'}
          className="rounded-md px-2 py-2 text-muted-foreground hover:text-foreground organised:py-1.5"
        >
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
      </div>
      {open && (
        <ul className="ml-5 mt-0.5 space-y-0.5 border-l border-border pl-2">
          {children.map((v) => {
            const on = isNavLinkActive(v, pathname, view);
            return (
              <li key={v.id}>
                <Link
                  href={v.href}
                  onClick={onNavigate}
                  aria-current={on ? 'page' : undefined}
                  className={cn(
                    'block truncate rounded-md px-2 py-1.5 text-sm transition-colors organised:py-1',
                    on ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                  )}
                >
                  {v.label}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
