// Compact identity badge — avatar (image or initial), name, and an optional
// "Admin" pill. Used in the top of every authenticated page so the user
// instantly knows which family member is currently signed in.
//
// Two sizes are exposed via the `compact` prop:
//   * compact=false (default): 40px avatar + name + role/admin pill
//   * compact=true:            32px avatar + name, no pill (fits dense bars)

import { ShieldCheck } from "lucide-react";
import { getMember } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";

const initialOf = (name) => (name || "?").trim().charAt(0).toUpperCase();

export const MemberAvatar = ({ member, size = 40, className = "" }) => {
  // Auto-pick a readable foreground when the colour is dark. Use a tiny
  // luminance heuristic (works well enough for our pastel palette).
  const bg = (member && member.color) || "#94A3B8";
  const fallback = (
    <span
      className="inline-flex items-center justify-center font-heading font-semibold text-white"
      style={{
        width: size, height: size, backgroundColor: bg, borderRadius: "9999px",
        fontSize: Math.max(12, Math.floor(size * 0.42)),
      }}
    >
      {initialOf(member && member.name)}
    </span>
  );
  if (member && member.avatar) {
    return (
      <img
        src={member.avatar}
        alt={member?.name || ""}
        className={`rounded-full object-cover ring-2 ring-white shadow-sm ${className}`}
        style={{ width: size, height: size, borderColor: bg }}
        loading="lazy"
        data-testid={`member-avatar-${member?.id || "unknown"}`}
      />
    );
  }
  return <span className={className} data-testid={`member-avatar-${member?.id || "unknown"}`}>{fallback}</span>;
};

const MemberBadge = ({ member: memberProp, compact = false, showAdminBadge = true, className = "" }) => {
  const { t } = useI18n();
  const member = memberProp || getMember();
  if (!member) return null;
  const isAdmin = !!member.is_family_admin;
  const size = compact ? 32 : 40;
  return (
    <div
      className={`flex items-center gap-2 sm:gap-2.5 min-w-0 ${className}`}
      data-testid="member-badge"
    >
      <MemberAvatar member={member} size={size} />
      <div className="min-w-0 leading-tight">
        <p
          className={`font-heading font-semibold text-[#2D2A26] truncate ${compact ? "text-sm" : "text-sm sm:text-base"}`}
          data-testid="member-badge-name"
        >
          {member.name}
        </p>
        {!compact && showAdminBadge && isAdmin && (
          <span
            className="inline-flex items-center gap-1 mt-0.5 px-1.5 py-[1px] rounded-full bg-amber-100 text-amber-800 text-[9px] font-bold uppercase tracking-[0.12em]"
            data-testid="member-badge-admin-chip"
          >
            <ShieldCheck className="w-2.5 h-2.5" strokeWidth={2.4} />
            {t("members.admin")}
          </span>
        )}
      </div>
    </div>
  );
};

export default MemberBadge;
