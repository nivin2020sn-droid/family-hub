import { getContrastTextColor } from "@/lib/utils";

export const EventBar = ({ event, onClick, testid }) => {
  const textColor = getContrastTextColor(event.color);
  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        onClick && onClick(event);
      }}
      className="w-full text-[9px] sm:text-[10px] px-1.5 py-[2px] rounded-md truncate font-semibold cursor-pointer transition-all hover:brightness-95 hover:scale-[1.02]"
      style={{ backgroundColor: event.color, color: textColor }}
      data-testid={testid}
      title={`${event.start_time || ""} ${event.title}`.trim()}
    >
      {event.start_time ? `${event.start_time} ` : ""}{event.title}
    </div>
  );
};

export default EventBar;
