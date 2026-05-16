import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, Save, X } from "lucide-react";
import { toast } from "sonner";
import {
  createEventType,
  updateEventType,
  deleteEventType,
} from "@/lib/api";

const EventTypesDialog = ({ open, onOpenChange, types, onChanged }) => {
  const [name, setName] = useState("");
  const [color, setColor] = useState("#F472B6");
  const [description, setDescription] = useState("");
  const [editingId, setEditingId] = useState(null);

  const resetForm = () => {
    setName("");
    setColor("#F472B6");
    setDescription("");
    setEditingId(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    try {
      if (editingId) {
        await updateEventType(editingId, { name: name.trim(), color, description });
        toast.success("Category updated");
      } else {
        await createEventType({ name: name.trim(), color, description });
        toast.success("Category added");
      }
      resetForm();
      onChanged && onChanged();
    } catch {
      toast.error("Failed to save");
    }
  };

  const startEdit = (t) => {
    setEditingId(t.id);
    setName(t.name);
    setColor(t.color);
    setDescription(t.description || "");
  };

  const handleDelete = async (id) => {
    try {
      await deleteEventType(id);
      toast.success("Deleted");
      if (editingId === id) resetForm();
      onChanged && onChanged();
    } catch {
      toast.error("Failed to delete");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-lg rounded-3xl border border-[#E5E2DC] bg-white p-0 overflow-hidden"
        data-testid="types-dialog"
      >
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle className="font-heading text-2xl font-medium tracking-tight text-[#2D2A26]">
            Event Categories
          </DialogTitle>
          <p className="text-sm text-[#7A7571] mt-1">
            Create unlimited custom categories with your own colors.
          </p>
        </DialogHeader>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-4 border-b border-[#E5E2DC] space-y-3">
          <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
            <div>
              <Label className="text-xs font-semibold uppercase tracking-wider text-[#7A7571]">
                Category name
              </Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Morning Shift"
                className="mt-1.5 rounded-xl border-[#E5E2DC]"
                data-testid="type-name-input"
              />
            </div>
            <div>
              <Label className="text-xs font-semibold uppercase tracking-wider text-[#7A7571]">
                Color
              </Label>
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="mt-1.5 block w-16 h-10 rounded-xl border border-[#E5E2DC] cursor-pointer bg-white p-1"
                data-testid="type-color-input"
              />
            </div>
          </div>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional description"
            rows={2}
            className="rounded-xl border-[#E5E2DC] resize-none"
            data-testid="type-description-input"
          />
          <div className="flex gap-2 justify-end">
            {editingId && (
              <Button
                type="button"
                variant="ghost"
                onClick={resetForm}
                className="rounded-full"
                data-testid="type-cancel-edit-btn"
              >
                <X className="w-4 h-4 mr-1" /> Cancel
              </Button>
            )}
            <Button
              type="submit"
              className="rounded-full bg-[#2D2A26] hover:bg-[#1f1d1a] text-white"
              data-testid="type-save-btn"
            >
              {editingId ? (
                <>
                  <Save className="w-4 h-4 mr-1.5" /> Save
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 mr-1.5" /> Add
                </>
              )}
            </Button>
          </div>
        </form>

        {/* List */}
        <div className="px-6 py-4 max-h-72 overflow-y-auto" data-testid="types-list">
          {types.length === 0 ? (
            <p className="text-sm text-[#7A7571] text-center py-6">
              No categories yet. Add one above.
            </p>
          ) : (
            <ul className="space-y-2">
              {types.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center gap-3 p-3 rounded-xl border border-[#E5E2DC] bg-[#FAF9F6] hover:bg-white transition-colors"
                  data-testid={`type-item-${t.id}`}
                >
                  <span
                    className="w-5 h-5 rounded-full border border-[#E5E2DC]"
                    style={{ backgroundColor: t.color }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[#2D2A26] truncate">{t.name}</p>
                    {t.description && (
                      <p className="text-xs text-[#7A7571] truncate">{t.description}</p>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => startEdit(t)}
                    className="rounded-full text-xs"
                    data-testid={`type-edit-${t.id}`}
                  >
                    Edit
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(t.id)}
                    className="rounded-full text-red-500 hover:text-red-600 hover:bg-red-50"
                    data-testid={`type-delete-${t.id}`}
                  >
                    <Trash2 className="w-4 h-4" strokeWidth={1.75} />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <DialogFooter className="px-6 py-4 bg-[#FAF9F6] border-t border-[#E5E2DC]">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="rounded-full"
            data-testid="types-close-btn"
          >
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EventTypesDialog;
