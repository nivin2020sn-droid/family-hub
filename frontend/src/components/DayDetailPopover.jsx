import { Plus, Pencil, Trash2, Clock, Tag, StickyNote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getContrastTextColor } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

const DayDetailPopover = ({
  dateIso,
  events,
  users,
  eventTypes,
  merged,
  activeUserId,
  onAddEvent,
  onEditEvent,
  onDeleteEvent,
}) => {
  const { t, locale } = useI18n();
  const getUser = (uid) => users.find((u) => u.id === uid);
  const getType = (tid) => eventTypes.find((tp) => tp.id === tid);

  // Localized "Month D, YYYY" — falls back gracefully on unknown locales.
  const formatDate = (iso) => {
    try {
      const [y, m, d] = iso.split("-").map(Number);
      return new Date(y, m - 1, d).toLocaleDateString(locale || "en-US", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    } catch {
      return iso;
    }
  };

  const wifeName = (getUser("wife") || {}).name || t("user.wife");
  const husbandName = (getUser("husband") || {}).name || t("user.husband");

  const eventCountLabel =
    events.length === 1 ? t("day.eventCount.one", { n: 1 }) : t("day.eventCount.other", { n: events.length });

  return (
    <div className="flex flex-col" data-testid={`day-popover-${dateIso}`}>
      <div className="px-5 pt-5 pb-3 border-b border-[#E5E2DC]">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#7A7571]">
          {eventCountLabel}
        </p>
        <h3 className="font-heading text-xl font-medium text-[#2D2A26] mt-0.5">
          {formatDate(dateIso)}
        </h3>
      </div>

      <div className="max-h-72 overflow-y-auto px-3 py-2">
        {events.length === 0 ? (
          <p className="text-sm text-[#7A7571] text-center py-6">
            {t("day.noEvents")}
          </p>
        ) : (
          <ul className="space-y-2">
            {events.map((ev) => {
              const u = getUser(ev.user_id);
              const tp = getType(ev.type_id);
              const textColor = getContrastTextColor(ev.color);
              return (
                <li
                  key={ev.id}
                  className="group rounded-xl border border-[#E5E2DC] bg-white p-3 hover:shadow-sm transition-shadow"
                  data-testid={`day-event-${ev.id}`}
                >
                  <div className="flex items-start gap-2">
                    <span
                      className="mt-1 inline-flex items-center justify-center px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wide"
                      style={{ backgroundColor: ev.color, color: textColor }}
                    >
                      {ev.start_time || t("day.allDay")}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-[#2D2A26] truncate">{ev.title}</p>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-[#7A7571]">
                        {ev.end_time && (
                          <span className="inline-flex items-center gap-1">
                            <Clock className="w-3 h-3" strokeWidth={2} />
                            {ev.start_time}–{ev.end_time}
                          </span>
                        )}
                        {tp && (
                          <span className="inline-flex items-center gap-1">
                            <Tag className="w-3 h-3" strokeWidth={2} />
                            {tp.name}
                          </span>
                        )}
                        {u && (
                          <span className="inline-flex items-center gap-1">
                            <span
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: u.color }}
                            />
                            {u.name}
                          </span>
                        )}
                      </div>
                      {ev.notes && (
                        <p className="text-xs text-[#7A7571] mt-1.5 leading-relaxed flex items-start gap-1">
                          <StickyNote className="w-3 h-3 mt-0.5 flex-shrink-0" strokeWidth={2} />
                          <span className="line-clamp-3">{ev.notes}</span>
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="w-7 h-7 rounded-full"
                        onClick={() => onEditEvent(ev)}
                        data-testid={`edit-event-${ev.id}`}
                        aria-label={t("btn.edit")}
                      >
                        <Pencil className="w-3.5 h-3.5" strokeWidth={1.75} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="w-7 h-7 rounded-full text-red-500 hover:text-red-600 hover:bg-red-50"
                        onClick={() => onDeleteEvent(ev.id)}
                        data-testid={`delete-event-${ev.id}`}
                        aria-label={t("btn.delete")}
                      >
                        <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                      </Button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="px-3 py-3 border-t border-[#E5E2DC] bg-[#FAF9F6] rounded-b-2xl flex gap-2">
        {merged ? (
          <>
            <Button
              size="sm"
              onClick={() => onAddEvent("wife")}
              className="flex-1 rounded-full text-xs bg-white border border-[#F472B6] text-[#F472B6] hover:bg-[#F472B6]/10"
              data-testid="add-wife-event-btn"
            >
              <Plus className="w-3 h-3 mr-1" strokeWidth={2} /> {wifeName}
            </Button>
            <Button
              size="sm"
              onClick={() => onAddEvent("husband")}
              className="flex-1 rounded-full text-xs bg-white border border-[#60A5FA] text-[#60A5FA] hover:bg-[#60A5FA]/10"
              data-testid="add-husband-event-btn"
            >
              <Plus className="w-3 h-3 mr-1" strokeWidth={2} /> {husbandName}
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            onClick={() => onAddEvent(activeUserId)}
            className="flex-1 rounded-full text-xs bg-[#2D2A26] hover:bg-[#1f1d1a] text-white"
            data-testid="add-event-from-day-btn"
          >
            <Plus className="w-3 h-3 mr-1" strokeWidth={2} /> {t("day.addEvent")}
          </Button>
        )}
      </div>
    </div>
  );
};

export default DayDetailPopover;
