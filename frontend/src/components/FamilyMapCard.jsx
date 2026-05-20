import { useEffect, useMemo, useRef, useState } from "react";
import {
  MapContainer,
  TileLayer,
  LayerGroup,
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
  Layers,
  Map as MapIcon,
  Mountain,
  Satellite,
  Globe2,
  Moon,
  Maximize2,
  Navigation,
  Trash2,
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { cachedLatest, fetchLatest, fetchHistory, deleteMember } from "@/lib/locationApi";

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

// ---------- coords + reverse geocoding ----------
function formatCoords(lat, lng) {
  if (typeof lat !== "number" || typeof lng !== "number") return "—";
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

// Round to 4 decimals (~11m) — good enough granularity for "what address am I at"
// without hammering Nominatim every single ping (which only moves a few meters).
function coordCacheKey(lat, lng) {
  return `${lat.toFixed(4)},${lng.toFixed(4)}`;
}

const ADDRESS_CACHE_KEY = "family_geocode_cache";
function readAddressCache() {
  try {
    return JSON.parse(localStorage.getItem(ADDRESS_CACHE_KEY) || "{}");
  } catch {
    return {};
  }
}
function writeAddressCache(c) {
  try {
    localStorage.setItem(ADDRESS_CACHE_KEY, JSON.stringify(c));
  } catch {
    /* quota */
  }
}

// Global serial queue + 1.1s pause between calls — respects Nominatim's
// public usage policy of <= 1 req/sec.
let nominatimChain = Promise.resolve();
function reverseGeocode(lat, lng, locale) {
  const key = coordCacheKey(lat, lng);
  const cache = readAddressCache();
  if (cache[key] !== undefined) return Promise.resolve(cache[key]);

  const lang = (locale || "en").split("-")[0];
  const task = nominatimChain.then(async () => {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=16&accept-language=${lang}`,
        { headers: { Accept: "application/json" } }
      );
      if (!res.ok) throw new Error("geocode failed");
      const data = await res.json();
      const addr = data.address || {};
      // Build a friendly short address (road + suburb + city + country) and
      // fall back to display_name.
      const parts = [];
      const street = [addr.road || addr.pedestrian || addr.path, addr.house_number]
        .filter(Boolean)
        .join(" ");
      if (street) parts.push(street);
      const locality =
        addr.suburb || addr.neighbourhood || addr.village || addr.town || addr.city;
      if (locality) parts.push(locality);
      if (addr.country) parts.push(addr.country);
      const display = parts.length > 0 ? parts.join(", ") : data.display_name || "";
      const next = readAddressCache();
      next[key] = display;
      // Cap the cache to ~600 entries to avoid unbounded growth.
      const ks = Object.keys(next);
      if (ks.length > 600) {
        const trimmed = {};
        ks.slice(-500).forEach((k) => (trimmed[k] = next[k]));
        writeAddressCache(trimmed);
      } else {
        writeAddressCache(next);
      }
      await new Promise((r) => setTimeout(r, 1100));
      return display;
    } catch {
      // Soft failure — cache null briefly so we don't spam-retry on every render.
      await new Promise((r) => setTimeout(r, 1100));
      return null;
    }
  });
  nominatimChain = task.catch(() => {});
  return task;
}

// ---------- local-day → UTC ISO range ----------
// Returns { start, end } ISO strings representing midnight..midnight in the
// user's LOCAL timezone, converted to UTC. This is the correct way to ask the
// backend "all points logged during my local Tuesday" without losing 1-3 hours
// of data on either end depending on the user's offset.
function localDayRange(yyyymmdd) {
  if (!yyyymmdd) return null;
  const [y, m, d] = yyyymmdd.split("-").map(Number);
  if (!y || !m || !d) return null;
  const start = new Date(y, m - 1, d, 0, 0, 0, 0);
  const end = new Date(y, m - 1, d + 1, 0, 0, 0, 0);
  return { start: start.toISOString(), end: end.toISOString() };
}

// ---------- map layers ----------
// All providers are free and require no API key. Hybrid is built from two
// layered tile sources: satellite imagery + a transparent labels overlay.
const OSM_ATTR =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const ESRI_ATTR = "Tiles &copy; Esri";
const CARTO_ATTR =
  '&copy; <a href="https://carto.com/attributions">CARTO</a> &copy; OpenStreetMap contributors';
const OTM_ATTR =
  'Map data: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)';

const MAP_LAYERS = {
  standard: {
    key: "standard",
    icon: MapIcon,
    tiles: [
      {
        url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        attribution: OSM_ATTR,
        maxZoom: 19,
      },
    ],
  },
  satellite: {
    key: "satellite",
    icon: Satellite,
    tiles: [
      {
        url:
          "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        attribution: ESRI_ATTR + " — Source: Esri, Maxar, Earthstar Geographics",
        maxZoom: 19,
      },
    ],
  },
  terrain: {
    key: "terrain",
    icon: Mountain,
    tiles: [
      {
        url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
        attribution: OTM_ATTR,
        maxZoom: 17,
      },
    ],
  },
  hybrid: {
    key: "hybrid",
    icon: Globe2,
    tiles: [
      {
        url:
          "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        attribution: ESRI_ATTR + " — Source: Esri, Maxar, Earthstar Geographics",
        maxZoom: 19,
      },
      {
        // Transparent reference overlay: roads, places, country borders.
        url:
          "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
        attribution: "",
        maxZoom: 19,
      },
    ],
  },
  dark: {
    key: "dark",
    icon: Moon,
    tiles: [
      {
        url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
        attribution: CARTO_ATTR,
        maxZoom: 19,
      },
    ],
  },
};

const DEFAULT_LAYER = "hybrid";

// Renders the active layer's stack of TileLayer(s). `key` on each tile forces
// react-leaflet to fully unmount/remount the layer when the user switches —
// this prevents tile-caching glitches across providers.
const MapLayer = ({ layerKey }) => {
  const layer = MAP_LAYERS[layerKey] || MAP_LAYERS[DEFAULT_LAYER];
  return (
    <LayerGroup>
      {layer.tiles.map((tile, idx) => (
        <TileLayer
          key={`${layer.key}-${idx}`}
          url={tile.url}
          attribution={tile.attribution}
          maxZoom={tile.maxZoom}
        />
      ))}
    </LayerGroup>
  );
};

// Pill selector that lives inside the card header — one icon per layer.
const MapTypeSelector = ({ value, onChange, t }) => {
  const order = ["standard", "satellite", "terrain", "hybrid", "dark"];
  return (
    <div
      className="inline-flex items-center gap-0.5 rounded-full bg-white/85 backdrop-blur p-0.5 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.12)] border border-black/[0.05]"
      role="radiogroup"
      aria-label={t("fmap.layer.title")}
      data-testid="family-map-layer-selector"
    >
      {order.map((k) => {
        const Icon = MAP_LAYERS[k].icon;
        const active = k === value;
        return (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(k)}
            title={t(`fmap.layer.${k}`)}
            aria-label={t(`fmap.layer.${k}`)}
            className={`w-7 h-7 rounded-full flex items-center justify-center transition active:scale-95 ${
              active
                ? "bg-[#2D2A26] text-white shadow"
                : "text-[#5C5853] hover:bg-[#F3F0EA]"
            }`}
            data-testid={`family-map-layer-${k}`}
          >
            <Icon className="w-3.5 h-3.5" strokeWidth={2} />
          </button>
        );
      })}
    </div>
  );
};

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
const MemberCard = ({ member, onHistory, onCenter, onDelete, t }) => {
  const online = member.networkStatus === "online";
  const battery = typeof member.battery === "number" ? Math.round(member.battery) : null;
  const isLowBattery = battery !== null && battery <= 20;
  const isMidBattery = battery !== null && battery > 20 && battery <= 50;
  const batteryTint = isLowBattery
    ? { fg: "#B91C1C", bg: "#FEE2E2" }
    : isMidBattery
    ? { fg: "#B45309", bg: "#FEF3C7" }
    : { fg: "#15803D", bg: "#DCFCE7" };
  const accent = colorFromId(member.id);

  return (
    <div
      className="relative bg-white rounded-2xl border border-[#EFEBE4] p-3 sm:p-3.5 shadow-[0_1px_2px_rgba(0,0,0,0.03),0_8px_24px_-16px_rgba(0,0,0,0.12)] overflow-hidden"
      data-testid={`family-member-card-${member.id}`}
    >
      {/* Left accent stripe — same color as marker, ties card to map */}
      <span
        aria-hidden
        className="absolute inset-y-2 left-0 w-1 rounded-full"
        style={{ backgroundColor: accent }}
      />

      <div className="flex items-center gap-3 pl-2">
        {/* Avatar + online dot — clicking centers on the map */}
        <button
          type="button"
          onClick={() => onCenter(member)}
          className="w-12 h-12 rounded-full overflow-hidden flex-shrink-0 ring-2 ring-white shadow-sm relative active:scale-95 transition"
          style={{ backgroundColor: accent }}
          aria-label={t("fmap.openOnMap")}
          data-testid={`family-center-btn-${member.id}`}
        >
          {member.profileImage ? (
            <img src={member.profileImage} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="absolute inset-0 flex items-center justify-center text-white text-base font-bold">
              {avatarInitials(member.name || member.id)}
            </span>
          )}
          <span
            className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white ${
              online ? "bg-emerald-500" : "bg-[#A09B95]"
            }`}
          />
        </button>

        {/* Name + last update */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[#2D2A26] truncate leading-tight">
            {member.name || member.id}
          </p>
          <p className="text-[11px] text-[#7A7571] mt-0.5 inline-flex items-center gap-1">
            <Clock className="w-3 h-3" strokeWidth={1.8} />
            {timeAgo(member.lastUpdate, t) || "—"}
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex-shrink-0 flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onHistory(member)}
            className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-[#16A34A] bg-[#E3F1E0] hover:bg-[#D1E7CD] active:scale-95 transition px-2.5 py-1.5 rounded-full"
            data-testid={`family-history-btn-${member.id}`}
          >
            <HistoryLucide className="w-3 h-3" strokeWidth={2} />
            {t("btn.history")}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(member);
            }}
            className="w-7 h-7 inline-flex items-center justify-center rounded-full text-[#B91C1C]/85 hover:text-[#B91C1C] hover:bg-[#FEE2E2] active:scale-95 transition"
            aria-label={t("fmap.delete")}
            title={t("fmap.delete")}
            data-testid={`family-delete-btn-${member.id}`}
          >
            <Trash2 className="w-3.5 h-3.5" strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* Stat row — battery, network, connection */}
      <div className="mt-2.5 pl-2 grid grid-cols-3 gap-1.5">
        {battery !== null ? (
          <div
            className="flex items-center justify-center gap-1.5 rounded-xl px-2 py-1.5 text-[11px] font-medium"
            style={{ backgroundColor: batteryTint.bg, color: batteryTint.fg }}
          >
            {isLowBattery ? (
              <BatteryLow className="w-3.5 h-3.5" strokeWidth={2} />
            ) : (
              <BatteryFull className="w-3.5 h-3.5" strokeWidth={2} />
            )}
            {t("fmap.unit.percent", { n: battery })}
          </div>
        ) : (
          <div className="flex items-center justify-center gap-1.5 rounded-xl px-2 py-1.5 text-[11px] font-medium bg-[#F3F0EA] text-[#A09B95]">
            <BatteryFull className="w-3.5 h-3.5" strokeWidth={2} />
            —
          </div>
        )}

        <div
          className={`flex items-center justify-center gap-1.5 rounded-xl px-2 py-1.5 text-[11px] font-medium ${
            online
              ? "bg-emerald-50 text-emerald-700"
              : "bg-[#F3F0EA] text-[#7A7571]"
          }`}
        >
          {online ? (
            <Wifi className="w-3.5 h-3.5" strokeWidth={2} />
          ) : (
            <WifiOff className="w-3.5 h-3.5" strokeWidth={2} />
          )}
          <span className="truncate">{networkLabel(member.networkStatus, t)}</span>
        </div>

        <div className="flex items-center justify-center gap-1.5 rounded-xl px-2 py-1.5 text-[11px] font-medium bg-[#EAF2FB] text-[#1D4ED8]">
          <Smartphone className="w-3.5 h-3.5" strokeWidth={2} />
          <span className="truncate">{connectionLabel(member.connectionType, t)}</span>
        </div>
      </div>
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
      // Always query by local-day UTC range so points logged near midnight
      // in the user's local timezone don't get dropped by a naive UTC date
      // filter on the backend.
      const range = localDayRange(date);
      const data = range
        ? await fetchHistory(memberId, range)
        : await fetchHistory(memberId, { date });
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

// ---------- Member marker popup (shows address) ----------
const MemberMarkerPopup = ({ member, address, t }) => {
  const online = member.networkStatus === "online";
  return (
    <div className="text-xs leading-relaxed min-w-[200px] max-w-[240px]">
      <p className="font-semibold text-[#2D2A26] text-sm">{member.name || member.id}</p>
      {address === "__loading__" ? (
        <p className="text-[#7A7571] italic mt-1">{t("fmap.address.loading")}</p>
      ) : address ? (
        <p className="text-[#2D2A26] mt-1 leading-snug">{address}</p>
      ) : address === null ? (
        <p className="text-[#7A7571] italic mt-1">{t("fmap.address.unknown")}</p>
      ) : null}
      <p className="text-[10px] text-[#7A7571] mt-1.5 font-mono tracking-tight">
        {formatCoords(member.latitude, member.longitude)}
      </p>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-2 border-t border-[#EFEBE4] pt-1.5">
        <span className="text-[#7A7571]">{t("fmap.lastUpdate")}</span>
        <span className="text-[#2D2A26]">{timeAgo(member.lastUpdate, t)}</span>
        {typeof member.battery === "number" && (
          <>
            <span className="text-[#7A7571]">{t("fmap.battery")}</span>
            <span className="text-[#2D2A26]">
              {t("fmap.unit.percent", { n: Math.round(member.battery) })}
            </span>
          </>
        )}
        <span className="text-[#7A7571]">{t("fmap.network")}</span>
        <span className={online ? "text-emerald-700 font-medium" : "text-[#7A7571]"}>
          {networkLabel(member.networkStatus, t)}
        </span>
      </div>
    </div>
  );
};

// ---------- Member detail dialog (opened from card body) ----------
const MemberDetailDialog = ({ open, onOpenChange, member, address, t, locale, onHistory }) => {
  if (!member) return null;
  const online = member.networkStatus === "online";
  const battery = typeof member.battery === "number" ? Math.round(member.battery) : null;
  const accent = colorFromId(member.id);

  const Row = ({ label, value, mono = false }) => (
    <div className="flex items-start justify-between gap-3 py-2 border-b border-[#EFEBE4] last:border-b-0">
      <span className="text-[11px] uppercase tracking-wider text-[#7A7571] font-medium">{label}</span>
      <span
        className={`text-xs text-[#2D2A26] text-right break-words max-w-[60%] ${mono ? "font-mono tracking-tight" : ""}`}
      >
        {value}
      </span>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-sm rounded-3xl border border-[#E5E2DC] bg-white p-0 overflow-hidden"
        data-testid="family-member-detail-dialog"
      >
        <div className="px-5 pt-5 pb-4 flex items-center gap-3 border-b border-[#EFEBE4]">
          <div
            className="w-12 h-12 rounded-full overflow-hidden ring-2 ring-white shadow-sm relative flex-shrink-0"
            style={{ backgroundColor: accent }}
          >
            {member.profileImage ? (
              <img src={member.profileImage} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="absolute inset-0 flex items-center justify-center text-white text-base font-bold">
                {avatarInitials(member.name || member.id)}
              </span>
            )}
            <span
              className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white ${
                online ? "bg-emerald-500" : "bg-[#A09B95]"
              }`}
            />
          </div>
          <div className="min-w-0">
            <DialogTitle className="font-heading text-lg font-semibold text-[#2D2A26] truncate">
              {member.name || member.id}
            </DialogTitle>
            <DialogDescription className="text-[11px] text-[#7A7571]">
              {timeAgo(member.lastUpdate, t)}
            </DialogDescription>
          </div>
        </div>

        <div className="px-5 py-3">
          <Row
            label={t("fmap.address")}
            value={
              address === "__loading__"
                ? t("fmap.address.loading")
                : address || t("fmap.address.unknown")
            }
          />
          <Row
            label={t("fmap.coords")}
            value={formatCoords(member.latitude, member.longitude)}
            mono
          />
          <Row
            label={t("fmap.battery")}
            value={battery !== null ? t("fmap.unit.percent", { n: battery }) : "—"}
          />
          <Row label={t("fmap.network")} value={networkLabel(member.networkStatus, t)} />
          <Row label={t("fmap.connection")} value={connectionLabel(member.connectionType, t)} />
          {typeof member.accuracy === "number" && (
            <Row
              label={t("fmap.accuracy")}
              value={t("fmap.unit.meters", { n: Math.round(member.accuracy) })}
            />
          )}
          {member.trackingStatus && (
            <Row
              label={t("fmap.tracking")}
              value={
                member.trackingStatus === "active"
                  ? t("fmap.tracking.active")
                  : member.trackingStatus === "paused"
                  ? t("fmap.tracking.paused")
                  : member.trackingStatus
              }
            />
          )}
        </div>

        <DialogFooter className="px-5 py-3 border-t border-[#EFEBE4] bg-[#FAF9F6] gap-2 sm:gap-2">
          <Button
            variant="ghost"
            className="rounded-full text-[#16A34A] hover:bg-[#E3F1E0] hover:text-[#16A34A]"
            onClick={() => {
              onOpenChange(false);
              onHistory && onHistory(member);
            }}
            data-testid="detail-history-btn"
          >
            <HistoryLucide className="w-4 h-4 mr-1.5" />
            {t("btn.history")}
          </Button>
          <Button
            variant="ghost"
            className="rounded-full"
            onClick={() => onOpenChange(false)}
            data-testid="detail-close-btn"
          >
            {t("btn.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ---------- Full-screen map dialog ----------
const FullMapDialog = ({ open, onOpenChange, members, addresses, layerKey, onLayerChange, t, onMemberClick }) => {
  const positioned = useMemo(
    () => members.filter((m) => typeof m.latitude === "number" && typeof m.longitude === "number"),
    [members]
  );
  const bounds = useMemo(
    () => positioned.map((m) => [m.latitude, m.longitude]),
    [positioned]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="p-0 overflow-hidden border-0 bg-white w-screen max-w-[100vw] h-[100dvh] sm:h-[100dvh] sm:max-w-[100vw] rounded-none flex flex-col"
        data-testid="family-full-map-dialog"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>{t("fmap.fullMap.title")}</DialogTitle>
          <DialogDescription>{t("section.familyMap")}</DialogDescription>
        </DialogHeader>

        {/* Floating header bar */}
        <div className="absolute top-0 inset-x-0 z-[500] px-3 pt-3 pb-2 flex items-center gap-2 pointer-events-none">
          <div className="pointer-events-auto flex items-center gap-2 bg-white/95 backdrop-blur px-3 py-2 rounded-full shadow-[0_4px_16px_-4px_rgba(0,0,0,0.18)]">
            <MapPin className="w-4 h-4 text-[#2563EB]" strokeWidth={2} />
            <span className="text-sm font-semibold text-[#2D2A26] tracking-tight">
              {t("fmap.fullMap.title")}
            </span>
          </div>
          <div className="flex-1" />
          <div className="pointer-events-auto">
            <MapTypeSelector value={layerKey} onChange={onLayerChange} t={t} />
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="pointer-events-auto w-10 h-10 rounded-full bg-white/95 backdrop-blur flex items-center justify-center text-[#2D2A26] shadow-[0_4px_16px_-4px_rgba(0,0,0,0.18)] active:scale-95 transition"
            aria-label={t("btn.close")}
            data-testid="full-map-close-btn"
          >
            <X className="w-4 h-4" strokeWidth={2.2} />
          </button>
        </div>

        {/* Map */}
        <div className="relative flex-1 min-h-0" style={{ isolation: "isolate" }}>
          <MapContainer
            center={
              (positioned[0] && [positioned[0].latitude, positioned[0].longitude]) ||
              FALLBACK_CENTER
            }
            zoom={positioned.length ? LIVE_ZOOM : FALLBACK_ZOOM}
            scrollWheelZoom
            style={{ height: "100%", width: "100%" }}
            data-testid="family-full-map-container"
          >
            <MapLayer layerKey={layerKey} />
            {bounds.length > 0 && (
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
                eventHandlers={{
                  click: () => onMemberClick && onMemberClick(m),
                }}
              >
                <Popup>
                  <MemberMarkerPopup member={m} address={addresses[m.id]} t={t} />
                </Popup>
              </Marker>
            ))}
          </MapContainer>

          {positioned.length === 0 && (
            <div className="absolute inset-0 z-[400] flex items-center justify-center bg-white/70 backdrop-blur-sm">
              <div className="text-center px-6">
                <Users className="w-6 h-6 mx-auto text-[#7A7571] mb-2" strokeWidth={1.8} />
                <p className="text-sm text-[#5C5853]">{t("fmap.fullMap.empty")}</p>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ---------- Main card (default export) ----------
const FamilyMapCard = () => {
  const { t, locale } = useI18n();
  const [members, setMembers] = useState(() => cachedLatest());
  const [refreshing, setRefreshing] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyMember, setHistoryMember] = useState(null);
  const [centerOn, setCenterOn] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailMember, setDetailMember] = useState(null);
  const [fullMapOpen, setFullMapOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null); // member pending confirm
  const [deleting, setDeleting] = useState(false);
  const [addresses, setAddresses] = useState({}); // memberId -> string | null | "__loading__"
  const [layerKey, setLayerKey] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_LAYER;
    const saved = localStorage.getItem("family_map_layer");
    return saved && MAP_LAYERS[saved] ? saved : DEFAULT_LAYER;
  });
  const pollRef = useRef(null);

  const changeLayer = (k) => {
    setLayerKey(k);
    try {
      localStorage.setItem("family_map_layer", k);
    } catch {
      /* ignore */
    }
  };

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

  // Prefetch (and cache) addresses for everyone with a position. The
  // reverseGeocode helper already throttles & caches, so re-renders are cheap.
  // Effect only re-runs when the set of {id, rounded coords} actually changes.
  const positionedFingerprint = useMemo(
    () =>
      positioned
        .map((m) => `${m.id}:${coordCacheKey(m.latitude, m.longitude)}`)
        .join("|"),
    [positioned]
  );
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const m of positioned) {
        if (cancelled) return;
        const key = coordCacheKey(m.latitude, m.longitude);
        const cache = readAddressCache();
        if (cache[key] !== undefined) {
          setAddresses((prev) =>
            prev[m.id] === cache[key] ? prev : { ...prev, [m.id]: cache[key] }
          );
          continue;
        }
        setAddresses((prev) =>
          prev[m.id] === "__loading__" ? prev : { ...prev, [m.id]: "__loading__" }
        );
        const a = await reverseGeocode(m.latitude, m.longitude, locale);
        if (cancelled) return;
        setAddresses((prev) => ({ ...prev, [m.id]: a }));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positionedFingerprint, locale]);

  const bounds = useMemo(
    () =>
      centerOn && typeof centerOn.latitude === "number"
        ? [[centerOn.latitude, centerOn.longitude]]
        : positioned.map((m) => [m.latitude, m.longitude]),
    [positioned, centerOn]
  );

  const openDetail = (mem) => {
    setDetailMember(mem);
    setDetailOpen(true);
  };
  const openHistoryFor = (mem) => {
    setHistoryMember(mem);
    setHistoryOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      await deleteMember(deleteTarget.id);
      // Optimistically prune from local state so the row disappears instantly.
      setMembers((prev) => prev.filter((m) => m.id !== deleteTarget.id));
      setAddresses((prev) => {
        const next = { ...prev };
        delete next[deleteTarget.id];
        return next;
      });
      // Close any open dialogs that referenced this member.
      if (detailMember && detailMember.id === deleteTarget.id) {
        setDetailOpen(false);
        setDetailMember(null);
      }
      if (historyMember && historyMember.id === deleteTarget.id) {
        setHistoryOpen(false);
        setHistoryMember(null);
      }
      if (centerOn && centerOn.id === deleteTarget.id) {
        setCenterOn(null);
      }
      toast.success(t("fmap.delete.success"));
      setDeleteTarget(null);
      // Pull fresh server truth so we stay in sync if other tabs are open.
      refresh();
    } catch (err) {
      toast.error(err.message || t("fmap.delete.error"));
    } finally {
      setDeleting(false);
    }
  };

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

      {/* Layer selector — pill row aligned with map */}
      <div className="px-4 sm:px-5 pb-2 flex items-center gap-2">
        <Layers className="w-3.5 h-3.5 text-[#5C5853]" strokeWidth={2} />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[#5C5853]">
          {t("fmap.layer.title")}
        </span>
        <div className="flex-1" />
        <MapTypeSelector value={layerKey} onChange={changeLayer} t={t} />
      </div>

      {/* Map — isolated stacking context keeps Leaflet's overlay panes
          (popups, controls, attribution) contained inside the rounded card. */}
      <div
        className="mx-4 sm:mx-5 rounded-2xl overflow-hidden border border-white/70 bg-white relative"
        style={{ height: 340, isolation: "isolate", zIndex: 0 }}
      >
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
          <MapLayer layerKey={layerKey} />
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
                <MemberMarkerPopup member={m} address={addresses[m.id]} t={t} />
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>

      {/* Full-map CTA */}
      <div className="px-4 sm:px-5 pt-3 pb-1">
        <button
          type="button"
          onClick={() => setFullMapOpen(true)}
          className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-[#2D2A26] hover:bg-[#1f1d1a] text-white text-sm font-semibold py-2.5 active:scale-[0.99] transition shadow-[0_6px_18px_-8px_rgba(0,0,0,0.4)]"
          data-testid="family-map-fullmap-btn"
        >
          <Maximize2 className="w-4 h-4" strokeWidth={2.2} />
          {t("fmap.fullMap")}
        </button>
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
              onHistory={openHistoryFor}
              onDelete={(mem) => setDeleteTarget(mem)}
              onCenter={(mem) => {
                if (typeof mem.latitude === "number") setCenterOn(mem);
                openDetail(mem);
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

      <MemberDetailDialog
        open={detailOpen}
        onOpenChange={(v) => {
          setDetailOpen(v);
          if (!v) setDetailMember(null);
        }}
        member={detailMember}
        address={detailMember ? addresses[detailMember.id] : undefined}
        t={t}
        locale={locale}
        onHistory={openHistoryFor}
      />

      <FullMapDialog
        open={fullMapOpen}
        onOpenChange={setFullMapOpen}
        members={members}
        addresses={addresses}
        layerKey={layerKey}
        onLayerChange={changeLayer}
        t={t}
        onMemberClick={openDetail}
      />

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(v) => {
          if (!v && !deleting) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent
          className="rounded-3xl border border-[#E5E2DC] bg-white"
          data-testid="family-delete-confirm-dialog"
        >
          <AlertDialogHeader>
            <AlertDialogTitle className="font-heading text-lg text-[#2D2A26] flex items-center gap-2">
              <Trash2 className="w-4 h-4 text-[#B91C1C]" />
              {t("fmap.delete.confirm.title")}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-[#5C5853] leading-relaxed">
              {t("fmap.delete.confirm.desc")}
              {deleteTarget && (
                <span className="block mt-3 px-3 py-2 rounded-xl bg-[#F3F0EA] text-[#2D2A26] text-xs font-semibold">
                  {deleteTarget.name || deleteTarget.id}
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-2">
            <AlertDialogCancel
              disabled={deleting}
              className="rounded-full"
              data-testid="family-delete-cancel-btn"
            >
              {t("btn.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmDelete();
              }}
              disabled={deleting}
              className="rounded-full bg-[#B91C1C] hover:bg-[#991414] text-white"
              data-testid="family-delete-confirm-btn"
            >
              {deleting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4 mr-1.5 rtl:mr-0 rtl:ml-1.5" />
              )}
              {t("fmap.delete.confirm.cta")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default FamilyMapCard;
