import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ShoppingCart, Plus, Check, Trash2, ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import PrivacyControl from "@/components/PrivacyControl";
import {
  listShoppingItems,
  createShoppingItem,
  toggleShoppingItem,
  deleteShoppingItem,
  finishShopping,
} from "@/lib/shoppingApi";

// Simple family Shopping List page.
// Each item is just a name with a checkbox. Tapping the row toggles the
// purchased state. "Finished Shopping" wipes purchased rows after a
// confirmation dialog and keeps unpurchased ones intact.
const ShoppingList = () => {
  const navigate = useNavigate();
  const { t, dir } = useI18n();

  const [items, setItems] = useState([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const inputRef = useRef(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const data = await listShoppingItems();
      setItems(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const handleAdd = async (e) => {
    e?.preventDefault?.();
    const trimmed = name.trim();
    if (!trimmed) return;
    setAdding(true);
    try {
      const created = await createShoppingItem(trimmed);
      setItems((prev) => [...prev, created]);
      setName("");
      inputRef.current?.focus();
    } catch {
      toast.error(t("shopping.toast.addFailed"));
    } finally {
      setAdding(false);
    }
  };

  const handleToggle = async (id) => {
    // Optimistic update — toggle immediately and reconcile on error.
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, purchased: !it.purchased } : it))
    );
    try {
      await toggleShoppingItem(id);
    } catch {
      toast.error(t("shopping.toast.updateFailed"));
      refresh();
    }
  };

  const handleDelete = async (id) => {
    const prev = items;
    setItems((p) => p.filter((it) => it.id !== id));
    try {
      await deleteShoppingItem(id);
    } catch {
      toast.error(t("shopping.toast.deleteFailed"));
      setItems(prev);
    }
  };

  const handleFinish = async () => {
    setFinishing(true);
    try {
      const res = await finishShopping();
      setItems((prev) => prev.filter((it) => !it.purchased));
      setConfirmOpen(false);
      toast.success(
        t("shopping.toast.finished", { n: res?.removed ?? 0 })
      );
    } catch {
      toast.error(t("shopping.toast.finishFailed"));
    } finally {
      setFinishing(false);
    }
  };

  const purchasedCount = items.filter((it) => it.purchased).length;

  return (
    <div
      className="min-h-screen bg-[#FAF9F6] pb-28"
      data-testid="shopping-list-page"
      dir={dir}
    >
      {/* Top bar */}
      <div className="sticky top-0 z-30 bg-[#FAF9F6]/95 backdrop-blur-md border-b border-[#EFEBE4]">
        <div className="max-w-md mx-auto px-4 h-14 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="w-10 h-10 rounded-full flex items-center justify-center text-[#2D2A26] active:bg-[#F3F0EA]"
            data-testid="shopping-back-btn"
            aria-label={t("btn.back")}
          >
            <ArrowLeft className="w-5 h-5 rtl:rotate-180" strokeWidth={1.8} />
          </button>
          <div className="flex items-center gap-2 flex-1 justify-center">
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-white"
              style={{ backgroundColor: "#16A34A" }}
            >
              <ShoppingCart className="w-4 h-4" strokeWidth={2} />
            </div>
            <h1 className="font-heading text-base font-semibold text-[#2D2A26] card-title">
              {t("shopping.title")}
            </h1>
          </div>
          <LanguageSwitcher />
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 pt-4 space-y-4">
        {/* Add item form */}
        <motion.form
          onSubmit={handleAdd}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="rounded-3xl bg-white border border-[#E5E2DC] p-3 flex items-center gap-2 shadow-[0_4px_16px_-8px_rgba(0,0,0,0.08)]"
        >
          <Input
            ref={inputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("shopping.addPlaceholder")}
            className="rounded-2xl border-[#EFEBE4] flex-1"
            data-testid="shopping-input"
            maxLength={120}
            autoFocus
          />
          <Button
            type="submit"
            disabled={!name.trim() || adding}
            className="rounded-full bg-[#16A34A] hover:bg-[#15803D] text-white px-4 h-10"
            data-testid="shopping-add-btn"
          >
            {adding ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <Plus className="w-4 h-4 ltr:mr-1 rtl:ml-1" strokeWidth={2.2} />
                <span className="text-sm">{t("shopping.add")}</span>
              </>
            )}
          </Button>
        </motion.form>

        {/* Items list */}
        <div className="rounded-3xl bg-white border border-[#E5E2DC] overflow-hidden">
          {loading && items.length === 0 ? (
            <div className="flex items-center justify-center py-10 text-[#7A7571] text-sm gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> {t("common.loading")}
            </div>
          ) : items.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <ShoppingCart className="w-8 h-8 mx-auto text-[#C7C2B9] mb-2" strokeWidth={1.6} />
              <p className="text-sm text-[#7A7571]">{t("shopping.empty")}</p>
            </div>
          ) : (
            <ul className="divide-y divide-[#EFEBE4]" data-testid="shopping-items">
              {items.map((it) => (
                <li
                  key={it.id}
                  className="flex items-center gap-3 px-4 py-3 active:bg-[#F7F5EF] transition-colors"
                  data-testid={`shopping-row-${it.id}`}
                >
                  <button
                    type="button"
                    onClick={() => handleToggle(it.id)}
                    className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors flex-shrink-0 ${
                      it.purchased
                        ? "bg-[#16A34A]"
                        : "border-2 border-[#E5E2DC] bg-white"
                    }`}
                    aria-label={
                      it.purchased
                        ? t("shopping.markUnpurchased")
                        : t("shopping.markPurchased")
                    }
                    data-testid={`shopping-toggle-${it.id}`}
                  >
                    {it.purchased && (
                      <Check className="w-4 h-4 text-white" strokeWidth={3} />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggle(it.id)}
                    className={`flex-1 min-w-0 text-start text-base break-words py-1 ${
                      it.purchased
                        ? "text-[#7A7571] line-through opacity-70"
                        : "text-[#2D2A26]"
                    }`}
                    data-testid={`shopping-name-${it.id}`}
                  >
                    {it.name}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(it.id)}
                    className="w-8 h-8 rounded-full hover:bg-[#FEE2E2] flex items-center justify-center text-[#B91C1C] flex-shrink-0"
                    aria-label={t("btn.delete")}
                    data-testid={`shopping-delete-${it.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <PrivacyControl kind="shopping_items" item={it} onChanged={refresh} size="xs" />
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Finish shopping button */}
        <Button
          type="button"
          onClick={() => setConfirmOpen(true)}
          disabled={purchasedCount === 0}
          className="w-full rounded-full h-12 bg-[#2D2A26] hover:bg-[#1f1d1a] text-white font-semibold tracking-wide disabled:opacity-40"
          data-testid="shopping-finish-btn"
        >
          <Check className="w-4 h-4 ltr:mr-2 rtl:ml-2" strokeWidth={2.4} />
          {t("shopping.finish")}
          {purchasedCount > 0 && (
            <span className="ltr:ml-2 rtl:mr-2 text-xs opacity-80">
              ({purchasedCount})
            </span>
          )}
        </Button>
      </div>

      {/* Confirmation dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent
          className="max-w-sm rounded-3xl border border-[#E5E2DC] bg-white"
          data-testid="shopping-confirm-dialog"
        >
          <DialogHeader>
            <DialogTitle className="font-heading text-xl text-[#2D2A26]">
              {t("shopping.finish.confirm.title")}
            </DialogTitle>
            <DialogDescription className="text-sm text-[#7A7571]">
              {t("shopping.finish.confirm.desc")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="ghost"
              className="rounded-full"
              onClick={() => setConfirmOpen(false)}
              disabled={finishing}
              data-testid="shopping-confirm-cancel"
            >
              {t("btn.cancel")}
            </Button>
            <Button
              onClick={handleFinish}
              disabled={finishing}
              className="rounded-full bg-[#16A34A] hover:bg-[#15803D] text-white"
              data-testid="shopping-confirm-ok"
            >
              {finishing ? (
                <Loader2 className="w-4 h-4 animate-spin ltr:mr-1.5 rtl:ml-1.5" />
              ) : (
                <Check className="w-4 h-4 ltr:mr-1.5 rtl:ml-1.5" strokeWidth={2.4} />
              )}
              {t("shopping.finish.confirm.btn")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ShoppingList;
