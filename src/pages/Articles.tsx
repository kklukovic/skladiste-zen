import { AppLayout } from "@/components/AppLayout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useState } from "react";
import { Plus, Pencil, Trash2, Search } from "lucide-react";
import { toast } from "sonner";

interface ArticleForm {
  code: string; name: string; unit: string; category: string;
  purchase_price: number; min_quantity: number;
}

const emptyForm: ArticleForm = { code: "", name: "", unit: "kom", category: "", purchase_price: 0, min_quantity: 0 };

export default function Articles() {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<ArticleForm>(emptyForm);
  const qc = useQueryClient();

  const { data: articles, isLoading } = useQuery({
    queryKey: ["articles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("articles").select("*").order("code");
      if (error) throw error;
      return data;
    },
  });

  const save = useMutation({
    mutationFn: async (f: ArticleForm) => {
      if (editing) {
        const { error } = await supabase.from("articles").update(f).eq("id", editing);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("articles").insert(f);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["articles"] });
      setOpen(false); setEditing(null); setForm(emptyForm);
      toast.success(editing ? "Artikl ažuriran" : "Artikl dodan");
    },
    onError: (e) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("articles").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["articles"] }); toast.success("Artikl obrisan"); },
    onError: (e) => toast.error(e.message),
  });

  const filtered = articles?.filter(a =>
    a.name.toLowerCase().includes(search.toLowerCase()) ||
    a.code.toLowerCase().includes(search.toLowerCase())
  );

  const openEdit = (a: typeof articles extends (infer T)[] | undefined ? T : never) => {
    setEditing(a.id);
    setForm({ code: a.code, name: a.name, unit: a.unit, category: a.category || "", purchase_price: a.purchase_price || 0, min_quantity: a.min_quantity || 0 });
    setOpen(true);
  };

  return (
    <AppLayout title="Artikli">
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-3 justify-between">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Pretraži..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setEditing(null); setForm(emptyForm); } }}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" />Novi artikl</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{editing ? "Uredi artikl" : "Novi artikl"}</DialogTitle></DialogHeader>
              <form onSubmit={(e) => { e.preventDefault(); save.mutate(form); }} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>Šifra</Label><Input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} required /></div>
                  <div><Label>Naziv</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required /></div>
                  <div><Label>JM</Label><Input value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} /></div>
                  <div><Label>Kategorija</Label><Input value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} /></div>
                  <div><Label>Nabavna cijena</Label><Input type="number" step="0.01" value={form.purchase_price} onChange={e => setForm({ ...form, purchase_price: Number(e.target.value) })} /></div>
                  <div><Label>Min. količina</Label><Input type="number" value={form.min_quantity} onChange={e => setForm({ ...form, min_quantity: Number(e.target.value) })} /></div>
                </div>
                <Button type="submit" className="w-full" disabled={save.isPending}>
                  {save.isPending ? "Spremanje..." : "Spremi"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Šifra</TableHead>
                <TableHead>Naziv</TableHead>
                <TableHead>JM</TableHead>
                <TableHead>Kategorija</TableHead>
                <TableHead className="text-right">Nab. cijena</TableHead>
                <TableHead className="text-right">Min. kol.</TableHead>
                <TableHead className="w-24"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Učitavanje...</TableCell></TableRow>
              ) : filtered?.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Nema artikala</TableCell></TableRow>
              ) : (
                filtered?.map(a => (
                  <TableRow key={a.id}>
                    <TableCell className="font-mono text-sm">{a.code}</TableCell>
                    <TableCell className="font-medium">{a.name}</TableCell>
                    <TableCell>{a.unit}</TableCell>
                    <TableCell>{a.category || "—"}</TableCell>
                    <TableCell className="text-right">{Number(a.purchase_price).toFixed(2)} €</TableCell>
                    <TableCell className="text-right">{a.min_quantity}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(a)}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => del.mutate(a.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </AppLayout>
  );
}
