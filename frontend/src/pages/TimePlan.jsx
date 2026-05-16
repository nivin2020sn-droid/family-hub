import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Plus,
  Settings2,
  Layers,
  UserCog,
  Zap,
  X,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import {
  getUsers,
  getEvents,
  getEventTypes,
  createEvent,
  deleteEvent,
} from "@/lib/api";
import { buildMonthMatrix, getDayNames, MONTH_NAMES, todayIso, getContrastTextColor } from "@/lib/utils";
import EventBar from "@/components/EventBar";
import EventDialog from "@/components/EventDialog";
import EventTypesDialog from "@/components/EventTypesDialog";
import DayDetailPopover from "@/components/DayDetailPopover";
import ProfilesDialog from "@/components/ProfilesDialog";

const WIFE_COLOR = "#F472B6";
const HUSBAND_COLOR = "#60A5FA";
const MAX_EVENTS_PER_HALF = 3;
const MAX_EVENTS_SINGLE = 6;

// Default users — always rendered so the calendar always shows both
// profiles even if the API hasn't responded yet or returned partial data.
const DEFAULT_USERS = [
  { id: "wife", name: "Wife", role: "wife", color: WIFE_COLOR },
  { id: "husband", name: "Husband", role: "husband", color: HUSBAND_COLOR },
];

const TimePlan = () => {
  const navigate = useNavigate();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1); // 1-12

  const [users, setUsers] = useState(DEFAULT_USERS);
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

  // Quick Fill Mode — when set, tapping a day adds/removes this event type
  const [quickFillTypeId, setQuickFillTypeId] = useState(null);

  // Week start: 1=Mon (default), 0=Sun, 6=Sat — persisted to localStorage
  const [weekStart, setWeekStart] = useState(() => {
    try {
      const v = parseInt(localStorage.getItem("mfml_week_start"), 10);
      if (v === 0 || v === 1 || v === 6) return v;
    } catch {}
    return 1;
  });
  useEffect(() => {
    try {
      localStorage.setItem("mfml_week_start", String(weekStart));
    } catch {}
  }, [weekStart]);

  // Sync state: online | offline | syncing | synced
  const [syncState, setSyncState] = useState(
    typeof navigator !== "undefined" && navigator.onLine ? "online" : "offline"
  );

  const [online, setOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);

  useEffect(() => {
    const onOnline = () => {
      setOnline(true);
      setSyncState((s) => (s === "syncing" ? s : "online"));
      toast.success("Back online — syncing");
      loadEvents();
    };
    const onOffline = () => {
      setOnline(false);
      setSyncState("offline");
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
      // Merge API response with defaults so both profiles are ALWAYS present,
      // even if the backend is slow / empty / returned only one.
      const byId = new Map(DEFAULT_USERS.map((x) => [x.id, x]));
      (Array.isArray(u) ? u : []).forEach((x) => {
        if (x && x.id) byId.set(x.id, { ...byId.get(x.id), ...x });
      });
      setUsers([byId.get("wife"), byId.get("husband")]);
      setEventTypes(t);
    })();
  }, []);

  const loadEvents = async () => {
    setLoading(true);
    const data = await getEvents({ year, month });
    setEvents(data);
    setLoading(false);
  };

  // Full sync — pull fresh data for users, types, and events
  const handleSync = async () => {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      toast.error("You're offline — can't sync");
      setSyncState("offline");
      return;
    }
    setSyncState("syncing");
    try {
      const [u, t, ev] = await Promise.all([
        getUsers(),
        getEventTypes(),
        getEvents({ year, month }),
      ]);
      const byId = new Map(DEFAULT_USERS.map((x) => [x.id, x]));
      (Array.isArray(u) ? u : []).forEach((x) => {
        if (x && x.id) byId.set(x.id, { ...byId.get(x.id), ...x });
      });
      setUsers([byId.get("wife"), byId.get("husband")]);
      setEventTypes(t);
      setEvents(ev);
      setSyncState("synced");
      toast.success("All synced");
      setTimeout(
        () =>
          setSyncState(
            typeof navigator !== "undefined" && navigator.onLine ? "online" : "offline"
          ),
        2500
      );
    } catch {
      setSyncState(
        typeof navigator !== "undefined" && navigator.onLine ? "online" : "offline"
      );
      toast.error("Sync failed");
    }
  };

  useEffect(() => {
    loadEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month]);

  const matrix = useMemo(() => buildMonthMatrix(year, month, weekStart), [year, month, weekStart]);
  const dayHeaders = useMemo(() => getDayNames(weekStart), [weekStart]);

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

  // Quick Fill: add (or remove if duplicate) the selected event type on a day
  // for the currently active user. Always targets activeUserId — never both.
  const handleQuickFill = async (dateIso) => {
    if (!quickFillTypeId) return false;
    const t = typesMap.get(quickFillTypeId);
    if (!t) return false;
    const existing = (eventsByDate.get(dateIso) || []).find(
      (e) => e.user_id === activeUserId && e.type_id === quickFillTypeId
    );
    try {
      if (existing) {
        await deleteEvent(existing.id);
        toast.message(`Removed ${t.abbreviation || t.name}`);
      } else {
        await createEvent({
          title: t.name,
          user_id: activeUserId,
          type_id: quickFillTypeId,
          color: t.color,
          date: dateIso,
        });
        toast.success(`Added ${t.abbreviation || t.name}`);
      }
      loadEvents();
      return true;
    } catch {
      toast.error("Quick fill failed");
      return false;
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF9F6]">
      <div className="max-w-7xl mx-auto px-3 sm:px-8 md:px-10 py-4 sm:py-6 md:py-10">
        {/* Top bar */}
        <div className="flex items-center justify-between mb-4 sm:mb-6 md:mb-8 gap-2">
          <button
            onClick={() => navigate("/")}
            className="inline-flex items-center gap-1.5 text-sm text-[#7A7571] hover:text-[#2D2A26] transition-colors active:opacity-60"
            data-testid="back-to-dashboard-btn"
          >
            <ArrowLeft className="w-5 h-5 sm:w-4 sm:h-4" strokeWidth={2} />
            <span className="hidden sm:inline">Dashboard</span>
          </button>
          <div className="flex items-center gap-1 sm:gap-2">
            {/* Sync status indicator + Sync Now button */}
            <button
              onClick={handleSync}
              disabled={syncState === "syncing"}
              className={`inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-full text-[10px] sm:text-xs font-semibold transition-all active:scale-95 ${
                syncState === "offline"
                  ? "bg-red-50 text-red-700 border border-red-200"
                  : syncState === "syncing"
                  ? "bg-amber-50 text-amber-800 border border-amber-200"
                  : syncState === "synced"
                  ? "bg-blue-50 text-blue-700 border border-blue-200"
                  : "bg-emerald-50 text-emerald-700 border border-emerald-200"
              }`}
              data-testid="sync-status-btn"
              aria-label="Sync now"
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  syncState === "offline"
                    ? "bg-red-500"
                    : syncState === "syncing"
                    ? "bg-amber-500 animate-pulse"
                    : syncState === "synced"
                    ? "bg-blue-500"
                    : "bg-emerald-500"
                }`}
              />
              <span className="hidden xs:inline sm:inline">
                {syncState === "offline"
                  ? "Offline"
                  : syncState === "syncing"
                  ? "Syncing…"
                  : syncState === "synced"
                  ? "Synced"
                  : "Sync"}
              </span>
            </button>
            <Button
              variant="ghost"
              onClick={() => setProfilesDialogOpen(true)}
              className="rounded-full text-[#2D2A26] hover:bg-[#F3F0EA] h-10 w-10 sm:w-auto sm:px-4 p-0 sm:p-2"
              data-testid="manage-profiles-btn"
              aria-label="Settings"
            >
              <UserCog className="w-5 h-5 sm:w-4 sm:h-4 sm:mr-2" strokeWidth={1.75} />
              <span className="hidden sm:inline">Settings</span>
            </Button>
            <Button
              variant="ghost"
              onClick={() => setTypesDialogOpen(true)}
              className="rounded-full text-[#2D2A26] hover:bg-[#F3F0EA] h-10 w-10 sm:w-auto sm:px-4 p-0 sm:p-2"
              data-testid="manage-types-btn"
              aria-label="Event Types"
            >
              <Settings2 className="w-5 h-5 sm:w-4 sm:h-4 sm:mr-2" strokeWidth={1.75} />
              <span className="hidden sm:inline">Event Types</span>
            </Button>
          </div>
        </div>

        {/* Header */}
        <div className="flex flex-col gap-3 sm:gap-6 md:flex-row md:items-end md:justify-between mb-4 sm:mb-6 md:mb-8">
          <div>
            <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-[0.2em] sm:tracking-[0.25em] text-[#7A7571] mb-1 sm:mb-3">
              Time Plan
            </p>
            <h1 className="font-heading text-3xl sm:text-5xl font-light tracking-tight text-[#2D2A26] leading-none">
              {MONTH_NAMES[month - 1]}{" "}
              <span className="text-[#7A7571] font-light">{year}</span>
            </h1>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 w-full md:w-auto">
            {/* User Switcher — always enabled. In merge mode it picks the
                ACTIVE target for Quick Fill / New Event. */}
            <div
              className="flex-1 md:flex-none inline-flex items-center gap-1 bg-[#F3F0EA] p-1 sm:p-1.5 rounded-full"
              data-testid="user-switcher"
            >
              {users.map((u) => {
                const isActive = u.id === activeUserId;
                return (
                  <button
                    key={u.id}
                    onClick={() => setActiveUserId(u.id)}
                    className={`flex-1 md:flex-none px-3 sm:px-5 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-semibold transition-all flex items-center justify-center gap-1.5 sm:gap-2 active:scale-95 ${
                      isActive
                        ? "bg-white shadow-sm text-[#2D2A26]"
                        : "text-[#7A7571] hover:text-[#2D2A26]"
                    }`}
                    data-testid={`user-pill-${u.id}`}
                  >
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: u.color }}
                    />
                    <span className="truncate max-w-[80px] sm:max-w-none">{u.name}</span>
                  </button>
                );
              })}
            </div>

            {/* Merge toggle — compact on mobile (icon + switch only) */}
            <div className="flex items-center gap-2 sm:gap-3 bg-white border border-[#E5E2DC] px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-full shadow-sm flex-shrink-0">
              <Layers className="w-4 h-4 text-[#7A7571]" strokeWidth={1.75} />
              <label htmlFor="merge-switch" className="hidden sm:inline text-sm font-medium text-[#2D2A26] cursor-pointer">
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
        <div className="flex items-center justify-between mb-3 sm:mb-4">
          <div className="flex items-center gap-0.5 sm:gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={goPrev}
              className="rounded-full hover:bg-[#F3F0EA] h-10 w-10"
              data-testid="prev-month-btn"
              aria-label="Previous month"
            >
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <Button
              variant="ghost"
              onClick={goToday}
              className="rounded-full text-xs sm:text-sm hover:bg-[#F3F0EA] h-10 px-3"
              data-testid="today-btn"
            >
              Today
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={goNext}
              className="rounded-full hover:bg-[#F3F0EA] h-10 w-10"
              data-testid="next-month-btn"
              aria-label="Next month"
            >
              <ChevronRight className="w-5 h-5" />
            </Button>
          </div>
          <Button
            onClick={() => onAddEvent(todayStr, activeUserId)}
            className="rounded-full bg-[#2D2A26] hover:bg-[#1f1d1a] text-white h-10 px-4 sm:px-5 active:scale-95"
            data-testid="add-event-btn"
          >
            <Plus className="w-4 h-4 sm:mr-1.5" strokeWidth={2} />
            <span className="hidden sm:inline">New Event</span>
            <span className="sm:hidden ml-1.5 text-sm">Add</span>
          </Button>
        </div>

        {/* Day headers — single letter on mobile, full short name on larger screens */}
        <div className="grid grid-cols-7 gap-0.5 sm:gap-1 mb-1 sm:mb-2">
          {dayHeaders.map((d, i) => (
            <div
              key={`${d}-${i}`}
              className="py-1 sm:py-2 text-center text-[10px] sm:text-[11px] font-semibold text-[#7A7571] uppercase tracking-[0.1em] sm:tracking-[0.15em]"
            >
              <span className="sm:hidden">{d[0]}</span>
              <span className="hidden sm:inline">{d}</span>
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
                onOpenChange={(o) => {
                  if (o && quickFillTypeId && cell.inMonth) {
                    // Quick Fill takes priority — do not open the popover
                    handleQuickFill(cell.iso);
                    return;
                  }
                  setOpenDayIso(o ? cell.iso : null);
                }}
              >
                <PopoverTrigger asChild>
                  <div
                    className={`relative h-[72px] sm:h-28 md:h-32 cursor-pointer transition-all rounded-[10px] overflow-hidden active:scale-[0.97] ${
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
                          <div className="flex-1 flex flex-col gap-[1px] min-h-0 overflow-hidden pt-[18px] sm:pt-[22px] px-[3px] pb-[2px]">
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
                        <div className="absolute inset-0 flex flex-col gap-[1px] pt-[18px] sm:pt-[22px] px-[3px] pb-[2px] overflow-hidden">
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

        {/* Spacer so calendar isn't covered by the fixed quick-fill bar */}
        <div aria-hidden className="h-20 sm:h-24" />
      </div>

      {/* Quick Fill bar — fixed bottom strip */}
      {eventTypes.length > 0 && (
        <div
          className="fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-[#E5E2DC] shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.08)]"
          data-testid="quick-fill-bar"
        >
          <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2 sm:py-2.5">
            <div className="flex items-center gap-2">
              {/* Status pill */}
              <div className="flex-shrink-0 flex items-center gap-1.5 text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider">
                <Zap
                  className={`w-3.5 h-3.5 ${quickFillTypeId ? "text-[#2D2A26]" : "text-[#7A7571]"}`}
                  strokeWidth={2.25}
                />
                <span className={quickFillTypeId ? "text-[#2D2A26]" : "text-[#7A7571]"}>
                  Quick Fill
                </span>
              </div>

              {/* Scrollable list of type buttons */}
              <div
                className="flex-1 flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar"
                style={{ scrollbarWidth: "none" }}
              >
                {eventTypes.map((t) => {
                  const isActive = t.id === quickFillTypeId;
                  const textColor = getContrastTextColor(t.color);
                  const label = (t.abbreviation && t.abbreviation.trim())
                    ? t.abbreviation
                    : (t.name || "").slice(0, 4).toUpperCase();
                  return (
                    <button
                      key={t.id}
                      onClick={() =>
                        setQuickFillTypeId(isActive ? null : t.id)
                      }
                      className={`flex-shrink-0 h-9 min-w-[44px] px-2.5 rounded-lg text-[11px] sm:text-xs font-extrabold uppercase tracking-wide transition-all active:scale-95 ${
                        isActive
                          ? "ring-2 ring-offset-2 ring-[#2D2A26] ring-offset-white scale-105"
                          : "opacity-90 hover:opacity-100"
                      }`}
                      style={{ backgroundColor: t.color, color: textColor }}
                      title={t.name}
                      data-testid={`quick-fill-type-${t.id}`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              {/* Active indicator + clear button */}
              {quickFillTypeId && (
                <button
                  onClick={() => setQuickFillTypeId(null)}
                  className="flex-shrink-0 h-9 w-9 rounded-lg bg-[#F3F0EA] flex items-center justify-center active:scale-95"
                  aria-label="Turn off Quick Fill"
                  data-testid="quick-fill-off-btn"
                >
                  <X className="w-4 h-4 text-[#2D2A26]" strokeWidth={2.25} />
                </button>
              )}
            </div>

            {/* Target indicator — visible when active */}
            {quickFillTypeId && (
              <p
                className="mt-1.5 text-[10px] sm:text-[11px] text-[#7A7571] leading-none"
                data-testid="quick-fill-target"
              >
                Tap a day to add/remove for{" "}
                <span className="font-semibold text-[#2D2A26]">
                  {(users.find((u) => u.id === activeUserId) || {}).name || activeUserId}
                </span>
                . Tap the same day again to undo.
              </p>
            )}
          </div>
        </div>
      )}

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
        weekStart={weekStart}
        onWeekStartChange={setWeekStart}
        onChanged={async () => {
          const u = await getUsers();
          const byId = new Map(DEFAULT_USERS.map((x) => [x.id, x]));
          (Array.isArray(u) ? u : []).forEach((x) => {
            if (x && x.id) byId.set(x.id, { ...byId.get(x.id), ...x });
          });
          setUsers([byId.get("wife"), byId.get("husband")]);
        }}
      />
    </div>
  );
};

export default TimePlan;
