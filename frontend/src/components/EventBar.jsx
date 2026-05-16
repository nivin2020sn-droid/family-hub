import { cn, getContrastTextColor } from "@/lib/utils";

/**
 * Event bar — compact rectangular pill used inside calendar day cells.
 * - fill=true: compact stacked bar with abbreviation centered (in monthly grid)
 * - fill=false: inline bar with start time + title (in detail popovers)
 */
export const EventBar = ({ event, label, fill, onClick, testid, className }) => {
  const textColor = getContrastTextColor(event.color);
  const display = fill
    ? (label || event.title)
    : `${event.start_time ? event.start_time + " " : ""}${event.title}`;
  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        onClick && onClick(event);
      }}
      className={cn(
        "rounded-md cursor-pointer transition-all hover:brightness-95 overflow-hidden flex items-center w-full",
        fill
          ? "h-[18px] sm:h-[20px] justify-center text-center px-1.5 leading-none"
          : "text-[10px] px-1.5 py-[2px] truncate hover:scale-[1.02]",
        className
      )}
      style={{ backgroundColor: event.color, color: textColor }}
      data-testid={testid}
      title={`${event.start_time || ""} ${event.title}`.trim()}
    >
      <span
        className={cn(
          "truncate w-full text-center",
          fill
            ? "text-[11px] sm:text-xs font-extrabold tracking-wide uppercase leading-none"
            : "font-semibold text-left"
        )}
      >
        {display}
      </span>
    </div>
  );
};

export default EventBar;
