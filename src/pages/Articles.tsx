import { AppLayout } from "@/components/AppLayout";
import { formatCurrency } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useState } from "react";
import { Plus, Pencil, Trash2, Search, Download } from "lucide-react";
import { toast } from "sonner";

const CODE_REGEX = /^[A-Z]{2,4}-[0-9]{3}$/;
const UNITS = ["kom", "m", "kg", "l", "par", "pak", "set"];
const CATEGORY_SUGGESTIONS = [
  "Energy meter", "Inverter", "Kanalice", "Konektori", "Oprema",
  "Fotonaponski moduli", "Potkonstrukcija", "Smart", "Vijčana roba",
  "Vodiči", "Ostalo"
];

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
  const [codeError, setCodeError] = useState("");
  const qc = useQueryClient();

  const { data: articles, isLoading } = useQuery({
    queryKey: ["articles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("articles").select("*").order("code");
      if (error) throw error;
      return data;
    },
  });

  const { data: inventory } = useQuery({
    queryKey: ["inventory_current"],
    queryFn: async () => {
      const { data, error } = await supabase.from("inventory_current").select("*");
      if (error) throw error;
      return data;
    },
  });

  const save = useMutation({
    mutationFn: async (f: ArticleForm) => {
      if (!CODE_REGEX.test(f.code)) throw new Error("Šifra mora biti u formatu ABC-001");
      // Check uniqueness
      const existing = articles?.find(a => a.code === f.code && a.id !== editing);
      if (existing) throw new Error("Šifra već postoji");

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
      qc.invalidateQueries({ queryKey: ["inventory_current"] });
      setOpen(false); setEditing(null); setForm(emptyForm); setCodeError("");
      toast.success(editing ? "Artikl ažuriran" : "Artikl dodan");
    },
    onError: (e) => {
      if (e.message.includes("Šifra")) setCodeError(e.message);
      else toast.error(e.message);
    },
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      // Check references
      const { count: itemCount } = await supabase
        .from("document_items").select("*", { count: "exact", head: true }).eq("article_id", id);
      const { count: txnCount } = await supabase
        .from("inventory_transactions").select("*", { count: "exact", head: true }).eq("article_id", id);
      if ((itemCount || 0) > 0 || (txnCount || 0) > 0) {
        throw new Error("Artikal se ne može obrisati jer ima evidentirane transakcije.");
      }
      const { error } = await supabase.from("articles").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["articles"] }); toast.success("Artikl obrisan"); },
    onError: (e) => toast.error(e.message),
  });

  const exportCSV = () => {
    if (!articles || !inventory) return;
    const rows = articles.map(a => {
      const inv = inventory.find(i => i.id === a.id);
      return [a.code, a.name, a.unit, a.category || "", a.purchase_price, a.min_quantity, Number(inv?.current_qty || 0).toFixed(2)];
    });
    const header = "Šifra,Naziv,JMJ,Kategorija,Nabavna cijena,Min. zaliha,Trenutna količina";
    const csv = header + "\n" + rows.map(r => r.map(v => `"${v}"`).join(",")).join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `artikli_${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const filtered = articles?.filter(a =>
    a.name.toLowerCase().includes(search.toLowerCase()) ||
    a.code.toLowerCase().includes(search.toLowerCase())
  );

  const openEdit = (a: NonNullable<typeof articles>[0]) => {
    setEditing(a.id);
    setForm({ code: a.code, name: a.name, unit: a.unit, category: a.category || "", purchase_price: a.purchase_price || 0, min_quantity: a.min_quantity || 0 });
    setCodeError("");
    setOpen(true);
  };

  const validateCode = (code: string) => {
    setForm(prev => ({ ...prev, code }));
    if (code && !CODE_REGEX.test(code)) setCodeError("Format: ABC-001 (2-4 velika slova, crtica, 3 znamenke)");
    else setCodeError("");
  };

  return (
    <AppLayout title="Artikli">
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-3 justify-between">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Pretraži..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={exportCSV}>
              <Download className="mr-2 h-4 w-4" />Export CSV
            </Button>
            <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setEditing(null); setForm(emptyForm); setCodeError(""); } }}>
              <DialogTrigger asChild>
                <Button><Plus className="mr-2 h-4 w-4" />Novi artikl</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>{editing ? "Uredi artikl" : "Novi artikl"}</DialogTitle></DialogHeader>
                <form onSubmit={(e) => { e.preventDefault(); save.mutate(form); }} className="space-y-4">
                  <div>
                    <Label>Šifra *</Label>
                    <Input value={form.code} onChange={e => validateCode(e.target.value.toUpperCase())} required placeholder="ABC-001" />
                    {codeError && <p className="text-sm text-destructive mt-1">{codeError}</p>}
                    <p className="text-xs text-muted-foreground mt-1">Format: ABC-001</p>
                  </div>
                  <div>
                    <Label>Naziv *</Label>
                    <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>JMJ</Label>
                      <Select value={form.unit} onValueChange={v => setForm({ ...form, unit: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Kategorija</Label>
                      <Input
                        value={form.category}
                        onChange={e => setForm({ ...form, category: e.target.value })}
                        list="category-suggestions"
                      />
                      <datalist id="category-suggestions">
                        {CATEGORY_SUGGESTIONS.map(c => <option key={c} value={c} />)}
                      </datalist>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Nabavna cijena (€)</Label>
                      <Input type="number" step="0.01" min="0" value={form.purchase_price} onChange={e => setForm({ ...form, purchase_price: Number(e.target.value) })} />
                    </div>
                    <div>
                      <Label>Min. zaliha</Label>
                      <Input type="number" min="0" value={form.min_quantity} onChange={e => setForm({ ...form, min_quantity: Number(e.target.value) })} />
                    </div>
                  </div>
                  <Button type="submit" className="w-full" disabled={save.isPending || !!codeError}>
                    {save.isPending ? "Spremanje..." : "Spremi"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="rounded-lg border bg-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Šifra</TableHead>
                <TableHead>Naziv</TableHead>
                <TableHead>JMJ</TableHead>
                <TableHead>Kategorija</TableHead>
                <TableHead className="text-right">Nabavna cijena</TableHead>
                <TableHead className="text-right">Min. zaliha</TableHead>
                <TableHead className="w-24">Akcije</TableHead>
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
                    <TableCell className="text-right">{formatCurrency(Number(a.purchase_price))}</TableCell>
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
