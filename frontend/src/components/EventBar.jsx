import { cn, getContrastTextColor } from "@/lib/utils";

/**
 * Event bar used in both calendar cells (fill mode) and detail popovers.
 * - fill: when true the bar uses flex-1 to fill its parent vertically and shows the abbreviation centered.
 * - label: short text (abbreviation) shown in fill mode. Falls back to event.title.
 */
export const EventBar = ({ event, label, fill, onClick, testid, className }) => {
  const textColor = getContrastTextColor(event.color);
  const display = (fill ? (label || event.title) : `${event.start_time ? event.start_time + " " : ""}${event.title}`);
  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        onClick && onClick(event);
      }}
      className={cn(
        "rounded-md font-bold cursor-pointer transition-all hover:brightness-95 overflow-hidden flex items-center",
        fill
          ? "flex-1 min-h-[12px] justify-center text-center px-1 leading-none"
          : "w-full text-[10px] px-1.5 py-[2px] truncate hover:scale-[1.02]",
        className
      )}
      style={{ backgroundColor: event.color, color: textColor }}
      data-testid={testid}
      title={`${event.start_time || ""} ${event.title}`.trim()}
    >
      <span
        className={cn(
          "truncate w-full text-center",
          fill ? "text-[11px] sm:text-xs font-extrabold tracking-wide uppercase leading-none" : "font-semibold text-left"
        )}
      >
        {display}
      </span>
    </div>
  );
};

export default EventBar;
