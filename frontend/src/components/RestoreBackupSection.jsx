// Restore Backup — destructive recovery tool inside System Backup.
//
// Per spec:
//   - Reuses the existing Backup History as the list of restorable points
//     (we fetch /api/admin/backup/history under the hood).
//   - Each row exposes "Preview" (safe, no DB writes) + "Restore" (full).
//   - Restore opens a hard-confirm dialog: the admin must type RESTORE
//     to enable the button.
//   - The backend automatically takes a pre-restore-backup before any
//     data is touched — that's the rollback path.
//   - A Restore History sub-section lists past restore attempts with
//     actor, status, doc counts, and error messages.

import { useCallback, useEffect, useState } from "react";
import {
  History as HistoryIcon, Eye, RotateCcw, ShieldAlert, Loader2, AlertCircle,
  CheckCircle2, X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api } from "@/lib/api";

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

const STATUS = {
  success: { color: "bg-emerald-50 text-emerald-700 border-emerald-200", Icon: CheckCircle2 },
  failed: { color: "bg-red-50 text-red-700 border-red-200", Icon: AlertCircle },
  running: { color: "bg-amber-50 text-amber-700 border-amber-200", Icon: Loader2 },
};

export default function RestoreBackupSection({ backups, onRefreshHistory }) {
  const [restoreHistory, setRestoreHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [preview, setPreview] = useState(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [confirmRun, setConfirmRun] = useState(null); // backup run pending confirmation
  const [confirmText, setConfirmText] = useState("");
  const [restoreBusy, setRestoreBusy] = useState(false);

  const loadRestoreHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const r = await api.get("/admin/backup/restore-history", { timeout: 15000 });
      setRestoreHistory(Array.isArray(r.data) ? r.data : []);
    } catch (e) {
      // History is optional — silent failure is fine.
      void e;
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => { loadRestoreHistory(); }, [loadRestoreHistory]);

  // Only successful backups are restorable.
  const restorable = (backups || []).filter((b) => b.status === "success" && b.drive_file_name);

  const openPreview = async (run) => {
    setPreview({ run, data: null });
    setPreviewBusy(true);
    try {
      // Allow 5 min — large backups can take a while to download + parse.
      const r = await api.post(`/admin/backup/restore/preview/${run.id}`, {}, { timeout: 300000 });
      setPreview({ run, data: r.data });
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Preview failed.");
      setPreview(null);
    } finally {
      setPreviewBusy(false);
    }
  };

  const openConfirm = (run) => {
    setConfirmRun(run);
    setConfirmText("");
  };

  const runRestore = async () => {
    if (!confirmRun) return;
    setRestoreBusy(true);
    try {
      // 10-minute timeout — the backend may take a while on big restores
      // because it also creates a fresh pre-restore safety backup first.
      const r = await api.post(
        `/admin/backup/restore/${confirmRun.id}`,
        { confirm: "RESTORE" },
        { timeout: 600000 },
      );
      if (r.data.status === "success") {
        toast.success(
          `Restore complete: ${r.data.collections_restored} collections, ${r.data.documents_restored} documents.`,
        );
      } else {
        toast.error(r.data.error || "Restore failed.");
      }
      await Promise.all([loadRestoreHistory(), onRefreshHistory?.()]);
      setConfirmRun(null);
      setConfirmText("");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Restore failed.");
    } finally {
      setRestoreBusy(false);
    }
  };

  return (
    <section className="mt-5 pt-4 border-t border-[#E5E2DC]" data-testid="backup-restore-section">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[#7A7571]">
          Restore Backup
        </h3>
        <span className="inline-flex items-center gap-1 text-[10px] text-red-700">
          <ShieldAlert className="w-3 h-3" />
          destructive
        </span>
      </div>
      {restorable.length === 0 ? (
        <p className="text-xs text-[#7A7571] text-center py-3">
          No successful backups available to restore.
        </p>
      ) : (
        <div className="overflow-x-auto -mx-3 sm:mx-0">
          <table className="w-full text-xs" data-testid="restore-list-table">
            <thead className="text-[10px] uppercase text-[#7A7571]">
              <tr>
                <th className="text-start font-medium py-1.5 px-2">Date</th>
                <th className="text-start font-medium py-1.5 px-2">Type</th>
                <th className="text-start font-medium py-1.5 px-2">Size</th>
                <th className="text-start font-medium py-1.5 px-2">Status</th>
                <th className="text-end font-medium py-1.5 px-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {restorable.map((b) => {
                const s = STATUS[b.status] || STATUS.success;
                const Icon = s.Icon;
                return (
                  <tr key={b.id} className="border-t border-[#E5E2DC]" data-testid={`restore-row-${b.id}`}>
                    <td className="py-1.5 px-2 text-[#2D2A26]">{fmtDate(b.finished_at || b.started_at)}</td>
                    <td className="py-1.5 px-2 text-[#7A7571]">{b.trigger}</td>
                    <td className="py-1.5 px-2 text-[#2D2A26] tabular-nums">{fmtBytes(b.size_bytes)}</td>
                    <td className="py-1.5 px-2">
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] ${s.color}`}>
                        <Icon className="w-3 h-3" />
                        {b.status}
                      </span>
                    </td>
                    <td className="py-1.5 px-2">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => openPreview(b)}
                          className="rounded-full h-7 px-2 text-[11px]"
                          data-testid={`restore-preview-btn-${b.id}`}
                        >
                          <Eye className="w-3 h-3 me-1" />
                          Preview
                        </Button>
                        <Button
                          type="button"
                          onClick={() => openConfirm(b)}
                          className="rounded-full bg-red-600 hover:bg-red-700 text-white h-7 px-2 text-[11px]"
                          data-testid={`restore-btn-${b.id}`}
                        >
                          <RotateCcw className="w-3 h-3 me-1" />
                          Restore
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Preview dialog */}
      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-lg rounded-3xl border border-[#E5E2DC] bg-white" data-testid="restore-preview-dialog">
          <DialogHeader>
            <DialogTitle className="font-heading text-lg text-[#2D2A26] inline-flex items-center gap-2">
              <Eye className="w-4 h-4" />
              Safe Restore Preview
            </DialogTitle>
            <DialogDescription className="text-xs text-[#7A7571]">
              The live database is NOT modified. This only inspects the
              archive's contents.
            </DialogDescription>
          </DialogHeader>
          {previewBusy || !preview?.data ? (
            <div className="py-6 flex justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-[#7A7571]" />
            </div>
          ) : (
            <div className="space-y-3 text-xs">
              <Row label="Source database" value={preview.data.manifest?.database || "—"} />
              <Row label="Archive size" value={fmtBytes(preview.data.archive_size_bytes)} />
              <Row label="Created at" value={fmtDate(preview.data.manifest?.created_at)} />
              <Row label="Manifest version" value={preview.data.manifest?.version} />
              <Row label="Total documents" value={preview.data.total_documents} />
              <div>
                <div className="text-[10px] uppercase tracking-wider text-[#7A7571] mb-1">
                  Would overwrite ({preview.data.would_overwrite.length})
                </div>
                <div className="rounded-2xl bg-[#FAF9F6] border border-[#E5E2DC] p-2 max-h-44 overflow-y-auto">
                  {preview.data.would_overwrite.map((c) => (
                    <div key={c} className="flex items-center justify-between py-0.5">
                      <span className="text-[#2D2A26]">{c}</span>
                      <span className="text-[#7A7571] tabular-nums">{preview.data.collection_counts[c]}</span>
                    </div>
                  ))}
                </div>
              </div>
              {preview.data.would_skip.length > 0 && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-[#7A7571] mb-1">
                    Would skip ({preview.data.would_skip.length}) — system collections
                  </div>
                  <div className="text-[10px] text-[#7A7571]">
                    {preview.data.would_skip.join(", ")}
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPreview(null)} data-testid="restore-preview-close">
              <X className="w-3.5 h-3.5 me-1" /> Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm dialog */}
      <Dialog open={!!confirmRun} onOpenChange={(o) => !o && !restoreBusy && setConfirmRun(null)}>
        <DialogContent className="max-w-md rounded-3xl border-2 border-red-200 bg-white" data-testid="restore-confirm-dialog">
          <DialogHeader>
            <DialogTitle className="font-heading text-lg text-red-700 inline-flex items-center gap-2">
              <ShieldAlert className="w-5 h-5" />
              Confirm Full Restore
            </DialogTitle>
            <DialogDescription className="text-xs text-[#2D2A26] leading-relaxed">
              <span className="block font-semibold text-red-700 mb-1">
                Restoring a backup will replace the current database data.
              </span>
              This action may overwrite recent changes. A
              <code className="px-1 mx-0.5 rounded bg-[#FAF9F6] border border-[#E5E2DC]">pre-restore-backup</code>
              will be created first so you can roll back if needed.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-xs">
            <div className="rounded-2xl bg-[#FAF9F6] border border-[#E5E2DC] p-2.5">
              <div className="text-[10px] uppercase tracking-wider text-[#7A7571] mb-1">Restoring from</div>
              <div className="font-mono text-[11px] text-[#2D2A26] break-all">
                {confirmRun?.drive_file_name}
              </div>
              <div className="text-[#7A7571] mt-1">
                {fmtDate(confirmRun?.finished_at || confirmRun?.started_at)} · {fmtBytes(confirmRun?.size_bytes)}
              </div>
            </div>
            <div>
              <label className="block text-[#2D2A26] mb-1">
                Type <code className="font-mono px-1 rounded bg-[#FAF9F6] border border-[#E5E2DC]">RESTORE</code> to confirm:
              </label>
              <Input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="RESTORE"
                disabled={restoreBusy}
                autoFocus
                data-testid="restore-confirm-input"
                autoComplete="off"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="ghost"
              disabled={restoreBusy}
              onClick={() => { setConfirmRun(null); setConfirmText(""); }}
              data-testid="restore-confirm-cancel"
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={confirmText !== "RESTORE" || restoreBusy}
              onClick={runRestore}
              className="rounded-full bg-red-600 hover:bg-red-700 text-white disabled:bg-red-200"
              data-testid="restore-confirm-go"
            >
              {restoreBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin me-1" /> : <RotateCcw className="w-3.5 h-3.5 me-1" />}
              {restoreBusy ? "Restoring…" : "Run Full Restore"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Restore History */}
      <div className="mt-4 pt-3 border-t border-[#E5E2DC]" data-testid="restore-history-section">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-[#7A7571] inline-flex items-center gap-1">
            <HistoryIcon className="w-3 h-3" />
            Restore History ({restoreHistory.length})
          </h4>
          {loadingHistory && <Loader2 className="w-3 h-3 animate-spin text-[#7A7571]" />}
        </div>
        {restoreHistory.length === 0 ? (
          <p className="text-[11px] text-[#7A7571] text-center py-2">No restore operations yet.</p>
        ) : (
          <div className="overflow-x-auto -mx-3 sm:mx-0">
            <table className="w-full text-[11px]">
              <thead className="text-[10px] uppercase text-[#7A7571]">
                <tr>
                  <th className="text-start font-medium py-1 px-2">When</th>
                  <th className="text-start font-medium py-1 px-2">Actor</th>
                  <th className="text-start font-medium py-1 px-2">Source</th>
                  <th className="text-start font-medium py-1 px-2">Result</th>
                </tr>
              </thead>
              <tbody>
                {restoreHistory.map((r) => {
                  const s = STATUS[r.status] || STATUS.failed;
                  const Icon = s.Icon;
                  return (
                    <tr key={r.id} className="border-t border-[#E5E2DC]" data-testid={`restore-history-row-${r.id}`}>
                      <td className="py-1 px-2 text-[#2D2A26]">{fmtDate(r.finished_at || r.started_at)}</td>
                      <td className="py-1 px-2 text-[#7A7571] truncate max-w-[140px]" title={r.actor_email}>{r.actor_email || "—"}</td>
                      <td className="py-1 px-2 text-[#2D2A26] truncate max-w-[180px]" title={r.source_drive_file_name}>{r.source_drive_file_name || r.source_run_id?.slice(0, 8)}</td>
                      <td className="py-1 px-2">
                        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] ${s.color}`}>
                          <Icon className="w-3 h-3" />
                          {r.status === "success"
                            ? `${r.collections_restored} colls · ${r.documents_restored} docs`
                            : r.status}
                        </span>
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
      </div>
    </section>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[10px] uppercase tracking-wider text-[#7A7571]">{label}</span>
      <span className="text-[#2D2A26] tabular-nums text-end">{String(value ?? "—")}</span>
    </div>
  );
}
