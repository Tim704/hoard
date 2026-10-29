'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { MoreHorizontal, Plus, Rows3, Sparkles, Trophy } from 'lucide-react';

import { useLayout } from '@/components/prefs-provider';
import { ROAST_ACTIONS, useRoastCritic } from '@/components/roast-button';
import { SearchDialog } from '@/components/search-dialog';
import { FiltersPopover } from '@/components/section/filters-popover';
import type { SectionFiltersState } from '@/components/section/use-section-filters';
import { VIEW_MODES, ViewToggle } from '@/components/view-toggle';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { CategoryConfig, CategorySlug } from '@/lib/categories';
import type { ToolbarStyle } from '@/lib/layouts';
import type { Status } from '@/lib/status';
import type { ViewMode } from '@/lib/types';
import { cn } from '@/lib/utils';

/** One optional item: its classes in the row, and on its More menu entry. */
interface Fold {
  bar: string;
  menu: string;
}

/**
 * Where the optional items join the row. Below that width an item is hidden
 * and its More menu entry shows instead; More hides once nothing is folded
 * into it. CSS breakpoints only: nothing is measured, so the server's HTML
 * is final (no hydration jump). The widths allow for the expanded sidebar
 * (256px from md) and the longest section name ("Add Video Game"):
 * - labelled (Classic): phones fit Add, the title filter, Filters and More;
 *   sm (no sidebar yet) adds the view switch, which md's sidebar folds
 *   again; lg adds Tiers and the view switch; xl adds AI Critic.
 * - icons: everything from sm; phones fold Tiers, AI Critic and the view.
 */
const FOLD: Record<ToolbarStyle, { tiers: Fold; critic: Fold; view: Fold; more: string }> = {
  labelled: {
    tiers: { bar: 'hidden lg:inline-flex', menu: 'lg:hidden' },
    // sm has no sidebar yet, so room for the view switch until md brings it.
    view: { bar: 'hidden sm:inline-flex md:hidden lg:inline-flex', menu: 'sm:hidden md:block lg:hidden' },
    critic: { bar: 'hidden xl:inline-flex', menu: 'xl:hidden' },
    more: 'xl:hidden',
  },
  icons: {
    tiers: { bar: 'hidden sm:inline-flex', menu: 'sm:hidden' },
    view: { bar: 'hidden sm:inline-flex', menu: 'sm:hidden' },
    critic: { bar: 'hidden sm:inline-flex', menu: 'sm:hidden' },
    more: 'sm:hidden',
  },
};

/** Icon buttons: 40px touch targets on phones, 36px from md. */
const ICON_BUTTON = 'h-10 w-10 shrink-0 md:h-9 md:w-9';

interface SectionToolbarProps {
  slug: CategorySlug;
  config: CategoryConfig;
  /** Titles already in the library, for the Add dialog's "In library". */
  library: Record<string, { status: Status; rating: number | null }>;
  /** The title filter. */
  text: string;
  onText: (text: string) => void;
  filters: SectionFiltersState;
  ownedChoices: { value: string; label: string }[];
  sectionTags: string[];
  view: ViewMode;
  onView: (view: ViewMode) => void;
}

/**
 * A section page's toolbar: ONE line that never wraps, at every width.
 * `[Add] [title filter] [Filters · n] [Tiers] [AI Critic] [view] [More ⋯]`.
 * Classic shows labelled buttons; the other layouts show the same items as
 * icons with tooltips. Items that don't fit fold into More (see FOLD).
 */
export function SectionToolbar({
  slug,
  config,
  library,
  text,
  onText,
  filters,
  ownedChoices,
  sectionTags,
  view,
  onView,
}: SectionToolbarProps) {
  const style = useLayout().toolbar;
  const icons = style === 'icons';
  const fold = FOLD[style];
  const critic = useRoastCritic(slug);
  const addLabel = `Add ${config.singular}`;
  const tiersHref = `/${slug}/arena`;
  // Classic keeps the tier list's own icon; alone, it would read as "List view".
  const TiersIcon = icons ? Trophy : Rows3;

  return (
    <div data-section-toolbar="" className="flex min-w-0 flex-nowrap items-center gap-2">
      {icons ? (
        <Tooltip>
          <SearchDialog
            slug={slug}
            singular={config.singular}
            library={library}
            trigger={
              <TooltipTrigger asChild>
                <Button size="icon" aria-label={addLabel} className={ICON_BUTTON}>
                  <Plus className="h-4 w-4" aria-hidden />
                </Button>
              </TooltipTrigger>
            }
          />
          <TooltipContent>{addLabel}</TooltipContent>
        </Tooltip>
      ) : (
        <SearchDialog
          slug={slug}
          singular={config.singular}
          library={library}
          trigger={
            <Button aria-label={addLabel} className="shrink-0 px-3 sm:px-4">
              <Plus className="h-4 w-4 sm:mr-2" aria-hidden />
              <span className="sm:hidden">Add</span>
              <span className="hidden sm:inline">{addLabel}</span>
            </Button>
          }
        />
      )}

      <Input
        value={text}
        onChange={(e) => onText(e.target.value)}
        placeholder="Filter by title…"
        aria-label="Filter by title"
        // text-base on phones stops iOS zooming the page on focus (<16px does).
        className="h-10 min-w-0 flex-1 truncate text-base md:h-9 md:text-sm"
      />

      <FiltersPopover slug={slug} state={filters} ownedChoices={ownedChoices} sectionTags={sectionTags} style={style} />

      <Tip label="Tiers" on={icons}>
        <Link
          href={tiersHref}
          aria-label={icons ? 'Tiers' : undefined}
          className={cn(
            buttonVariants({ variant: 'outline', size: icons ? 'icon' : 'default' }),
            icons ? ICON_BUTTON : 'shrink-0',
            fold.tiers.bar,
          )}
        >
          <TiersIcon className={cn('h-4 w-4', !icons && 'mr-2')} aria-hidden />
          {!icons && 'Tiers'}
        </Link>
      </Tip>

      <MenuButton
        label="AI Critic"
        tooltip={icons}
        className={fold.critic.bar}
        trigger={
          <Button
            variant="outline"
            size={icons ? 'icon' : 'default'}
            aria-label={icons ? 'AI Critic' : undefined}
            className={icons ? ICON_BUTTON : 'shrink-0'}
          >
            <Sparkles className={cn('h-4 w-4', !icons && 'mr-2')} aria-hidden />
            {!icons && 'AI Critic'}
          </Button>
        }
      >
        {(later) =>
          ROAST_ACTIONS.map(({ mode, label, Icon }) => (
            <DropdownMenuItem key={mode} onSelect={() => later(() => critic.run(mode))}>
              <Icon className="mr-2 h-4 w-4" aria-hidden />
              {label}
            </DropdownMenuItem>
          ))
        }
      </MenuButton>

      <ViewToggle value={view} onChange={onView} tooltips={icons} className={cn('shrink-0', fold.view.bar)} />

      <MenuButton
        label="More"
        tooltip
        className={fold.more}
        trigger={
          <Button variant="outline" size="icon" aria-label="More" className={ICON_BUTTON}>
            <MoreHorizontal className="h-4 w-4" aria-hidden />
          </Button>
        }
      >
        {(later) => (
          <>
            {/* Inset like the view's radio items, so the icons line up. */}
            <DropdownMenuItem asChild inset className={fold.tiers.menu}>
              <Link href={tiersHref}>
                <TiersIcon className="mr-2 h-4 w-4" aria-hidden />
                Tiers
              </Link>
            </DropdownMenuItem>
            <div className={fold.critic.menu}>
              <DropdownMenuLabel inset className="text-xs font-normal text-muted-foreground">
                AI Critic
              </DropdownMenuLabel>
              {ROAST_ACTIONS.map(({ mode, label, Icon }) => (
                <DropdownMenuItem key={mode} inset onSelect={() => later(() => critic.run(mode))}>
                  <Icon className="mr-2 h-4 w-4" aria-hidden />
                  {label}
                </DropdownMenuItem>
              ))}
            </div>
            <div className={fold.view.menu}>
              <DropdownMenuLabel inset className="text-xs font-normal text-muted-foreground">
                View
              </DropdownMenuLabel>
              <DropdownMenuRadioGroup value={view} onValueChange={(v) => onView(v as ViewMode)}>
                {VIEW_MODES.map(({ mode, label, Icon }) => (
                  <DropdownMenuRadioItem key={mode} value={mode}>
                    <Icon className="mr-2 h-4 w-4" aria-hidden />
                    {label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </div>
          </>
        )}
      </MenuButton>

      {critic.dialog}
    </div>
  );
}

/** A tooltip around an icon control (`on`), or the control alone. */
function Tip({ label, on, children }: { label: string; on: boolean; children: React.ReactElement }) {
  if (!on) return children;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/**
 * A toolbar button that opens a menu. An entry that opens a dialog passes
 * its action to `later`: it runs once the menu has closed and focus is back
 * on this button, so the dialog can hand focus back to it when it closes.
 */
function MenuButton({
  label,
  tooltip,
  className,
  trigger,
  children,
}: {
  label: string;
  /** Name the (icon) button in a tooltip too. */
  tooltip: boolean;
  className?: string;
  trigger: React.ReactElement<{ className?: string }>;
  children: (later: (action: () => void) => void) => React.ReactNode;
}) {
  const afterClose = useRef<(() => void) | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const later = (action: () => void) => {
    afterClose.current = action;
  };
  return (
    <DropdownMenu>
      <Tip label={label} on={tooltip}>
        <DropdownMenuTrigger asChild ref={triggerRef} className={className}>
          {trigger}
        </DropdownMenuTrigger>
      </Tip>
      <DropdownMenuContent
        align="end"
        collisionPadding={8}
        className="w-52"
        onCloseAutoFocus={(ev) => {
          const run = afterClose.current;
          if (!run) return;
          afterClose.current = null;
          ev.preventDefault();
          triggerRef.current?.focus({ preventScroll: true });
          run();
        }}
      >
        {children(later)}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
