import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { CalendarHeart, Wallet, StickyNote, ArrowUpRight, Lock } from "lucide-react";

const ComingSoonCard = ({ icon: Icon, title, description, accent, testid }) => (
  <motion.div
    initial={{ opacity: 0, y: 16 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.5 }}
    whileHover={{ y: -4 }}
    className="relative overflow-hidden bg-[#F3F0EA]/60 rounded-3xl p-6 sm:p-8 flex flex-col justify-between min-h-[200px] sm:min-h-[280px] border border-[#E5E2DC]/70 group transition-all hover:shadow-[0_20px_50px_-20px_rgba(0,0,0,0.12)]"
    data-testid={testid}
  >
    <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full opacity-20" style={{ background: accent }} />
    <div className="relative z-10 flex flex-col gap-3 sm:gap-4">
      <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-white/70 backdrop-blur flex items-center justify-center shadow-sm">
        <Icon strokeWidth={1.5} className="w-5 h-5 sm:w-6 sm:h-6 text-[#2D2A26]" />
      </div>
      <div>
        <h3 className="font-heading text-xl sm:text-2xl font-medium text-[#2D2A26] tracking-tight">{title}</h3>
        <p className="text-sm text-[#7A7571] mt-1.5 sm:mt-2 leading-relaxed">{description}</p>
      </div>
    </div>
    <div className="relative z-10 flex items-center gap-2 mt-4 sm:mt-6">
      <span className="inline-flex items-center gap-2 bg-white/80 backdrop-blur px-3 py-1.5 rounded-full text-[10px] sm:text-xs font-semibold uppercase tracking-[0.15em] text-[#7A7571] border border-[#E5E2DC]">
        <Lock className="w-3 h-3" strokeWidth={2} />
        Coming Soon
      </span>
    </div>
  </motion.div>
);

const Dashboard = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#FAF9F6]">
      <div className="max-w-6xl mx-auto px-4 sm:px-8 md:px-12 py-6 sm:py-10 md:py-16">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="flex items-center justify-between mb-8 sm:mb-12"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#F472B6] to-[#60A5FA] flex items-center justify-center shadow-md">
              <span className="text-white font-heading font-bold text-lg">M</span>
            </div>
            <div>
              <p className="font-heading text-base font-semibold text-[#2D2A26] leading-none">My Family My Life</p>
              <p className="text-xs text-[#7A7571] mt-1 tracking-wide">Family Hub</p>
            </div>
          </div>
        </motion.div>

        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="mb-8 sm:mb-12 md:mb-16"
        >
          <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-[0.25em] text-[#7A7571] mb-3 sm:mb-4">Welcome home</p>
          <h1 className="font-heading text-3xl sm:text-5xl lg:text-6xl font-light tracking-tight text-[#2D2A26] leading-[1.1]">
            One App to Organize<br />
            <span className="italic font-normal">Your Entire Family Life.</span>
          </h1>
          <p className="text-sm sm:text-base text-[#7A7571] mt-4 sm:mt-6 max-w-xl leading-relaxed">
            A calm, shared space for the two of you — plans, budgets, and little notes,
            all in one warm corner of the internet.
          </p>
        </motion.div>

        {/* Cards Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 lg:gap-8">
          {/* Active: Time Plan */}
          <motion.button
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
            whileHover={{ y: -4 }}
            onClick={() => navigate("/time-plan")}
            className="lg:col-span-2 text-left relative overflow-hidden bg-white rounded-3xl p-6 sm:p-8 md:p-10 border border-[#E5E2DC] shadow-[0_16px_40px_-16px_rgba(0,0,0,0.08)] transition-all hover:shadow-[0_24px_60px_-20px_rgba(0,0,0,0.14)] cursor-pointer group active:scale-[0.99]"
            data-testid="time-plan-card"
          >
            <div className="absolute top-0 right-0 w-80 h-80 -mr-32 -mt-32 rounded-full bg-gradient-to-br from-[#F472B6]/15 to-[#60A5FA]/15 blur-3xl" />
            <div className="relative z-10 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 sm:gap-6">
              <div className="max-w-md">
                <div className="flex items-center gap-3 mb-3 sm:mb-5">
                  <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-[#FAF9F6] flex items-center justify-center border border-[#E5E2DC]">
                    <CalendarHeart strokeWidth={1.5} className="w-5 h-5 sm:w-6 sm:h-6 text-[#2D2A26]" />
                  </div>
                  <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-[0.2em] text-[#7A7571]">Active Module</span>
                </div>
                <h2 className="font-heading text-2xl sm:text-4xl font-medium text-[#2D2A26] tracking-tight mb-2 sm:mb-3">
                  Time Plan
                </h2>
                <p className="text-sm sm:text-base text-[#7A7571] leading-relaxed">
                  A shared monthly calendar for both of you. Toggle <em>Merge Calendars</em> to see
                  her plans and his plans side-by-side in one elegant view.
                </p>
              </div>
              <div className="self-start sm:self-end flex items-center gap-2 bg-[#2D2A26] text-white px-4 sm:px-5 py-2.5 sm:py-3 rounded-full font-medium text-sm transition-transform group-hover:translate-x-1">
                <span>Open Calendar</span>
                <ArrowUpRight className="w-4 h-4" strokeWidth={2} />
              </div>
            </div>
          </motion.button>

          <ComingSoonCard
            icon={Wallet}
            title="Home Budget"
            description="Income, bills, savings, debts and a clear monthly view of where money flows."
            accent="#F472B6"
            testid="home-budget-card"
          />
          <ComingSoonCard
            icon={StickyNote}
            title="Wall Board"
            description="A shared corkboard for sticky notes, shopping lists and little reminders."
            accent="#60A5FA"
            testid="wall-board-card"
          />
        </div>

        {/* Footer */}
        <div className="mt-10 sm:mt-16 pt-6 sm:pt-8 border-t border-[#E5E2DC] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <p className="text-xs text-[#7A7571] tracking-wide">
            Built with care · Works offline · PWA ready
          </p>
          <p className="text-xs text-[#7A7571] tracking-wide">© My Family My Life</p>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
