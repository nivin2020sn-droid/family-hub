import { cn, getContrastTextColor } from "@/lib/utils";

/**
 * Event bar — used inside calendar day cells.
 * - fill=true: bar uses `flex-1` to fill its share of the parent column,
 *   so 1 event fills the whole half, 2 events split it, 3 split into three,
 *   and so on. The abbreviation stays centered.
 *   In fill mode the click is allowed to BUBBLE up to the day cell so the
 *   day-detail popover opens normally (events otherwise cover the whole cell
 *   and would block any tap target).
 * - fill=false: compact inline bar with start time + title (popovers).
 */
export const EventBar = ({ event, label, fill, onClick, testid, className }) => {
  const textColor = getContrastTextColor(event.color);
  const display = fill
    ? (label || event.title)
    : `${event.start_time ? event.start_time + " " : ""}${event.title}`;
  const handleClick = (e) => {
    if (onClick) {
      e.stopPropagation();
      onClick(event);
    }
    // else: do nothing — click bubbles to the day cell (Popover trigger)
  };
  return (
    <div
      onClick={handleClick}
      className={cn(
        "w-full rounded-md cursor-pointer transition-all hover:brightness-95 overflow-hidden flex items-center justify-center",
        fill
          ? "flex-1 min-h-[10px] px-1 leading-none"
          : "h-auto px-1.5 py-[2px] hover:scale-[1.02]",
        className
      )}
      style={{ backgroundColor: event.color, color: textColor }}
      data-testid={testid}
      title={`${event.start_time || ""} ${event.title}`.trim()}
    >
      <span
        className={cn(
          "block w-full text-center whitespace-nowrap overflow-hidden",
          fill
            ? "text-[9px] sm:text-[11px] font-extrabold tracking-wide uppercase leading-none"
            : "font-semibold text-left text-[10px]"
        )}
      >
        {display}
      </span>
    </div>
  );
};

export default EventBar;
