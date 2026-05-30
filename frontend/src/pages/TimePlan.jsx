// Time Plan — per-member calendar.
//
// Each family member owns their own events. A member sees ONLY their own
// calendar by default. Family admins can open "Family Calendar View" to
// overlay any combination of members on the same grid, each rendered in
// their own colour. Events authored by the active member always default
// to themselves; only admins can pick another owner.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, ChevronLeft, ChevronRight, Plus, Settings2, Users as UsersIcon,
  Zap, X, Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  getEvents, getEventTypes, createEvent, deleteEvent,
} from "@/lib/api";
import { listMembers, getMember, isSingleAccount } from "@/lib/auth";
import { buildMonthMatrix, todayIso, getContrastTextColor } from "@/lib/utils";
import EventBar from "@/components/EventBar";
import EventDialog from "@/components/EventDialog";
import EventTypesDialog from "@/components/EventTypesDialog";
import DayDetailPopover from "@/components/DayDetailPopover";
import MemberBadge from "@/components/MemberBadge";
import { useI18n } from "@/lib/i18n";

const FALLBACK_COLOR = "#94A3B8";
const MAX_EVENTS_SINGLE = 6;

const TimePlan = () => {
  const navigate = useNavigate();
  const { t } = useI18n();

  const currentMember = getMember();
  const currentMemberId = currentMember?.id || null;
  const isAdmin = !!currentMember?.is_family_admin;
  const isSingle = isSingleAccount();

  // Localized month names + short weekday names.
  const MONTH_NAMES_LOCAL = useMemo(
    () => Array.from({ length: 12 }, (_, i) => t(`month.${i + 1}`)),
    [t]
  );
  const SHORT_DAY_BY_INDEX = useMemo(
    () => Array.from({ length: 7 }, (_, i) => t(`day.short.${i}`)),
    [t]
  );

  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);

  // Members of the family (sorted by created_at, server-side).
  const [users, setUsers] = useState([]);
  // Which member's "Add event" button targets by default (the pill picker).
  const [activeUserId, setActiveUserId] = useState(currentMemberId);
  // Which members are currently rendered on the grid. Default = self.
  const [visibleUserIds, setVisibleUserIds] = useState(
    () => new Set(currentMemberId ? [currentMemberId] : [])
  );
  const [filterDialogOpen, setFilterDialogOpen] = useState(false);

  const [events, setEvents] = useState([]);
  const [eventTypes, setEventTypes] = useState([]);
  const [loading, setLoading] = useState(false);

  const [eventDialogOpen, setEventDialogOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [dialogDefaultDate, setDialogDefaultDate] = useState(null);
  const [dialogDefaultUserId, setDialogDefaultUserId] = useState(null);
  const [typesDialogOpen, setTypesDialogOpen] = useState(false);
  const [openDayIso, setOpenDayIso] = useState(null);

  const [quickFillTypeId, setQuickFillTypeId] = useState(null);

  // Week start, persisted to localStorage (1=Mon default, 0=Sun, 6=Sat).
  const [weekStart, setWeekStart] = useState(() => {
    try {
      const v = parseInt(localStorage.getItem("mfml_week_start"), 10);
      if (v === 0 || v === 1 || v === 6) return v;
    } catch {}
    return 1;
  });
  useEffect(() => {
    try { localStorage.setItem("mfml_week_start", String(weekStart)); } catch {}
  }, [weekStart]);

  // Online/sync indicator.
  const [syncState, setSyncState] = useState(
    typeof navigator !== "undefined" && navigator.onLine ? "online" : "offline"
  );

  // ----- Loaders -----
  const loadMembers = useCallback(async () => {
    try {
      const ms = await listMembers();
      const arr = Array.isArray(ms) ? ms : [];
      setUsers(arr);
      // First-load: if no visible users are set yet OR our previous
      // active id has been removed, re-anchor on the current member.
      setVisibleUserIds((prev) => {
        if (prev.size === 0 && currentMemberId) {
          return new Set([currentMemberId]);
        }
        // Strip any ids that no longer exist in the family.
        const next = new Set([...prev].filter((id) => arr.find((m) => m.id === id)));
        if (next.size === 0 && currentMemberId) next.add(currentMemberId);
        return next;
      });
      setActiveUserId((curr) => {
        if (curr && arr.find((m) => m.id === curr)) return curr;
        return currentMemberId || (arr[0] && arr[0].id) || null;
      });
    } catch (err) {
      const detail = err?.response?.status ? `HTTP ${err.response.status}` : err?.message || "network error";
      toast.error(t("tp.failedLoadMembers", { detail }));
    }
  }, [currentMemberId, t]);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    try {
      // Admins can opt into a multi-owner filter; non-admins are forced to
      // their own events by the backend regardless of params.
      const params = { year, month };
      if (isAdmin && visibleUserIds.size > 0) {
        params.user_ids = [...visibleUserIds].join(",");
      }
      const data = await getEvents(params);
      setEvents(data);
    } catch (err) {
      const detail = err?.response?.status ? `HTTP ${err.response.status}` : err?.message || "network error";
      toast.error(t("tp.failedLoadEvents", { detail }));
    } finally {
      setLoading(false);
    }
  }, [year, month, isAdmin, visibleUserIds, t]);

  useEffect(() => { loadMembers(); }, [loadMembers]);
  useEffect(() => { loadEvents(); }, [loadEvents]);

  useEffect(() => {
    (async () => {
      try { setEventTypes(await getEventTypes()); } catch {}
    })();
  }, []);

  useEffect(() => {
    const onOnline = () => { setSyncState("online"); loadEvents(); };
    const onOffline = () => setSyncState("offline");
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [loadEvents]);

  const handleSync = async () => {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      toast.error(t("sync.cantSyncOffline"));
      return;
    }
    setSyncState("syncing");
    try {
      await Promise.all([loadMembers(), loadEvents(), getEventTypes().then(setEventTypes)]);
      setSyncState("synced");
      toast.success(t("sync.allSyncedToast"));
      setTimeout(() => setSyncState(navigator.onLine ? "online" : "offline"), 1800);
    } catch (err) {
      setSyncState(navigator.onLine ? "online" : "offline");
      const detail = err?.response?.status ? `HTTP ${err.response.status}` : err?.message || "network error";
      toast.error(t("sync.failedDetail", { detail, url: "" }), { duration: 6000 });
    }
  };

  // ----- Derived -----
  const userById = useMemo(() => {
    const m = new Map();
    users.forEach((u) => m.set(u.id, u));
    return m;
  }, [users]);

  const ownerOf = (ev) => ev.owner_member_id || ev.user_id;
  const colorFor = (ev) => {
    const u = userById.get(ownerOf(ev));
    return (u && u.color) || ev.color || FALLBACK_COLOR;
  };

  const matrix = useMemo(() => buildMonthMatrix(year, month, weekStart), [year, month, weekStart]);
  const dayHeaders = useMemo(
    () => Array.from({ length: 7 }, (_, i) => SHORT_DAY_BY_INDEX[(i + weekStart) % 7]),
    [weekStart, SHORT_DAY_BY_INDEX]
  );

  const eventsByDate = useMemo(() => {
    const map = new Map();
    events.forEach((e) => {
      if (!map.has(e.date)) map.set(e.date, []);
      // Inject the owner colour so EventBar paints by member, not by raw event color.
      map.get(e.date).push({ ...e, color: colorFor(e) });
    });
    map.forEach((arr) => arr.sort((a, b) => (a.start_time || "").localeCompare(b.start_time || "")));
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, userById]);

  const typesMap = useMemo(() => {
    const m = new Map();
    eventTypes.forEach((tp) => m.set(tp.id, tp));
    return m;
  }, [eventTypes]);

  const getEventLabel = (ev) => {
    if (ev.type_id && typesMap.has(ev.type_id)) {
      const tp = typesMap.get(ev.type_id);
      if (tp.abbreviation && tp.abbreviation.trim()) return tp.abbreviation;
    }
    return (ev.title || "").slice(0, 4).toUpperCase();
  };

  const isMulti = visibleUserIds.size > 1;
  const activeUser = userById.get(activeUserId);
  const activeUserColor = (activeUser && activeUser.color) || FALLBACK_COLOR;

  // The owners that should actually appear on the grid. Non-admin sees only self.
  const effectiveVisibleIds = useMemo(() => {
    if (!isAdmin) return new Set([currentMemberId]);
    if (visibleUserIds.size > 0) return visibleUserIds;
    return new Set([currentMemberId]);
  }, [isAdmin, currentMemberId, visibleUserIds]);

  const filterDayEvents = (dayIso) => {
    const all = eventsByDate.get(dayIso) || [];
    return all.filter((e) => effectiveVisibleIds.has(ownerOf(e)));
  };

  // ----- Navigation -----
  const goPrev = () => (month === 1 ? (setMonth(12), setYear(year - 1)) : setMonth(month - 1));
  const goNext = () => (month === 12 ? (setMonth(1), setYear(year + 1)) : setMonth(month + 1));
  const goToday = () => {
    const now = new Date();
    setYear(now.getFullYear());
    setMonth(now.getMonth() + 1);
  };

  // ----- Event handlers -----
  const onAddEvent = (dateIso, userId) => {
    setEditingEvent(null);
    setDialogDefaultDate(dateIso);
    // Non-admins can only add for themselves regardless of which pill they tapped.
    const defaultOwner = isAdmin ? (userId || activeUserId) : currentMemberId;
    setDialogDefaultUserId(defaultOwner);
    setEventDialogOpen(true);
  };
  const onEditEvent = (ev) => {
    // Non-admins can only edit their own.
    if (!isAdmin && ownerOf(ev) !== currentMemberId) {
      toast.error(t("tp.cantEditOthers"));
      return;
    }
    setEditingEvent(ev);
    setDialogDefaultDate(ev.date);
    setDialogDefaultUserId(ownerOf(ev));
    setEventDialogOpen(true);
  };
  const onDeleteEvent = async (id, ev) => {
    if (!isAdmin && ev && ownerOf(ev) !== currentMemberId) {
      toast.error(t("tp.cantDeleteOthers"));
      return;
    }
    try {
      await deleteEvent(id);
      toast.success(t("tp.eventDeleted"));
      loadEvents();
    } catch {
      toast.error(t("tp.failedToDelete"));
    }
  };
  const onEventSaved = () => { setEventDialogOpen(false); loadEvents(); };

  const todayStr = todayIso();

  const handleQuickFill = async (dateIso) => {
    if (!quickFillTypeId) return false;
    const tp = typesMap.get(quickFillTypeId);
    if (!tp) return false;
    // Quick fill always targets the active member; if no permission, fall
    // back to self silently.
    const owner = isAdmin ? activeUserId : currentMemberId;
    const existing = (eventsByDate.get(dateIso) || []).find(
      (e) => ownerOf(e) === owner && e.type_id === quickFillTypeId
    );
    try {
      if (existing) {
        await deleteEvent(existing.id);
        toast.message(t("tp.removedShort", { label: tp.abbreviation || tp.name }));
      } else {
        await createEvent({
          title: tp.name, user_id: owner, type_id: quickFillTypeId,
          color: tp.color, date: dateIso,
        });
        toast.success(t("tp.addedShort", { label: tp.abbreviation || tp.name }));
      }
      loadEvents();
      return true;
    } catch (err) {
      const detail = err?.response?.status ? `HTTP ${err.response.status}` : err?.message || "network error";
      toast.error(t("tp.saveFailedShort", { detail }));
      return false;
    }
  };

  // Toggle helper for the filter dialog.
  const toggleVisible = (id) => {
    setVisibleUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      // Keep at least one selection so the grid never goes blank.
      if (next.size === 0 && currentMemberId) next.add(currentMemberId);
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-[#FAF9F6]" dir-aware="true">
      <div className="max-w-7xl mx-auto px-3 sm:px-8 md:px-10 py-4 sm:py-6 md:py-10">
        {/* Top bar */}
        <div className="flex items-center justify-between mb-4 sm:mb-6 md:mb-8 gap-2">
          <button
            onClick={() => navigate("/")}
            className="inline-flex items-center gap-1.5 text-sm text-[#7A7571] hover:text-[#2D2A26] transition-colors active:opacity-60"
            data-testid="back-to-dashboard-btn"
          >
            <ArrowLeft className="w-5 h-5 sm:w-4 sm:h-4" strokeWidth={2} />
            <span className="hidden sm:inline">{t("nav.dashboard")}</span>
          </button>
          {currentMember && (
            <div className="flex-1 flex justify-center min-w-0" data-testid="tp-member-strip">
              <MemberBadge member={currentMember} compact className="max-w-[200px]" />
            </div>
          )}
          <div className="flex items-center gap-1 sm:gap-2">
            <button
              onClick={handleSync}
              disabled={syncState === "syncing"}
              className={`inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-full text-[10px] sm:text-xs font-semibold transition-all active:scale-95 ${
                syncState === "offline" ? "bg-red-50 text-red-700 border border-red-200"
                : syncState === "syncing" ? "bg-amber-50 text-amber-800 border border-amber-200"
                : syncState === "synced" ? "bg-blue-50 text-blue-700 border border-blue-200"
                : "bg-emerald-50 text-emerald-700 border border-emerald-200"
              }`}
              data-testid="sync-status-btn"
              aria-label={t("btn.syncNow")}
            >
              <span className={`w-2 h-2 rounded-full ${
                syncState === "offline" ? "bg-red-500"
                : syncState === "syncing" ? "bg-amber-500 animate-pulse"
                : syncState === "synced" ? "bg-blue-500"
                : "bg-emerald-500"
              }`} />
              <span className="hidden xs:inline sm:inline">
                {syncState === "offline" ? t("sync.offline")
                 : syncState === "syncing" ? t("sync.syncing")
                 : syncState === "synced" ? t("sync.synced")
                 : t("sync.sync")}
              </span>
            </button>
            {isAdmin && !isSingle && (
              <Button
                variant="ghost"
                onClick={() => navigate("/family-members")}
                className="rounded-full text-[#2D2A26] hover:bg-[#F3F0EA] h-10 w-10 sm:w-auto sm:px-4 p-0 sm:p-2"
                data-testid="manage-family-btn"
                aria-label={t("members.manage")}
              >
                <UsersIcon className="w-5 h-5 sm:w-4 sm:h-4 sm:mr-2 rtl:sm:mr-0 rtl:sm:ml-2" strokeWidth={1.75} />
                <span className="hidden sm:inline">{t("members.manage")}</span>
              </Button>
            )}
            <Button
              variant="ghost"
              onClick={() => setTypesDialogOpen(true)}
              className="rounded-full text-[#2D2A26] hover:bg-[#F3F0EA] h-10 w-10 sm:w-auto sm:px-4 p-0 sm:p-2"
              data-testid="manage-types-btn"
              aria-label={t("tp.eventTypes")}
            >
              <Settings2 className="w-5 h-5 sm:w-4 sm:h-4 sm:mr-2 rtl:sm:mr-0 rtl:sm:ml-2" strokeWidth={1.75} />
              <span className="hidden sm:inline">{t("tp.eventTypes")}</span>
            </Button>
          </div>
        </div>

        {/* Header */}
        <div className="flex flex-col gap-3 sm:gap-6 md:flex-row md:items-end md:justify-between mb-4 sm:mb-6 md:mb-8">
          <div>
            <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-[0.2em] sm:tracking-[0.25em] text-[#7A7571] mb-1 sm:mb-3">
              {t("tp.title")}
            </p>
            <h1 className="font-heading text-3xl sm:text-5xl font-light tracking-tight text-[#2D2A26] leading-none">
              {MONTH_NAMES_LOCAL[month - 1]}{" "}
              <span className="text-[#7A7571] font-light">{year}</span>
            </h1>
            <p className="mt-2 text-xs text-[#7A7571]">
              {isMulti
                ? t("tp.viewingFamily", { n: visibleUserIds.size })
                : t("tp.viewingMember", { name: (activeUser && activeUser.name) || "" })}
            </p>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 w-full md:w-auto">
            {/* Member pill switcher: tap to switch the "active" calendar. Admins
                can switch to any member; non-admins are locked to self.
                Hidden for single accounts (there is only one member). */}
            {!isSingle && (
              <div
                className="flex-1 md:flex-none inline-flex items-center gap-1 bg-[#F3F0EA] p-1 sm:p-1.5 rounded-full overflow-x-auto no-scrollbar"
                data-testid="user-switcher"
              >
              {users.length === 0 ? (
                <span className="px-3 py-1.5 text-xs text-[#7A7571]">{t("tp.noMembersYet")}</span>
              ) : users.map((u) => {
                const active = u.id === activeUserId;
                const disabled = !isAdmin && u.id !== currentMemberId;
                return (
                  <button
                    key={u.id}
                    onClick={() => {
                      if (disabled) return;
                      setActiveUserId(u.id);
                      // When switching active member, also single-visibility-mode.
                      setVisibleUserIds(new Set([u.id]));
                    }}
                    disabled={disabled}
                    className={`flex-shrink-0 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-semibold transition-all flex items-center gap-1.5 sm:gap-2 active:scale-95 ${
                      active ? "bg-white shadow-sm text-[#2D2A26]"
                            : disabled ? "text-[#9CA3AF] opacity-50 cursor-not-allowed"
                                       : "text-[#7A7571] hover:text-[#2D2A26]"
                    }`}
                    data-testid={`user-pill-${u.id}`}
                  >
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: u.color || FALLBACK_COLOR }} />
                    <span className="truncate max-w-[80px] sm:max-w-none">{u.name}</span>
                  </button>
                );
              })}
              </div>
            )}

            {isAdmin && !isSingle && (
              <Button
                variant="outline"
                onClick={() => setFilterDialogOpen(true)}
                className="rounded-full border-[#E5E2DC] text-[#2D2A26] hover:bg-[#F3F0EA] h-10 px-3 sm:px-4 flex-shrink-0"
                data-testid="open-family-view-btn"
              >
                <UsersIcon className="w-4 h-4 sm:mr-2 rtl:sm:mr-0 rtl:sm:ml-2" strokeWidth={1.75} />
                <span className="hidden sm:inline">{t("tp.familyView")}</span>
                {isMulti && (
                  <span className="ml-1 inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#2D2A26] text-white text-[10px] font-bold">
                    {visibleUserIds.size}
                  </span>
                )}
              </Button>
            )}
          </div>
        </div>

        {/* Month navigation */}
        <div className="flex items-center justify-between mb-3 sm:mb-4">
          <div className="flex items-center gap-0.5 sm:gap-1">
            <Button variant="ghost" size="icon" onClick={goPrev} className="rounded-full hover:bg-[#F3F0EA] h-10 w-10" data-testid="prev-month-btn" aria-label={t("tp.prevMonth")}>
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <Button variant="ghost" onClick={goToday} className="rounded-full text-xs sm:text-sm hover:bg-[#F3F0EA] h-10 px-3" data-testid="today-btn">
              {t("tp.today")}
            </Button>
            <Button variant="ghost" size="icon" onClick={goNext} className="rounded-full hover:bg-[#F3F0EA] h-10 w-10" data-testid="next-month-btn" aria-label={t("tp.nextMonth")}>
              <ChevronRight className="w-5 h-5" />
            </Button>
          </div>
          <Button onClick={() => onAddEvent(todayStr, activeUserId)} className="rounded-full bg-[#2D2A26] hover:bg-[#1f1d1a] text-white h-10 px-4 sm:px-5 active:scale-95" data-testid="add-event-btn">
            <Plus className="w-4 h-4 sm:mr-1.5 rtl:sm:mr-0 rtl:sm:ml-1.5" strokeWidth={2} />
            <span className="hidden sm:inline">{t("tp.newEvent")}</span>
            <span className="sm:hidden ml-1.5 rtl:ml-0 rtl:mr-1.5 text-sm">{t("btn.add")}</span>
          </Button>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 gap-0.5 sm:gap-1 mb-1 sm:mb-2">
          {dayHeaders.map((d, i) => (
            <div key={`${d}-${i}`} className="py-1 sm:py-2 text-center text-[10px] sm:text-[11px] font-semibold text-[#7A7571] uppercase tracking-[0.1em] sm:tracking-[0.15em]">
              <span className="sm:hidden">{d[0]}</span>
              <span className="hidden sm:inline">{d}</span>
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 auto-rows-fr gap-0.5 sm:gap-1" data-testid="calendar-grid">
          {matrix.flat().map((cell, idx) => {
            const dayEvents = filterDayEvents(cell.iso);
            const isToday = cell.iso === todayStr;
            const dimmed = !cell.inMonth;
            // Border colour: single mode → that member's colour; multi → neutral.
            const cellStyle = cell.inMonth ? {
              backgroundColor: "#fff",
              border: `1.5px solid ${isMulti ? "#E5E2DC" : activeUserColor}`,
            } : {};

            return (
              <Popover key={idx} open={openDayIso === cell.iso} onOpenChange={(o) => {
                if (o && quickFillTypeId && cell.inMonth) { handleQuickFill(cell.iso); return; }
                setOpenDayIso(o ? cell.iso : null);
              }}>
                <PopoverTrigger asChild>
                  <div
                    className={`relative h-[72px] sm:h-28 md:h-32 cursor-pointer transition-all rounded-[10px] overflow-hidden active:scale-[0.97] ${dimmed ? "opacity-40" : ""}`}
                    style={cellStyle}
                    data-testid={`day-cell-${cell.iso}`}
                  >
                    <span className={`absolute top-0.5 left-1 z-20 inline-flex items-center justify-center text-[10px] sm:text-[11px] font-bold w-[18px] h-[18px] sm:w-5 sm:h-5 rounded-full ${isToday ? "bg-[#2D2A26] text-white" : "bg-transparent text-[#2D2A26]"}`}>
                      {cell.day}
                    </span>
                    {cell.inMonth && (
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
                            +{dayEvents.length - MAX_EVENTS_SINGLE}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </PopoverTrigger>
                <PopoverContent align="center" side="bottom" className="z-50 bg-white/95 backdrop-blur-xl border border-white/40 rounded-2xl shadow-[0_24px_64px_-24px_rgba(0,0,0,0.18)] p-0 min-w-[320px] max-w-sm">
                  <DayDetailPopover
                    dateIso={cell.iso}
                    events={dayEvents}
                    users={users}
                    eventTypes={eventTypes}
                    activeUserId={activeUserId}
                    canAddForOthers={isAdmin}
                    canEditEvent={(ev) => isAdmin || ownerOf(ev) === currentMemberId}
                    onAddEvent={(uid) => { setOpenDayIso(null); onAddEvent(cell.iso, uid); }}
                    onEditEvent={(ev) => { setOpenDayIso(null); onEditEvent(ev); }}
                    onDeleteEvent={onDeleteEvent}
                  />
                </PopoverContent>
              </Popover>
            );
          })}
        </div>

        {loading && <p className="text-xs text-[#7A7571] mt-4">{t("tp.loadingEvents")}</p>}
        <div aria-hidden className="h-20 sm:h-24" />
      </div>

      {/* Quick Fill bar */}
      <div className="fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-[#E5E2DC] shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.08)]" data-testid="quick-fill-bar">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2 sm:py-2.5">
          <div className="flex items-center gap-2">
            <div className="flex-shrink-0 flex items-center gap-1.5 text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider">
              <Zap className={`w-3.5 h-3.5 ${quickFillTypeId ? "text-[#2D2A26]" : "text-[#7A7571]"}`} strokeWidth={2.25} />
              <span className={quickFillTypeId ? "text-[#2D2A26]" : "text-[#7A7571]"}>{t("tp.quickFill")}</span>
            </div>
            {eventTypes.length > 0 ? (
              <div className="flex-1 flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar" style={{ scrollbarWidth: "none" }}>
                {eventTypes.map((tp) => {
                  const isActive = tp.id === quickFillTypeId;
                  const textColor = getContrastTextColor(tp.color);
                  const label = (tp.abbreviation && tp.abbreviation.trim()) ? tp.abbreviation : (tp.name || "").slice(0, 4).toUpperCase();
                  return (
                    <button key={tp.id} onClick={() => setQuickFillTypeId(isActive ? null : tp.id)} className={`flex-shrink-0 h-9 min-w-[44px] px-2.5 rounded-lg text-[11px] sm:text-xs font-extrabold uppercase tracking-wide transition-all active:scale-95 ${isActive ? "ring-2 ring-offset-2 ring-[#2D2A26] ring-offset-white scale-105" : "opacity-90 hover:opacity-100"}`} style={{ backgroundColor: tp.color, color: textColor }} title={tp.name} data-testid={`quick-fill-type-${tp.id}`}>
                      {label}
                    </button>
                  );
                })}
              </div>
            ) : (
              <button onClick={() => setTypesDialogOpen(true)} className="flex-1 text-left text-[11px] sm:text-xs text-[#7A7571] active:opacity-70" data-testid="quick-fill-empty-cta">
                <span className="font-semibold text-[#2D2A26]">{t("tp.createEventTypes")}</span>
                <span className="hidden sm:inline">{t("tp.toEnableQuickFill")}</span>
              </button>
            )}
            {quickFillTypeId && (
              <button onClick={() => setQuickFillTypeId(null)} className="flex-shrink-0 h-9 w-9 rounded-lg bg-[#F3F0EA] flex items-center justify-center active:scale-95" aria-label={t("tp.turnOffQuickFill")} data-testid="quick-fill-off-btn">
                <X className="w-4 h-4 text-[#2D2A26]" strokeWidth={2.25} />
              </button>
            )}
          </div>
          {quickFillTypeId && (
            <p className="mt-1.5 text-[10px] sm:text-[11px] text-[#7A7571] leading-none" data-testid="quick-fill-target">
              {t("tp.tapDayPrefix")}
              <span className="font-semibold text-[#2D2A26]">{(userById.get(activeUserId) || {}).name || ""}</span>
              {t("tp.tapDaySuffix")}
            </p>
          )}
        </div>
      </div>

      {/* Dialogs */}
      <EventDialog
        open={eventDialogOpen}
        onOpenChange={setEventDialogOpen}
        editing={editingEvent}
        defaultDate={dialogDefaultDate}
        defaultUserId={dialogDefaultUserId || activeUserId || currentMemberId}
        users={users}
        eventTypes={eventTypes}
        canChangeOwner={isAdmin}
        currentMemberId={currentMemberId}
        onSaved={onEventSaved}
      />
      <EventTypesDialog
        open={typesDialogOpen}
        onOpenChange={setTypesDialogOpen}
        types={eventTypes}
        onChanged={async () => setEventTypes(await getEventTypes())}
      />

      {/* Family Calendar View dialog — admins only, multi-select members */}
      <Dialog open={filterDialogOpen} onOpenChange={setFilterDialogOpen}>
        <DialogContent className="max-w-sm rounded-3xl border border-[#E5E2DC] bg-white" data-testid="family-view-dialog">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl flex items-center gap-2">
              <UsersIcon className="w-5 h-5 text-[#2D2A26]" />
              {t("tp.familyView")}
            </DialogTitle>
            <DialogDescription className="text-xs text-[#7A7571]">
              {t("tp.familyView.desc")}
            </DialogDescription>
          </DialogHeader>
          <ul className="space-y-1.5" data-testid="family-view-list">
            {users.map((u) => {
              const checked = visibleUserIds.has(u.id);
              return (
                <li key={u.id}>
                  <button
                    type="button"
                    onClick={() => toggleVisible(u.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl border ${checked ? "border-[#2D2A26] bg-[#FAF9F6]" : "border-[#EFEBE4] hover:bg-[#FAF9F6]"}`}
                    data-testid={`family-view-toggle-${u.id}`}
                  >
                    <span className="w-7 h-7 rounded-full flex items-center justify-center" style={{ backgroundColor: (u.color || FALLBACK_COLOR) + "33", color: u.color || FALLBACK_COLOR }}>
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: u.color || FALLBACK_COLOR }} />
                    </span>
                    <span className="flex-1 text-start font-semibold text-sm text-[#2D2A26] truncate">{u.name}</span>
                    {u.is_family_admin && (
                      <span className="text-[9px] font-bold uppercase tracking-widest text-amber-700">{t("members.admin")}</span>
                    )}
                    <span className={`w-5 h-5 rounded-md border flex items-center justify-center ${checked ? "bg-[#2D2A26] border-[#2D2A26] text-white" : "border-[#D1D5DB]"}`}>
                      {checked && <Check className="w-3 h-3" strokeWidth={3} />}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={() => setVisibleUserIds(new Set(currentMemberId ? [currentMemberId] : []))} className="rounded-full" data-testid="family-view-reset">
              {t("tp.familyView.onlyMe")}
            </Button>
            <Button type="button" onClick={() => setVisibleUserIds(new Set(users.map((u) => u.id)))} className="rounded-full bg-[#2D2A26] hover:bg-[#1f1d1a] text-white" data-testid="family-view-all">
              {t("tp.familyView.all")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TimePlan;
