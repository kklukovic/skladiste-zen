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

const typeLabels: Record<string, string> = {
  in: "Primka",
  out: "Otpremnica",
  return: "Povrat materijala",
};

export default function DocumentForm({ docType }: { docType: "in" | "out" | "return" }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const title = typeLabels[docType] || docType;

  const [form, setForm] = useState({
    stock_location_id: "",
    project_id: "",
    recipient_name: "",
    recipient_address: "",
    issued_by: "",
    received_by: "",
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

  const { data: projects } = useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("*").eq("status", "active").order("name");
      if (error) throw error;
      return data;
    },
  });

  const generateDocNumber = async () => {
    const prefix = docType === "in" ? "PRI" : docType === "out" ? "OTP" : "POV";
    const year = new Date().getFullYear();
    const { count } = await supabase
      .from("documents")
      .select("*", { count: "exact", head: true })
      .eq("type", docType)
      .gte("date", `${year}-01-01`);
    return `${prefix}-${year}-${String((count || 0) + 1).padStart(4, "0")}`;
  };

  const submit = useMutation({
    mutationFn: async () => {
      const validItems = items.filter(i => i.article_id && i.quantity > 0);
      if (!form.stock_location_id) throw new Error("Odaberite lokaciju");
      if (validItems.length === 0) throw new Error("Dodajte barem jednu stavku");

      const docNumber = await generateDocNumber();

      const { data: doc, error: docErr } = await supabase
        .from("documents")
        .insert({
          type: docType,
          doc_number: docNumber,
          stock_location_id: form.stock_location_id,
          project_id: form.project_id || null,
          recipient_name: form.recipient_name || null,
          recipient_address: form.recipient_address || null,
          issued_by: form.issued_by || null,
          received_by: form.received_by || null,
          note: form.note || null,
          date: form.date,
        })
        .select()
        .single();
      if (docErr) throw docErr;

      const docItems = validItems.map(i => ({
        document_id: doc.id,
        article_id: i.article_id,
        quantity: i.quantity,
        unit: i.unit,
        unit_price: i.unit_price || null,
        note: i.note || null,
      }));

      const { data: savedItems, error: itemErr } = await supabase
        .from("document_items")
        .insert(docItems)
        .select();
      if (itemErr) throw itemErr;

      const txns = savedItems.map(si => ({
        article_id: si.article_id,
        type: docType,
        quantity: si.quantity,
        stock_location_id: form.stock_location_id,
        document_id: doc.id,
        document_item_id: si.id,
        project_id: form.project_id || null,
        note: si.note,
      }));

      const { error: txnErr } = await supabase.from("inventory_transactions").insert(txns);
      if (txnErr) throw txnErr;

      return docNumber;
    },
    onSuccess: (docNumber) => {
      qc.invalidateQueries({ queryKey: ["inventory_current"] });
      toast.success(`${title} ${docNumber} kreirana`);
      navigate("/");
    },
    onError: (e) => toast.error(e.message),
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

  return (
    <AppLayout title={`Nova ${title.toLowerCase()}`}>
      <form onSubmit={(e) => { e.preventDefault(); submit.mutate(); }} className="space-y-6 max-w-5xl">
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
            <Label>Projekt</Label>
            <Select value={form.project_id} onValueChange={v => setForm({ ...form, project_id: v })}>
              <SelectTrigger><SelectValue placeholder="Odaberi projekt" /></SelectTrigger>
              <SelectContent>
                {projects?.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {(docType === "out" || docType === "return") && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><Label>Primatelj</Label><Input value={form.recipient_name} onChange={e => setForm({ ...form, recipient_name: e.target.value })} /></div>
            <div><Label>Adresa primatelja</Label><Input value={form.recipient_address} onChange={e => setForm({ ...form, recipient_address: e.target.value })} /></div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div><Label>Izdao</Label><Input value={form.issued_by} onChange={e => setForm({ ...form, issued_by: e.target.value })} /></div>
          <div><Label>Preuzeo</Label><Input value={form.received_by} onChange={e => setForm({ ...form, received_by: e.target.value })} /></div>
        </div>

        <div><Label>Napomena</Label><Textarea value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} /></div>

        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Stavke</h3>
            <Button type="button" variant="outline" size="sm" onClick={addItem}><Plus className="mr-1 h-4 w-4" />Dodaj stavku</Button>
          </div>

          <div className="rounded-lg border bg-card overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[200px]">Artikl</TableHead>
                  <TableHead className="w-24">Količina</TableHead>
                  <TableHead className="w-20">JM</TableHead>
                  <TableHead className="w-28">Cijena</TableHead>
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
                          {articles?.map(a => <SelectItem key={a.id} value={a.id}>{a.code} — {a.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell><Input type="number" min="0.01" step="0.01" value={item.quantity} onChange={e => updateItem(idx, "quantity", Number(e.target.value))} /></TableCell>
                    <TableCell><Input value={item.unit} onChange={e => updateItem(idx, "unit", e.target.value)} /></TableCell>
                    <TableCell><Input type="number" step="0.01" value={item.unit_price} onChange={e => updateItem(idx, "unit_price", Number(e.target.value))} /></TableCell>
                    <TableCell><Input value={item.note} onChange={e => updateItem(idx, "note", e.target.value)} /></TableCell>
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
        </div>

        <Button type="submit" size="lg" disabled={submit.isPending} className="w-full md:w-auto">
          <Save className="mr-2 h-4 w-4" />
          {submit.isPending ? "Spremanje..." : `Spremi ${title.toLowerCase()}`}
        </Button>
      </form>
    </AppLayout>
  );
}
