// Family Budget — full dashboard page.
//
// One scrollable page with: summary cards, financial health, forecast,
// month-over-month compare, upcoming bills strip, and 5 tabs for managing
// Income / Expenses / Bills / Debts / Loans.

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Wallet,
  TrendingUp,
  TrendingDown,
  Plus,
  Trash2,
  Pencil,
  Check,
  X,
  AlertCircle,
  PiggyBank,
  Receipt,
  HandCoins,
  Banknote,
  Activity,
  CalendarClock,
  Loader2,
  ArrowRightLeft,
  Building2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useI18n } from "@/lib/i18n";
import {
  budgetIncome,
  budgetExpenses,
  budgetBills,
  budgetDebts,
  budgetLoans,
  fetchBudgetSummary,
  INCOME_TYPES,
  EXPENSE_CATS,
  BILL_TYPES,
  OWNERS,
  OWNER_COLORS,
  fmtMoney,
} from "@/lib/budgetApi";

const HEALTH_THEME = {
  green: { bg: "#E3F1E0", fg: "#15803D", ring: "#16A34A", icon: PiggyBank },
  orange: { bg: "#FEF3C7", fg: "#B45309", ring: "#F59E0B", icon: AlertCircle },
  red: { bg: "#FEE2E2", fg: "#B91C1C", ring: "#DC2626", icon: AlertCircle },
};

function formatDate(d, locale) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString(locale || "en-US", {
      day: "numeric",
      month: "short",
    });
  } catch {
    return d;
  }
}

// ---------- Summary tile ----------
const Tile = ({ icon: Icon, label, value, tone = "neutral", testid }) => {
  const tones = {
    income: { bg: "#E3F1E0", fg: "#15803D" },
    expense: { bg: "#FEE2E2", fg: "#B91C1C" },
    remaining: { bg: "#EAF2FB", fg: "#1D4ED8" },
    debt: { bg: "#FEF3C7", fg: "#B45309" },
    loan: { bg: "#F3E8FF", fg: "#6B21A8" },
    neutral: { bg: "#F3F0EA", fg: "#2D2A26" },
  };
  const c = tones[tone] || tones.neutral;
  return (
    <div
      className="rounded-2xl px-3 py-3 sm:px-4 sm:py-3.5 flex items-center gap-3 border border-black/[0.03]"
      style={{ backgroundColor: c.bg }}
      data-testid={testid}
    >
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: "white", color: c.fg }}
      >
        <Icon className="w-4 h-4" strokeWidth={2} />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: c.fg }}>
          {label}
        </p>
        <p className="text-base sm:text-lg font-heading font-semibold leading-tight" style={{ color: c.fg }}>
          {value}
        </p>
      </div>
    </div>
  );
};

// ---------- Generic entry dialog ----------
const FieldRow = ({ label, children }) => (
  <div>
    <Label className="text-[10px] uppercase tracking-wider text-[#7A7571]">{label}</Label>
    <div className="mt-1">{children}</div>
  </div>
);

const EntryDialog = ({ open, onOpenChange, title, fields, initial, onSave }) => {
  const { t } = useI18n();
  const [values, setValues] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const base = {};
    fields.forEach((f) => {
      base[f.name] = initial?.[f.name] ?? f.default ?? "";
    });
    setValues(base);
  }, [open, initial, fields]);

  const setField = (k, v) => setValues((prev) => ({ ...prev, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    try {
      // Numeric coercion for declared number fields
      const out = { ...values };
      fields.forEach((f) => {
        if (f.type === "number") out[f.name] = Number(out[f.name]) || 0;
      });
      await onSave(out);
      onOpenChange(false);
    } catch (err) {
      toast.error(err?.response?.data?.detail || t("budget.toast.saveError"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-3xl border border-[#E5E2DC] bg-white max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl text-[#2D2A26]">{title}</DialogTitle>
          <DialogDescription className="text-xs text-[#7A7571]">
            {initial ? t("btn.edit") : t("btn.add")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {fields.map((f) => (
            <FieldRow key={f.name} label={f.label}>
              {f.type === "select" ? (
                <select
                  value={values[f.name] ?? ""}
                  onChange={(e) => setField(f.name, e.target.value)}
                  className="w-full h-10 rounded-xl border border-[#E5E2DC] bg-white text-sm px-2"
                  data-testid={`budget-field-${f.name}`}
                >
                  {f.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : f.type === "textarea" ? (
                <Textarea
                  value={values[f.name] ?? ""}
                  onChange={(e) => setField(f.name, e.target.value)}
                  className="rounded-xl border-[#E5E2DC] min-h-[60px]"
                  data-testid={`budget-field-${f.name}`}
                />
              ) : (
                <Input
                  type={f.type}
                  value={values[f.name] ?? ""}
                  onChange={(e) => setField(f.name, e.target.value)}
                  className="rounded-xl border-[#E5E2DC]"
                  placeholder={f.placeholder}
                  data-testid={`budget-field-${f.name}`}
                />
              )}
            </FieldRow>
          ))}
        </div>
        <DialogFooter className="gap-2">
          <Button
            variant="ghost"
            className="rounded-full"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            {t("btn.cancel")}
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="rounded-full bg-[#2D2A26] hover:bg-[#1f1d1a] text-white"
            data-testid="budget-entry-save"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : t("btn.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ---------- Section list row ----------
const Row = ({ left, right, sub, onEdit, onDelete, accent, testid }) => (
  <div
    className="relative bg-white rounded-2xl border border-[#EFEBE4] px-3 py-2.5 overflow-hidden"
    data-testid={testid}
  >
    {accent && (
      <span
        aria-hidden
        className="absolute inset-y-2 left-0 w-1 rounded-full"
        style={{ backgroundColor: accent }}
      />
    )}
    <div className="flex items-center gap-2 pl-1.5">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-[#2D2A26] leading-tight card-title">{left}</p>
        {sub && <p className="text-[11px] text-[#7A7571] mt-0.5 leading-snug">{sub}</p>}
      </div>
      <div className="text-right text-sm font-semibold text-[#2D2A26]">{right}</div>
      <button
        type="button"
        onClick={onEdit}
        className="w-7 h-7 rounded-full text-[#5C5853] hover:bg-[#F3F0EA] flex items-center justify-center active:scale-95"
        aria-label="edit"
      >
        <Pencil className="w-3.5 h-3.5" strokeWidth={2} />
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="w-7 h-7 rounded-full text-[#B91C1C]/80 hover:bg-[#FEE2E2] flex items-center justify-center active:scale-95"
        aria-label="delete"
      >
        <Trash2 className="w-3.5 h-3.5" strokeWidth={2} />
      </button>
    </div>
  </div>
);

// ---------- Tabs panel ----------
const TabBar = ({ value, onChange, t }) => {
  const tabs = [
    { key: "income", label: t("budget.tab.income") },
    { key: "expenses", label: t("budget.tab.expenses") },
    { key: "bills", label: t("budget.tab.bills") },
    { key: "debts", label: t("budget.tab.debts") },
    { key: "loans", label: t("budget.tab.loans") },
  ];
  return (
    <div className="flex gap-1 overflow-x-auto no-scrollbar bg-white rounded-full p-1 border border-[#EFEBE4] shadow-sm">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => onChange(tab.key)}
          className={`flex-1 min-w-fit text-[11px] font-semibold uppercase tracking-wider px-3 py-1.5 rounded-full whitespace-nowrap transition ${
            value === tab.key
              ? "bg-[#2D2A26] text-white"
              : "text-[#5C5853] hover:bg-[#F3F0EA]"
          }`}
          data-testid={`budget-tab-${tab.key}`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
};

// ---------- Field factories ----------
const ownerField = (t) => ({
  name: "owner",
  label: t("budget.field.owner"),
  type: "select",
  default: "shared",
  options: OWNERS.map((k) => ({ value: k, label: t(`budget.owner.${k}`) })),
});

const incomeFields = (t) => [
  { name: "description", label: t("budget.field.description"), type: "text", placeholder: "" },
  { name: "amount", label: t("budget.field.amount"), type: "number", default: 0 },
  {
    name: "category",
    label: t("budget.field.category"),
    type: "select",
    default: "primary",
    options: INCOME_TYPES.map((k) => ({ value: k, label: t(`budget.income.${k}`) })),
  },
  ownerField(t),
  { name: "date", label: t("budget.field.date"), type: "date" },
  { name: "notes", label: t("budget.field.notes"), type: "textarea" },
];

const expenseFields = (t) => [
  { name: "description", label: t("budget.field.description"), type: "text" },
  { name: "amount", label: t("budget.field.amount"), type: "number", default: 0 },
  {
    name: "category",
    label: t("budget.field.category"),
    type: "select",
    default: "food",
    options: EXPENSE_CATS.map((k) => ({ value: k, label: t(`budget.expense.${k}`) })),
  },
  ownerField(t),
  { name: "date", label: t("budget.field.date"), type: "date" },
  { name: "notes", label: t("budget.field.notes"), type: "textarea" },
];

const billFields = (t) => [
  { name: "name", label: t("budget.field.name"), type: "text" },
  { name: "amount", label: t("budget.field.amount"), type: "number", default: 0 },
  {
    name: "bill_type",
    label: t("budget.field.type"),
    type: "select",
    default: "fixed_monthly",
    options: BILL_TYPES.map((k) => ({ value: k, label: t(`budget.bill.${k}`) })),
  },
  ownerField(t),
  { name: "due_date", label: t("budget.field.dueDate"), type: "date" },
  { name: "notes", label: t("budget.field.notes"), type: "textarea" },
];

const debtFields = (t) => [
  { name: "creditor", label: t("budget.field.creditor"), type: "text" },
  { name: "original_amount", label: t("budget.field.original"), type: "number", default: 0 },
  { name: "remaining_amount", label: t("budget.field.remaining"), type: "number", default: 0 },
  ownerField(t),
  { name: "due_date", label: t("budget.field.dueDate"), type: "date" },
  { name: "notes", label: t("budget.field.notes"), type: "textarea" },
];

const loanFields = (t) => [
  { name: "name", label: t("budget.field.name"), type: "text" },
  { name: "lender", label: t("budget.field.lender"), type: "text" },
  { name: "principal", label: t("budget.field.principal"), type: "number", default: 0 },
  { name: "interest_rate", label: t("budget.field.interestRate"), type: "number", default: 0 },
  { name: "term_months", label: t("budget.field.termMonths"), type: "number", default: 12 },
  { name: "monthly_payment", label: t("budget.field.monthlyPayment"), type: "number", default: 0 },
  { name: "payments_made", label: t("budget.field.paymentsMade"), type: "number", default: 0 },
  ownerField(t),
  { name: "start_date", label: t("budget.field.startDate"), type: "date" },
];

// ---------- Compare row ----------
const CompareRow = ({ label, comp, locale }) => {
  const { current, previous, pct } = comp || {};
  const dir = pct == null ? "flat" : pct > 0 ? "up" : pct < 0 ? "down" : "flat";
  const color = dir === "up" ? "#B91C1C" : dir === "down" ? "#15803D" : "#7A7571";
  const Arrow = dir === "up" ? TrendingUp : dir === "down" ? TrendingDown : ArrowRightLeft;
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-[#EFEBE4] last:border-b-0">
      <span className="text-sm text-[#5C5853]">{label}</span>
      <div className="text-right">
        <p className="text-xs text-[#7A7571]">
          {fmtMoney(previous, locale)} → {fmtMoney(current, locale)}
        </p>
        <p className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color }}>
          <Arrow className="w-3 h-3" strokeWidth={2.2} />
          {pct == null ? "—" : `${Math.abs(pct)}%`}
        </p>
      </div>
    </div>
  );
};

// ---------- Family Dashboard (per-wallet KPIs) ----------
const WalletColumn = ({ ownerKey, title, kpis, locale }) => {
  const c = OWNER_COLORS[ownerKey] || OWNER_COLORS.shared;
  return (
    <div
      className="rounded-3xl border border-black/[0.03] p-3 sm:p-4 flex-1 min-w-0"
      style={{ backgroundColor: c.soft }}
      data-testid={`budget-wallet-${ownerKey}`}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c.ring }} />
        <h3 className="font-heading text-sm font-semibold" style={{ color: c.text }}>
          {title}
        </h3>
      </div>
      <ul className="space-y-1.5">
        {kpis.map((k) => (
          <li key={k.label} className="flex items-center justify-between gap-2">
            <span className="text-[10px] uppercase tracking-wider" style={{ color: c.fg }}>
              {k.label}
            </span>
            <span
              className="text-sm font-heading font-semibold"
              style={{ color: k.negative ? "#B91C1C" : c.text }}
            >
              {fmtMoney(k.value, locale)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};

const FamilyDashboard = ({ summary, t, locale }) => {
  if (!summary) return null;
  const bo = summary.by_owner || {};
  const get = (k, o) => (bo?.[k]?.[o] ?? 0);

  // Top-level family-wide KPIs
  const familyKpis = [
    { label: t("budget.dashboard.familyIncome"), value: summary.income_total },
    { label: t("budget.dashboard.familyRemaining"), value: summary.remaining, negative: (summary.remaining ?? 0) < 0 },
    { label: t("budget.dashboard.sharedExpenses"), value: get("expense", "shared") + get("bills", "shared") },
    { label: t("budget.dashboard.monthlyObligations"), value: summary.monthly_obligations_total },
    { label: t("budget.summary.debts"), value: summary.debts_total },
    { label: t("budget.dashboard.totalRemainingLoans"), value: summary.loans_total_remaining },
  ];

  const bahaaKpis = [
    { label: t("budget.summary.income"), value: get("income", "bahaa") },
    { label: t("budget.summary.expense"), value: get("expense", "bahaa") },
    { label: t("budget.dashboard.monthlyObligations"), value: get("monthly_obligations", "bahaa") },
    { label: t("budget.summary.remaining"), value: get("remaining", "bahaa"), negative: get("remaining", "bahaa") < 0 },
  ];

  const theresaKpis = [
    { label: t("budget.summary.income"), value: get("income", "theresa") },
    { label: t("budget.summary.expense"), value: get("expense", "theresa") },
    { label: t("budget.dashboard.monthlyObligations"), value: get("monthly_obligations", "theresa") },
    { label: t("budget.summary.remaining"), value: get("remaining", "theresa"), negative: get("remaining", "theresa") < 0 },
  ];

  return (
    <div className="space-y-3" data-testid="budget-family-dashboard">
      <div className="bg-white rounded-3xl border border-[#EFEBE4] p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-2.5">
          <Wallet className="w-4 h-4 text-[#2D2A26]" strokeWidth={2} />
          <h3 className="font-heading text-base font-semibold text-[#2D2A26]">
            {t("budget.dashboard.title")}
          </h3>
        </div>
        <ul className="grid grid-cols-2 gap-x-3 gap-y-1.5">
          {familyKpis.map((k) => (
            <li key={k.label} className="flex items-center justify-between gap-2 min-w-0">
              <span className="text-[10px] uppercase tracking-wider text-[#7A7571] truncate">
                {k.label}
              </span>
              <span
                className={`text-sm font-heading font-semibold ${
                  k.negative ? "text-rose-700" : "text-[#2D2A26]"
                }`}
              >
                {fmtMoney(k.value, locale)}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <WalletColumn
          ownerKey="bahaa"
          title={t("budget.wallet.bahaa")}
          kpis={bahaaKpis}
          locale={locale}
        />
        <WalletColumn
          ownerKey="theresa"
          title={t("budget.wallet.theresa")}
          kpis={theresaKpis}
          locale={locale}
        />
      </div>
    </div>
  );
};

// ---------- Wallet filter pills ----------
const WalletFilter = ({ value, onChange, t }) => {
  const tabs = [
    { key: "all", label: t("budget.wallet.all"), color: "#2D2A26" },
    { key: "bahaa", label: t("budget.wallet.bahaa"), color: OWNER_COLORS.bahaa.ring },
    { key: "theresa", label: t("budget.wallet.theresa"), color: OWNER_COLORS.theresa.ring },
    { key: "shared", label: t("budget.wallet.shared"), color: OWNER_COLORS.shared.ring },
  ];
  return (
    <div className="flex gap-1 bg-white rounded-full p-1 border border-[#EFEBE4] shadow-sm">
      {tabs.map((w) => {
        const active = value === w.key;
        return (
          <button
            key={w.key}
            type="button"
            onClick={() => onChange(w.key)}
            className={`flex-1 inline-flex items-center justify-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider py-1.5 rounded-full transition ${
              active ? "text-white shadow" : "text-[#5C5853] hover:bg-[#F3F0EA]"
            }`}
            style={active ? { backgroundColor: w.color } : undefined}
            data-testid={`budget-wallet-filter-${w.key}`}
          >
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: active ? "white" : w.color }}
            />
            {w.label}
          </button>
        );
      })}
    </div>
  );
};

// ---------- Main page ----------
const HomeBudget = () => {
  const navigate = useNavigate();
  const { t, locale } = useI18n();
  const [summary, setSummary] = useState(null);
  const [tab, setTab] = useState("income");
  const [items, setItems] = useState({
    income: [],
    expenses: [],
    bills: [],
    debts: [],
    loans: [],
  });
  const [loading, setLoading] = useState(true);

  // Dialog state for create/edit
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorKind, setEditorKind] = useState(null); // 'income' | 'expenses' | ...
  const [editorInitial, setEditorInitial] = useState(null);
  const [walletFilter, setWalletFilter] = useState("all"); // all | bahaa | theresa | shared

  const apis = useMemo(
    () => ({
      income: budgetIncome,
      expenses: budgetExpenses,
      bills: budgetBills,
      debts: budgetDebts,
      loans: budgetLoans,
    }),
    []
  );

  const refresh = async () => {
    setLoading(true);
    try {
      const [s, inc, exp, bills, debts, loans] = await Promise.all([
        fetchBudgetSummary(),
        budgetIncome.list(),
        budgetExpenses.list(),
        budgetBills.list(),
        budgetDebts.list(),
        budgetLoans.list(),
      ]);
      setSummary(s);
      setItems({ income: inc, expenses: exp, bills, debts, loans });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const openEditor = (kind, initial = null) => {
    setEditorKind(kind);
    setEditorInitial(initial);
    setEditorOpen(true);
  };

  const fieldsForKind = (kind) => {
    if (kind === "income") return incomeFields(t);
    if (kind === "expenses") return expenseFields(t);
    if (kind === "bills") return billFields(t);
    if (kind === "debts") return debtFields(t);
    return loanFields(t);
  };

  const titleForKind = (kind) => {
    if (kind === "income") return t("budget.add.income");
    if (kind === "expenses") return t("budget.add.expense");
    if (kind === "bills") return t("budget.add.bill");
    if (kind === "debts") return t("budget.add.debt");
    return t("budget.add.loan");
  };

  const saveEntry = async (data) => {
    const kind = editorKind;
    const api = apis[kind];
    if (editorInitial) {
      await api.update(editorInitial.id, data);
    } else {
      await api.create(data);
    }
    toast.success(t("budget.toast.saved"));
    await refresh();
  };

  const deleteEntry = async (kind, id) => {
    try {
      await apis[kind].remove(id);
      toast.success(t("budget.toast.deleted"));
      await refresh();
    } catch {
      toast.error(t("budget.toast.saveError"));
    }
  };

  const toggleBillPaid = async (bill) => {
    try {
      await budgetBills.update(bill.id, {
        is_paid: !bill.is_paid,
        last_paid_at: !bill.is_paid ? new Date().toISOString() : bill.last_paid_at,
      });
      await refresh();
    } catch {
      toast.error(t("budget.toast.saveError"));
    }
  };

  // ---- summary derived ----
  const health = summary?.health || "green";
  const healthTheme = HEALTH_THEME[health];
  const HealthIcon = healthTheme.icon;

  // ---- list renderers ----
  // Wallet filter helper — applies to all tabs uniformly.
  const matchWallet = (it) => {
    if (walletFilter === "all") return true;
    const o = (it.owner || "shared").toLowerCase();
    return o === walletFilter;
  };
  // Owner badge / accent helper
  const ownerOf = (it) => (it.owner || "shared").toLowerCase();
  const accentFor = (it) => (OWNER_COLORS[ownerOf(it)] || OWNER_COLORS.shared).ring;
  const OwnerBadge = ({ owner }) => {
    const o = (owner || "shared").toLowerCase();
    const c = OWNER_COLORS[o] || OWNER_COLORS.shared;
    return (
      <span
        className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full"
        style={{ backgroundColor: c.soft, color: c.text }}
      >
        {t(`budget.owner.${o}`)}
      </span>
    );
  };

  const renderList = () => {
    if (tab === "income") {
      const filtered = items.income.filter(matchWallet);
      if (filtered.length === 0) return <EmptyHint text={t("budget.empty.income")} />;
      return filtered.map((it) => (
        <Row
          key={it.id}
          left={
            <span className="inline-flex items-center gap-2 flex-wrap">
              {it.description || t(`budget.income.${it.category}`)}
              <OwnerBadge owner={it.owner} />
            </span>
          }
          sub={`${t(`budget.income.${it.category}`)} · ${formatDate(it.date, locale)}`}
          right={`+${fmtMoney(it.amount, locale)}`}
          accent={accentFor(it)}
          onEdit={() => openEditor("income", it)}
          onDelete={() => deleteEntry("income", it.id)}
          testid={`budget-income-${it.id}`}
        />
      ));
    }
    if (tab === "expenses") {
      const filtered = items.expenses.filter(matchWallet);
      if (filtered.length === 0) return <EmptyHint text={t("budget.empty.expenses")} />;
      return filtered.map((it) => (
        <Row
          key={it.id}
          left={
            <span className="inline-flex items-center gap-2 flex-wrap">
              {it.description || t(`budget.expense.${it.category}`)}
              <OwnerBadge owner={it.owner} />
            </span>
          }
          sub={`${t(`budget.expense.${it.category}`)} · ${formatDate(it.date, locale)}`}
          right={`-${fmtMoney(it.amount, locale)}`}
          accent={accentFor(it)}
          onEdit={() => openEditor("expenses", it)}
          onDelete={() => deleteEntry("expenses", it.id)}
          testid={`budget-expense-${it.id}`}
        />
      ));
    }
    if (tab === "bills") {
      const filtered = items.bills.filter(matchWallet);
      if (filtered.length === 0) return <EmptyHint text={t("budget.empty.bills")} />;
      return filtered.map((b) => (
        <div
          key={b.id}
          className="relative bg-white rounded-2xl border border-[#EFEBE4] p-3 overflow-hidden"
          data-testid={`budget-bill-${b.id}`}
        >
          <span
            aria-hidden
            className="absolute inset-y-2 left-0 w-1 rounded-full"
            style={{ backgroundColor: accentFor(b) }}
          />
          <div className="flex items-start gap-2 pl-1.5">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[#2D2A26] card-title inline-flex items-center gap-2 flex-wrap">
                {b.name}
                <OwnerBadge owner={b.owner} />
              </p>
              <p className="text-[11px] text-[#7A7571] mt-0.5">
                {t(`budget.bill.${b.bill_type}`)}
                {b.due_date && ` · ${formatDate(b.due_date, locale)}`}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-[#2D2A26]">
                {fmtMoney(b.amount, locale)}
              </p>
              <button
                type="button"
                onClick={() => toggleBillPaid(b)}
                className={`mt-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                  b.is_paid
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-amber-100 text-amber-700"
                }`}
                data-testid={`budget-bill-toggle-${b.id}`}
              >
                {b.is_paid ? t("budget.bill.markUnpaid") : t("budget.bill.markPaid")}
              </button>
            </div>
            <button
              type="button"
              onClick={() => openEditor("bills", b)}
              className="w-7 h-7 rounded-full text-[#5C5853] hover:bg-[#F3F0EA] flex items-center justify-center"
            >
              <Pencil className="w-3.5 h-3.5" strokeWidth={2} />
            </button>
            <button
              type="button"
              onClick={() => deleteEntry("bills", b.id)}
              className="w-7 h-7 rounded-full text-[#B91C1C]/80 hover:bg-[#FEE2E2] flex items-center justify-center"
            >
              <Trash2 className="w-3.5 h-3.5" strokeWidth={2} />
            </button>
          </div>
        </div>
      ));
    }
    if (tab === "debts") {
      const filtered = items.debts.filter(matchWallet);
      if (filtered.length === 0) return <EmptyHint text={t("budget.empty.debts")} />;
      return filtered.map((d) => {
        const statusTone = {
          unpaid: "bg-rose-100 text-rose-700",
          partial: "bg-amber-100 text-amber-700",
          paid: "bg-emerald-100 text-emerald-700",
        }[d.status] || "bg-gray-100 text-gray-700";
        return (
          <Row
            key={d.id}
            left={
              <span className="inline-flex items-center gap-2 flex-wrap">
                {d.creditor}
                <OwnerBadge owner={d.owner} />
              </span>
            }
            sub={
              <span className="inline-flex items-center gap-2 flex-wrap">
                <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${statusTone}`}>
                  {t(`budget.debt.${d.status}`)}
                </span>
                {d.due_date && (
                  <span className="text-[10px] text-[#7A7571]">{formatDate(d.due_date, locale)}</span>
                )}
              </span>
            }
            right={
              <span>
                <span className="block text-sm">{fmtMoney(d.remaining_amount, locale)}</span>
                <span className="block text-[10px] text-[#7A7571]">
                  / {fmtMoney(d.original_amount, locale)}
                </span>
              </span>
            }
            accent={accentFor(d)}
            onEdit={() => openEditor("debts", d)}
            onDelete={() => deleteEntry("debts", d.id)}
            testid={`budget-debt-${d.id}`}
          />
        );
      });
    }
    // loans
    const filtered = items.loans.filter(matchWallet);
    if (filtered.length === 0) return <EmptyHint text={t("budget.empty.loans")} />;
    const progress = (summary?.loan_progress || []).reduce(
      (m, p) => ({ ...m, [p.id]: p }),
      {}
    );
    return filtered.map((l) => {
      const p = progress[l.id] || {};
      const pct = p.progress_pct || 0;
      return (
        <div
          key={l.id}
          className="relative bg-white rounded-2xl border border-[#EFEBE4] p-3 overflow-hidden"
          data-testid={`budget-loan-${l.id}`}
        >
          <span
            aria-hidden
            className="absolute inset-y-2 left-0 w-1 rounded-full"
            style={{ backgroundColor: accentFor(l) }}
          />
          <div className="pl-1.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[#2D2A26] card-title inline-flex items-center gap-2 flex-wrap">
                  {l.name}
                  <OwnerBadge owner={l.owner} />
                </p>
                <p className="text-[11px] text-[#7A7571] mt-0.5">
                  {l.lender || "—"} · {l.interest_rate}%
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-[#2D2A26]">
                  {fmtMoney(p.remaining ?? l.principal, locale)}
                </p>
                <p className="text-[10px] text-[#7A7571]">
                  / {fmtMoney(l.principal, locale)}
                </p>
              </div>
            </div>
            <div className="mt-2">
              <div className="flex items-center justify-between text-[10px] text-[#7A7571] mb-1">
                <span>{t("budget.loan.progress")}: {pct}%</span>
                <span>
                  {t("budget.loan.paymentsLeft", { n: p.payments_remaining ?? "—" })}
                </span>
              </div>
              <div className="h-2 bg-[#F3F0EA] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${pct}%`, backgroundColor: accentFor(l) }}
                />
              </div>
              {p.estimated_end_date && (
                <p className="text-[10px] text-[#7A7571] mt-1.5">
                  {t("budget.loan.estEnd")}: {p.estimated_end_date} · {fmtMoney(l.monthly_payment, locale)}/mo
                </p>
              )}
            </div>
            <div className="mt-2 flex items-center justify-end gap-1">
              <button
                type="button"
                onClick={() => openEditor("loans", l)}
                className="w-7 h-7 rounded-full text-[#5C5853] hover:bg-[#F3F0EA] flex items-center justify-center"
              >
                <Pencil className="w-3.5 h-3.5" strokeWidth={2} />
              </button>
              <button
                type="button"
                onClick={() => deleteEntry("loans", l.id)}
                className="w-7 h-7 rounded-full text-[#B91C1C]/80 hover:bg-[#FEE2E2] flex items-center justify-center"
              >
                <Trash2 className="w-3.5 h-3.5" strokeWidth={2} />
              </button>
            </div>
          </div>
        </div>
      );
    });
  };

  return (
    <div className="min-h-screen bg-[#FAF9F6] pb-20" data-testid="budget-page">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-[#FAF9F6]/95 backdrop-blur-md border-b border-[#EFEBE4]">
        <div className="max-w-md mx-auto px-4 py-3 flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="w-9 h-9 rounded-full bg-white hover:bg-[#F3F0EA] flex items-center justify-center text-[#2D2A26] active:scale-95 transition border border-[#EFEBE4]"
            aria-label={t("btn.close")}
            data-testid="budget-back-btn"
          >
            <ArrowLeft className="w-4 h-4 rtl:rotate-180" strokeWidth={2.2} />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="font-heading text-lg sm:text-xl font-semibold text-[#2D2A26] tracking-tight">
              {t("budget.title")}
            </h1>
            <p className="text-[11px] text-[#7A7571] truncate">{t("budget.subtitle")}</p>
          </div>
          <LanguageSwitcher />
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 pt-4 space-y-4">
        {loading ? (
          <div className="py-12 text-center text-[#7A7571]">
            <Loader2 className="w-5 h-5 animate-spin mx-auto" />
          </div>
        ) : (
          <>
            {/* Family Dashboard — top-level per-wallet summary */}
            <FamilyDashboard summary={summary} t={t} locale={locale} />

            {/* Summary tiles */}
            <div className="grid grid-cols-2 gap-2.5">
              <Tile
                icon={TrendingUp}
                label={t("budget.summary.income")}
                value={fmtMoney(summary?.income_total, locale)}
                tone="income"
                testid="budget-tile-income"
              />
              <Tile
                icon={TrendingDown}
                label={t("budget.summary.expense")}
                value={fmtMoney(summary?.expense_total, locale)}
                tone="expense"
                testid="budget-tile-expense"
              />
              <Tile
                icon={Wallet}
                label={t("budget.summary.remaining")}
                value={fmtMoney(summary?.remaining, locale)}
                tone="remaining"
                testid="budget-tile-remaining"
              />
              <Tile
                icon={HandCoins}
                label={t("budget.summary.debts")}
                value={fmtMoney(summary?.debts_total, locale)}
                tone="debt"
                testid="budget-tile-debts"
              />
              <Tile
                icon={Building2}
                label={t("budget.summary.loans")}
                value={fmtMoney(summary?.loans_total_remaining, locale)}
                tone="loan"
                testid="budget-tile-loans"
              />
              <Tile
                icon={Receipt}
                label={t("budget.upcoming.title")}
                value={fmtMoney(summary?.next_14_total, locale)}
                tone="neutral"
                testid="budget-tile-upcoming"
              />
            </div>

            {/* Health card */}
            <motion.div
              layout
              className="rounded-3xl p-4 sm:p-5 border border-black/[0.03]"
              style={{ backgroundColor: healthTheme.bg }}
              data-testid="budget-health"
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-2xl flex items-center justify-center text-white"
                  style={{ backgroundColor: healthTheme.ring }}
                >
                  <HealthIcon className="w-5 h-5" strokeWidth={2} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: healthTheme.fg }}>
                    {t("budget.health.title")}
                  </p>
                  <p className="font-heading text-lg font-semibold" style={{ color: healthTheme.fg }}>
                    {t(`budget.health.${health}`)}
                  </p>
                </div>
              </div>
              <p className="text-sm mt-2 leading-snug" style={{ color: healthTheme.fg }}>
                {t(`budget.health.reason.${summary?.health_reason || "all_covered"}`)}
              </p>
            </motion.div>

            {/* Forecast */}
            <div className="bg-white rounded-3xl p-4 sm:p-5 border border-[#EFEBE4]">
              <div className="flex items-center gap-2 mb-3">
                <Activity className="w-4 h-4 text-[#2D2A26]" strokeWidth={2} />
                <h3 className="font-heading text-base font-semibold text-[#2D2A26]">
                  {t("budget.forecast.title")}
                </h3>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                {[
                  { k: "now", v: summary?.forecast?.balance_now },
                  { k: "in7", v: summary?.forecast?.balance_7d },
                  { k: "eom", v: summary?.forecast?.balance_eom },
                ].map((f) => {
                  const isNeg = (f.v ?? 0) < 0;
                  return (
                    <div
                      key={f.k}
                      className="rounded-2xl bg-[#FAF9F6] px-2 py-2.5 border border-[#EFEBE4]"
                    >
                      <p className="text-[10px] uppercase tracking-wider text-[#7A7571]">
                        {t(`budget.forecast.${f.k}`)}
                      </p>
                      <p
                        className={`font-heading text-base sm:text-lg font-semibold mt-0.5 ${
                          isNeg ? "text-rose-700" : "text-[#2D2A26]"
                        }`}
                      >
                        {fmtMoney(f.v, locale)}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Comparisons */}
            <div className="bg-white rounded-3xl p-4 sm:p-5 border border-[#EFEBE4]">
              <div className="flex items-center gap-2 mb-2">
                <CalendarClock className="w-4 h-4 text-[#2D2A26]" strokeWidth={2} />
                <h3 className="font-heading text-base font-semibold text-[#2D2A26]">
                  {t("budget.compare.title")}
                </h3>
              </div>
              <CompareRow
                label={t("budget.summary.income")}
                comp={summary?.comparisons?.income}
                locale={locale}
              />
              <CompareRow
                label={t("budget.summary.expense")}
                comp={summary?.comparisons?.expense}
                locale={locale}
              />
              <CompareRow
                label={t("budget.expense.food")}
                comp={summary?.comparisons?.food}
                locale={locale}
              />
              <CompareRow
                label={t("budget.summary.remaining")}
                comp={summary?.comparisons?.remaining}
                locale={locale}
              />
            </div>

            {/* Upcoming bills */}
            {summary?.upcoming_bills?.length > 0 && (
              <div className="bg-white rounded-3xl p-4 sm:p-5 border border-[#EFEBE4]">
                <h3 className="font-heading text-base font-semibold text-[#2D2A26] mb-2">
                  {t("budget.upcoming.title")}
                </h3>
                <div className="space-y-1.5">
                  {summary.upcoming_bills.slice(0, 5).map((b) => (
                    <div
                      key={b.id}
                      className="flex items-center justify-between text-xs bg-[#FAF9F6] rounded-xl px-3 py-2"
                    >
                      <span className="text-[#2D2A26] font-medium card-title">{b.name}</span>
                      <span className="text-[#5C5853]">{formatDate(b._due, locale)}</span>
                      <span className="font-semibold text-[#2D2A26]">{fmtMoney(b.amount, locale)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tabs + List */}
            <div className="space-y-3">
              {/* Wallet filter pills */}
              <WalletFilter value={walletFilter} onChange={setWalletFilter} t={t} />
              <TabBar value={tab} onChange={setTab} t={t} />
              <div className="flex justify-end">
                <Button
                  onClick={() => openEditor(tab, null)}
                  className="rounded-full bg-[#2D2A26] hover:bg-[#1f1d1a] text-white px-3 h-9"
                  data-testid={`budget-add-${tab}-btn`}
                >
                  <Plus className="w-4 h-4 mr-1 rtl:mr-0 rtl:ml-1" />
                  {t(`budget.add.${tab === "expenses" ? "expense" : tab.replace(/s$/, "")}`)}
                </Button>
              </div>
              <div className="space-y-2">{renderList()}</div>
            </div>
          </>
        )}
      </div>

      {/* Editor dialog */}
      {editorOpen && (
        <EntryDialog
          open={editorOpen}
          onOpenChange={(v) => {
            setEditorOpen(v);
            if (!v) {
              setEditorKind(null);
              setEditorInitial(null);
            }
          }}
          title={titleForKind(editorKind)}
          fields={fieldsForKind(editorKind)}
          initial={editorInitial}
          onSave={saveEntry}
        />
      )}
    </div>
  );
};

const EmptyHint = ({ text }) => (
  <div className="bg-white rounded-2xl border border-[#EFEBE4] px-4 py-6 text-center">
    <p className="text-xs text-[#7A7571] leading-relaxed">{text}</p>
  </div>
);

export default HomeBudget;
