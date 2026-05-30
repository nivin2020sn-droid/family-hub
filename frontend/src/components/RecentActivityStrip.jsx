// "Recent activity by you" — a slim 3-row strip rendered on the WallBoard
// just under the welcome MemberBadge. Each row is a localized template
// resolved from the activity `kind`, with relative time ("yesterday",
// "2h ago", …). When the server has no entries we render nothing so the
// surface stays calm for brand-new accounts.

import { useEffect, useState } from "react";
import { Activity, Loader2 } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { fetchRecentActivity } from "@/lib/activityApi";

// All supported kinds → i18n key + icon emoji-free label. The frontend
// stays the single source of truth for labels so the user can switch
// language without re-fetching anything.
const KIND_TEMPLATES = {
  "event.created": { tkey: "activity.event.created" },
  "event.deleted": { tkey: "activity.event.deleted" },
  "kids_money.income.added": { tkey: "activity.kids.income" },
  "kids_money.payment.added": { tkey: "activity.kids.payment" },
  "goal.created": { tkey: "activity.goal.created" },
  "goal.completed": { tkey: "activity.goal.completed" },
  "member.added": { tkey: "activity.member.added" },
  "member.promoted": { tkey: "activity.member.promoted" },
  "member.demoted": { tkey: "activity.member.demoted" },
  "member.deleted": { tkey: "activity.member.deleted" },
};

// "X minutes ago" formatter — locale-aware via Intl.RelativeTimeFormat with
// a safe fallback when the API is missing on a very old browser.
const relativeTime = (iso, locale = "en") => {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return iso;
  const diffSec = Math.round((then - Date.now()) / 1000);
  const abs = Math.abs(diffSec);
  let value, unit;
  if (abs < 60) { value = diffSec; unit = "second"; }
  else if (abs < 3600) { value = Math.round(diffSec / 60); unit = "minute"; }
  else if (abs < 86400) { value = Math.round(diffSec / 3600); unit = "hour"; }
  else if (abs < 604800) { value = Math.round(diffSec / 86400); unit = "day"; }
  else { value = Math.round(diffSec / 604800); unit = "week"; }
  try {
    return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(value, unit);
  } catch {
    return iso.slice(0, 10);
  }
};

const renderItem = (t, item) => {
  const cfg = KIND_TEMPLATES[item.kind];
  const payload = item.payload || {};
  // Default to a generic line so unknown future kinds still render
  // something readable instead of disappearing.
  const tkey = cfg ? cfg.tkey : "activity.generic";
  return t(tkey, {
    title: payload.title || "",
    name: payload.name || "",
    description: payload.description || "",
    amount: payload.amount ?? "",
    target_amount: payload.target_amount ?? "",
    date: payload.date || "",
  });
};

const RecentActivityStrip = ({ limit = 3, className = "" }) => {
  const { t, locale } = useI18n();
  const [items, setItems] = useState(null); // null while loading
  const [err, setErr] = useState(null);

  useEffect(() => {
    let alive = true;
    fetchRecentActivity({ limit })
      .then((list) => { if (alive) setItems(list); })
      .catch((e) => { if (alive) { setErr(e); setItems([]); } });
    return () => { alive = false; };
  }, [limit]);

  if (items === null) {
    return (
      <div
        className={`flex items-center gap-2 text-[11px] text-[#7A7571] ${className}`}
        data-testid="recent-activity-loading"
      >
        <Loader2 className="w-3 h-3 animate-spin" />
        {t("activity.loading")}
      </div>
    );
  }
  if (err || items.length === 0) return null;
  return (
    <div
      className={`rounded-2xl bg-white/70 backdrop-blur border border-[#EFEBE4] px-3 py-2 ${className}`}
      data-testid="recent-activity-strip"
    >
      <div className="flex items-center gap-1.5 mb-1">
        <Activity className="w-3 h-3 text-[#7A7571]" strokeWidth={2.4} />
        <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#7A7571]">
          {t("activity.title")}
        </p>
      </div>
      <ul className="space-y-0.5">
        {items.map((it) => (
          <li
            key={it.id}
            className="flex items-baseline gap-2 text-[11px] leading-snug"
            data-testid={`activity-item-${it.kind}`}
          >
            <span className="w-1 h-1 rounded-full bg-[#2D2A26] mt-1.5 shrink-0" aria-hidden />
            <span className="flex-1 text-[#2D2A26] truncate" title={renderItem(t, it)}>
              {renderItem(t, it)}
            </span>
            <span className="text-[10px] text-[#9CA3AF] shrink-0">
              {relativeTime(it.created_at, locale)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default RecentActivityStrip;
