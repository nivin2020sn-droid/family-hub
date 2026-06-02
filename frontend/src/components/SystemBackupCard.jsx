// Admin → System Backup card.
//
// Three sub-sections in one card (no router-level routing — the admin page
// itself is small enough that nested routes would just slow things down):
//
//   1. Backup Settings — Google Client ID/Secret/Folder ID, time, auto on/off,
//      Connect/Disconnect Drive, Test Connection.
//   2. Backup Now — one-tap full database dump → upload.
//   3. Backup History — table of recent runs with size + status + Drive link.

import { useEffect, useState, useCallback } from "react";
import {
  Database, RefreshCw, Loader2, Cloud, CloudOff, Send, CheckCircle2, AlertCircle, ExternalLink, Clock,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/api";

// ---------- helpers ----------
const fmtBytes = (n) => {
  if (!n) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i += 1; }
  return `${v.toFixed(v < 10 ? 2 : 1)} ${units[i]}`;
};
const fmtDate = (iso) => {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
};

const STATUS_COLORS = {
  success: "bg-emerald-50 text-emerald-700 border-emerald-200",
  failed: "bg-red-50 text-red-700 border-red-200",
  running: "bg-amber-50 text-amber-700 border-amber-200",
};

export default function SystemBackupCard() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [testing, setTesting] = useState(false);
  const [running, setRunning] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Local form state — initialised from `settings` on first load. We never
  // pre-fill the client_secret field (the backend never returns it).
  const [form, setForm] = useState({
    client_id: "",
    client_secret: "",
    folder_id: "",
    backup_time: "03:00",
    auto_enabled: false,
  });

  const loadSettings = useCallback(async () => {
    try {
      const r = await api.get("/admin/backup/settings");
      setSettings(r.data);
      setForm((prev) => ({
        ...prev,
        client_id: r.data.client_id || "",
        // Leave client_secret blank on load — admin types only when changing.
        client_secret: "",
        folder_id: r.data.folder_id || "",
        backup_time: r.data.backup_time || "03:00",
        auto_enabled: !!r.data.auto_enabled,
      }));
    } catch (e) {
      toast.error("Failed to load backup settings");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const r = await api.get("/admin/backup/history");
      setHistory(Array.isArray(r.data) ? r.data : []);
    } catch {
      /* empty list is fine */
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
    loadHistory();
    // If we just came back from Google's OAuth callback, refresh once.
    const params = new URLSearchParams(window.location.search);
    if (params.get("drive_connected") === "1") {
      toast.success("Google Drive connected.");
      // Clean the URL so a manual refresh doesn't re-fire the toast.
      const url = window.location.pathname;
      window.history.replaceState({}, "", url);
    }
  }, [loadSettings, loadHistory]);

  const saveSettings = async () => {
    setSavingSettings(true);
    try {
      const body = {
        client_id: form.client_id.trim(),
        folder_id: form.folder_id.trim(),
        backup_time: form.backup_time,
        auto_enabled: form.auto_enabled,
      };
      // Only send the secret when the admin actually typed a new value —
      // otherwise the backend keeps whatever it already has.
      if (form.client_secret.trim()) body.client_secret = form.client_secret.trim();
      const r = await api.put("/admin/backup/settings", body);
      setSettings(r.data);
      setForm((prev) => ({ ...prev, client_secret: "" }));
      toast.success("Backup settings saved.");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to save settings.");
    } finally {
      setSavingSettings(false);
    }
  };

  const testConnection = async () => {
    setTesting(true);
    try {
      const r = await api.post("/admin/backup/test-connection");
      const email = r.data.account_email || "Drive";
      if (r.data.folder_ok === false) {
        toast.warning(`Connected to ${email}, but folder check failed: ${r.data.folder_message}`);
      } else {
        toast.success(`Connection OK — ${email}`);
      }
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Connection test failed.");
    } finally {
      setTesting(false);
    }
  };

  const connectDrive = async () => {
    try {
      const r = await api.get("/admin/backup/oauth/start");
      // Full-page navigation to the Google consent screen.
      window.location.assign(r.data.authorization_url);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not start OAuth.");
    }
  };

  const disconnectDrive = async () => {
    if (!window.confirm("Disconnect Google Drive? Auto-backup will stop until you reconnect.")) return;
    setDisconnecting(true);
    try {
      await api.post("/admin/backup/oauth/disconnect");
      toast.success("Google Drive disconnected.");
      await loadSettings();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Disconnect failed.");
    } finally {
      setDisconnecting(false);
    }
  };

  const runBackup = async () => {
    setRunning(true);
    try {
      const r = await api.post("/admin/backup/run");
      if (r.data.status === "success") {
        toast.success(`Backup uploaded — ${fmtBytes(r.data.size_bytes)}`);
      } else {
        toast.error(r.data.error || "Backup failed.");
      }
      await Promise.all([loadHistory(), loadSettings()]);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Backup failed.");
    } finally {
      setRunning(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-3xl bg-white border border-[#E5E2DC] p-4 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-[#7A7571]" />
      </div>
    );
  }

  const connected = settings?.drive_connected;

  return (
    <div className="rounded-3xl bg-white border border-[#E5E2DC] p-3 sm:p-4" data-testid="admin-system-backup-card">
      <header className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-[#0F172A] flex items-center justify-center">
            <Database className="w-4 h-4 text-white" />
          </div>
          <h2 className="font-heading text-base font-semibold text-[#2D2A26]">System Backup</h2>
        </div>
        <button
          type="button"
          onClick={() => { loadSettings(); loadHistory(); }}
          className="w-8 h-8 rounded-full hover:bg-[#F5F2EC] flex items-center justify-center"
          aria-label="Refresh"
          data-testid="backup-refresh-btn"
        >
          <RefreshCw className="w-4 h-4 text-[#7A7571]" />
        </button>
      </header>

      {/* ---------- Settings ---------- */}
      <section className="space-y-3" data-testid="backup-settings-section">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[#7A7571]">Backup Settings</h3>
        <div className="grid grid-cols-1 gap-3">
          <Field label="Google Client ID" testid="backup-field-client-id">
            <Input
              value={form.client_id}
              onChange={(e) => setForm({ ...form, client_id: e.target.value })}
              placeholder="xxxxx.apps.googleusercontent.com"
              data-testid="backup-input-client-id"
              autoComplete="off"
            />
          </Field>
          <Field
            label="Google Client Secret"
            hint={settings?.has_client_secret ? `Saved — ${settings.client_secret_preview}. Type a new value to replace.` : "Required on first setup."}
            testid="backup-field-client-secret"
          >
            <Input
              type="password"
              value={form.client_secret}
              onChange={(e) => setForm({ ...form, client_secret: e.target.value })}
              placeholder={settings?.has_client_secret ? "•••• (keep current)" : "GOCSPX-…"}
              data-testid="backup-input-client-secret"
              autoComplete="off"
            />
          </Field>
          <Field
            label="Google Drive Folder ID"
            hint={`Optional — leave empty to auto-create a folder named "${settings?.folder_name || "My Life My Time Backups"}".`}
            testid="backup-field-folder-id"
          >
            <Input
              value={form.folder_id}
              onChange={(e) => setForm({ ...form, folder_id: e.target.value })}
              placeholder="(auto)"
              data-testid="backup-input-folder-id"
              autoComplete="off"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Backup Time (UTC)" testid="backup-field-time">
              <Input
                type="time"
                value={form.backup_time}
                onChange={(e) => setForm({ ...form, backup_time: e.target.value })}
                data-testid="backup-input-time"
              />
            </Field>
            <Field label="Auto Backup Enabled" testid="backup-field-auto">
              <div className="h-10 flex items-center gap-3">
                <Switch
                  checked={form.auto_enabled}
                  onCheckedChange={(v) => setForm({ ...form, auto_enabled: !!v })}
                  data-testid="backup-input-auto"
                />
                <span className="text-xs text-[#7A7571]">
                  {form.auto_enabled ? "Daily" : "Off"}
                </span>
              </div>
            </Field>
          </div>
        </div>

        {/* Connect / Disconnect / Test buttons */}
        <div className="flex flex-wrap gap-2 pt-1">
          <Button
            type="button"
            onClick={saveSettings}
            disabled={savingSettings}
            className="rounded-full bg-[#0F172A] hover:bg-[#1e293b] text-white"
            data-testid="backup-save-settings-btn"
          >
            {savingSettings && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
            Save Settings
          </Button>
          {connected ? (
            <Button
              type="button"
              variant="outline"
              onClick={disconnectDrive}
              disabled={disconnecting}
              className="rounded-full border-red-200 text-red-700 hover:bg-red-50"
              data-testid="backup-disconnect-drive-btn"
            >
              {disconnecting ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <CloudOff className="w-3.5 h-3.5 mr-1.5" />}
              Disconnect Google Drive
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              onClick={connectDrive}
              disabled={!settings?.client_id || !settings?.has_client_secret}
              className="rounded-full border-[#0F172A] text-[#0F172A] hover:bg-[#F5F2EC]"
              data-testid="backup-connect-drive-btn"
              title={!settings?.client_id || !settings?.has_client_secret ? "Save Client ID + Client Secret first" : ""}
            >
              <Cloud className="w-3.5 h-3.5 mr-1.5" />
              Connect Google Drive
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={testConnection}
            disabled={testing || !connected}
            className="rounded-full"
            data-testid="backup-test-connection-btn"
          >
            {testing && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
            Test Google Drive Connection
          </Button>
        </div>

        {/* Live status row */}
        <StatusRow settings={settings} />
      </section>

      {/* ---------- Backup Now ---------- */}
      <section className="mt-5 pt-4 border-t border-[#E5E2DC]" data-testid="backup-now-section">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[#7A7571] mb-2">Backup Now</h3>
        <div className="flex items-center gap-3">
          <Button
            type="button"
            onClick={runBackup}
            disabled={running || !connected}
            className="rounded-full bg-emerald-600 hover:bg-emerald-700 text-white"
            data-testid="backup-run-now-btn"
          >
            {running ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Send className="w-3.5 h-3.5 mr-1.5" />}
            {running ? "Backing up…" : "Backup Now"}
          </Button>
          <span className="text-xs text-[#7A7571]">
            {connected
              ? `Dumps every collection in the live database and uploads as one .tar.gz.`
              : "Connect Google Drive first."}
          </span>
        </div>
      </section>

      {/* ---------- History ---------- */}
      <section className="mt-5 pt-4 border-t border-[#E5E2DC]" data-testid="backup-history-section">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[#7A7571]">
            Backup History ({history.length})
          </h3>
          {historyLoading && <Loader2 className="w-3.5 h-3.5 animate-spin text-[#7A7571]" />}
        </div>
        {history.length === 0 ? (
          <p className="text-xs text-[#7A7571] text-center py-4">No backups yet.</p>
        ) : (
          <div className="overflow-x-auto -mx-3 sm:mx-0">
            <table className="w-full text-xs" data-testid="backup-history-table">
              <thead className="text-[10px] uppercase text-[#7A7571]">
                <tr className="text-start">
                  <th className="text-start font-medium py-1.5 px-2">Date</th>
                  <th className="text-start font-medium py-1.5 px-2">Trigger</th>
                  <th className="text-start font-medium py-1.5 px-2">Size</th>
                  <th className="text-start font-medium py-1.5 px-2">Status</th>
                  <th className="text-start font-medium py-1.5 px-2">Link</th>
                </tr>
              </thead>
              <tbody>
                {history.map((r) => {
                  const cls = STATUS_COLORS[r.status] || "bg-[#F5F2EC] text-[#7A7571] border-[#E5E2DC]";
                  return (
                    <tr key={r.id} className="border-t border-[#E5E2DC]" data-testid={`backup-history-row-${r.id}`}>
                      <td className="py-1.5 px-2 text-[#2D2A26]">{fmtDate(r.finished_at || r.started_at)}</td>
                      <td className="py-1.5 px-2 text-[#7A7571]">{r.trigger}</td>
                      <td className="py-1.5 px-2 text-[#2D2A26] tabular-nums">{fmtBytes(r.size_bytes)}</td>
                      <td className="py-1.5 px-2">
                        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] ${cls}`}>
                          {r.status === "success" && <CheckCircle2 className="w-3 h-3" />}
                          {r.status === "failed" && <AlertCircle className="w-3 h-3" />}
                          {r.status === "running" && <Loader2 className="w-3 h-3 animate-spin" />}
                          {r.status}
                        </span>
                      </td>
                      <td className="py-1.5 px-2">
                        {r.drive_web_view_link ? (
                          <a
                            href={r.drive_web_view_link}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-[#0F172A] hover:underline"
                            data-testid={`backup-history-link-${r.id}`}
                          >
                            Open <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : (
                          <span className="text-[#7A7571]">—</span>
                        )}
                        {r.status === "failed" && r.error && (
                          <div className="text-[10px] text-red-700 mt-0.5 max-w-xs truncate" title={r.error}>
                            {r.error}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Field({ label, hint, children, testid }) {
  return (
    <div data-testid={testid}>
      <Label className="text-[10px] uppercase tracking-wider text-[#7A7571] mb-1 block">{label}</Label>
      {children}
      {hint && <p className="text-[10px] text-[#7A7571] mt-1">{hint}</p>}
    </div>
  );
}

function StatusRow({ settings }) {
  if (!settings) return null;
  const connected = settings.drive_connected;
  return (
    <div className="rounded-2xl bg-[#FAF9F6] border border-[#E5E2DC] p-2.5 text-[11px] space-y-1" data-testid="backup-status-row">
      <Row
        icon={connected ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : <CloudOff className="w-3.5 h-3.5 text-[#7A7571]" />}
        label="Google Drive"
        value={connected ? (settings.drive_account_email || "Connected") : "Not connected"}
      />
      <Row
        icon={<Clock className="w-3.5 h-3.5 text-[#7A7571]" />}
        label="Next scheduled"
        value={settings.next_scheduled_at ? fmtDate(settings.next_scheduled_at) : "Off"}
      />
      <Row
        icon={settings.last_backup_status === "success"
          ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          : settings.last_backup_status === "failed"
            ? <AlertCircle className="w-3.5 h-3.5 text-red-600" />
            : <Database className="w-3.5 h-3.5 text-[#7A7571]" />}
        label="Last backup"
        value={settings.last_backup_at
          ? `${fmtDate(settings.last_backup_at)} (${settings.last_backup_status || "—"})`
          : "Never"}
      />
      <Row
        icon={<Database className="w-3.5 h-3.5 text-[#7A7571]" />}
        label="Retention"
        value={`Keep latest ${settings.retention_count} backups`}
      />
    </div>
  );
}

function Row({ icon, label, value }) {
  return (
    <div className="flex items-center gap-2">
      {icon}
      <span className="text-[#7A7571] w-28">{label}</span>
      <span className="text-[#2D2A26] truncate">{value}</span>
    </div>
  );
}
