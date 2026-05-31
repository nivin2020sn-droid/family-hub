// Admin · Legal & Content Management
//
// Single-form editor for the global site_content document. Lets the admin
// edit short brand metadata and the four long legal texts. Saves are
// partial — only fields that changed are sent — so individual sections
// can be tweaked without round-tripping the whole document.
//
// Auth: this page is mounted under /admin/content. The route guard in
// useEffect redirects any non-admin back to /login.

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Save,
  Building2,
  Mail,
  Phone,
  MapPin,
  Shield,
  FileText,
  Scale,
  AlertTriangle,
  RotateCcw,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { isAdmin, getAccountToken } from "@/lib/auth";
import { getSiteContent, updateSiteContent } from "@/lib/siteContent";

// Shape of the form. Mirrors backend SiteContent (sans server-only fields).
const EMPTY = {
  app_name: "",
  app_version: "",
  company_name: "",
  contact_email: "",
  address: "",
  phone_number: "",
  privacy_policy: "",
  terms_of_service: "",
  legal_notice: "",
  disclaimer: "",
};

// Compute the patch we'll send to the server: only fields that diverged
// from the last loaded snapshot. Keeps the request small and lets the
// admin save one section without scrubbing the others.
function buildPatch(current, original) {
  const patch = {};
  for (const k of Object.keys(EMPTY)) {
    if ((current[k] ?? "") !== (original[k] ?? "")) {
      patch[k] = current[k] ?? "";
    }
  }
  return patch;
}

const AdminContent = () => {
  const navigate = useNavigate();
  const [original, setOriginal] = useState(EMPTY);
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Guard: admin-only. Anyone else gets redirected.
  useEffect(() => {
    if (!getAccountToken() || !isAdmin()) {
      toast.error("Admin access required");
      navigate("/login", { replace: true });
    }
  }, [navigate]);

  // Initial load.
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const data = await getSiteContent();
      if (!alive) return;
      const merged = { ...EMPTY, ...(data || {}) };
      setOriginal(merged);
      setForm(merged);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const patch = useMemo(() => buildPatch(form, original), [form, original]);
  const dirty = Object.keys(patch).length > 0;

  const onChange = (key) => (e) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const onReset = () => setForm(original);

  const onSave = async () => {
    if (!dirty || saving) return;
    setSaving(true);
    try {
      const updated = await updateSiteContent(patch);
      const merged = { ...EMPTY, ...updated };
      setOriginal(merged);
      setForm(merged);
      toast.success("Content saved");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div
        className="min-h-screen bg-[#F3F0EA] flex items-center justify-center"
        data-testid="admin-content-loading"
      >
        <Loader2 className="w-6 h-6 animate-spin text-[#7A7571]" />
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-[#F3F0EA] text-[#2D2A26]"
      data-testid="admin-content-page"
    >
      {/* Sticky top bar */}
      <div className="sticky top-0 z-20 bg-[#F3F0EA]/85 backdrop-blur border-b border-[#E5E2DC]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <button
            onClick={() => navigate("/admin")}
            className="inline-flex items-center gap-1.5 text-sm font-medium hover:text-[#E11D48] transition-colors"
            data-testid="back-to-admin"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={2} />
            <span>Back to Admin</span>
          </button>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={onReset}
              disabled={!dirty || saving}
              className="h-9 rounded-full border-[#E5E2DC] gap-2"
              data-testid="content-reset"
            >
              <RotateCcw className="w-3.5 h-3.5" strokeWidth={2} />
              <span className="hidden sm:inline">Reset</span>
            </Button>
            <Button
              onClick={onSave}
              disabled={!dirty || saving}
              className="h-9 rounded-full bg-[#2D2A26] hover:bg-[#1f1d1a] text-white gap-2"
              data-testid="content-save"
            >
              {saving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" strokeWidth={2} />
              )}
              Save
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-8">
        <header>
          <h1 className="font-heading text-3xl sm:text-4xl font-semibold tracking-tight">
            Legal &amp; Content Management
          </h1>
          <p className="mt-2 text-sm text-[#5A5550]">
            Edit the brand metadata and the four legal documents. Changes go
            live immediately on the public site — no redeploy required.
          </p>
          {dirty && (
            <p
              className="mt-3 inline-flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full"
              data-testid="dirty-indicator"
            >
              <AlertTriangle className="w-3 h-3" strokeWidth={2} />
              You have unsaved changes ({Object.keys(patch).length})
            </p>
          )}
        </header>

        {/* Brand block */}
        <Card icon={Building2} title="Brand & Contact">
          <Grid>
            <Field
              label="Application Name"
              testid="field-app-name"
              value={form.app_name}
              onChange={onChange("app_name")}
              placeholder="My Life My Time"
            />
            <Field
              label="Application Version"
              testid="field-app-version"
              value={form.app_version}
              onChange={onChange("app_version")}
              placeholder="0.9.0-beta"
            />
            <Field
              label="Company Name"
              testid="field-company-name"
              value={form.company_name}
              onChange={onChange("company_name")}
              placeholder="My Life My Time"
            />
            <Field
              icon={Mail}
              label="Contact Email"
              testid="field-contact-email"
              type="email"
              value={form.contact_email}
              onChange={onChange("contact_email")}
              placeholder="info@mylife-mytime.com"
            />
            <Field
              icon={Phone}
              label="Phone Number"
              testid="field-phone"
              value={form.phone_number}
              onChange={onChange("phone_number")}
              placeholder="+49 …"
            />
            <AreaField
              icon={MapPin}
              label="Address"
              testid="field-address"
              value={form.address}
              onChange={onChange("address")}
              rows={3}
              placeholder={"Kaiserstraße 101\n76133 Karlsruhe\nGermany"}
            />
          </Grid>
        </Card>

        {/* Long-text blocks */}
        <Card icon={Shield} title="Privacy Policy">
          <AreaField
            label="Privacy Policy"
            srOnly
            testid="field-privacy"
            value={form.privacy_policy}
            onChange={onChange("privacy_policy")}
            rows={14}
          />
        </Card>

        <Card icon={FileText} title="Terms of Service">
          <AreaField
            label="Terms of Service"
            srOnly
            testid="field-terms"
            value={form.terms_of_service}
            onChange={onChange("terms_of_service")}
            rows={14}
          />
        </Card>

        <Card icon={Scale} title="Legal Notice">
          <AreaField
            label="Legal Notice"
            srOnly
            testid="field-legal-notice"
            value={form.legal_notice}
            onChange={onChange("legal_notice")}
            rows={14}
          />
        </Card>

        <Card icon={AlertTriangle} title="Disclaimer">
          <AreaField
            label="Disclaimer"
            srOnly
            testid="field-disclaimer"
            value={form.disclaimer}
            onChange={onChange("disclaimer")}
            rows={8}
          />
        </Card>

        <div className="flex justify-end pb-12">
          <Button
            onClick={onSave}
            disabled={!dirty || saving}
            className="h-11 px-6 rounded-full bg-[#2D2A26] hover:bg-[#1f1d1a] text-white gap-2"
            data-testid="content-save-bottom"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" strokeWidth={2} />
            )}
            Save Changes
          </Button>
        </div>
      </div>
    </div>
  );
};

// ---------- Small layout helpers ----------
const Card = ({ icon: Icon, title, children }) => (
  <section className="bg-white rounded-3xl border border-[#E5E2DC] p-5 sm:p-7 shadow-[0_18px_50px_-32px_rgba(0,0,0,0.18)]">
    <header className="flex items-center gap-2.5 mb-4">
      {Icon && (
        <div className="w-9 h-9 rounded-xl bg-[#FCE7E9] flex items-center justify-center">
          <Icon className="w-4 h-4 text-[#E11D48]" strokeWidth={2} />
        </div>
      )}
      <h2 className="font-heading text-lg sm:text-xl font-semibold">{title}</h2>
    </header>
    {children}
  </section>
);

const Grid = ({ children }) => (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{children}</div>
);

const Field = ({ icon: Icon, label, testid, srOnly, ...rest }) => (
  <div>
    <Label
      className={`text-xs uppercase tracking-wider text-[#7A7571] ${srOnly ? "sr-only" : ""}`}
    >
      <span className="inline-flex items-center gap-1">
        {Icon && <Icon className="w-3 h-3" strokeWidth={2} />}
        {label}
      </span>
    </Label>
    <Input
      data-testid={testid}
      className="rounded-xl border-[#E5E2DC] h-11 mt-1.5"
      {...rest}
    />
  </div>
);

const AreaField = ({ icon: Icon, label, testid, srOnly, ...rest }) => (
  <div className="md:col-span-2">
    <Label
      className={`text-xs uppercase tracking-wider text-[#7A7571] ${srOnly ? "sr-only" : ""}`}
    >
      <span className="inline-flex items-center gap-1">
        {Icon && <Icon className="w-3 h-3" strokeWidth={2} />}
        {label}
      </span>
    </Label>
    <Textarea
      data-testid={testid}
      className="rounded-xl border-[#E5E2DC] mt-1.5 leading-relaxed font-mono text-[13px]"
      {...rest}
    />
  </div>
);

export default AdminContent;
