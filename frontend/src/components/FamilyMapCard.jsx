import { useEffect, useMemo, useRef, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  CircleMarker,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import {
  MapPin,
  Users,
  Wifi,
  WifiOff,
  Smartphone,
  BatteryFull,
  BatteryLow,
  Crosshair,
  Gauge,
  HistoryIcon as HIcon,
  Clock,
  RefreshCw,
  ChevronRight,
  X,
  Loader2,
  Circle,
  Flag,
} from "lucide-react";
// lucide-react does not export HistoryIcon under that alias on every version
// — fall back to History.
import { History as HistoryLucide } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/lib/i18n";
import { cachedLatest, fetchLatest, fetchHistory } from "@/lib/locationApi";

// ---------- helpers ----------
const FALLBACK_CENTER = [50.8503, 4.3517]; // Brussels — neutral fallback only
const FALLBACK_ZOOM = 5;
const HISTORY_ZOOM = 14;
const LIVE_ZOOM = 13;

function avatarInitials(name) {
  if (!name) return "?";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

function colorFromId(id) {
  // Stable color per memberId — keeps the same marker color across renders.
  const palette = [
    "#F472B6",
    "#60A5FA",
    "#34D399",
    "#FBBF24",
    "#A78BFA",
    "#F87171",
    "#22D3EE",
    "#FB923C",
  ];
  let hash = 0;
  for (let i = 0; i < (id || "").length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return palette[Math.abs(hash) % palette.length];
}

function avatarHtml(member) {
  const color = colorFromId(member.id);
  const img = member.profileImage;
  const initials = avatarInitials(member.name || member.id);
  const inner = img
    ? `<img src="${img}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%"/>`
    : `<div style="background:${color};color:#fff;width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;border-radius:50%;font-family:Outfit,sans-serif">${initials}</div>`;
  return `<div style="width:38px;height:38px;border-radius:50%;background:white;padding:2px;box-shadow:0 4px 14px rgba(0,0,0,0.25);border:2px solid ${color};overflow:hidden">${inner}</div>`;
}

function memberIcon(member) {
  return L.divIcon({
    className: "family-marker",
    html: avatarHtml(member),
    iconSize: [42, 42],
    iconAnchor: [21, 21],
    popupAnchor: [0, -20],
  });
}

function startIcon() {
  return L.divIcon({
    className: "family-start-marker",
    html: `<div style="background:#16A34A;color:white;width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:3px solid white;box-shadow:0 4px 10px rgba(0,0,0,0.25);font-weight:800;font-size:11px;font-family:Outfit,sans-serif">A</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}
function endIcon() {
  return L.divIcon({
    className: "family-end-marker",
    html: `<div style="background:#DC2626;color:white;width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:3px solid white;box-shadow:0 4px 10px rgba(0,0,0,0.25);font-weight:800;font-size:11px;font-family:Outfit,sans-serif">B</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

function timeAgo(iso, t) {
  if (!iso) return "";
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return "";
  const diff = Date.now() - ts;
  const m = Math.round(diff / 60000);
  if (m < 1) return t("fmap.time.justNow");
  if (m < 60) return t("fmap.time.minutesAgo", { n: m });
  const h = Math.round(m / 60);
  if (h < 24) return t("fmap.time.hoursAgo", { n: h });
  const d = Math.round(h / 24);
  return t("fmap.time.daysAgo", { n: d });
}

function formatDateTime(iso, locale) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString(locale || "en-US", {
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}

function networkLabel(value, t) {
  if (value === "online") return t("fmap.net.online");
  if (value === "offline") return t("fmap.net.offline");
  return value || "—";
}
function connectionLabel(value, t) {
  if (value === "wifi") return t("fmap.conn.wifi");
  if (value === "mobile") return t("fmap.conn.mobile");
  if (value === "unknown") return t("fmap.conn.unknown");
  return value || t("fmap.conn.unknown");
}

// Tiny imperative wrapper that re-centers the map whenever `bounds` changes.
const FitBoundsOnChange = ({ bounds, fallbackCenter, fallbackZoom }) => {
  const map = useMap();
  useEffect(() => {
    if (bounds && bounds.length > 0) {
      try {
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
        return;
      } catch {
        /* ignore */
      }
    }
    if (fallbackCenter) {
      map.setView(fallbackCenter, fallbackZoom);
    }
  }, [bounds, fallbackCenter, fallbackZoom, map]);
  return null;
};

// ---------- Member compact card (below the map) ----------
const MemberCard = ({ member, onHistory, onCenter, t }) => {
  const online = member.networkStatus === "online";
  const battery = typeof member.battery === "number" ? Math.round(member.battery) : null;
  const isLowBattery = battery !== null && battery <= 20;
  return (
    <div
      className="bg-white rounded-2xl border border-[#EFEBE4] p-3 flex items-center gap-3 shadow-[0_2px_8px_-4px_rgba(0,0,0,0.06)]"
      data-testid={`family-member-card-${member.id}`}
    >
      <button
        type="button"
        onClick={() => onCenter(member)}
        className="w-11 h-11 rounded-full overflow-hidden flex-shrink-0 ring-2 ring-white shadow-sm relative active:scale-95 transition"
        style={{ backgroundColor: colorFromId(member.id) }}
        aria-label={t("fmap.openOnMap")}
      >
        {member.profileImage ? (
          <img src={member.profileImage} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-white text-sm font-bold">
            {avatarInitials(member.name || member.id)}
          </span>
        )}
        <span
          className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${
            online ? "bg-emerald-500" : "bg-[#A09B95]"
          }`}
        />
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-semibold text-[#2D2A26] truncate">
            {member.name || member.id}
          </p>
        </div>
        <div className="flex items-center gap-2 mt-0.5 text-[10px] text-[#7A7571] flex-wrap">
          <span className="inline-flex items-center gap-1">
            <Clock className="w-3 h-3" strokeWidth={1.8} />
            {timeAgo(member.lastUpdate, t) || "—"}
          </span>
          {battery !== null && (
            <span className={`inline-flex items-center gap-1 ${isLowBattery ? "text-[#B91C1C]" : ""}`}>
              {isLowBattery ? (
                <BatteryLow className="w-3 h-3" strokeWidth={1.8} />
              ) : (
                <BatteryFull className="w-3 h-3" strokeWidth={1.8} />
              )}
              {t("fmap.unit.percent", { n: battery })}
            </span>
          )}
          <span className="inline-flex items-center gap-1">
            {online ? (
              <Wifi className="w-3 h-3" strokeWidth={1.8} />
            ) : (
              <WifiOff className="w-3 h-3" strokeWidth={1.8} />
            )}
            {networkLabel(member.networkStatus, t)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Smartphone className="w-3 h-3" strokeWidth={1.8} />
            {connectionLabel(member.connectionType, t)}
          </span>
        </div>
      </div>

      <button
        type="button"
        onClick={() => onHistory(member)}
        className="flex-shrink-0 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-[#16A34A] bg-[#E3F1E0] hover:bg-[#D1E7CD] px-2.5 py-1.5 rounded-full"
        data-testid={`family-history-btn-${member.id}`}
      >
        <HistoryLucide className="w-3 h-3" strokeWidth={2} />
        {t("btn.history")}
      </button>
    </div>
  );
};

// ---------- History dialog ----------
const FamilyHistoryDialog = ({ open, onOpenChange, members, initialMember }) => {
  const { t, locale } = useI18n();
  const [memberId, setMemberId] = useState("");
  const todayIso = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);
  const [date, setDate] = useState(todayIso);
  const [points, setPoints] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedPoint, setSelectedPoint] = useState(null);

  useEffect(() => {
    if (open) {
      setMemberId(initialMember?.id || (members[0] && members[0].id) || "");
      setDate(todayIso);
      setPoints([]);
      setSelectedPoint(null);
    }
  }, [open, initialMember, members, todayIso]);

  useEffect(() => {
    if (!open || !memberId || !date) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const data = await fetchHistory(memberId, date);
      if (!cancelled) {
        setPoints(data);
        setSelectedPoint(null);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, memberId, date]);

  const polyline = useMemo(() => points.map((p) => [p.latitude, p.longitude]), [points]);
  const bounds = polyline.length > 0 ? polyline : null;
  const startPoint = points[0];
  const endPoint = points.length > 1 ? points[points.length - 1] : null;
  const member = members.find((m) => m.id === memberId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-lg rounded-3xl border border-[#E5E2DC] bg-white p-0 overflow-hidden max-h-[90vh] flex flex-col"
        data-testid="family-history-dialog"
      >
        <DialogHeader className="px-6 pt-6 pb-3 border-b border-[#EFEBE4]">
          <DialogTitle className="font-heading text-xl font-medium tracking-tight text-[#2D2A26] flex items-center gap-2">
            <HistoryLucide className="w-4 h-4 text-[#16A34A]" />
            {t("fmap.history.title")}
          </DialogTitle>
          <DialogDescription className="text-xs text-[#7A7571]">
            {member ? member.name || member.id : t("fmap.history.selectPerson")}
          </DialogDescription>
        </DialogHeader>

        <div className="px-5 py-3 border-b border-[#EFEBE4] grid grid-cols-2 gap-3">
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-[#7A7571]">
              {t("fmap.history.member")}
            </Label>
            <select
              value={memberId}
              onChange={(e) => setMemberId(e.target.value)}
              className="mt-1 w-full h-9 rounded-xl border border-[#E5E2DC] bg-white text-sm px-2 focus:outline-none focus:ring-2 focus:ring-[#2D2A26]"
              data-testid="history-member-select"
            >
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name || m.id}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-[#7A7571]">
              {t("fmap.history.date")}
            </Label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              max={todayIso}
              className="mt-1 h-9 rounded-xl border-[#E5E2DC]"
              data-testid="history-date-input"
            />
          </div>
        </div>

        <div className="relative flex-1 min-h-[280px]" data-testid="history-map">
          {loading ? (
            <div className="absolute inset-0 flex items-center justify-center text-[#7A7571] text-sm gap-2 bg-[#F3F0EA]/60 z-10">
              <Loader2 className="w-4 h-4 animate-spin" /> {t("fmap.history.loading")}
            </div>
          ) : null}
          <MapContainer
            center={polyline[0] || FALLBACK_CENTER}
            zoom={polyline.length ? HISTORY_ZOOM : FALLBACK_ZOOM}
            style={{ height: "100%", width: "100%", minHeight: 280 }}
            scrollWheelZoom
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            />
            <FitBoundsOnChange
              bounds={bounds}
              fallbackCenter={FALLBACK_CENTER}
              fallbackZoom={FALLBACK_ZOOM}
            />
            {polyline.length > 1 && (
              <Polyline
                positions={polyline}
                pathOptions={{ color: colorFromId(memberId), weight: 4, opacity: 0.85 }}
              />
            )}
            {points.map((p, i) => (
              <CircleMarker
                key={i}
                center={[p.latitude, p.longitude]}
                radius={4}
                pathOptions={{
                  color: colorFromId(memberId),
                  fillColor: "white",
                  fillOpacity: 1,
                  weight: 2,
                }}
                eventHandlers={{ click: () => setSelectedPoint(p) }}
              />
            ))}
            {startPoint && (
              <Marker
                position={[startPoint.latitude, startPoint.longitude]}
                icon={startIcon()}
              >
                <Popup>
                  <PointPopup label={t("fmap.history.start")} point={startPoint} locale={locale} t={t} />
                </Popup>
              </Marker>
            )}
            {endPoint && (
              <Marker position={[endPoint.latitude, endPoint.longitude]} icon={endIcon()}>
                <Popup>
                  <PointPopup label={t("fmap.history.end")} point={endPoint} locale={locale} t={t} />
                </Popup>
              </Marker>
            )}
          </MapContainer>
        </div>

        <div className="px-5 py-3 border-t border-[#EFEBE4] bg-[#FAF9F6] flex items-center justify-between gap-3">
          <p className="text-xs text-[#7A7571]">
            {points.length === 0 && !loading
              ? t("fmap.history.empty")
              : t("fmap.history.points", { n: points.length })}
          </p>
          {selectedPoint && (
            <div className="text-[10px] text-[#7A7571] truncate max-w-[60%]">
              {formatDateTime(selectedPoint.timestamp, locale)}
            </div>
          )}
        </div>

        <DialogFooter className="px-6 py-3 border-t border-[#EFEBE4] bg-[#FAF9F6]">
          <Button
            variant="ghost"
            className="rounded-full"
            onClick={() => onOpenChange(false)}
            data-testid="history-close-btn"
          >
            {t("btn.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// Small popup contents for start / end markers.
const PointPopup = ({ label, point, locale, t }) => (
  <div className="text-xs leading-relaxed">
    <p className="font-semibold text-[#2D2A26]">{label}</p>
    <p className="text-[#7A7571] mt-0.5">{formatDateTime(point.timestamp, locale)}</p>
    {typeof point.accuracy === "number" && (
      <p className="text-[#7A7571]">
        {t("fmap.accuracy")}: {t("fmap.unit.meters", { n: Math.round(point.accuracy) })}
      </p>
    )}
    {typeof point.battery === "number" && (
      <p className="text-[#7A7571]">
        {t("fmap.battery")}: {t("fmap.unit.percent", { n: Math.round(point.battery) })}
      </p>
    )}
    {typeof point.speed === "number" && point.speed > 0 && (
      <p className="text-[#7A7571]">
        {t("fmap.speed")}: {t("fmap.unit.kmh", { n: Math.round(point.speed * 3.6) })}
      </p>
    )}
  </div>
);

// ---------- Main card (default export) ----------
const FamilyMapCard = () => {
  const { t, locale } = useI18n();
  const [members, setMembers] = useState(() => cachedLatest());
  const [refreshing, setRefreshing] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyMember, setHistoryMember] = useState(null);
  const [centerOn, setCenterOn] = useState(null);
  const pollRef = useRef(null);

  const refresh = async () => {
    setRefreshing(true);
    try {
      const data = await fetchLatest();
      setMembers(data);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    refresh();
    pollRef.current = setInterval(refresh, 30000);
    const onOnline = () => refresh();
    window.addEventListener("online", onOnline);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      window.removeEventListener("online", onOnline);
    };
  }, []);

  const positioned = useMemo(
    () =>
      members.filter(
        (m) => typeof m.latitude === "number" && typeof m.longitude === "number"
      ),
    [members]
  );

  const bounds = useMemo(
    () =>
      centerOn && typeof centerOn.latitude === "number"
        ? [[centerOn.latitude, centerOn.longitude]]
        : positioned.map((m) => [m.latitude, m.longitude]),
    [positioned, centerOn]
  );

  return (
    <div
      className="rounded-3xl border border-black/[0.04] shadow-[0_8px_24px_-12px_rgba(0,0,0,0.08)] overflow-hidden"
      style={{ backgroundColor: "#E0F0FB" }}
      data-testid="card-family-map"
    >
      <div className="flex items-center gap-2.5 px-4 sm:px-5 pt-4 sm:pt-5 pb-3">
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center text-white shadow-sm"
          style={{ backgroundColor: "#2563EB" }}
        >
          <MapPin className="w-4.5 h-4.5" strokeWidth={2} />
        </div>
        <h3 className="font-heading text-base sm:text-lg font-semibold text-[#2D2A26] tracking-tight flex-1">
          {t("section.familyMap")}
        </h3>
        <button
          type="button"
          onClick={refresh}
          disabled={refreshing}
          className="w-8 h-8 rounded-full bg-white/70 hover:bg-white flex items-center justify-center text-[#2D2A26] active:scale-95 transition disabled:opacity-60"
          aria-label={t("fmap.refresh")}
          data-testid="family-map-refresh"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} strokeWidth={2} />
        </button>
      </div>

      {/* Map */}
      <div className="mx-4 sm:mx-5 rounded-2xl overflow-hidden border border-white/70 bg-white" style={{ height: 280 }}>
        <MapContainer
          center={
            (centerOn && [centerOn.latitude, centerOn.longitude]) ||
            (positioned[0] && [positioned[0].latitude, positioned[0].longitude]) ||
            FALLBACK_CENTER
          }
          zoom={positioned.length ? LIVE_ZOOM : FALLBACK_ZOOM}
          scrollWheelZoom={false}
          style={{ height: "100%", width: "100%" }}
          data-testid="family-map-container"
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          />
          {(bounds && bounds.length > 0) && (
            <FitBoundsOnChange
              bounds={bounds}
              fallbackCenter={FALLBACK_CENTER}
              fallbackZoom={FALLBACK_ZOOM}
            />
          )}
          {positioned.map((m) => (
            <Marker
              key={m.id}
              position={[m.latitude, m.longitude]}
              icon={memberIcon(m)}
            >
              <Popup>
                <div className="text-xs leading-relaxed min-w-[180px]">
                  <p className="font-semibold text-[#2D2A26] text-sm">{m.name || m.id}</p>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-1.5">
                    <span className="text-[#7A7571]">{t("fmap.lastUpdate")}</span>
                    <span className="text-[#2D2A26]">{timeAgo(m.lastUpdate, t)}</span>
                    {typeof m.battery === "number" && (
                      <>
                        <span className="text-[#7A7571]">{t("fmap.battery")}</span>
                        <span className="text-[#2D2A26]">{t("fmap.unit.percent", { n: Math.round(m.battery) })}</span>
                      </>
                    )}
                    {typeof m.accuracy === "number" && (
                      <>
                        <span className="text-[#7A7571]">{t("fmap.accuracy")}</span>
                        <span className="text-[#2D2A26]">{t("fmap.unit.meters", { n: Math.round(m.accuracy) })}</span>
                      </>
                    )}
                    <span className="text-[#7A7571]">{t("fmap.network")}</span>
                    <span className="text-[#2D2A26]">{networkLabel(m.networkStatus, t)}</span>
                    <span className="text-[#7A7571]">{t("fmap.connection")}</span>
                    <span className="text-[#2D2A26]">{connectionLabel(m.connectionType, t)}</span>
                    {m.trackingStatus && (
                      <>
                        <span className="text-[#7A7571]">{t("fmap.tracking")}</span>
                        <span className="text-[#2D2A26]">
                          {m.trackingStatus === "active"
                            ? t("fmap.tracking.active")
                            : m.trackingStatus === "paused"
                            ? t("fmap.tracking.paused")
                            : m.trackingStatus}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>

      {/* List */}
      <div className="p-4 sm:p-5 pt-3 space-y-2">
        {members.length === 0 ? (
          <div className="bg-white/70 rounded-2xl px-4 py-5 text-center">
            <Users className="w-5 h-5 mx-auto text-[#7A7571] mb-2" strokeWidth={1.8} />
            <p className="text-xs text-[#7A7571] leading-relaxed">{t("fmap.empty")}</p>
          </div>
        ) : (
          members.map((m) => (
            <MemberCard
              key={m.id}
              member={m}
              t={t}
              onHistory={(mem) => {
                setHistoryMember(mem);
                setHistoryOpen(true);
              }}
              onCenter={(mem) => {
                if (typeof mem.latitude === "number") setCenterOn(mem);
              }}
            />
          ))
        )}
      </div>

      <FamilyHistoryDialog
        open={historyOpen}
        onOpenChange={(v) => {
          setHistoryOpen(v);
          if (!v) setHistoryMember(null);
        }}
        members={members}
        initialMember={historyMember}
      />
    </div>
  );
};

export default FamilyMapCard;
