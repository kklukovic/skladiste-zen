import { AppLayout } from "@/components/AppLayout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useState } from "react";
import { Plus, Trash2, Save } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

interface DocItem {
  article_id: string;
  quantity: number;
  unit: string;
  unit_price: number;
  note: string;
}

export default function NovaPrimka() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [form, setForm] = useState({
    stock_location_id: "",
    supplier: "",
    note: "",
    date: new Date().toISOString().slice(0, 10),
  });

  const [items, setItems] = useState<DocItem[]>([
    { article_id: "", quantity: 1, unit: "kom", unit_price: 0, note: "" },
  ]);

  const { data: articles } = useQuery({
    queryKey: ["articles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("articles").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: locations } = useQuery({
    queryKey: ["stock_locations"],
    queryFn: async () => {
      const { data, error } = await supabase.from("stock_locations").select("*").order("code");
      if (error) throw error;
      return data;
    },
  });

  const submit = useMutation({
    mutationFn: async () => {
      const validItems = items.filter(i => i.article_id && i.quantity > 0);
      if (!form.stock_location_id) throw new Error("Odaberite skladišnu lokaciju");
      if (validItems.length === 0) throw new Error("Dodajte barem jednu stavku s artiklom i količinom > 0");

      const result = await supabase.rpc("create_primka", {
        p_stock_location_id: form.stock_location_id,
        p_date: form.date,
        p_supplier: form.supplier || null,
        p_note: form.note || null,
        p_items: validItems.map(i => ({
          article_id: i.article_id,
          quantity: i.quantity,
          unit: i.unit,
          unit_price: i.unit_price,
          note: i.note || null,
        })),
      });

      if (result.error) throw result.error;
      return result.data as { id: string; doc_number: string };
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["inventory_current"] });
      qc.invalidateQueries({ queryKey: ["articles"] });
      toast.success(`Primka ${data.doc_number} uspješno kreirana`);
      navigate("/");
    },
    onError: (e: any) => {
      console.error("Primka error:", e);
      const msg = e?.message || e?.details || "Nepoznata greška pri spremanju primke";
      toast.error(msg, { duration: 8000 });
    },
  });

  const addItem = () => setItems([...items, { article_id: "", quantity: 1, unit: "kom", unit_price: 0, note: "" }]);
  const removeItem = (idx: number) => setItems(items.filter((_, i) => i !== idx));
  const updateItem = (idx: number, field: keyof DocItem, value: string | number) => {
    const updated = [...items];
    (updated[idx] as any)[field] = value;
    if (field === "article_id" && articles) {
      const article = articles.find(a => a.id === value);
      if (article) {
        updated[idx].unit = article.unit;
        updated[idx].unit_price = article.purchase_price || 0;
      }
    }
    setItems(updated);
  };

  const runningTotal = items.reduce((s, i) => s + (i.quantity * i.unit_price), 0);

  return (
    <AppLayout title="Nova primka">
      <form onSubmit={(e) => { e.preventDefault(); submit.mutate(); }} className="space-y-6 max-w-5xl">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground mb-4">Broj primke će biti automatski generiran pri spremanju</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>Datum</Label>
              <Input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} required />
            </div>
            <div>
              <Label>Skladišna lokacija *</Label>
              <Select value={form.stock_location_id} onValueChange={v => setForm({ ...form, stock_location_id: v })}>
                <SelectTrigger><SelectValue placeholder="Odaberi lokaciju" /></SelectTrigger>
                <SelectContent>
                  {locations?.map(l => <SelectItem key={l.id} value={l.id}>{l.name} ({l.code})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Dobavljač</Label>
              <Input value={form.supplier} onChange={e => setForm({ ...form, supplier: e.target.value })} />
            </div>
          </div>
          <div className="mt-4">
            <Label>Napomena</Label>
            <Textarea value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} />
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Stavke</h3>
            <Button type="button" variant="outline" size="sm" onClick={addItem}>
              <Plus className="mr-1 h-4 w-4" />Dodaj stavku
            </Button>
          </div>

          <div className="rounded-lg border bg-card overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[250px]">Artikl</TableHead>
                  <TableHead className="w-24">Količina</TableHead>
                  <TableHead className="w-28">Jedinična cijena</TableHead>
                  <TableHead>Napomena</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item, idx) => (
                  <TableRow key={idx}>
                    <TableCell>
                      <Select value={item.article_id} onValueChange={v => updateItem(idx, "article_id", v)}>
                        <SelectTrigger><SelectValue placeholder="Odaberi artikl" /></SelectTrigger>
                        <SelectContent>
                          {articles?.map(a => (
                            <SelectItem key={a.id} value={a.id}>
                              {a.code} — {a.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Input type="number" min="0.01" step="0.01" value={item.quantity}
                        onChange={e => updateItem(idx, "quantity", Number(e.target.value))} />
                    </TableCell>
                    <TableCell>
                      <Input type="number" step="0.01" value={item.unit_price}
                        onChange={e => updateItem(idx, "unit_price", Number(e.target.value))} />
                    </TableCell>
                    <TableCell>
                      <Input value={item.note} onChange={e => updateItem(idx, "note", e.target.value)} />
                    </TableCell>
                    <TableCell>
                      {items.length > 1 && (
                        <Button type="button" variant="ghost" size="icon" onClick={() => removeItem(idx)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex justify-end">
            <div className="text-right">
              <span className="text-muted-foreground text-sm">Ukupno: </span>
              <span className="text-lg font-bold">{runningTotal.toFixed(2)} €</span>
            </div>
          </div>
        </div>

        <Button type="submit" size="lg" disabled={submit.isPending} className="w-full md:w-auto">
          <Save className="mr-2 h-4 w-4" />
          {submit.isPending ? "Spremanje..." : "Spremi primku"}
        </Button>
      </form>
    </AppLayout>
  );
}
