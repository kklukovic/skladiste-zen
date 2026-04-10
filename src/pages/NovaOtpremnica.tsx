import { AppLayout } from "@/components/AppLayout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useState, useMemo, useEffect } from "react";
import { Plus, Trash2, Save } from "lucide-react";
import { toast } from "sonner";
import { useNavigate, useSearchParams } from "react-router-dom";
import { generateDocumentPDF } from "@/lib/pdf-generators";

interface DocItem {
  article_id: string;
  quantity: number;
  unit: string;
  note: string;
}

export default function NovaOtpremnica() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const qc = useQueryClient();
  const { profile } = useAuth();

  const [form, setForm] = useState({
    stock_location_id: "",
    project_id: searchParams.get("project") || "",
    recipient_name: "",
    recipient_address: "",
    issued_by: profile?.username || "",
    received_by: "",
    note: "",
    date: new Date().toLocaleDateString('sv-SE'),
  });

  const [items, setItems] = useState<DocItem[]>([
    { article_id: "", quantity: 1, unit: "kom", note: "" },
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

  const { data: perLocation } = useQuery({
    queryKey: ["inventory_per_location"],
    queryFn: async () => {
      const { data, error } = await supabase.from("inventory_current_per_location").select("*");
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

  // Default to first location
  useEffect(() => {
    if (locations && locations.length > 0 && !form.stock_location_id) {
      setForm(prev => ({ ...prev, stock_location_id: locations[0].id }));
    }
  }, [locations]);

  const selectedLocation = locations?.find(l => l.id === form.stock_location_id);
  const selectedLocationCode = selectedLocation?.code || "";

  const stockAtLocation = useMemo(() => {
    if (!perLocation || !selectedLocationCode) return new Map<string, number>();
    const map = new Map<string, number>();
    perLocation
      .filter(pl => pl.location_code === selectedLocationCode)
      .forEach(pl => {
        if (pl.article_id) map.set(pl.article_id, Number(pl.current_qty) || 0);
      });
    return map;
  }, [perLocation, selectedLocationCode]);

  const rowErrors = useMemo(() => {
    return items.map(item => {
      if (!item.article_id || !form.stock_location_id) return "";
      const available = stockAtLocation.get(item.article_id) || 0;
      if (item.quantity > available) {
        return `Nedovoljno na zalihi (dostupno: ${available} ${item.unit})`;
      }
      return "";
    });
  }, [items, stockAtLocation, form.stock_location_id]);

  const hasErrors = rowErrors.some(e => e !== "");

  const submit = useMutation({
    mutationFn: async () => {
      const validItems = items.filter(i => i.article_id && i.quantity > 0);
      if (!form.stock_location_id) throw new Error("Odaberite skladišnu lokaciju");
      if (!form.project_id) throw new Error("Odaberite projekt prije spremanja");
      if (validItems.length === 0) throw new Error("Dodajte barem jednu stavku");
      if (hasErrors) throw new Error("Ispravite greške prije spremanja");

      const result = await supabase.rpc("create_otpremnica", {
        p_stock_location_id: form.stock_location_id,
        p_date: form.date,
        p_project_id: form.project_id || undefined,
        p_recipient_name: form.recipient_name || undefined,
        p_recipient_address: form.recipient_address || undefined,
        p_issued_by: form.issued_by || undefined,
        p_received_by: form.received_by || undefined,
        p_note: form.note || undefined,
        p_items: validItems.map(i => ({
          article_id: i.article_id,
          quantity: i.quantity,
          unit: i.unit,
          note: i.note || null,
        })),
      });

      if (result.error) throw result.error;
      const data = result.data as { id: string; doc_number: string; date: string; recipient_name: string; recipient_address: string; issued_by: string; received_by: string };

      const project = projects?.find(p => p.id === form.project_id);
      generateDocumentPDF({
        title: "OTPREMNICA",
        doc_number: data.doc_number,
        date: data.date || form.date,
        leftLabel1: "Primatelj",
        leftValue1: data.recipient_name || form.recipient_name,
        leftLabel2: "Adresa",
        leftValue2: data.recipient_address || form.recipient_address || undefined,
        rightLabel: "Projekt / Lokacija",
        rightValue: [project?.name, selectedLocationCode].filter(Boolean).join(" / Lok. "),
        sigLeftLabel: "Izdao",
        sigLeftValue: data.issued_by || form.issued_by,
        sigRightLabel: "Primio",
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

      return data.doc_number;
    },
    onSuccess: (docNumber) => {
      qc.invalidateQueries({ queryKey: ["inventory_current"] });
      qc.invalidateQueries({ queryKey: ["inventory_per_location"] });
      toast.success(`Otpremnica ${docNumber} uspješno kreirana`);
      navigate("/");
    },
    onError: (e: any) => {
      console.error("Otpremnica error:", e);
      const msg = e?.message || e?.details || "Nepoznata greška pri spremanju otpremnice";
      toast.error(msg, { duration: 8000 });
    },
  });

  const addItem = () => setItems([...items, { article_id: "", quantity: 1, unit: "kom", note: "" }]);
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

  return (
    <AppLayout title="Nova otpremnica">
      <form onSubmit={(e) => { e.preventDefault(); submit.mutate(); }} className="space-y-6 max-w-5xl">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground mb-4">Broj otpremnice će biti automatski generiran pri spremanju</p>
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
              <Label>Projekt *</Label>
              <Select value={form.project_id} onValueChange={v => setForm({ ...form, project_id: v })}>
                <SelectTrigger><SelectValue placeholder="Odaberi projekt" /></SelectTrigger>
                <SelectContent>
                  {projects?.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <div><Label>Primatelj naziv</Label><Input value={form.recipient_name} onChange={e => setForm({ ...form, recipient_name: e.target.value })} /></div>
            <div><Label>Primatelj adresa</Label><Input value={form.recipient_address} onChange={e => setForm({ ...form, recipient_address: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <div><Label>Izdao</Label><Input value={form.issued_by} onChange={e => setForm({ ...form, issued_by: e.target.value })} /></div>
            <div><Label>Primio</Label><Input value={form.received_by} onChange={e => setForm({ ...form, received_by: e.target.value })} /></div>
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

          {!form.stock_location_id && (
            <p className="text-sm text-muted-foreground">Odaberite skladišnu lokaciju za prikaz dostupnih količina</p>
          )}

          <div className="rounded-lg border bg-card overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[280px]">Artikl</TableHead>
                  <TableHead className="w-24">Količina</TableHead>
                  <TableHead className="w-20">JMJ</TableHead>
                  <TableHead>Napomena</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item, idx) => {
                  const available = item.article_id ? (stockAtLocation.get(item.article_id) || 0) : 0;
                  return (
                    <TableRow key={idx}>
                      <TableCell>
                        <Select value={item.article_id} onValueChange={v => updateItem(idx, "article_id", v)}>
                          <SelectTrigger><SelectValue placeholder="Odaberi artikl" /></SelectTrigger>
                          <SelectContent>
                            {articles?.map(a => {
                              const stock = stockAtLocation.get(a.id) || 0;
                              return (
                                <SelectItem key={a.id} value={a.id}>
                                  {a.code} — {a.name} {form.stock_location_id ? `(dostupno: ${stock} ${a.unit})` : ""}
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                        {rowErrors[idx] && (
                          <p className="text-xs text-destructive mt-1">{rowErrors[idx]}</p>
                        )}
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min="1"
                          step="1"
                          value={item.quantity}
                          onChange={e => updateItem(idx, "quantity", Math.max(1, Math.round(Number(e.target.value))))}
                        />
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">{item.unit}</span>
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
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>

        <Button type="submit" size="lg" disabled={submit.isPending || hasErrors} className="w-full md:w-auto">
          <Save className="mr-2 h-4 w-4" />
          {submit.isPending ? "Spremanje..." : "Spremi otpremnicu i generiraj PDF"}
        </Button>
      </form>
    </AppLayout>
  );
}
