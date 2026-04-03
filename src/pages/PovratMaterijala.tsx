import { AppLayout } from "@/components/AppLayout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useState, useMemo } from "react";
import { Plus, Trash2, Save, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { generateDocumentPDF } from "@/lib/pdf-generators";

interface DocItem {
  article_id: string;
  quantity: number;
  unit: string;
  note: string;
  override_reason: string;
}

export default function PovratMaterijala() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [form, setForm] = useState({
    stock_location_id: "",
    project_id: "",
    returned_by: "",
    received_by: "",
    note: "",
    date: new Date().toISOString().slice(0, 10),
  });

  const [items, setItems] = useState<DocItem[]>([
    { article_id: "", quantity: 1, unit: "kom", note: "", override_reason: "" },
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
    queryKey: ["projects_active"],
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("*").eq("status", "active").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: transactions } = useQuery({
    queryKey: ["inventory_transactions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("inventory_transactions").select("*");
      if (error) throw error;
      return data;
    },
  });

  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("settings").select("*").single();
      if (error) throw error;
      return data;
    },
  });

  // Max return per article for selected project
  const maxReturn = useMemo(() => {
    if (!transactions || !form.project_id) return new Map<string, number>();
    const map = new Map<string, number>();
    const projectTxns = transactions.filter(t => t.project_id === form.project_id);
    projectTxns.forEach(t => {
      const current = map.get(t.article_id) || 0;
      if (t.type === "out") map.set(t.article_id, current + Number(t.quantity));
      if (t.type === "return") map.set(t.article_id, current - Number(t.quantity));
    });
    return map;
  }, [transactions, form.project_id]);

  // Check which rows exceed max return
  const rowWarnings = useMemo(() => {
    return items.map(item => {
      if (!item.article_id || !form.project_id) return { exceeded: false, max: 0 };
      const max = maxReturn.get(item.article_id) || 0;
      return { exceeded: item.quantity > max, max };
    });
  }, [items, maxReturn, form.project_id]);

  // Block submit if any exceeded row is missing override reason
  const hasUnresolvedOverrides = items.some((item, idx) =>
    rowWarnings[idx].exceeded && !item.override_reason.trim()
  );

  const submit = useMutation({
    mutationFn: async () => {
      const validItems = items.filter(i => i.article_id && i.quantity > 0);
      if (!form.project_id) throw new Error("Odaberite projekt");
      if (!form.stock_location_id) throw new Error("Odaberite skladišnu lokaciju");
      if (validItems.length === 0) throw new Error("Dodajte barem jednu stavku");
      if (hasUnresolvedOverrides) throw new Error("Unesite razlog za stavke koje prelaze izdanu količinu");

      // Build note with override reasons
      const overrideNotes = validItems
        .map((item, idx) => {
          const origIdx = items.indexOf(item);
          if (rowWarnings[origIdx]?.exceeded && item.override_reason) {
            const article = articles?.find(a => a.id === item.article_id);
            return `Override za ${article?.code}: ${item.override_reason}`;
          }
          return null;
        })
        .filter(Boolean);

      const fullNote = [form.note, ...overrideNotes].filter(Boolean).join("; ");

      const result = await supabase.rpc("create_povratnica", {
        p_stock_location_id: form.stock_location_id,
        p_project_id: form.project_id,
        p_date: form.date,
        p_returned_by: form.returned_by || undefined,
        p_received_by: form.received_by || undefined,
        p_note: fullNote || undefined,
        p_items: validItems.map(i => ({
          article_id: i.article_id,
          quantity: i.quantity,
          unit: i.unit,
          note: i.note || null,
        })),
      });

      if (result.error) throw result.error;
      const data = result.data as { id: string; doc_number: string; date: string; returned_by: string; received_by: string };

      // Generate PDF
      const project = projects?.find(p => p.id === form.project_id);
      const location = locations?.find(l => l.id === form.stock_location_id);
      generateDocumentPDF({
        title: "POVRATNICA",
        doc_number: data.doc_number,
        date: data.date || form.date,
        leftLabel1: "Projekt",
        leftValue1: project?.name || "-",
        leftLabel2: "Adresa",
        leftValue2: project?.site_address || undefined,
        rightLabel: "Lokacija povrata",
        rightValue: location ? `${location.name} (${location.code})` : "-",
        sigLeftLabel: "Vratio",
        sigLeftValue: data.returned_by || form.returned_by,
        sigRightLabel: "Preuzeo",
        sigRightValue: data.received_by || form.received_by,
        items: validItems.map((item, idx) => {
          const article = articles?.find(a => a.id === item.article_id);
          return { index: idx + 1, code: article?.code || "", name: article?.name || "", unit: item.unit, quantity: item.quantity };
        }),
        company: {
          name: settings?.company_name || "COREX ING d.o.o.",
          oib: settings?.company_oib || "17193431064",
          address: settings?.company_address || "Međimurska ulica 23",
          city: settings?.company_city || "42000 Varaždin",
        },
      });

      return { docNumber: data.doc_number, projectId: form.project_id };
    },
    onSuccess: ({ docNumber }) => {
      qc.invalidateQueries({ queryKey: ["inventory_current"] });
      qc.invalidateQueries({ queryKey: ["inventory_per_location"] });
      qc.invalidateQueries({ queryKey: ["inventory_transactions"] });
      toast.success(`Povratnica ${docNumber} uspješno kreirana`);
      navigate("/projekti");
    },
    onError: (e) => toast.error(e.message),
  });

  const addItem = () => setItems([...items, { article_id: "", quantity: 1, unit: "kom", note: "", override_reason: "" }]);
  const removeItem = (idx: number) => setItems(items.filter((_, i) => i !== idx));
  const updateItem = (idx: number, field: keyof DocItem, value: string | number) => {
    const updated = [...items];
    (updated[idx] as any)[field] = value;
    if (field === "article_id" && articles) {
      const article = articles.find(a => a.id === value);
      if (article) updated[idx].unit = article.unit;
    }
    setItems(updated);
  };

  // Get articles that were issued to this project
  const projectArticleIds = useMemo(() => {
    if (!transactions || !form.project_id) return new Set<string>();
    return new Set(
      transactions
        .filter(t => t.project_id === form.project_id && t.type === "out")
        .map(t => t.article_id)
    );
  }, [transactions, form.project_id]);

  return (
    <AppLayout title="Povrat materijala">
      <form onSubmit={(e) => { e.preventDefault(); submit.mutate(); }} className="space-y-6 max-w-5xl">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground mb-4">Broj povratnice će biti automatski generiran pri spremanju</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>Datum</Label>
              <Input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} required />
            </div>
            <div>
              <Label>Projekt *</Label>
              <Select value={form.project_id} onValueChange={v => setForm({ ...form, project_id: v })}>
                <SelectTrigger><SelectValue placeholder="Odaberi projekt" /></SelectTrigger>
                <SelectContent>
                  {projects?.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Skladišna lokacija *</Label>
              <Select value={form.stock_location_id} onValueChange={v => setForm({ ...form, stock_location_id: v })}>
                <SelectTrigger><SelectValue placeholder="Povrat NA lokaciju" /></SelectTrigger>
                <SelectContent>
                  {locations?.map(l => <SelectItem key={l.id} value={l.id}>{l.name} ({l.code})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <div><Label>Vratio</Label><Input value={form.returned_by} onChange={e => setForm({ ...form, returned_by: e.target.value })} /></div>
            <div><Label>Preuzeo</Label><Input value={form.received_by} onChange={e => setForm({ ...form, received_by: e.target.value })} /></div>
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

          {!form.project_id && (
            <p className="text-sm text-muted-foreground">Odaberite projekt za prikaz izdanih artikala</p>
          )}

          <div className="rounded-lg border bg-card overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[250px]">Artikl</TableHead>
                  <TableHead className="w-28">Količina povrata</TableHead>
                  <TableHead className="w-20">JMJ</TableHead>
                  <TableHead className="w-28">Max. povrat</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item, idx) => {
                  const warning = rowWarnings[idx];
                  return (
                    <TableRow key={idx} className="align-top">
                      <TableCell>
                        <Select value={item.article_id} onValueChange={v => updateItem(idx, "article_id", v)}>
                          <SelectTrigger><SelectValue placeholder="Odaberi artikl" /></SelectTrigger>
                          <SelectContent>
                            {articles
                              ?.filter(a => !form.project_id || projectArticleIds.has(a.id))
                              .map(a => {
                                const max = maxReturn.get(a.id) || 0;
                                return (
                                  <SelectItem key={a.id} value={a.id}>
                                    {a.code} — {a.name} (max: {max} {a.unit})
                                  </SelectItem>
                                );
                              })}
                          </SelectContent>
                        </Select>
                        {warning.exceeded && (
                          <div className="mt-2 space-y-1">
                            <div className="flex items-center gap-1 text-xs text-[hsl(30,90%,40%)]">
                              <AlertTriangle className="h-3 w-3" />
                              Količina prelazi prethodno izdanu količinu (max: {warning.max}). Unesite razlog:
                            </div>
                            <Input
                              placeholder="Razlog prekoračenja..."
                              value={item.override_reason}
                              onChange={e => updateItem(idx, "override_reason", e.target.value)}
                              className="text-sm border-[hsl(30,90%,70%)]"
                            />
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Input type="number" min="0.01" step="0.01" value={item.quantity}
                          onChange={e => updateItem(idx, "quantity", Number(e.target.value))} />
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">{item.unit}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {item.article_id && form.project_id ? (maxReturn.get(item.article_id) || 0) : "—"}
                        </span>
                      </TableCell>
                      <TableCell>
                        {items.length > 1 && (
                          <Button type="button" variant="ghost" size="icon" onClick={() => removeItem(idx)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>

        <Button type="submit" size="lg" disabled={submit.isPending || hasUnresolvedOverrides} className="w-full md:w-auto">
          <Save className="mr-2 h-4 w-4" />
          {submit.isPending ? "Spremanje..." : "Spremi povratnicu i generiraj PDF"}
        </Button>
      </form>
    </AppLayout>
  );
}
