import { cn, getContrastTextColor } from "@/lib/utils";

/**
 * Event bar — compact rectangular bar used inside calendar day cells.
 * No ellipsis truncation — text either fits or is clipped cleanly.
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
        "w-full rounded-md cursor-pointer transition-all hover:brightness-95 overflow-hidden flex items-center justify-center",
        fill
          ? "h-[16px] sm:h-[18px] px-1 leading-none"
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
