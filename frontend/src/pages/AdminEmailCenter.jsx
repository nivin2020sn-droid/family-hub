import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, Send, Eye, Mail, Users as UsersIcon, User, UserPlus,
  Globe, Loader2, CheckCircle2, AlertTriangle, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { toast } from "sonner";
import {
  adminListEmailRecipients,
  adminPreviewBroadcast,
  adminSendBroadcast,
  adminListEmailLogs,
  isAdmin,
} from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { usePageMeta } from "@/lib/usePageMeta";

const RECIPIENT_TYPES = [
  { value: "user",     icon: User,      key: "ec.type.user" },
  { value: "family",   icon: UsersIcon, key: "ec.type.family" },
  { value: "multiple", icon: UserPlus,  key: "ec.type.multiple" },
  { value: "all",      icon: Globe,     key: "ec.type.all" },
];

const LANGS = [
  { value: "en", label: "English" },
  { value: "ar", label: "العربية" },
  { value: "de", label: "Deutsch" },
];

const AdminEmailCenter = () => {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [recipients, setRecipients] = useState({ users: [], families: [], total_users: 0 });
  const [logs, setLogs] = useState([]);

  // Compose state
  const [recipientType, setRecipientType] = useState("user");
  const [recipientEmail, setRecipientEmail] = useState(""); // free-text email for "user"
  const [recipientIds, setRecipientIds] = useState([]);     // selected user/family ids
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [emailLang, setEmailLang] = useState(lang || "en");

  // Preview + send state
  const [previewHtml, setPreviewHtml] = useState("");
  const [previewCount, setPreviewCount] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState(null);

  usePageMeta({ title: `Email Center · ${t("admin.nav.email")}` });

  useEffect(() => {
    if (!isAdmin()) {
      navigate("/login", { replace: true });
      return;
    }
    (async () => {
      try {
        const [r, l] = await Promise.all([adminListEmailRecipients(), adminListEmailLogs()]);
        setRecipients(r);
        setLogs(l.logs || []);
      } catch {
        toast.error(t("auth.error.generic"));
      } finally {
        setLoading(false);
      }
    })();
  }, [navigate, t]);

  const refreshLogs = async () => {
    try {
      const l = await adminListEmailLogs();
      setLogs(l.logs || []);
    } catch {/* no-op */}
  };

  // ---------- compose ----------

  const canPreview = useMemo(() => {
    if (!subject.trim() || !body.trim()) return false;
    if (recipientType === "user") return !!recipientEmail.trim() || recipientIds.length === 1;
    if (recipientType === "family") return recipientIds.length >= 1;
    if (recipientType === "multiple") return recipientIds.length >= 1;
    return true; // "all"
  }, [subject, body, recipientType, recipientEmail, recipientIds]);

  const buildPayload = (extra = {}) => ({
    recipient_type: recipientType,
    recipient_email: recipientType === "user" ? recipientEmail.trim() : undefined,
    recipient_ids: recipientType === "user"
      ? (recipientIds[0] ? [recipientIds[0]] : [])
      : recipientIds,
    subject: subject.trim(),
    body: body.trim(),
    lang: emailLang,
    ...extra,
  });

  const doPreview = async () => {
    if (!canPreview) return;
    setPreviewing(true);
    try {
      const r = await adminPreviewBroadcast(buildPayload());
      setPreviewHtml(r.html);
      setPreviewCount(r.recipient_count);
    } catch (err) {
      toast.error(err?.response?.data?.detail || t("auth.error.generic"));
    } finally {
      setPreviewing(false);
    }
  };

  const doSend = async (confirmLarge = false) => {
    if (!canPreview) return;
    setSending(true);
    setSendResult(null);
    try {
      const r = await adminSendBroadcast(buildPayload(confirmLarge ? { confirm_large_send: true } : {}));
      setSendResult(r);
      const lvl = r.status === "sent" ? "success" : r.status === "partial" ? "warning" : "error";
      toast[lvl === "warning" ? "message" : lvl](
        t(`ec.sent.${r.status}`, { ok: r.success_count, total: r.recipient_count })
      );
      await refreshLogs();
    } catch (err) {
      const d = err?.response?.data?.detail;
      if (d?.code === "large_audience") {
        if (window.confirm(t("ec.confirmLarge", { n: d.recipient_count }))) {
          return doSend(true);
        }
      } else {
        toast.error(typeof d === "string" ? d : t("auth.error.generic"));
      }
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAF9F6] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#2D2A26]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAF9F6] px-4 py-6" data-testid="admin-email-center-page">
      <div className="max-w-5xl mx-auto">
        <button
          type="button"
          onClick={() => navigate("/admin")}
          className="inline-flex items-center gap-2 text-sm text-[#7A7571] hover:text-[#2D2A26] mb-4"
          data-testid="ec-back"
        >
          <ArrowLeft className="w-4 h-4" strokeWidth={2} />
          Admin
        </button>

        <div className="mb-6 flex items-start gap-3">
          <div className="w-11 h-11 rounded-2xl bg-[#F3F0EA] flex items-center justify-center shrink-0">
            <Mail className="w-6 h-6 text-[#2D2A26]" strokeWidth={2} />
          </div>
          <div>
            <h1 className="font-heading text-2xl text-[#2D2A26]">{t("ec.title")}</h1>
            <p className="text-sm text-[#7A7571] mt-1">{t("ec.subtitle")}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* ---------- Compose ---------- */}
          <div className="bg-white rounded-3xl border border-[#E5E2DC] p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-[#2D2A26] mb-4">{t("ec.compose")}</h2>

            {/* Recipient type */}
            <Label className="text-[10px] uppercase tracking-wider text-[#7A7571]">{t("ec.recipientType")}</Label>
            <div className="grid grid-cols-2 gap-2 mt-1 mb-4">
              {RECIPIENT_TYPES.map((rt) => {
                const Icon = rt.icon;
                const active = recipientType === rt.value;
                return (
                  <button
                    key={rt.value}
                    type="button"
                    onClick={() => {
                      setRecipientType(rt.value);
                      setRecipientIds([]);
                      setRecipientEmail("");
                    }}
                    className={`flex items-center gap-2 rounded-2xl border px-3 py-3 text-sm font-medium transition ${
                      active
                        ? "border-[#2D2A26] bg-[#2D2A26] text-white"
                        : "border-[#E5E2DC] text-[#2D2A26] hover:bg-[#F3F0EA]"
                    }`}
                    data-testid={`ec-type-${rt.value}`}
                  >
                    <Icon className="w-4 h-4" strokeWidth={2} />
                    {t(rt.key)}
                  </button>
                );
              })}
            </div>

            {/* Recipient selectors per type */}
            {recipientType === "user" && (
              <RecipientUserPicker
                users={recipients.users}
                email={recipientEmail}
                setEmail={setRecipientEmail}
                selectedId={recipientIds[0]}
                setSelectedId={(id) => setRecipientIds(id ? [id] : [])}
              />
            )}
            {recipientType === "family" && (
              <RecipientFamilyPicker
                families={recipients.families}
                selectedIds={recipientIds}
                setSelectedIds={setRecipientIds}
              />
            )}
            {recipientType === "multiple" && (
              <RecipientMultiUserPicker
                users={recipients.users}
                selectedIds={recipientIds}
                setSelectedIds={setRecipientIds}
              />
            )}
            {recipientType === "all" && (
              <div className="rounded-2xl border border-[#FDE68A] bg-[#FEF3C7] px-4 py-3 text-xs text-[#92400E] mb-4" data-testid="ec-all-warning">
                {t("ec.allWarning", { n: recipients.total_users })}
              </div>
            )}

            {/* Language selector for the email */}
            <Label className="text-[10px] uppercase tracking-wider text-[#7A7571]">{t("ec.lang")}</Label>
            <Select value={emailLang} onValueChange={setEmailLang}>
              <SelectTrigger className="rounded-xl border-[#E5E2DC] h-10 mt-1 mb-4" data-testid="ec-lang">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LANGS.map((l) => (
                  <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Subject */}
            <Label className="text-[10px] uppercase tracking-wider text-[#7A7571]">{t("ec.subject")}</Label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={200}
              placeholder={t("ec.subjectPh")}
              className="rounded-xl border-[#E5E2DC] h-11 mt-1 mb-4"
              data-testid="ec-subject"
            />

            {/* Body */}
            <Label className="text-[10px] uppercase tracking-wider text-[#7A7571]">{t("ec.body")}</Label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={10}
              placeholder={t("ec.bodyPh")}
              className="rounded-xl border-[#E5E2DC] mt-1 resize-y"
              data-testid="ec-body"
            />
            <p className="text-[10px] text-[#A09B95] mt-1">{t("ec.bodyHint")}</p>

            {/* Actions */}
            <div className="flex flex-wrap gap-2 mt-5">
              <Button
                type="button"
                onClick={doPreview}
                disabled={!canPreview || previewing}
                variant="outline"
                className="rounded-full gap-2"
                data-testid="ec-preview-btn"
              >
                <Eye className="w-4 h-4" strokeWidth={2} />
                {previewing ? t("forgot.sending") : t("ec.preview")}
              </Button>
              <Button
                type="button"
                onClick={() => doSend(false)}
                disabled={!canPreview || sending}
                className="rounded-full bg-[#2D2A26] hover:bg-[#1f1d1a] text-white gap-2"
                data-testid="ec-send-btn"
              >
                <Send className="w-4 h-4" strokeWidth={2} />
                {sending ? t("ec.sending") : t("ec.send")}
              </Button>
            </div>

            {sendResult && <SendResultBanner result={sendResult} />}
          </div>

          {/* ---------- Preview + Logs ---------- */}
          <div className="space-y-6">
            {/* Preview */}
            <div className="bg-white rounded-3xl border border-[#E5E2DC] p-6 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-[#2D2A26]">{t("ec.previewHeading")}</h2>
                {previewCount !== null && (
                  <span className="text-[11px] font-semibold bg-[#F3F0EA] text-[#2D2A26] px-2 py-1 rounded-full" data-testid="ec-preview-count">
                    {t("ec.previewCount", { n: previewCount })}
                  </span>
                )}
              </div>
              {previewHtml ? (
                <iframe
                  title="email-preview"
                  srcDoc={previewHtml}
                  className="w-full h-[560px] rounded-2xl border border-[#E5E2DC] bg-[#F3F0EA]"
                  data-testid="ec-preview-iframe"
                />
              ) : (
                <div className="h-[200px] rounded-2xl border border-dashed border-[#E5E2DC] flex items-center justify-center text-xs text-[#A09B95] text-center px-4">
                  {t("ec.previewEmpty")}
                </div>
              )}
            </div>

            {/* Logs */}
            <div className="bg-white rounded-3xl border border-[#E5E2DC] p-6 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-[#2D2A26]">{t("ec.logsHeading")}</h2>
                <button
                  type="button"
                  onClick={refreshLogs}
                  className="text-[11px] text-[#7A7571] hover:text-[#2D2A26] inline-flex items-center gap-1"
                  data-testid="ec-logs-refresh"
                >
                  <RefreshCw className="w-3 h-3" strokeWidth={2} />
                  {t("ec.logsRefresh")}
                </button>
              </div>
              {logs.length === 0 ? (
                <div className="h-[120px] flex items-center justify-center text-xs text-[#A09B95]">
                  {t("ec.logsEmpty")}
                </div>
              ) : (
                <div className="space-y-2 max-h-[480px] overflow-y-auto" data-testid="ec-logs-list">
                  {logs.map((log) => <EmailLogRow key={log.id} log={log} />)}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ---------- Recipient pickers ----------

const RecipientUserPicker = ({ users, email, setEmail, selectedId, setSelectedId }) => {
  const { t } = useI18n();
  return (
    <div className="mb-4">
      <Label className="text-[10px] uppercase tracking-wider text-[#7A7571]">{t("ec.userPicker")}</Label>
      <Select value={selectedId || "__none__"} onValueChange={(v) => { setSelectedId(v === "__none__" ? "" : v); if (v !== "__none__") setEmail(""); }}>
        <SelectTrigger className="rounded-xl border-[#E5E2DC] h-10 mt-1" data-testid="ec-user-select">
          <SelectValue placeholder={t("ec.userPickerPh")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">{t("ec.userPickerPh")}</SelectItem>
          {users.map((u) => (
            <SelectItem key={u.id} value={u.id}>{u.email}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-[10px] text-[#A09B95] mt-2 mb-1">{t("ec.userOrEmail")}</p>
      <Input
        type="email"
        value={email}
        onChange={(e) => { setEmail(e.target.value); if (e.target.value) setSelectedId(""); }}
        placeholder="someone@example.com"
        className="rounded-xl border-[#E5E2DC] h-10 mb-4"
        data-testid="ec-user-email"
      />
    </div>
  );
};

const RecipientFamilyPicker = ({ families, selectedIds, setSelectedIds }) => {
  const { t } = useI18n();
  const toggle = (id) => {
    setSelectedIds(selectedIds.includes(id) ? selectedIds.filter(x => x !== id) : [...selectedIds, id]);
  };
  return (
    <div className="mb-4">
      <Label className="text-[10px] uppercase tracking-wider text-[#7A7571]">{t("ec.familyPicker", { n: selectedIds.length })}</Label>
      <div className="mt-1 mb-4 max-h-[240px] overflow-y-auto border border-[#E5E2DC] rounded-2xl p-2 space-y-1" data-testid="ec-family-list">
        {families.length === 0 ? (
          <p className="text-xs text-[#A09B95] text-center py-4">{t("ec.familyEmpty")}</p>
        ) : (
          families.map((f) => {
            const checked = selectedIds.includes(f.id);
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => toggle(f.id)}
                className={`w-full text-left flex items-center justify-between px-3 py-2 rounded-xl text-xs ${
                  checked ? "bg-[#2D2A26] text-white" : "hover:bg-[#F3F0EA] text-[#2D2A26]"
                }`}
                data-testid={`ec-family-${f.id}`}
              >
                <span className="truncate flex-1">{f.name}</span>
                <span className={`text-[10px] ${checked ? "text-white/80" : "text-[#A09B95]"} ms-2`}>
                  {f.member_emails.length}
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
};

const RecipientMultiUserPicker = ({ users, selectedIds, setSelectedIds }) => {
  const { t } = useI18n();
  const [filter, setFilter] = useState("");
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? users.filter(u => u.email.toLowerCase().includes(q)) : users;
  }, [users, filter]);
  const toggle = (id) => {
    setSelectedIds(selectedIds.includes(id) ? selectedIds.filter(x => x !== id) : [...selectedIds, id]);
  };
  return (
    <div className="mb-4">
      <Label className="text-[10px] uppercase tracking-wider text-[#7A7571]">{t("ec.multiPicker", { n: selectedIds.length })}</Label>
      <Input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder={t("ec.multiFilter")}
        className="rounded-xl border-[#E5E2DC] h-9 mt-1 mb-1"
        data-testid="ec-multi-filter"
      />
      <div className="max-h-[200px] overflow-y-auto border border-[#E5E2DC] rounded-2xl p-2 space-y-1" data-testid="ec-multi-list">
        {filtered.length === 0 ? (
          <p className="text-xs text-[#A09B95] text-center py-4">{t("ec.multiEmpty")}</p>
        ) : filtered.slice(0, 200).map((u) => {
          const checked = selectedIds.includes(u.id);
          return (
            <button
              key={u.id}
              type="button"
              onClick={() => toggle(u.id)}
              className={`w-full text-left flex items-center px-3 py-1.5 rounded-xl text-xs ${
                checked ? "bg-[#2D2A26] text-white" : "hover:bg-[#F3F0EA] text-[#2D2A26]"
              }`}
            >
              <span className="truncate flex-1">{u.email}</span>
              {checked && <CheckCircle2 className="w-3.5 h-3.5 ms-2 shrink-0" strokeWidth={2} />}
            </button>
          );
        })}
      </div>
      <p className="text-[10px] text-[#A09B95] mt-1 mb-3">{t("ec.multiHint")}</p>
    </div>
  );
};

// ---------- Send result banner ----------

const SendResultBanner = ({ result }) => {
  const { t } = useI18n();
  const ok = result.status === "sent";
  const partial = result.status === "partial";
  const palette = ok
    ? "border-[#BBF7D0] bg-[#F0FDF4] text-[#166534]"
    : partial
      ? "border-[#FDE68A] bg-[#FEF3C7] text-[#92400E]"
      : "border-[#FCDCD7] bg-[#FEF3F2] text-[#7F1D1D]";
  const Icon = ok ? CheckCircle2 : AlertTriangle;
  return (
    <div className={`mt-4 rounded-2xl border ${palette} px-4 py-3 flex items-start gap-2`} data-testid="ec-send-result">
      <Icon className="w-5 h-5 shrink-0 mt-0.5" strokeWidth={2} />
      <div className="text-xs">
        <p className="font-semibold">
          {t(`ec.sent.${result.status}`, { ok: result.success_count, total: result.recipient_count })}
        </p>
        <p className="opacity-80 mt-0.5">
          {result.success_count}/{result.recipient_count} · log-id <span className="font-mono">{result.log_id?.slice(0, 8)}</span>
        </p>
      </div>
    </div>
  );
};

// ---------- Email log row ----------

const EmailLogRow = ({ log }) => {
  const { t } = useI18n();
  const date = log.sent_at ? new Date(log.sent_at) : null;
  const dot = log.status === "sent" ? "bg-[#16A34A]"
            : log.status === "partial" ? "bg-[#F59E0B]"
            : "bg-[#B91C1C]";
  return (
    <div className="rounded-xl border border-[#E5E2DC] px-3 py-2" data-testid={`ec-log-${log.id}`}>
      <div className="flex items-center gap-2 mb-1">
        <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
        <span className="text-xs font-semibold text-[#2D2A26] truncate flex-1">{log.subject}</span>
        <span className="text-[10px] text-[#7A7571] font-mono ms-2 shrink-0">
          {date ? date.toLocaleString() : ""}
        </span>
      </div>
      <div className="text-[10px] text-[#7A7571] flex flex-wrap gap-x-3 gap-y-0.5">
        <span><span className="opacity-60">{t("ec.log.sender")}:</span> {log.sender_email || "—"}</span>
        <span><span className="opacity-60">{t("ec.log.type")}:</span> {log.recipient_type}</span>
        <span><span className="opacity-60">{t("ec.log.count")}:</span> {log.success_count}/{log.recipient_count}</span>
        <span><span className="opacity-60">{t("ec.log.status")}:</span> {t(`ec.status.${log.status}`)}</span>
      </div>
    </div>
  );
};

export default AdminEmailCenter;
