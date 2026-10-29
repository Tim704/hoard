import { STATUS_BASE_LABEL, STATUS_ICON, STATUS_TEXT_CLASS, type Status } from '@/lib/status';
import { cn } from '@/lib/utils';

/**
 * A bare, colour-tinted status icon (compact rows, section headers). It is
 * named after the status, unless `decorative` (a visible label next to it
 * already says the status), which hides it from assistive tech.
 */
export function StatusIcon({ status, className, decorative }: { status: Status; className?: string; decorative?: boolean }) {
  const Icon = STATUS_ICON[status];
  return (
    <Icon
      className={cn(
        'h-4 w-4 shrink-0',
        STATUS_TEXT_CLASS[status],
        status === 'CONSUMING' && 'fill-current',
        className,
      )}
      {...(decorative ? { 'aria-hidden': true } : { 'aria-label': STATUS_BASE_LABEL[status] })}
    />
  );
}
