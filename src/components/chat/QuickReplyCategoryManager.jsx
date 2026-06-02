import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

const palette = ['#38bdf8', '#22c55e', '#a78bfa', '#f59e0b', '#fb7185', '#94a3b8'];

export default function QuickReplyCategoryManager({
  open,
  onOpenChange,
  categories,
  onSave,
  onDelete,
  onSaveOrder,
  isSaving,
}) {
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', color: palette[0], icon: 'folder' });
  const manageableCategories = useMemo(
    () =>
      (Array.isArray(categories) ? categories : [])
        .filter((category) => category.id !== 'cat-none')
        .sort((left, right) => (Number(left.sortOrder) || 9999) - (Number(right.sortOrder) || 9999)),
    [categories]
  );
  const [orderedCategories, setOrderedCategories] = useState([]);

  useEffect(() => {
    setOrderedCategories(manageableCategories);
  }, [manageableCategories]);

  const startCreate = () => {
    setEditing(null);
    setForm({ name: '', color: palette[0], icon: 'folder' });
  };

  const startEdit = (category) => {
    setEditing(category);
    setForm({ name: category.name || '', color: category.color || palette[0], icon: category.icon || 'folder' });
  };

  const handleSave = () => {
    if (!form.name.trim()) return;
    onSave({ ...editing, ...form, name: form.name.trim() }, editing?.id || null);
    startCreate();
  };

  const moveCategory = (index, direction) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= orderedCategories.length) return;
    const next = [...orderedCategories];
    const [item] = next.splice(index, 1);
    next.splice(targetIndex, 0, item);
    setOrderedCategories(next);
  };

  const handleSaveOrder = () => {
    onSaveOrder?.(orderedCategories);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-border bg-card text-foreground sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Categorias</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-[1fr_220px]">
          <div className="flex max-h-[340px] flex-col gap-2 overflow-y-auto pr-1">
            {orderedCategories
              .map((category, index) => (
                <div key={category.id} className="flex items-center gap-2 rounded-lg border border-border bg-background/60 px-3 py-2">
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: category.color }} />
                  <span className="min-w-0 flex-1 truncate text-sm">{category.name}</span>
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => moveCategory(index, -1)} disabled={index === 0}>
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => moveCategory(index, 1)}
                    disabled={index === orderedCategories.length - 1}
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(category)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-red-300" onClick={() => onDelete(category.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            {orderedCategories.length > 1 ? (
              <Button type="button" variant="outline" className="mt-2 h-9" onClick={handleSaveOrder} disabled={isSaving}>
                Salvar ordenação
              </Button>
            ) : null}
          </div>

          <div className="space-y-3 rounded-xl border border-border bg-background/60 p-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">{editing ? 'Editar' : 'Nova categoria'}</p>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={startCreate}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <Input
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="Nome"
              className="h-9 border-border bg-background text-foreground"
            />
            <div className="flex flex-wrap gap-2">
              {palette.map((color) => (
                <button
                  key={color}
                  type="button"
                  className="h-7 w-7 rounded-full border-2"
                  style={{ backgroundColor: color, borderColor: form.color === color ? '#fff' : 'transparent' }}
                  onClick={() => setForm({ ...form, color })}
                  title={color}
                />
              ))}
            </div>
            <Button type="button" className="h-9 w-full bg-primary text-primary-foreground hover:bg-primary/90" onClick={handleSave} disabled={isSaving}>
              {isSaving ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
