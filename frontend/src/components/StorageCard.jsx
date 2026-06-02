// Admin → Storage card.
//
// Read-only dashboard showing where the app's user-uploaded files live in
// Google Drive: total counts, per-category breakdown, top families by
// usage, recent uploads. There's also a one-tap "Initialise Folders"
// button so the admin can pre-create the directory tree in Drive before
// any user actually uploads anything.
//
// Drive auth is shared with System Backup — this card never reconfigures
// the connection.

import { useCallback, useEffect, useState } from "react";
import {
  HardDrive, RefreshCw, FolderPlus, Loader2, ExternalLink, Cloud, CloudOff,
  Image as ImageIcon, FileText, MessageSquare, FileDown, Upload,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

const fmtBytes = (n) => {
  if (!n) return "0 B";
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

const CATEGORY_META = {
  photos: { label: "Photos", icon: ImageIcon, accent: "text-rose-600 bg-rose-50" },
  documents: { label: "Documents", icon: FileText, accent: "text-amber-700 bg-amber-50" },
  chat_attachments: { label: "Chat Attachments", icon: MessageSquare, accent: "text-sky-700 bg-sky-50" },
  exports: { label: "Exports", icon: FileDown, accent: "text-emerald-700 bg-emerald-50" },
};

export default function StorageCard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [initBusy, setInitBusy] = useState(false);
  const [testBusy, setTestBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get("/admin/storage/stats", { timeout: 30000 });
      setStats(r.data);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to load storage stats.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const initFolders = async () => {
    setInitBusy(true);
    try {
      // Folder creation does up to 5 sequential Drive calls — bump the
      // axios timeout so a slow Drive doesn't surface as a "hang".
      await api.post("/admin/storage/init-folders", {}, { timeout: 60000 });
      toast.success("Folders ready in Google Drive.");
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to initialise folders.");
    } finally {
      setInitBusy(false);
    }
  };

  const runTestUpload = async () => {
    setTestBusy(true);
    try {
      // Admin-only endpoint uploads a tiny 1×1 PNG to a dedicated
      // `Family_ADMINTEST` folder. Verifies the whole pipeline (OAuth →
      // folder caching → Drive upload → metadata row) without needing a
      // real member session.
      await api.post("/admin/storage/test-upload", {}, { timeout: 60000 });
      toast.success("Test upload succeeded — check Recent Uploads.");
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Test upload failed.");
    } finally {
      setTestBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-3xl bg-white border border-[#E5E2DC] p-4 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-[#7A7571]" />
      </div>
    );
  }
  if (!stats) return null;

  const driveOk = stats.drive_connected;
  const byCat = stats.by_category || {};
  const rootSet = !!stats.root_folder_id;

  return (
    <div className="rounded-3xl bg-white border border-[#E5E2DC] p-3 sm:p-4" data-testid="admin-storage-card">
      <header className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-[#1e3a8a] flex items-center justify-center">
            <HardDrive className="w-4 h-4 text-white" />
          </div>
          <h2 className="font-heading text-base font-semibold text-[#2D2A26]">Storage</h2>
        </div>
        <button
          type="button"
          onClick={load}
          className="w-8 h-8 rounded-full hover:bg-[#F5F2EC] flex items-center justify-center"
          aria-label="Refresh"
          data-testid="storage-refresh-btn"
        >
          <RefreshCw className="w-4 h-4 text-[#7A7571]" />
        </button>
      </header>

      {/* Drive connection row */}
      <div className="rounded-2xl bg-[#FAF9F6] border border-[#E5E2DC] p-2.5 text-[11px] flex items-center gap-2 mb-3" data-testid="storage-drive-status">
        {driveOk ? <Cloud className="w-3.5 h-3.5 text-emerald-600" /> : <CloudOff className="w-3.5 h-3.5 text-[#7A7571]" />}
        <span className="text-[#7A7571] w-24">Google Drive</span>
        <span className="text-[#2D2A26] truncate">
          {driveOk ? (stats.drive_account_email || "Connected") : "Not connected — set up in System Backup card."}
        </span>
      </div>

      {/* Headline numbers */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        <Tile label="Total files" value={stats.total_files} testid="storage-total-files" />
        <Tile label="Used space" value={fmtBytes(stats.total_size_bytes)} testid="storage-total-size" />
      </div>

      {/* Per-category */}
      <section data-testid="storage-by-category">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[#7A7571] mb-2">By Category</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {stats.categories.map((cat) => {
            const meta = CATEGORY_META[cat] || { label: cat, icon: HardDrive, accent: "text-[#7A7571] bg-[#FAF9F6]" };
            const Icon = meta.icon;
            const row = byCat[cat] || { count: 0, size_bytes: 0 };
            return (
              <div key={cat} className="rounded-2xl border border-[#E5E2DC] p-2.5 flex items-center gap-3" data-testid={`storage-cat-${cat}`}>
                <span className={`w-9 h-9 rounded-full flex items-center justify-center ${meta.accent}`}>
                  <Icon className="w-4 h-4" />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-[#2D2A26]">{meta.label}</div>
                  <div className="text-[11px] text-[#7A7571] tabular-nums">
                    {row.count} files · {fmtBytes(row.size_bytes)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Folder setup */}
      <section className="mt-4 pt-3 border-t border-[#E5E2DC]" data-testid="storage-folders-section">
        <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[#7A7571]">Drive Folder Layout</h3>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              onClick={runTestUpload}
              disabled={!driveOk || testBusy}
              variant="outline"
              className="rounded-full h-8 px-3 text-xs"
              data-testid="storage-test-upload-btn"
              title="Uploads a tiny 1×1 PNG to verify the pipeline end-to-end."
            >
              {testBusy
                ? <Loader2 className="w-3 h-3 animate-spin mr-1" />
                : <Upload className="w-3 h-3 mr-1" />}
              Test Upload
            </Button>
            <Button
              type="button"
              onClick={initFolders}
              disabled={!driveOk || initBusy}
              className="rounded-full bg-[#0F172A] hover:bg-[#1e293b] text-white h-8 px-3 text-xs"
              data-testid="storage-init-folders-btn"
            >
              {initBusy
                ? <Loader2 className="w-3 h-3 animate-spin mr-1" />
                : <FolderPlus className="w-3 h-3 mr-1" />}
              Initialise Folders
            </Button>
          </div>
        </div>
        <pre className="text-[11px] text-[#2D2A26] leading-tight bg-[#FAF9F6] border border-[#E5E2DC] rounded-2xl p-2.5 overflow-x-auto" data-testid="storage-folders-tree">
{`My Life My Time/${rootSet ? " ✓" : ""}
├── Backups/
├── Photos/${byCat.photos ? `         (${byCat.photos.count} files)` : ""}
├── Documents/${byCat.documents ? `      (${byCat.documents.count} files)` : ""}
├── Chat Attachments/${byCat.chat_attachments ? ` (${byCat.chat_attachments.count} files)` : ""}
└── Exports/${byCat.exports ? `        (${byCat.exports.count} files)` : ""}`}
        </pre>
        <p className="text-[10px] text-[#7A7571] mt-1">
          Per-family subfolders <code>Family_&lt;id&gt;</code> are created on first upload.
        </p>
      </section>

      {/* Top families */}
      {stats.top_families.length > 0 && (
        <section className="mt-4 pt-3 border-t border-[#E5E2DC]" data-testid="storage-top-families">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[#7A7571] mb-2">
            Top Families
          </h3>
          <div className="space-y-1.5">
            {stats.top_families.map((f) => (
              <div key={f.family_id} className="flex items-center justify-between text-xs">
                <span className="text-[#2D2A26] truncate">{f.family_name || f.family_id.slice(0, 8)}</span>
                <span className="text-[#7A7571] tabular-nums shrink-0 ms-2">
                  {f.count} files · {fmtBytes(f.size_bytes)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Recent uploads */}
      <section className="mt-4 pt-3 border-t border-[#E5E2DC]" data-testid="storage-recent">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[#7A7571] mb-2">
          Recent Uploads ({stats.recent_uploads.length})
        </h3>
        {stats.recent_uploads.length === 0 ? (
          <p className="text-xs text-[#7A7571] text-center py-3">No files uploaded yet.</p>
        ) : (
          <div className="overflow-x-auto -mx-3 sm:mx-0">
            <table className="w-full text-xs">
              <thead className="text-[10px] uppercase text-[#7A7571]">
                <tr>
                  <th className="text-start font-medium py-1 px-2">Name</th>
                  <th className="text-start font-medium py-1 px-2">Category</th>
                  <th className="text-start font-medium py-1 px-2">Size</th>
                  <th className="text-start font-medium py-1 px-2">When</th>
                  <th className="text-start font-medium py-1 px-2"></th>
                </tr>
              </thead>
              <tbody>
                {stats.recent_uploads.map((f) => (
                  <tr key={f.id} className="border-t border-[#E5E2DC]" data-testid={`storage-recent-row-${f.id}`}>
                    <td className="py-1 px-2 text-[#2D2A26] max-w-[180px] truncate" title={f.name}>{f.name}</td>
                    <td className="py-1 px-2 text-[#7A7571]">{CATEGORY_META[f.category]?.label || f.category}</td>
                    <td className="py-1 px-2 text-[#2D2A26] tabular-nums">{fmtBytes(f.size_bytes)}</td>
                    <td className="py-1 px-2 text-[#7A7571]">{fmtDate(f.created_at)}</td>
                    <td className="py-1 px-2">
                      {f.drive_web_view_link && (
                        <a
                          href={f.drive_web_view_link}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-[#0F172A] hover:underline"
                          data-testid={`storage-recent-open-${f.id}`}
                        >
                          Open <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Tile({ label, value, testid }) {
  return (
    <div className="rounded-2xl border border-[#E5E2DC] bg-[#FAF9F6] p-3" data-testid={testid}>
      <div className="text-[10px] uppercase tracking-wider text-[#7A7571]">{label}</div>
      <div className="text-xl font-semibold text-[#2D2A26] tabular-nums mt-1">{value}</div>
    </div>
  );
}
