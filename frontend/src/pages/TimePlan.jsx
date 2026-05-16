import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Plus,
  Settings2,
  WifiOff,
  Layers,
  UserCog,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import {
  getUsers,
  getEvents,
  getEventTypes,
  deleteEvent,
} from "@/lib/api";
import { buildMonthMatrix, DAY_NAMES, MONTH_NAMES, todayIso } from "@/lib/utils";
import EventBar from "@/components/EventBar";
import EventDialog from "@/components/EventDialog";
import EventTypesDialog from "@/components/EventTypesDialog";
import DayDetailPopover from "@/components/DayDetailPopover";
import ProfilesDialog from "@/components/ProfilesDialog";

const WIFE_COLOR = "#F472B6";
const HUSBAND_COLOR = "#60A5FA";
const MAX_EVENTS_PER_HALF = 3;
const MAX_EVENTS_SINGLE = 6;

const TimePlan = () => {
  const navigate = useNavigate();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1); // 1-12

  const [users, setUsers] = useState([]);
  const [activeUserId, setActiveUserId] = useState("wife");
  const [merged, setMerged] = useState(false);

  const [events, setEvents] = useState([]);
  const [eventTypes, setEventTypes] = useState([]);
  const [loading, setLoading] = useState(false);

  const [eventDialogOpen, setEventDialogOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [dialogDefaultDate, setDialogDefaultDate] = useState(null);
  const [dialogDefaultUserId, setDialogDefaultUserId] = useState(null);

  const [typesDialogOpen, setTypesDialogOpen] = useState(false);
  const [profilesDialogOpen, setProfilesDialogOpen] = useState(false);
  const [openDayIso, setOpenDayIso] = useState(null);

  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const onOnline = () => {
      setOnline(true);
      toast.success("Back online — syncing");
      loadEvents();
    };
    const onOffline = () => {
      setOnline(false);
      toast.message("You're offline. Showing cached data.");
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    (async () => {
      const [u, t] = await Promise.all([getUsers(), getEventTypes()]);
      setUsers(u);
      setEventTypes(t);
    })();
  }, []);

  const loadEvents = async () => {
    setLoading(true);
    const data = await getEvents({ year, month });
    setEvents(data);
    setLoading(false);
  };

  useEffect(() => {
    loadEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month]);

  const matrix = useMemo(() => buildMonthMatrix(year, month), [year, month]);

  const eventsByDate = useMemo(() => {
    const map = new Map();
    events.forEach((e) => {
      if (!map.has(e.date)) map.set(e.date, []);
      map.get(e.date).push(e);
    });
    // sort each day's events by start_time
    map.forEach((arr) => arr.sort((a, b) => (a.start_time || "").localeCompare(b.start_time || "")));
    return map;
  }, [events]);

  const typesMap = useMemo(() => {
    const m = new Map();
    eventTypes.forEach((t) => m.set(t.id, t));
    return m;
  }, [eventTypes]);

  const getEventLabel = (ev) => {
    if (ev.type_id && typesMap.has(ev.type_id)) {
      const t = typesMap.get(ev.type_id);
      if (t.abbreviation && t.abbreviation.trim()) return t.abbreviation;
    }
    return (ev.title || "").slice(0, 4).toUpperCase();
  };

  const activeUserColor =
    activeUserId === "wife" ? WIFE_COLOR : HUSBAND_COLOR;

  const goPrev = () => {
    if (month === 1) {
      setMonth(12);
      setYear(year - 1);
    } else setMonth(month - 1);
  };
  const goNext = () => {
    if (month === 12) {
      setMonth(1);
      setYear(year + 1);
    } else setMonth(month + 1);
  };
  const goToday = () => {
    const t = new Date();
    setYear(t.getFullYear());
    setMonth(t.getMonth() + 1);
  };

  const onAddEvent = (dateIso, userId) => {
    setEditingEvent(null);
    setDialogDefaultDate(dateIso);
    setDialogDefaultUserId(userId || activeUserId);
    setEventDialogOpen(true);
  };

  const onEditEvent = (ev) => {
    setEditingEvent(ev);
    setDialogDefaultDate(ev.date);
    setDialogDefaultUserId(ev.user_id);
    setEventDialogOpen(true);
  };

  const onDeleteEvent = async (id) => {
    try {
      await deleteEvent(id);
      toast.success("Event deleted");
      loadEvents();
    } catch {
      toast.error("Failed to delete");
    }
  };

  const onEventSaved = () => {
    setEventDialogOpen(false);
    loadEvents();
  };

  const onTypesChanged = async () => {
    const t = await getEventTypes();
    setEventTypes(t);
  };

  const todayStr = todayIso();

  const filterDayEvents = (dayIso) => {
    const all = eventsByDate.get(dayIso) || [];
    return merged ? all : all.filter((e) => e.user_id === activeUserId);
  };

  return (
    <div className="min-h-screen bg-[#FAF9F6]">
      <div className="max-w-7xl mx-auto px-4 sm:px-8 md:px-10 py-6 md:py-10">
        {/* Top bar */}
        <div className="flex items-center justify-between mb-6 md:mb-8 gap-3">
          <button
            onClick={() => navigate("/")}
            className="inline-flex items-center gap-2 text-sm text-[#7A7571] hover:text-[#2D2A26] transition-colors"
            data-testid="back-to-dashboard-btn"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={2} />
            Dashboard
          </button>
          <div className="flex items-center gap-2">
            {!online && (
              <span className="inline-flex items-center gap-1 text-xs text-[#7A7571] bg-[#F3F0EA] px-3 py-1.5 rounded-full">
                <WifiOff className="w-3 h-3" strokeWidth={2} /> Offline
              </span>
            )}
            <Button
              variant="ghost"
              onClick={() => setProfilesDialogOpen(true)}
              className="rounded-full text-[#2D2A26] hover:bg-[#F3F0EA]"
              data-testid="manage-profiles-btn"
            >
              <UserCog className="w-4 h-4 mr-2" strokeWidth={1.75} /> Profiles
            </Button>
            <Button
              variant="ghost"
              onClick={() => setTypesDialogOpen(true)}
              className="rounded-full text-[#2D2A26] hover:bg-[#F3F0EA]"
              data-testid="manage-types-btn"
            >
              <Settings2 className="w-4 h-4 mr-2" strokeWidth={1.75} /> Event Types
            </Button>
          </div>
        </div>

        {/* Header */}
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between mb-6 md:mb-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#7A7571] mb-3">
              Time Plan
            </p>
            <h1 className="font-heading text-4xl sm:text-5xl font-light tracking-tight text-[#2D2A26] leading-none">
              {MONTH_NAMES[month - 1]}{" "}
              <span className="text-[#7A7571] font-light">{year}</span>
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* User Switcher */}
            <div
              className={`inline-flex items-center gap-1 bg-[#F3F0EA] p-1.5 rounded-full ${merged ? "opacity-50 pointer-events-none" : ""}`}
              data-testid="user-switcher"
            >
              {users.map((u) => {
                const isActive = u.id === activeUserId;
                return (
                  <button
                    key={u.id}
                    onClick={() => setActiveUserId(u.id)}
                    className={`px-5 py-2 rounded-full text-sm font-semibold transition-all flex items-center gap-2 ${
                      isActive
                        ? "bg-white shadow-sm text-[#2D2A26]"
                        : "text-[#7A7571] hover:text-[#2D2A26]"
                    }`}
                    data-testid={`user-pill-${u.id}`}
                  >
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: u.color }}
                    />
                    {u.name}
                  </button>
                );
              })}
            </div>

            {/* Merge toggle */}
            <div className="flex items-center gap-3 bg-white border border-[#E5E2DC] px-4 py-2 rounded-full shadow-sm">
              <Layers className="w-4 h-4 text-[#7A7571]" strokeWidth={1.75} />
              <label htmlFor="merge-switch" className="text-sm font-medium text-[#2D2A26] cursor-pointer">
                Merge Calendars
              </label>
              <Switch
                id="merge-switch"
                checked={merged}
                onCheckedChange={setMerged}
                data-testid="merge-toggle"
              />
            </div>
          </div>
        </div>

        {/* Month navigation */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={goPrev}
              className="rounded-full hover:bg-[#F3F0EA]"
              data-testid="prev-month-btn"
            >
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <Button
              variant="ghost"
              onClick={goToday}
              className="rounded-full text-sm hover:bg-[#F3F0EA]"
              data-testid="today-btn"
            >
              Today
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={goNext}
              className="rounded-full hover:bg-[#F3F0EA]"
              data-testid="next-month-btn"
            >
              <ChevronRight className="w-5 h-5" />
            </Button>
          </div>
          <Button
            onClick={() => onAddEvent(todayStr, activeUserId)}
            className="rounded-full bg-[#2D2A26] hover:bg-[#1f1d1a] text-white"
            data-testid="add-event-btn"
          >
            <Plus className="w-4 h-4 mr-1.5" strokeWidth={2} /> New Event
          </Button>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 mb-2">
          {DAY_NAMES.map((d) => (
            <div
              key={d}
              className="py-2 text-center text-[11px] font-semibold text-[#7A7571] uppercase tracking-[0.15em]"
            >
              {d}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div
          className="grid grid-cols-7 auto-rows-fr gap-0.5 sm:gap-1"
          data-testid="calendar-grid"
        >
          {matrix.flat().map((cell, idx) => {
            const dayEvents = filterDayEvents(cell.iso);
            const wifeEvents = dayEvents.filter((e) => e.user_id === "wife");
            const husbandEvents = dayEvents.filter((e) => e.user_id === "husband");
            const isToday = cell.iso === todayStr;
            const dimmed = !cell.inMonth;

            // Build cell style — single mode: solid border, merged mode: gradient border (split colors)
            let cellStyle = {};
            if (cell.inMonth) {
              if (merged) {
                cellStyle = {
                  background:
                    "linear-gradient(#fff, #fff) padding-box, " +
                    "linear-gradient(to bottom, #F472B6 0%, #F472B6 50%, #60A5FA 50%, #60A5FA 100%) border-box",
                  border: "1.5px solid transparent",
                };
              } else {
                cellStyle = {
                  backgroundColor: "#fff",
                  border: `1.5px solid ${activeUserColor}`,
                };
              }
            }

            return (
              <Popover
                key={idx}
                open={openDayIso === cell.iso}
                onOpenChange={(o) => setOpenDayIso(o ? cell.iso : null)}
              >
                <PopoverTrigger asChild>
                  <div
                    className={`relative h-24 sm:h-28 md:h-32 cursor-pointer transition-all rounded-[10px] overflow-hidden ${
                      dimmed ? "opacity-40" : ""
                    }`}
                    style={cellStyle}
                    data-testid={`day-cell-${cell.iso}`}
                  >
                    {/* Date label */}
                    <span
                      className={`absolute top-0.5 left-1 z-20 inline-flex items-center justify-center text-[10px] sm:text-[11px] font-bold w-[18px] h-[18px] sm:w-5 sm:h-5 rounded-full ${
                        isToday
                          ? "bg-[#2D2A26] text-white"
                          : "bg-transparent text-[#2D2A26]"
                      }`}
                    >
                      {cell.day}
                    </span>

                    {/* Events */}
                    {cell.inMonth && (
                      merged ? (
                        <div className="absolute inset-0 flex flex-col">
                          {/* Wife half */}
                          <div className="flex-1 flex flex-col gap-[1px] min-h-0 overflow-hidden pt-5 sm:pt-[22px] px-[3px] pb-[2px]">
                            {wifeEvents.slice(0, MAX_EVENTS_PER_HALF).map((ev) => (
                              <EventBar
                                key={ev.id}
                                event={ev}
                                label={getEventLabel(ev)}
                                fill
                                testid={`event-bar-${ev.id}`}
                              />
                            ))}
                            {wifeEvents.length > MAX_EVENTS_PER_HALF && (
                              <span className="text-[9px] font-semibold text-[#7A7571] leading-none px-1">
                                +{wifeEvents.length - MAX_EVENTS_PER_HALF}
                              </span>
                            )}
                          </div>
                          {/* Husband half */}
                          <div className="flex-1 flex flex-col gap-[1px] min-h-0 overflow-hidden px-[3px] py-[2px]">
                            {husbandEvents.slice(0, MAX_EVENTS_PER_HALF).map((ev) => (
                              <EventBar
                                key={ev.id}
                                event={ev}
                                label={getEventLabel(ev)}
                                fill
                                testid={`event-bar-${ev.id}`}
                              />
                            ))}
                            {husbandEvents.length > MAX_EVENTS_PER_HALF && (
                              <span className="text-[9px] font-semibold text-[#7A7571] leading-none px-1">
                                +{husbandEvents.length - MAX_EVENTS_PER_HALF}
                              </span>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="absolute inset-0 flex flex-col gap-[1px] pt-5 sm:pt-[22px] px-[3px] pb-[2px] overflow-hidden">
                          {dayEvents.slice(0, MAX_EVENTS_SINGLE).map((ev) => (
                            <EventBar
                              key={ev.id}
                              event={ev}
                              label={getEventLabel(ev)}
                              fill
                              testid={`event-bar-${ev.id}`}
                            />
                          ))}
                          {dayEvents.length > MAX_EVENTS_SINGLE && (
                            <span className="text-[9px] font-semibold text-[#7A7571] leading-none px-1">
                              +{dayEvents.length - MAX_EVENTS_SINGLE} more
                            </span>
                          )}
                        </div>
                      )
                    )}
                  </div>
                </PopoverTrigger>
                <PopoverContent
                  align="center"
                  side="bottom"
                  className="z-50 bg-white/95 backdrop-blur-xl border border-white/40 rounded-2xl shadow-[0_24px_64px_-24px_rgba(0,0,0,0.18)] p-0 min-w-[320px] max-w-sm"
                >
                  <DayDetailPopover
                    dateIso={cell.iso}
                    events={dayEvents}
                    users={users}
                    eventTypes={eventTypes}
                    merged={merged}
                    activeUserId={activeUserId}
                    onAddEvent={(uid) => {
                      setOpenDayIso(null);
                      onAddEvent(cell.iso, uid);
                    }}
                    onEditEvent={(ev) => {
                      setOpenDayIso(null);
                      onEditEvent(ev);
                    }}
                    onDeleteEvent={onDeleteEvent}
                    onClose={() => setOpenDayIso(null)}
                  />
                </PopoverContent>
              </Popover>
            );
          })}
        </div>

        {loading && (
          <p className="text-xs text-[#7A7571] mt-4">Loading events…</p>
        )}
      </div>

      {/* Dialogs */}
      <EventDialog
        open={eventDialogOpen}
        onOpenChange={setEventDialogOpen}
        editing={editingEvent}
        defaultDate={dialogDefaultDate}
        defaultUserId={dialogDefaultUserId || activeUserId}
        users={users}
        eventTypes={eventTypes}
        onSaved={onEventSaved}
      />
      <EventTypesDialog
        open={typesDialogOpen}
        onOpenChange={setTypesDialogOpen}
        types={eventTypes}
        onChanged={onTypesChanged}
      />
      <ProfilesDialog
        open={profilesDialogOpen}
        onOpenChange={setProfilesDialogOpen}
        users={users}
        onChanged={async () => {
          const u = await getUsers();
          setUsers(u);
        }}
      />
    </div>
  );
};

export default TimePlan;
