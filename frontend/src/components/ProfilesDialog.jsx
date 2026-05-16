import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { updateUser } from "@/lib/api";

const ProfilesDialog = ({ open, onOpenChange, users, onChanged }) => {
  const [names, setNames] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      const initial = {};
      users.forEach((u) => (initial[u.id] = u.name));
      setNames(initial);
    }
  }, [open, users]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await Promise.all(
        users.map((u) => {
          const newName = (names[u.id] || "").trim();
          if (newName && newName !== u.name) {
            return updateUser(u.id, { name: newName });
          }
          return null;
        })
      );
      toast.success("Profiles updated");
      onChanged && onChanged();
      onOpenChange(false);
    } catch {
      toast.error("Failed to update profiles");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-md rounded-3xl border border-[#E5E2DC] bg-white p-0 overflow-hidden"
        data-testid="profiles-dialog"
      >
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle className="font-heading text-2xl font-medium tracking-tight text-[#2D2A26]">
            Profile Names
          </DialogTitle>
          <DialogDescription className="text-sm text-[#7A7571]">
            Customize how each account is shown across the app.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-4 space-y-4">
          {users.map((u) => (
            <div key={u.id} className="space-y-1.5">
              <Label
                htmlFor={`profile-${u.id}`}
                className="text-xs font-semibold uppercase tracking-wider text-[#7A7571] flex items-center gap-2"
              >
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: u.color }}
                />
                Profile {u.id === "wife" ? "1" : "2"}
              </Label>
              <Input
                id={`profile-${u.id}`}
                value={names[u.id] || ""}
                onChange={(e) =>
                  setNames((prev) => ({ ...prev, [u.id]: e.target.value }))
                }
                className="rounded-xl border-[#E5E2DC] focus-visible:ring-[#2D2A26]"
                data-testid={`profile-name-input-${u.id}`}
              />
            </div>
          ))}
        </div>

        <DialogFooter className="px-6 py-4 bg-[#FAF9F6] border-t border-[#E5E2DC] flex gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="rounded-full"
            data-testid="profiles-cancel-btn"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-full bg-[#2D2A26] hover:bg-[#1f1d1a] text-white"
            data-testid="profiles-save-btn"
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ProfilesDialog;
