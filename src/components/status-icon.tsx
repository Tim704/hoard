import { STATUS_BASE_LABEL, STATUS_ICON, STATUS_TEXT_CLASS, type Status } from '@/lib/status';
import { cn } from '@/lib/utils';

/** A bare, colour-tinted status icon (compact rows, section headers). */
export function StatusIcon({ status, className }: { status: Status; className?: string }) {
  const Icon = STATUS_ICON[status];
  return (
    <Icon
      className={cn(
        'h-4 w-4 shrink-0',
        STATUS_TEXT_CLASS[status],
        status === 'CONSUMING' && 'fill-current',
        className,
      )}
      aria-label={STATUS_BASE_LABEL[status]}
    />
  );
}
