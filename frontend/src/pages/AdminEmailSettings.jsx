import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Mail, Send, Save, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  adminGetEmailSettings,
  adminUpdateEmailSettings,
  adminTestEmail,
  isAdmin,
} from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { usePageMeta } from "@/lib/usePageMeta";

const PASSWORD_MASK = "********";

const AdminEmailSettings = () => {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [settings, setSettings] = useState({
    smtp_host: "",
    smtp_port: 587,
    smtp_username: "",
    smtp_password: "",
    smtp_password_set: false,
    use_tls: true,
    sender_email: "",
    sender_name: "My Life My Time",
  });
  const [testTo, setTestTo] = useState("");

  usePageMeta({ title: `${t("admin.email.title")} · My Life My Time` });

  useEffect(() => {
    if (!isAdmin()) {
      navigate("/login", { replace: true });
      return;
    }
    (async () => {
      try {
        const data = await adminGetEmailSettings();
        setSettings({
          ...data,
          smtp_password: data?.smtp_password_set ? PASSWORD_MASK : "",
        });
      } catch {
        toast.error(t("auth.error.generic"));
      } finally {
        setLoading(false);
      }
    })();
  }, [navigate, t]);

  const save = async (e) => {
    e?.preventDefault?.();
    setSaving(true);
    try {
      const patch = {
        smtp_host: settings.smtp_host,
        smtp_port: Number(settings.smtp_port) || 587,
        smtp_username: settings.smtp_username,
        use_tls: !!settings.use_tls,
        sender_email: settings.sender_email,
        sender_name: settings.sender_name,
      };
      // Only send the password field if the admin actually changed it.
      if (settings.smtp_password && settings.smtp_password !== PASSWORD_MASK) {
        patch.smtp_password = settings.smtp_password;
      }
      const fresh = await adminUpdateEmailSettings(patch);
      setSettings({
        ...fresh,
        smtp_password: fresh?.smtp_password_set ? PASSWORD_MASK : "",
      });
      toast.success(t("admin.email.saved"));
    } catch (err) {
      toast.error(err?.response?.data?.detail || t("auth.error.generic"));
    } finally {
      setSaving(false);
    }
  };

  const sendTest = async () => {
    if (!testTo.trim()) return;
    setTesting(true);
    try {
      const r = await adminTestEmail(testTo.trim().toLowerCase(), lang);
      if (r?.sent) {
        toast.success(t("admin.email.testSent"));
      } else {
        toast.error(
          t("admin.email.testFailed", {
            error: r?.error || r?.reason || "unknown",
          })
        );
      }
    } catch (err) {
      toast.error(err?.response?.data?.detail || t("auth.error.generic"));
    } finally {
      setTesting(false);
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
    <div className="min-h-screen bg-[#FAF9F6] px-4 py-6" data-testid="admin-email-settings-page">
      <div className="max-w-2xl mx-auto">
        <button
          type="button"
          onClick={() => navigate("/admin")}
          className="inline-flex items-center gap-2 text-sm text-[#7A7571] hover:text-[#2D2A26] mb-4"
          data-testid="admin-email-back"
        >
          <ArrowLeft className="w-4 h-4" strokeWidth={2} />
          Admin
        </button>
        <div className="bg-white rounded-3xl border border-[#E5E2DC] p-6 sm:p-8 shadow-sm">
          <div className="flex items-start gap-3 mb-6">
            <div className="w-11 h-11 rounded-2xl bg-[#F3F0EA] flex items-center justify-center shrink-0">
              <Mail className="w-6 h-6 text-[#2D2A26]" strokeWidth={2} />
            </div>
            <div>
              <h1 className="font-heading text-2xl text-[#2D2A26]">{t("admin.email.title")}</h1>
              <p className="text-sm text-[#7A7571] mt-1">{t("admin.email.desc")}</p>
            </div>
          </div>

          {!settings.smtp_host && (
            <div className="rounded-2xl border border-[#FDE68A] bg-[#FEF3C7] px-4 py-3 mb-5 text-xs text-[#92400E]" data-testid="admin-email-not-configured">
              {t("admin.email.notConfigured")}
            </div>
          )}

          <form onSubmit={save} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <Label className="text-[10px] uppercase tracking-wider text-[#7A7571]">{t("admin.email.host")}</Label>
                <Input
                  value={settings.smtp_host || ""}
                  onChange={(e) => setSettings({ ...settings, smtp_host: e.target.value })}
                  placeholder="smtp.gmail.com"
                  className="rounded-xl border-[#E5E2DC] h-11 mt-1"
                  data-testid="email-host"
                />
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-wider text-[#7A7571]">{t("admin.email.port")}</Label>
                <Input
                  type="number"
                  value={settings.smtp_port || 587}
                  onChange={(e) => setSettings({ ...settings, smtp_port: e.target.value })}
                  className="rounded-xl border-[#E5E2DC] h-11 mt-1"
                  data-testid="email-port"
                />
              </div>
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-wider text-[#7A7571]">{t("admin.email.username")}</Label>
              <Input
                value={settings.smtp_username || ""}
                onChange={(e) => setSettings({ ...settings, smtp_username: e.target.value })}
                placeholder="me@example.com"
                className="rounded-xl border-[#E5E2DC] h-11 mt-1"
                data-testid="email-username"
              />
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-wider text-[#7A7571]">{t("admin.email.password")}</Label>
              <Input
                type="password"
                value={settings.smtp_password || ""}
                onChange={(e) => setSettings({ ...settings, smtp_password: e.target.value })}
                placeholder={t("admin.email.passwordPlaceholder")}
                className="rounded-xl border-[#E5E2DC] h-11 mt-1"
                data-testid="email-password"
              />
              <p className="text-[10px] text-[#7A7571] mt-1">
                {settings.smtp_password_set ? t("admin.email.passwordSet") : t("admin.email.passwordEmpty")}
              </p>
            </div>
            <div className="flex items-center gap-2 py-1">
              <Checkbox
                id="use_tls"
                checked={!!settings.use_tls}
                onCheckedChange={(v) => setSettings({ ...settings, use_tls: !!v })}
                data-testid="email-use-tls"
              />
              <label htmlFor="use_tls" className="text-xs text-[#2D2A26]">
                {t("admin.email.useTls")}
              </label>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-[10px] uppercase tracking-wider text-[#7A7571]">{t("admin.email.senderEmail")}</Label>
                <Input
                  type="email"
                  value={settings.sender_email || ""}
                  onChange={(e) => setSettings({ ...settings, sender_email: e.target.value })}
                  placeholder="noreply@mylife-mytime.com"
                  className="rounded-xl border-[#E5E2DC] h-11 mt-1"
                  data-testid="email-sender-email"
                />
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-wider text-[#7A7571]">{t("admin.email.senderName")}</Label>
                <Input
                  value={settings.sender_name || ""}
                  onChange={(e) => setSettings({ ...settings, sender_name: e.target.value })}
                  className="rounded-xl border-[#E5E2DC] h-11 mt-1"
                  data-testid="email-sender-name"
                />
              </div>
            </div>
            <Button
              type="submit"
              disabled={saving}
              className="w-full sm:w-auto rounded-full bg-[#2D2A26] hover:bg-[#1f1d1a] text-white gap-2"
              data-testid="email-save-btn"
            >
              <Save className="w-4 h-4" strokeWidth={2} />
              {saving ? t("forgot.sending") : t("admin.email.save")}
            </Button>
          </form>

          {/* Test send section */}
          <div className="mt-6 pt-6 border-t border-[#E5E2DC]">
            <Label className="text-[10px] uppercase tracking-wider text-[#7A7571]">{t("admin.email.testTo")}</Label>
            <div className="flex flex-col sm:flex-row gap-2 mt-1">
              <Input
                type="email"
                value={testTo}
                onChange={(e) => setTestTo(e.target.value)}
                placeholder="admin@example.com"
                className="rounded-xl border-[#E5E2DC] h-11 flex-1"
                data-testid="email-test-to"
              />
              <Button
                type="button"
                onClick={sendTest}
                disabled={testing || !testTo.trim() || !settings.smtp_host}
                variant="outline"
                className="rounded-full gap-2"
                data-testid="email-test-btn"
              >
                <Send className="w-4 h-4" strokeWidth={2} />
                {testing ? t("forgot.sending") : t("admin.email.test")}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminEmailSettings;
