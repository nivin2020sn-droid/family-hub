import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Heart,
  Image as ImageIcon,
  Target,
  CalendarClock,
  BookOpen,
  StickyNote,
  Trophy,
  Home as HomeIcon,
  CalendarHeart,
  Wallet,
  Settings as SettingsIcon,
  Menu,
  LogOut,
  Plane,
  Sparkles,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { logout as authLogout } from "@/lib/auth";

// ---------- Placeholder content ----------
const HERO_IMG =
  "https://images.unsplash.com/photo-1609220136736-443140cffec6?auto=format&fit=crop&w=1200&q=70";
const PHOTO_OF_DAY =
  "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=900&q=70";

const GOALS = [
  { label: "Buy a new home", icon: HomeIcon, done: true },
  { label: "Family trip to Bali", icon: Plane, done: true },
  { label: "Kids' education fund", icon: BookOpen, done: false },
  { label: "Emergency savings", icon: Wallet, done: false },
];

const COUNTDOWN = [
  { label: "Anniversary", sub: "June 15, 2026", days: 28, icon: Heart },
  { label: "Family trip to Bali", sub: "August 10, 2026", days: 84, icon: Plane },
];

const NOTES = [
  { color: "#60A5FA", text: "Don't forget to buy milk" },
  { color: "#34D399", text: "Doctor appointment on Tuesday" },
  { color: "#A78BFA", text: "Renew residency in July" },
  { color: "#F87171", text: "Book travel tickets" },
];

const ACHIEVEMENTS = [
  {
    name: "Sarah",
    note: "Top of her class in reading",
    img: "https://images.unsplash.com/photo-1503454537195-1dcabb73ffb9?auto=format&fit=crop&w=300&q=70",
  },
  {
    name: "Mohammed",
    note: "Painted a beautiful canvas",
    img: "https://images.unsplash.com/photo-1503944168849-8bf86d2ec5f4?auto=format&fit=crop&w=300&q=70",
  },
  {
    name: "Family trip",
    note: "A wonderful day by the sea",
    img: "https://images.unsplash.com/photo-1602002418816-5c0aeef426aa?auto=format&fit=crop&w=300&q=70",
  },
];

// ---------- Sub components ----------
const SectionCard = ({ icon: Icon, title, accent, iconBg, children, testid, className = "" }) => (
  <motion.div
    initial={{ opacity: 0, y: 12 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.35 }}
    className={`rounded-3xl p-4 sm:p-5 border border-black/[0.04] shadow-[0_8px_24px_-12px_rgba(0,0,0,0.08)] ${className}`}
    style={{ backgroundColor: accent }}
    data-testid={testid}
  >
    <div className="flex items-center gap-2.5 mb-3">
      <div
        className="w-9 h-9 rounded-full flex items-center justify-center text-white shadow-sm"
        style={{ backgroundColor: iconBg }}
      >
        <Icon className="w-4.5 h-4.5" strokeWidth={2} />
      </div>
      <h3 className="font-heading text-base sm:text-lg font-semibold text-[#2D2A26] tracking-tight">
        {title}
      </h3>
    </div>
    {children}
  </motion.div>
);

const BottomNavItem = ({ icon: Icon, label, active, onClick, testid }) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex flex-col items-center justify-center flex-1 min-h-[56px] py-1 transition-colors ${
      active ? "text-[#E11D48]" : "text-[#7A7571]"
    }`}
    data-testid={testid}
  >
    <div
      className={`flex items-center justify-center w-9 h-9 rounded-full transition-all ${
        active ? "bg-[#FEE2E5]" : "bg-transparent"
      }`}
    >
      <Icon className="w-[18px] h-[18px]" strokeWidth={1.9} />
    </div>
    <span className={`text-[10px] mt-0.5 font-medium tracking-wide ${active ? "font-semibold" : ""}`}>
      {label}
    </span>
  </button>
);

// ---------- Settings dialog (with logout) ----------
const WallSettingsDialog = ({ open, onOpenChange }) => {
  const navigate = useNavigate();
  const [confirm, setConfirm] = useState(false);
  const handleLogout = () => {
    if (!confirm) {
      setConfirm(true);
      return;
    }
    authLogout();
    onOpenChange(false);
    toast.success("Signed out");
    navigate("/login", { replace: true });
  };
  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setConfirm(false); }}>
      <DialogContent
        className="max-w-sm rounded-3xl border border-[#E5E2DC] bg-white p-0 overflow-hidden"
        data-testid="wall-settings-dialog"
      >
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle className="font-heading text-xl font-medium tracking-tight text-[#2D2A26]">
            Settings
          </DialogTitle>
          <DialogDescription className="text-sm text-[#7A7571]">
            Manage this device's session.
          </DialogDescription>
        </DialogHeader>
        <div className="px-6 py-4">
          <p className="text-xs text-[#7A7571] leading-relaxed mb-3">
            Profile and calendar preferences live inside Time Plan → Settings.
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() => { onOpenChange(false); navigate("/time-plan"); }}
            className="w-full rounded-2xl border-[#E5E2DC] text-[#2D2A26] hover:bg-[#F3F0EA]"
            data-testid="open-timeplan-settings-btn"
          >
            Open Time Plan settings
          </Button>
        </div>
        <div className="px-6 pb-5 pt-1 border-t border-[#E5E2DC] bg-[#FAF9F6]">
          <button
            type="button"
            onClick={handleLogout}
            className={`w-full flex items-center justify-center gap-2 px-3 py-2.5 mt-3 rounded-xl text-xs font-medium tracking-wide transition-colors ${
              confirm
                ? "bg-[#FEE2E2] text-[#B91C1C] hover:bg-[#FECACA]"
                : "text-[#A09B95] hover:text-[#7A7571] hover:bg-[#F3F0EA]"
            }`}
            data-testid="wall-logout-btn"
          >
            <LogOut className="w-3.5 h-3.5" strokeWidth={2} />
            {confirm ? "Tap again to confirm sign out" : "Sign out of this device"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ---------- Main page ----------
const WallBoard = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const isActive = (path) => location.pathname === path;
  const goSoon = (label) => toast.info(`${label} — Coming Soon`);

  return (
    <div className="min-h-screen bg-[#FAF9F6] pb-24" data-testid="wall-board-page">
      {/* Top bar */}
      <div className="sticky top-0 z-30 bg-[#FAF9F6]/95 backdrop-blur-md border-b border-[#EFEBE4]">
        <div className="max-w-md mx-auto px-4 h-14 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="w-10 h-10 -ml-2 rounded-full flex items-center justify-center text-[#2D2A26] active:bg-[#F3F0EA]"
            data-testid="wall-menu-btn"
            aria-label="Menu"
          >
            <Menu className="w-5 h-5" strokeWidth={1.8} />
          </button>
          <div className="flex items-center gap-2">
            <img
              src="/logo192.png"
              alt=""
              className="w-7 h-7 rounded-lg object-cover ring-1 ring-[#E5E2DC]"
            />
            <div className="leading-tight text-center">
              <p className="text-[10px] uppercase tracking-[0.18em] text-[#7A7571] font-semibold">
                My Family
              </p>
              <p className="text-xs font-heading text-[#2D2A26] -mt-0.5">My Life</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate("/")}
            className="w-10 h-10 -mr-2 rounded-full flex items-center justify-center text-[#2D2A26] active:bg-[#F3F0EA]"
            data-testid="wall-home-btn"
            aria-label="Home"
          >
            <HomeIcon className="w-5 h-5" strokeWidth={1.8} />
          </button>
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 pt-4">
        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="relative rounded-[28px] overflow-hidden h-56 sm:h-64 shadow-[0_18px_50px_-22px_rgba(0,0,0,0.25)]"
          data-testid="wall-hero"
        >
          <img
            src={HERO_IMG}
            alt="Our family"
            className="absolute inset-0 w-full h-full object-cover"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/15 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-4 sm:p-5 text-white">
            <h2 className="font-heading text-xl sm:text-2xl font-semibold tracking-tight flex items-center gap-2">
              Together We Build Beautiful Memories
              <Heart className="w-4 h-4 fill-[#F472B6] text-[#F472B6]" />
            </h2>
            <p className="text-xs sm:text-sm text-white/90 mt-1.5 leading-relaxed">
              Our Family, Our Dreams, Our Happiness
            </p>
          </div>
        </motion.div>

        {/* Cards */}
        <div className="mt-5 grid grid-cols-1 gap-3.5">
          {/* Message of the Day */}
          <SectionCard
            icon={Heart}
            title="Message of the Day"
            accent="#FCE7E9"
            iconBg="#E11D48"
            testid="card-message"
          >
            <div className="bg-white/70 rounded-2xl px-4 py-5 text-center">
              <span className="text-[#E11D48] text-2xl leading-none">“</span>
              <p className="text-sm text-[#3F3A36] leading-relaxed mt-1">
                Grateful for the blessing of family — your presence is the most beautiful
                thing I own in this life.
              </p>
              <Heart className="w-4 h-4 mx-auto mt-3 fill-[#E11D48] text-[#E11D48]" />
            </div>
          </SectionCard>

          {/* Photo of the Day */}
          <SectionCard
            icon={ImageIcon}
            title="Photo of the Day"
            accent="#E0F0FB"
            iconBg="#2563EB"
            testid="card-photo"
          >
            <div className="rounded-2xl overflow-hidden bg-white/70">
              <img
                src={PHOTO_OF_DAY}
                alt="Sunset by the sea"
                className="w-full h-40 sm:h-44 object-cover"
                loading="lazy"
              />
            </div>
            <div className="flex items-center justify-center gap-1.5 mt-2.5">
              {[0, 1, 2, 3].map((i) => (
                <span
                  key={i}
                  className={`h-1.5 rounded-full transition-all ${
                    i === 0 ? "w-5 bg-[#2563EB]" : "w-1.5 bg-[#2563EB]/30"
                  }`}
                />
              ))}
            </div>
          </SectionCard>

          {/* Our Goals */}
          <SectionCard
            icon={Target}
            title="Our Goals"
            accent="#E3F1E0"
            iconBg="#16A34A"
            testid="card-goals"
          >
            <ul className="bg-white/70 rounded-2xl divide-y divide-[#EFEBE4] overflow-hidden">
              {GOALS.map((g, i) => {
                const GIcon = g.icon;
                return (
                  <li
                    key={i}
                    className="flex items-center gap-3 px-3.5 py-2.5"
                    data-testid={`goal-${i}`}
                  >
                    <GIcon className="w-4 h-4 text-[#7A7571]" strokeWidth={1.8} />
                    <span className={`flex-1 text-sm ${g.done ? "text-[#3F3A36]" : "text-[#7A7571]"}`}>
                      {g.label}
                    </span>
                    {g.done ? (
                      <span className="w-5 h-5 rounded-full bg-[#16A34A] flex items-center justify-center">
                        <Check className="w-3 h-3 text-white" strokeWidth={3} />
                      </span>
                    ) : (
                      <span className="w-5 h-5 rounded-full border-2 border-[#E5E2DC]" />
                    )}
                  </li>
                );
              })}
            </ul>
          </SectionCard>

          {/* Countdown */}
          <SectionCard
            icon={CalendarClock}
            title="Countdown"
            accent="#FBEED9"
            iconBg="#D97706"
            testid="card-countdown"
          >
            <ul className="bg-white/70 rounded-2xl divide-y divide-[#EFEBE4]">
              {COUNTDOWN.map((c, i) => {
                const CIcon = c.icon;
                return (
                  <li key={i} className="flex items-center gap-3 px-3.5 py-3" data-testid={`countdown-${i}`}>
                    <CIcon className="w-5 h-5 text-[#D97706]" strokeWidth={1.8} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#3F3A36] truncate">{c.label}</p>
                      <p className="text-[11px] text-[#7A7571]">{c.sub}</p>
                    </div>
                    <div className="text-right leading-tight">
                      <p className="font-heading text-lg font-bold text-[#D97706]">{c.days}</p>
                      <p className="text-[10px] uppercase tracking-wider text-[#7A7571]">days</p>
                    </div>
                  </li>
                );
              })}
            </ul>
            <button
              type="button"
              className="mt-3 w-full text-xs font-semibold text-[#D97706] flex items-center justify-center gap-1.5"
              data-testid="see-all-events-btn"
              onClick={() => goSoon("All events view")}
            >
              <Sparkles className="w-3.5 h-3.5" /> See all events
            </button>
          </SectionCard>

          {/* Verse & Prayer */}
          <SectionCard
            icon={BookOpen}
            title="Verse & Prayer"
            accent="#EDE5F4"
            iconBg="#7C3AED"
            testid="card-verse"
          >
            <div className="bg-white/70 rounded-2xl px-4 py-4 text-center">
              <span className="text-[#7C3AED] text-2xl leading-none">“</span>
              <p className="text-sm text-[#3F3A36] leading-relaxed italic mt-1">
                Our Lord, grant us from among our spouses and offspring comfort to our
                eyes, and make us a leader for the righteous.
              </p>
              <p className="text-[11px] text-[#7A7571] mt-2">Surah Al-Furqan · Verse 74</p>
              <Sparkles className="w-4 h-4 mx-auto mt-2 text-[#7C3AED]" />
            </div>
          </SectionCard>

          {/* Quick Notes */}
          <SectionCard
            icon={StickyNote}
            title="Quick Notes"
            accent="#FBF1D8"
            iconBg="#CA8A04"
            testid="card-notes"
          >
            <ul className="bg-white/70 rounded-2xl px-3.5 py-3 space-y-2.5">
              {NOTES.map((n, i) => (
                <li
                  key={i}
                  className="flex items-center gap-2.5 text-sm text-[#3F3A36]"
                  data-testid={`note-${i}`}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: n.color }}
                  />
                  <span className="truncate">{n.text}</span>
                </li>
              ))}
            </ul>
          </SectionCard>

          {/* Our Achievements */}
          <SectionCard
            icon={Trophy}
            title="Our Achievements"
            accent="#E6EEF8"
            iconBg="#2563EB"
            testid="card-achievements"
            className="mt-1"
          >
            <div className="flex items-center gap-3 overflow-x-auto pb-1 -mx-1 px-1 snap-x">
              <div className="flex flex-col items-center min-w-[88px] snap-start">
                <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#F472B6] to-[#FBBF24] flex items-center justify-center text-2xl shadow-md">
                  🎉
                </div>
                <p className="text-[11px] font-semibold text-[#3F3A36] mt-1.5 text-center leading-tight">
                  MashaAllah<br />
                  <span className="font-normal text-[#7A7571]">We are proud</span>
                </p>
              </div>
              {ACHIEVEMENTS.map((a, i) => (
                <div
                  key={i}
                  className="flex flex-col items-center min-w-[88px] snap-start"
                  data-testid={`achievement-${i}`}
                >
                  <div className="w-14 h-14 rounded-full overflow-hidden ring-2 ring-white shadow-md">
                    <img src={a.img} alt={a.name} className="w-full h-full object-cover" loading="lazy" />
                  </div>
                  <p className="text-[11px] font-semibold text-[#3F3A36] mt-1.5 text-center leading-tight">
                    {a.name}<br />
                    <span className="font-normal text-[#7A7571]">{a.note}</span>
                  </p>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>

        <p className="text-center text-[10px] text-[#A09B95] tracking-wide mt-6 mb-2">
          Placeholder content · Editing coming soon
        </p>
      </div>

      {/* Bottom navigation */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-[#EFEBE4] shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.08)]"
        data-testid="bottom-nav"
      >
        <div className="max-w-md mx-auto flex items-stretch px-2 pt-1 pb-[max(0.25rem,env(safe-area-inset-bottom))]">
          <BottomNavItem
            icon={HomeIcon}
            label="Home"
            active={isActive("/")}
            onClick={() => navigate("/")}
            testid="nav-home"
          />
          <BottomNavItem
            icon={CalendarHeart}
            label="Time Plan"
            active={isActive("/time-plan")}
            onClick={() => navigate("/time-plan")}
            testid="nav-time-plan"
          />
          <BottomNavItem
            icon={Wallet}
            label="Home Budget"
            active={false}
            onClick={() => goSoon("Home Budget")}
            testid="nav-home-budget"
          />
          <BottomNavItem
            icon={Heart}
            label="Wall Board"
            active={isActive("/wall-board")}
            onClick={() => navigate("/wall-board")}
            testid="nav-wall-board"
          />
          <BottomNavItem
            icon={SettingsIcon}
            label="Settings"
            active={false}
            onClick={() => setSettingsOpen(true)}
            testid="nav-settings"
          />
        </div>
      </nav>

      <WallSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
};

export default WallBoard;
