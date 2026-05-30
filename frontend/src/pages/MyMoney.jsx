// "My Money" page — a kid-friendly personal ledger.
//
// Rendering rules:
//   * If the current member is a child (`role === "child"`), they land on
//     their OWN ledger straight away.
//   * If the current member is a family admin and arrives without a
//     `?kid=<id>` query, we render a list of every child in the family so
//     they can drill in.
//   * Any other role hitting this page → bounce to the wall board (per the
//     privacy contract: only kids see kid money, only admins can supervise).
//
// Backend already enforces every rule above; the UI just keeps the
// experience friendly and avoids unnecessary 403s.

import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft, Loader2, Plus, Trash2, Coins, Wallet, ArrowDownCircle,
  ArrowUpCircle, AlertTriangle, ChevronRight, Pencil, Target, CheckCircle2,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import MemberBadge from "@/components/MemberBadge";
import { getMember } from "@/lib/auth";
import {
  fetchSummary, fetchTransactions, createTransaction, updateTransaction,
  deleteTransaction, fetchAllKids,
  fetchGoals, createGoal, updateGoal, deleteGoal,
} from "@/lib/myMoneyApi";

const formatError = (err, fb) => err?.response?.data?.detail || err?.message || fb;

const formatAmount = (locale, n) => {
  try {
    return new Intl.NumberFormat(locale || "en", {
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    }).format(Number(n) || 0);
  } catch {
    return (Number(n) || 0).toFixed(2);
  }
};

const todayIso = () => new Date().toISOString().slice(0, 10);

const MyMoney = () => {
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const { t, dir, locale } = useI18n();
  const me = getMember();
  const meIsAdmin = !!me?.is_family_admin;
  const meIsChild = me?.role === "child";
  // Admin can supervise any child via ?kid=<id>; kids always see their own.
  const targetMemberId = meIsChild ? me.id : search.get("kid") || "";

  // ----- Admin index view -----
  const [kids, setKids] = useState([]);
  const [kidsLoading, setKidsLoading] = useState(false);
  const showAdminIndex = meIsAdmin && !targetMemberId;

  useEffect(() => {
    if (!me) {
      navigate("/login", { replace: true });
      return;
    }
    if (!meIsChild && !meIsAdmin) {
      toast.error(t("myMoney.notAuthorized"));
      navigate("/", { replace: true });
    }
  }, [me, meIsChild, meIsAdmin, navigate, t]);

  useEffect(() => {
    if (!showAdminIndex) return;
    let mounted = true;
    setKidsLoading(true);
    fetchAllKids()
      .then((list) => { if (mounted) setKids(list); })
      .catch((err) => toast.error(formatError(err, t("myMoney.error.load"))))
      .finally(() => { if (mounted) setKidsLoading(false); });
    return () => { mounted = false; };
  }, [showAdminIndex, t]);

  // ----- Ledger view (child or admin-on-child) -----
  const [summary, setSummary] = useState(null);
  const [txs, setTxs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addType, setAddType] = useState("income");
  const [add, setAdd] = useState({ description: "", amount: "", date: todayIso(), notes: "", busy: false });
  const [editTarget, setEditTarget] = useState(null);
  const [edit, setEdit] = useState({ description: "", amount: "", date: "", notes: "", busy: false });
  const [delTarget, setDelTarget] = useState(null);
  const [delBusy, setDelBusy] = useState(false);
  // Saving goals
  const [goals, setGoals] = useState([]);
  const [goalEditorOpen, setGoalEditorOpen] = useState(false);
  const [goalDraft, setGoalDraft] = useState({ id: null, name: "", target_amount: "", notes: "", target_date: "", busy: false });
  const [goalDelTarget, setGoalDelTarget] = useState(null);
  const [goalDelBusy, setGoalDelBusy] = useState(false);

  const refresh = async () => {
    if (!targetMemberId && !meIsChild) return;
    setLoading(true);
    try {
      const memberArg = meIsChild ? undefined : targetMemberId;
      const [s, list, goalsList] = await Promise.all([
        fetchSummary(memberArg),
        fetchTransactions(memberArg),
        fetchGoals(memberArg),
      ]);
      setSummary(s);
      setTxs(list);
      setGoals(goalsList);
    } catch (err) {
      toast.error(formatError(err, t("myMoney.error.load")));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { if (!showAdminIndex) refresh(); /* eslint-disable-next-line */ }, [targetMemberId, showAdminIndex]);

  const balance = summary?.balance ?? 0;
  const balanceColor = balance > 0 ? "text-emerald-700" : balance < 0 ? "text-rose-700" : "text-[#7A7571]";
  const balanceBg = balance > 0 ? "bg-emerald-50 border-emerald-200" : balance < 0 ? "bg-rose-50 border-rose-200" : "bg-[#FAF9F6] border-[#E5E2DC]";
  const subjectName = summary?.member?.name || (meIsChild ? me?.name : "");

  const openAdd = (type) => {
    setAddType(type);
    setAdd({ description: "", amount: "", date: todayIso(), notes: "", busy: false });
    setAddOpen(true);
  };

  const handleAdd = async (e) => {
    e?.preventDefault?.();
    if (add.busy) return;
    const amt = parseFloat(add.amount);
    if (!Number.isFinite(amt) || amt <= 0) return toast.error(t("myMoney.error.amount"));
    setAdd((s) => ({ ...s, busy: true }));
    try {
      await createTransaction({
        type: addType,
        amount: amt,
        description: add.description.trim(),
        date: add.date ? new Date(add.date).toISOString() : new Date().toISOString(),
        notes: add.notes.trim(),
        // When admin is supervising a kid, send the target id explicitly.
        ...(meIsAdmin && !meIsChild ? { member_id: targetMemberId } : {}),
      });
      toast.success(addType === "income" ? t("myMoney.toast.incomeAdded") : t("myMoney.toast.paymentAdded"));
      setAddOpen(false);
      await refresh();
    } catch (err) {
      toast.error(formatError(err, t("myMoney.error.add")));
      setAdd((s) => ({ ...s, busy: false }));
    }
  };

  const openEdit = (tx) => {
    setEditTarget(tx);
    const d = (tx.date || "").slice(0, 10);
    setEdit({
      description: tx.description || "",
      amount: String(tx.amount ?? ""),
      date: d || todayIso(),
      notes: tx.notes || "",
      busy: false,
    });
  };

  const saveEdit = async (e) => {
    e?.preventDefault?.();
    if (edit.busy || !editTarget) return;
    const amt = parseFloat(edit.amount);
    if (!Number.isFinite(amt) || amt <= 0) return toast.error(t("myMoney.error.amount"));
    setEdit((s) => ({ ...s, busy: true }));
    try {
      await updateTransaction(editTarget.id, {
        description: edit.description.trim(),
        amount: amt,
        date: edit.date ? new Date(edit.date).toISOString() : editTarget.date,
        notes: edit.notes.trim(),
      });
      toast.success(t("myMoney.toast.updated"));
      setEditTarget(null);
      await refresh();
    } catch (err) {
      toast.error(formatError(err, t("myMoney.error.update")));
      setEdit((s) => ({ ...s, busy: false }));
    }
  };

  const confirmDelete = async () => {
    if (delBusy || !delTarget) return;
    setDelBusy(true);
    try {
      await deleteTransaction(delTarget.id);
      toast.success(t("myMoney.toast.deleted"));
      setDelTarget(null);
      await refresh();
    } catch (err) {
      toast.error(formatError(err, t("myMoney.error.delete")));
    } finally {
      setDelBusy(false);
    }
  };

  const total = useMemo(() => ({
    income: summary?.income ?? 0,
    payments: summary?.payments ?? 0,
  }), [summary]);

  // ----- Goal handlers -----
  const openCreateGoal = () => {
    setGoalDraft({ id: null, name: "", target_amount: "", notes: "", target_date: "", busy: false });
    setGoalEditorOpen(true);
  };

  const openEditGoal = (g) => {
    setGoalDraft({
      id: g.id,
      name: g.name || "",
      target_amount: String(g.target_amount ?? ""),
      notes: g.notes || "",
      target_date: g.target_date || "",
      busy: false,
    });
    setGoalEditorOpen(true);
  };

  const saveGoal = async (e) => {
    e?.preventDefault?.();
    if (goalDraft.busy) return;
    const target = parseFloat(goalDraft.target_amount);
    if (!goalDraft.name.trim()) return toast.error(t("myMoney.goals.error.name"));
    if (!Number.isFinite(target) || target <= 0) return toast.error(t("myMoney.goals.error.target"));
    setGoalDraft((s) => ({ ...s, busy: true }));
    try {
      const payload = {
        name: goalDraft.name.trim(),
        target_amount: target,
        notes: goalDraft.notes.trim(),
        target_date: goalDraft.target_date || null,
        ...(meIsAdmin && !meIsChild ? { member_id: targetMemberId } : {}),
      };
      if (goalDraft.id) {
        await updateGoal(goalDraft.id, payload);
        toast.success(t("myMoney.goals.toast.updated"));
      } else {
        await createGoal(payload);
        toast.success(t("myMoney.goals.toast.added"));
      }
      setGoalEditorOpen(false);
      await refresh();
    } catch (err) {
      toast.error(formatError(err, t("myMoney.goals.error.save")));
      setGoalDraft((s) => ({ ...s, busy: false }));
    }
  };

  const toggleGoalComplete = async (g) => {
    try {
      await updateGoal(g.id, { is_complete: !g.is_complete });
      toast.success(!g.is_complete ? t("myMoney.goals.toast.completed") : t("myMoney.goals.toast.reopened"));
      await refresh();
    } catch (err) {
      toast.error(formatError(err, t("myMoney.goals.error.save")));
    }
  };

  const confirmGoalDelete = async () => {
    if (goalDelBusy || !goalDelTarget) return;
    setGoalDelBusy(true);
    try {
      await deleteGoal(goalDelTarget.id);
      toast.success(t("myMoney.goals.toast.deleted"));
      setGoalDelTarget(null);
      await refresh();
    } catch (err) {
      toast.error(formatError(err, t("myMoney.goals.error.delete")));
    } finally {
      setGoalDelBusy(false);
    }
  };

  if (!me) return null;

  // ---------- Admin index ----------
  if (showAdminIndex) {
    return (
      <div className="min-h-screen bg-[#FAF9F6] pb-12" data-testid="my-money-admin-index" dir={dir}>
        <Header onBack={() => navigate("/")} title={t("myMoney.adminTitle")} />
        <div className="max-w-md mx-auto px-4 pt-4 space-y-3">
          <p className="text-xs text-[#7A7571] leading-relaxed">{t("myMoney.adminDesc")}</p>
          <div className="rounded-3xl bg-white border border-[#E5E2DC] overflow-hidden">
            {kidsLoading ? (
              <div className="py-10 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-[#7A7571]" /></div>
            ) : kids.length === 0 ? (
              <p className="py-10 text-center text-sm text-[#7A7571]">{t("myMoney.noKids")}</p>
            ) : (
              <ul className="divide-y divide-[#EFEBE4]" data-testid="kids-list">
                {kids.map((k) => (
                  <li key={k.id}>
                    <button
                      type="button"
                      onClick={() => navigate(`/my-money?kid=${encodeURIComponent(k.id)}`)}
                      className="w-full text-start px-4 py-3 flex items-center gap-3 hover:bg-[#FAF9F6] active:bg-[#F3F0EA]"
                      data-testid={`kid-row-${k.id}`}
                    >
                      <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center font-heading font-semibold">
                        {(k.name || "?").charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-[#2D2A26] text-sm">{k.name}</p>
                        <p className="text-[11px] text-[#7A7571]">
                          {t("myMoney.entries", { n: k.entries_count })}
                        </p>
                      </div>
                      <div className="text-end ltr:mr-1 rtl:ml-1">
                        <p className={`font-mono font-bold text-base ${k.balance > 0 ? "text-emerald-700" : k.balance < 0 ? "text-rose-700" : "text-[#7A7571]"}`}>
                          {formatAmount(locale, k.balance)} €
                        </p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-[#9CA3AF] rtl:rotate-180" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ---------- Personal ledger ----------
  return (
    <div className="min-h-screen bg-[#FAF9F6] pb-24" data-testid="my-money-page" dir={dir}>
      <Header
        onBack={() => navigate(meIsAdmin && !meIsChild ? "/my-money" : "/")}
        title={meIsChild ? t("myMoney.title") : (subjectName || t("myMoney.title"))}
      />

      <div className="max-w-md mx-auto px-4 pt-4 space-y-4">
        <MemberBadge data-testid="my-money-member-strip" />
        {/* Big balance card */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className={`rounded-[28px] p-6 border-2 ${balanceBg}`}
          data-testid="balance-card"
        >
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#7A7571]">
            {t("myMoney.balance")}
          </p>
          {loading ? (
            <Loader2 className="w-6 h-6 animate-spin mt-2 text-[#7A7571]" />
          ) : (
            <p className={`font-mono text-4xl font-bold ${balanceColor} mt-1`} data-testid="balance-value">
              {formatAmount(locale, balance)} €
            </p>
          )}
          <div className="grid grid-cols-2 gap-3 mt-5">
            <div className="rounded-2xl bg-white/70 border border-white px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-emerald-700 flex items-center gap-1">
                <ArrowDownCircle className="w-3 h-3" />
                {t("myMoney.income")}
              </p>
              <p className="font-mono text-base font-semibold text-emerald-700" data-testid="income-value">
                {formatAmount(locale, total.income)} €
              </p>
            </div>
            <div className="rounded-2xl bg-white/70 border border-white px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-rose-700 flex items-center gap-1">
                <ArrowUpCircle className="w-3 h-3" />
                {t("myMoney.payments")}
              </p>
              <p className="font-mono text-base font-semibold text-rose-700" data-testid="payments-value">
                {formatAmount(locale, total.payments)} €
              </p>
            </div>
          </div>
        </motion.div>

        {/* Big friendly buttons */}
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            onClick={() => openAdd("income")}
            className="h-14 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold gap-2"
            data-testid="add-income-btn"
          >
            <Plus className="w-4 h-4" />
            {t("myMoney.addIncome")}
          </Button>
          <Button
            type="button"
            onClick={() => openAdd("payment")}
            className="h-14 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold gap-2"
            data-testid="add-payment-btn"
          >
            <Plus className="w-4 h-4" />
            {t("myMoney.addPayment")}
          </Button>
        </div>

        {/* Saving goals */}
        <div className="rounded-3xl bg-white border border-[#E5E2DC] overflow-hidden" data-testid="goals-section">
          <div className="px-4 py-3 border-b border-[#EFEBE4] flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Sparkles className="w-4 h-4 text-amber-500" />
              <h2 className="font-heading text-sm font-semibold text-[#2D2A26]">{t("myMoney.goals.title")}</h2>
            </div>
            <Button
              type="button"
              size="sm"
              onClick={openCreateGoal}
              className="rounded-full h-8 px-3 bg-amber-500 hover:bg-amber-600 text-white text-xs gap-1"
              data-testid="goals-add-btn"
            >
              <Plus className="w-3.5 h-3.5" />
              {t("myMoney.goals.add")}
            </Button>
          </div>
          {loading ? (
            <div className="py-8 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-[#7A7571]" /></div>
          ) : goals.length === 0 ? (
            <div className="py-8 text-center px-4">
              <Target className="w-8 h-8 mx-auto text-[#D1D5DB]" strokeWidth={1.5} />
              <p className="mt-2 text-xs text-[#7A7571]">{t("myMoney.goals.empty")}</p>
            </div>
          ) : (
            <ul className="divide-y divide-[#EFEBE4]" data-testid="goals-list">
              {goals.map((g) => {
                const pct = Math.min(100, Math.max(0, g.progress_pct || 0));
                const complete = !!g.is_complete;
                const reached = pct >= 100 || complete;
                const barColor = complete ? "bg-amber-500" : reached ? "bg-emerald-500" : "bg-amber-400";
                return (
                  <li key={g.id} className="px-4 py-3" data-testid={`goal-row-${g.id}`}>
                    <div className="flex items-center gap-2">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center ${complete ? "bg-amber-100 text-amber-700" : "bg-amber-50 text-amber-600"}`}>
                        {complete ? <CheckCircle2 className="w-4 h-4" /> : <Target className="w-4 h-4" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`font-semibold text-sm truncate ${complete ? "text-[#7A7571] line-through" : "text-[#2D2A26]"}`}>{g.name}</p>
                        <p className="text-[10px] text-[#7A7571]">
                          {formatAmount(locale, g.saved)} / {formatAmount(locale, g.target_amount)} €
                          {complete && <span className="ltr:ml-1 rtl:mr-1 text-amber-700 font-bold uppercase tracking-wider">· {t("myMoney.goals.completed")}</span>}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleGoalComplete(g)}
                        className={`w-7 h-7 rounded-full flex items-center justify-center ${complete ? "text-amber-600 hover:bg-amber-50" : "text-emerald-600 hover:bg-emerald-50"}`}
                        data-testid={`goal-toggle-${g.id}`}
                        aria-label={complete ? t("myMoney.goals.reopen") : t("myMoney.goals.markDone")}
                        title={complete ? t("myMoney.goals.reopen") : t("myMoney.goals.markDone")}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => openEditGoal(g)}
                        className="w-7 h-7 rounded-full flex items-center justify-center text-[#7A7571] hover:text-[#2D2A26] hover:bg-[#F3F0EA]"
                        data-testid={`goal-edit-${g.id}`}
                        aria-label={t("btn.edit")}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setGoalDelTarget(g)}
                        className="w-7 h-7 rounded-full flex items-center justify-center text-rose-700 hover:bg-rose-50"
                        data-testid={`goal-delete-${g.id}`}
                        aria-label={t("btn.delete")}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="mt-2 h-2 w-full rounded-full bg-[#F3F0EA] overflow-hidden">
                      <div
                        className={`h-full ${barColor} transition-all`}
                        style={{ width: `${pct}%` }}
                        data-testid={`goal-progress-${g.id}`}
                      />
                    </div>
                    <p className="mt-1 text-end text-[10px] font-mono text-[#7A7571]">{Math.round(pct)}%</p>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* History */}
        <div className="rounded-3xl bg-white border border-[#E5E2DC] overflow-hidden">
          <div className="px-4 py-3 border-b border-[#EFEBE4] flex items-center gap-2">
            <Coins className="w-4 h-4 text-[#2D2A26]" />
            <h2 className="font-heading text-sm font-semibold text-[#2D2A26]">{t("myMoney.history")}</h2>
          </div>
          {loading ? (
            <div className="py-10 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-[#7A7571]" /></div>
          ) : txs.length === 0 ? (
            <div className="py-10 text-center px-4">
              <Wallet className="w-8 h-8 mx-auto text-[#D1D5DB]" strokeWidth={1.5} />
              <p className="mt-2 text-sm text-[#7A7571]">{t("myMoney.empty")}</p>
            </div>
          ) : (
            <ul className="divide-y divide-[#EFEBE4]" data-testid="tx-list">
              {txs.map((tx) => {
                const isIncome = tx.type === "income";
                return (
                  <li key={tx.id} className="px-4 py-3 flex items-center gap-3" data-testid={`tx-row-${tx.id}`}>
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center ${isIncome ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                      {isIncome ? <ArrowDownCircle className="w-4 h-4" /> : <ArrowUpCircle className="w-4 h-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-[#2D2A26] text-sm truncate">
                        {tx.description || (isIncome ? t("myMoney.income") : t("myMoney.payments"))}
                      </p>
                      <p className="text-[10px] text-[#7A7571]">{(tx.date || "").slice(0, 10)}</p>
                    </div>
                    <p className={`font-mono font-bold text-sm ${isIncome ? "text-emerald-700" : "text-rose-700"}`}>
                      {isIncome ? "+" : "-"}{formatAmount(locale, tx.amount)} €
                    </p>
                    <button
                      type="button"
                      onClick={() => openEdit(tx)}
                      className="w-7 h-7 rounded-full flex items-center justify-center text-[#7A7571] hover:text-[#2D2A26] hover:bg-[#F3F0EA]"
                      data-testid={`tx-edit-${tx.id}`}
                      aria-label={t("btn.edit")}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDelTarget(tx)}
                      className="w-7 h-7 rounded-full flex items-center justify-center text-rose-700 hover:bg-rose-50"
                      data-testid={`tx-delete-${tx.id}`}
                      aria-label={t("btn.delete")}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Add dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-sm rounded-3xl border border-[#E5E2DC] bg-white" data-testid="my-money-add-dialog">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl flex items-center gap-2">
              {addType === "income" ? (
                <><ArrowDownCircle className="w-5 h-5 text-emerald-700" /> {t("myMoney.addIncome")}</>
              ) : (
                <><ArrowUpCircle className="w-5 h-5 text-rose-700" /> {t("myMoney.addPayment")}</>
              )}
            </DialogTitle>
            <DialogDescription className="text-xs text-[#7A7571]">
              {addType === "income" ? t("myMoney.addIncome.desc") : t("myMoney.addPayment.desc")}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAdd} className="space-y-3">
            <FieldLabel>{t("myMoney.amount")}</FieldLabel>
            <Input
              type="number" step="0.01" min="0.01" autoFocus
              value={add.amount}
              onChange={(e) => setAdd((s) => ({ ...s, amount: e.target.value }))}
              className="rounded-xl h-12 text-lg font-mono text-center"
              required data-testid="add-amount"
            />
            <FieldLabel>{t("myMoney.description")}</FieldLabel>
            <Input
              value={add.description}
              onChange={(e) => setAdd((s) => ({ ...s, description: e.target.value }))}
              className="rounded-xl h-11"
              placeholder={addType === "income" ? t("myMoney.placeholder.income") : t("myMoney.placeholder.payment")}
              data-testid="add-description"
            />
            <FieldLabel>{t("myMoney.date")}</FieldLabel>
            <Input
              type="date" value={add.date}
              onChange={(e) => setAdd((s) => ({ ...s, date: e.target.value }))}
              className="rounded-xl h-11"
              data-testid="add-date"
            />
            <FieldLabel>{t("myMoney.notes")}</FieldLabel>
            <Input
              value={add.notes}
              onChange={(e) => setAdd((s) => ({ ...s, notes: e.target.value }))}
              className="rounded-xl h-11"
              data-testid="add-notes"
            />
            <DialogFooter className="gap-2">
              <Button type="button" variant="ghost" onClick={() => setAddOpen(false)} disabled={add.busy} className="rounded-full">{t("btn.cancel")}</Button>
              <Button
                type="submit" disabled={add.busy}
                className={`rounded-full text-white ${addType === "income" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-rose-600 hover:bg-rose-700"}`}
                data-testid="add-submit"
              >
                {add.busy ? <Loader2 className="w-4 h-4 animate-spin" /> : t("btn.save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editTarget} onOpenChange={(v) => !v && setEditTarget(null)}>
        <DialogContent className="max-w-sm rounded-3xl border border-[#E5E2DC] bg-white" data-testid="my-money-edit-dialog">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl">{t("myMoney.edit")}</DialogTitle>
          </DialogHeader>
          {editTarget && (
            <form onSubmit={saveEdit} className="space-y-3">
              <FieldLabel>{t("myMoney.amount")}</FieldLabel>
              <Input
                type="number" step="0.01" min="0.01"
                value={edit.amount}
                onChange={(e) => setEdit((s) => ({ ...s, amount: e.target.value }))}
                className="rounded-xl h-12 text-lg font-mono text-center"
                required data-testid="edit-amount"
              />
              <FieldLabel>{t("myMoney.description")}</FieldLabel>
              <Input
                value={edit.description}
                onChange={(e) => setEdit((s) => ({ ...s, description: e.target.value }))}
                className="rounded-xl h-11"
                data-testid="edit-description"
              />
              <FieldLabel>{t("myMoney.date")}</FieldLabel>
              <Input
                type="date" value={edit.date}
                onChange={(e) => setEdit((s) => ({ ...s, date: e.target.value }))}
                className="rounded-xl h-11"
                data-testid="edit-date"
              />
              <FieldLabel>{t("myMoney.notes")}</FieldLabel>
              <Input
                value={edit.notes}
                onChange={(e) => setEdit((s) => ({ ...s, notes: e.target.value }))}
                className="rounded-xl h-11"
                data-testid="edit-notes"
              />
              <DialogFooter className="gap-2">
                <Button type="button" variant="ghost" onClick={() => setEditTarget(null)} disabled={edit.busy} className="rounded-full">{t("btn.cancel")}</Button>
                <Button type="submit" disabled={edit.busy} className="rounded-full bg-[#2D2A26] hover:bg-[#1f1d1a] text-white" data-testid="edit-submit">
                  {edit.busy ? <Loader2 className="w-4 h-4 animate-spin" /> : t("btn.save")}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!delTarget} onOpenChange={(v) => !v && setDelTarget(null)}>
        <DialogContent className="max-w-sm rounded-3xl border-2 border-rose-300 bg-white" data-testid="my-money-delete-dialog">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl text-rose-700 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              {t("myMoney.delete.title")}
            </DialogTitle>
            <DialogDescription className="text-xs text-rose-900">
              {t("myMoney.delete.desc")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={() => setDelTarget(null)} disabled={delBusy} className="rounded-full">{t("btn.cancel")}</Button>
            <Button type="button" onClick={confirmDelete} disabled={delBusy} className="rounded-full bg-rose-700 hover:bg-rose-800 text-white" data-testid="delete-confirm">
              {delBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                <><Trash2 className="w-4 h-4 ltr:mr-1 rtl:ml-1" />{t("btn.delete")}</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Goal editor (create + edit share the same form) */}
      <Dialog open={goalEditorOpen} onOpenChange={setGoalEditorOpen}>
        <DialogContent className="max-w-sm rounded-3xl border border-[#E5E2DC] bg-white" data-testid="goal-editor-dialog">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl flex items-center gap-2">
              <Target className="w-5 h-5 text-amber-600" />
              {goalDraft.id ? t("myMoney.goals.edit") : t("myMoney.goals.add")}
            </DialogTitle>
            <DialogDescription className="text-xs text-[#7A7571]">
              {t("myMoney.goals.desc")}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={saveGoal} className="space-y-3">
            <FieldLabel>{t("myMoney.goals.name")}</FieldLabel>
            <Input
              autoFocus value={goalDraft.name}
              onChange={(e) => setGoalDraft((s) => ({ ...s, name: e.target.value }))}
              placeholder={t("myMoney.goals.placeholder.name")}
              className="rounded-xl h-11"
              required data-testid="goal-name"
            />
            <FieldLabel>{t("myMoney.goals.target")}</FieldLabel>
            <Input
              type="number" step="0.01" min="0.01"
              value={goalDraft.target_amount}
              onChange={(e) => setGoalDraft((s) => ({ ...s, target_amount: e.target.value }))}
              className="rounded-xl h-12 text-lg font-mono text-center"
              required data-testid="goal-target"
            />
            <FieldLabel>{t("myMoney.goals.targetDate")}</FieldLabel>
            <Input
              type="date" value={goalDraft.target_date}
              onChange={(e) => setGoalDraft((s) => ({ ...s, target_date: e.target.value }))}
              className="rounded-xl h-11"
              data-testid="goal-target-date"
            />
            <FieldLabel>{t("myMoney.goals.notes")}</FieldLabel>
            <Input
              value={goalDraft.notes}
              onChange={(e) => setGoalDraft((s) => ({ ...s, notes: e.target.value }))}
              className="rounded-xl h-11"
              data-testid="goal-notes"
            />
            <DialogFooter className="gap-2">
              <Button type="button" variant="ghost" onClick={() => setGoalEditorOpen(false)} disabled={goalDraft.busy} className="rounded-full">{t("btn.cancel")}</Button>
              <Button type="submit" disabled={goalDraft.busy} className="rounded-full bg-amber-500 hover:bg-amber-600 text-white" data-testid="goal-save">
                {goalDraft.busy ? <Loader2 className="w-4 h-4 animate-spin" /> : t("btn.save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Goal delete confirmation */}
      <Dialog open={!!goalDelTarget} onOpenChange={(v) => !v && setGoalDelTarget(null)}>
        <DialogContent className="max-w-sm rounded-3xl border-2 border-rose-300 bg-white" data-testid="goal-delete-dialog">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl text-rose-700 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              {t("myMoney.goals.delete.title")}
            </DialogTitle>
            <DialogDescription className="text-xs text-rose-900">
              {goalDelTarget && t("myMoney.goals.delete.desc", { name: goalDelTarget.name })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={() => setGoalDelTarget(null)} disabled={goalDelBusy} className="rounded-full">{t("btn.cancel")}</Button>
            <Button type="button" onClick={confirmGoalDelete} disabled={goalDelBusy} className="rounded-full bg-rose-700 hover:bg-rose-800 text-white" data-testid="goal-delete-confirm">
              {goalDelBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                <><Trash2 className="w-4 h-4 ltr:mr-1 rtl:ml-1" />{t("btn.delete")}</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const Header = ({ onBack, title }) => {
  const { t } = useI18n();
  return (
    <div className="sticky top-0 z-30 bg-[#FAF9F6]/95 backdrop-blur-md border-b border-[#EFEBE4]">
      <div className="max-w-md mx-auto px-4 h-14 flex items-center justify-between gap-2">
        <button
          type="button" onClick={onBack}
          className="w-10 h-10 rounded-full flex items-center justify-center text-[#2D2A26] active:bg-[#F3F0EA]"
          data-testid="my-money-back-btn"
          aria-label={t("btn.back")}
        >
          <ArrowLeft className="w-5 h-5 rtl:rotate-180" strokeWidth={1.8} />
        </button>
        <div className="flex items-center gap-2 flex-1 justify-center">
          <Coins className="w-5 h-5 text-[#2D2A26]" strokeWidth={1.8} />
          <h1 className="font-heading text-base font-semibold text-[#2D2A26]">{title}</h1>
        </div>
        <LanguageSwitcher />
      </div>
    </div>
  );
};

const FieldLabel = ({ children }) => (
  <label className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#7A7571] block">
    {children}
  </label>
);

export default MyMoney;
