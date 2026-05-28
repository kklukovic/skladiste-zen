import { AppLayout } from "@/components/AppLayout";
import { formatCurrency } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState, useMemo } from "react";
import { Download, FileDown, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { generateInventoryPDF, generateProjectReportPDF, generateDocumentPDF, formatDateHR } from "@/lib/pdf-generators";

function exportExcel(headers: string[], rows: (string | number)[][], filename: string) {
  const csv = [headers.join(","), ...rows.map(r => r.map(v => `"${v}"`).join(","))].join("\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `${filename}.csv`; a.click(); URL.revokeObjectURL(url);
}

export default function Reports() {
  const [locFilter, setLocFilter] = useState("all");
  const [catFilter, setCatFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [articleFilter, setArticleFilter] = useState("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [txnLocFilter, setTxnLocFilter] = useState("all");
  const [reportProject, setReportProject] = useState("");
  const [stornoDialog, setStornoDialog] = useState<{ docId: string; docNumber: string; type: "otpremnica" | "primka" } | null>(null);
  const [deleteItemDialog, setDeleteItemDialog] = useState<{ documentItemId: string; docNumber: string; articleName: string } | null>(null);
  const [invoiceDialog, setInvoiceDialog] = useState<{ itemId: string; quantity: number; fakturirana_kolicina: string; racun_broj: string; racun_datum: string } | null>(null);

  const qc = useQueryClient();

  const { data: inventory } = useQuery({
    queryKey: ["inventory_current"],
    queryFn: async () => { const { data, error } = await supabase.from("inventory_current").select("*"); if (error) throw error; return data; },
  });
  const { data: perLocation } = useQuery({
    queryKey: ["inventory_per_location"],
    queryFn: async () => { const { data, error } = await supabase.from("inventory_current_per_location").select("*"); if (error) throw error; return data; },
  });
  const { data: locations } = useQuery({
    queryKey: ["stock_locations"],
    queryFn: async () => { const { data, error } = await supabase.from("stock_locations").select("*").order("code"); if (error) throw error; return data; },
  });
  const { data: articles } = useQuery({
    queryKey: ["articles"],
    queryFn: async () => { const { data, error } = await supabase.from("articles").select("*").order("code"); if (error) throw error; return data; },
  });
  const { data: transactions } = useQuery({
    queryKey: ["inventory_transactions_full"],
    queryFn: async () => { const { data, error } = await supabase.from("inventory_transactions").select("*").order("created_at", { ascending: false }); if (error) throw error; return data; },
  });
  const { data: documents } = useQuery({
    queryKey: ["documents_full"],
    queryFn: async () => { const { data, error } = await supabase.from("documents").select("*"); if (error) throw error; return data; },
  });
  const { data: documentItems } = useQuery({
    queryKey: ["document_items_all"],
    queryFn: async () => { const { data, error } = await supabase.from("document_items").select("*"); if (error) throw error; return data; },
  });
  const { data: projects } = useQuery({
    queryKey: ["projects"],
    queryFn: async () => { const { data, error } = await supabase.from("projects").select("*").order("name"); if (error) throw error; return data; },
  });
  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: async () => { const { data, error } = await supabase.from("settings").select("*").single(); if (error) throw error; return data; },
  });

  const company = {
    name: settings?.company_name || "COREX ING d.o.o.",
    oib: settings?.company_oib || "17193431064",
    address: settings?.company_address || "Međimurska ulica 23",
    city: settings?.company_city || "42000 Varaždin",
  };

  // === TAB 1: Stanje zalihe ===
  const categories = useMemo(() => {
    const cats = new Set(inventory?.map(i => i.category).filter(Boolean));
    return Array.from(cats) as string[];
  }, [inventory]);

  const stockData = useMemo(() => {
    let data: typeof inventory = [];
    if (locFilter === "all") {
      data = inventory || [];
    } else {
      const loc = locations?.find(l => l.code === locFilter);
      if (loc && perLocation) {
        data = perLocation
          .filter(pl => pl.location_code === locFilter)
          .map(pl => {
            const inv = inventory?.find(i => i.id === pl.article_id);
            return {
              id: pl.article_id, code: pl.code, name: pl.name, unit: pl.unit,
              category: inv?.category ?? null, purchase_price: pl.purchase_price,
              average_cost: inv?.average_cost ?? 0,
              min_quantity: inv?.min_quantity ?? 0,
              current_qty: pl.current_qty,
              current_value: (Number(pl.current_qty) || 0) * (Number(pl.purchase_price) || 0),
            };
          });
      }
    }
    if (catFilter !== "all") data = data?.filter(d => d.category === catFilter);
    return data || [];
  }, [inventory, perLocation, locFilter, catFilter, locations]);

  const stockTotal = stockData.reduce((s, i) => s + (Number(i.current_value) || 0), 0);
  const locationName = locFilter === "all" ? undefined : locations?.find(l => l.code === locFilter)?.name;

  // === TAB 2: Prometni list ===
  const typeBadge: Record<string, { label: string; className: string }> = {
    in: { label: "PRIMKA", className: "bg-primary text-primary-foreground" },
    primka: { label: "PRIMKA", className: "bg-primary text-primary-foreground" },
    out: { label: "OTPREMNICA", className: "bg-blue-500 text-primary-foreground" },
    otpremnica: { label: "OTPREMNICA", className: "bg-blue-500 text-primary-foreground" },
    return: { label: "POVRATNICA", className: "bg-[hsl(30,90%,50%)] text-primary-foreground" },
    povratnica: { label: "POVRATNICA", className: "bg-[hsl(30,90%,50%)] text-primary-foreground" },
    opening_balance: { label: "POČETNO STANJE", className: "bg-muted text-muted-foreground" },
    adjustment_in: { label: "KOREKCIJA +", className: "bg-primary/70 text-primary-foreground" },
    adjustment_out: { label: "KOREKCIJA -", className: "bg-destructive/70 text-primary-foreground" },
    storno_otpremnice: { label: "STORNO OTP.", className: "bg-red-700 text-white" },
    storno_primka: { label: "STORNO PRM.", className: "bg-red-700 text-white" },
  };

  const filteredTxns = useMemo(() => {
    let txns = transactions || [];
    if (dateFrom || dateTo) {
      txns = txns.filter(t => {
        const doc = documents?.find(d => d.id === t.document_id);
        const docDate = doc?.date;
        if (!docDate) return true;
        if (dateFrom && docDate < dateFrom) return false;
        if (dateTo && docDate > dateTo) return false;
        return true;
      });
    }
    txns = txns.filter(t => !(t.type === "opening_balance" && Number(t.quantity) === 0));
    if (typeFilter !== "all") txns = txns.filter(t => t.type === typeFilter);
    if (articleFilter !== "all") txns = txns.filter(t => t.article_id === articleFilter);
    if (projectFilter !== "all") txns = txns.filter(t => t.project_id === projectFilter);
    if (txnLocFilter !== "all") {
      const loc = locations?.find(l => l.code === txnLocFilter);
      if (loc) txns = txns.filter(t => t.stock_location_id === loc.id);
    }
    return [...txns].sort((a, b) => {
      const dateA = documents?.find(d => d.id === a.document_id)?.date || a.created_at || "";
      const dateB = documents?.find(d => d.id === b.document_id)?.date || b.created_at || "";
      return dateB.localeCompare(dateA);
    });
  }, [transactions, documents, dateFrom, dateTo, typeFilter, articleFilter, projectFilter, txnLocFilter, locations]);

  // === TAB 3: Izvještaj po projektu ===
  const projectReport = useMemo(() => {
    if (!reportProject || !transactions || !articles || !documents) return null;
    const projectTxns = transactions.filter(t => t.project_id === reportProject);
    const project = projects?.find(p => p.id === reportProject);
    if (!project) return null;

    const materialMap = new Map<string, { issued: number; returned: number }>();
    projectTxns.forEach(t => {
      const cur = materialMap.get(t.article_id) || { issued: 0, returned: 0 };
      if (t.type === "out") cur.issued += Number(t.quantity);
      if (t.type === "return") cur.returned += Number(t.quantity);
      materialMap.set(t.article_id, cur);
    });

    const items = Array.from(materialMap.entries()).map(([aid, d]) => {
      const a = articles.find(ar => ar.id === aid);
      return { code: a?.code || "", name: a?.name || "", unit: a?.unit || "", issued: d.issued, returned: d.returned, net: d.issued - d.returned };
    });

    const projectDocs = documents.filter(d => d.project_id === reportProject);
    const dates = projectDocs.map(d => d.date).sort();
    const period = dates.length > 0 ? `${formatDateHR(dates[0])} - ${formatDateHR(dates[dates.length - 1])}` : "—";

    return { project, items, period, totals: {
      issued: items.reduce((s, i) => s + i.issued, 0),
      returned: items.reduce((s, i) => s + i.returned, 0),
      net: items.reduce((s, i) => s + i.net, 0),
    }};
  }, [reportProject, transactions, articles, documents, projects]);

  // Set of document IDs that are the first occurrence in the sorted filtered list
  const firstOccurrenceDocIds = useMemo(() => {
    const seen = new Set<string>();
    const first = new Set<string>();
    filteredTxns.forEach(t => {
      if (t.document_id && !seen.has(t.document_id)) {
        seen.add(t.document_id);
        first.add(t.document_id);
      }
    });
    return first;
  }, [filteredTxns]);

  // === TAB: Nefakturirano ===
  const nefakturiranoByProject = useMemo(() => {
    if (!documentItems || !documents || !articles || !projects) return [];
    const otpremnicaDocs = new Map<string, (typeof documents)[0]>();
    documents.forEach(d => {
      if (d.type === "otpremnica" && d.status !== "stornoed") otpremnicaDocs.set(d.id, d);
    });
    const items = documentItems
      .filter(di => {
        const fk = Number(di.fakturirana_kolicina) || 0;
        const qty = Number(di.quantity) || 0;
        return otpremnicaDocs.has(di.document_id) && fk < qty;
      })
      .map(di => {
        const doc = otpremnicaDocs.get(di.document_id);
        const article = articles.find(a => a.id === di.article_id);
        const project = projects.find(p => p.id === doc?.project_id);
        return { di, doc, article, project };
      })
      .sort((a, b) => (a.doc?.date || "").localeCompare(b.doc?.date || ""));
    const groups = new Map<string, { project: (typeof projects)[0] | undefined; items: typeof items }>();
    items.forEach(item => {
      const key = item.project?.id || "__no_project__";
      if (!groups.has(key)) groups.set(key, { project: item.project, items: [] });
      groups.get(key)!.items.push(item);
    });
    return Array.from(groups.values());
  }, [documentItems, documents, articles, projects]);

  const stornoMutation = useMutation({
    mutationFn: async ({ docId, type }: { docId: string; type: "otpremnica" | "primka" }) => {
      const rpc = type === "otpremnica" ? "storno_otpremnice" : "storno_primke";
      const { data, error } = await supabase.rpc(rpc, { p_document_id: docId });
      if (error) throw error;
      return data as { doc_number: string };
    },
    onSuccess: (data) => {
      toast.success(`Storno dokumenta kreiran: ${data.doc_number}`);
      setStornoDialog(null);
      qc.invalidateQueries({ queryKey: ["documents_full"] });
      qc.invalidateQueries({ queryKey: ["inventory_transactions_full"] });
      qc.invalidateQueries({ queryKey: ["inventory_current"] });
      qc.invalidateQueries({ queryKey: ["inventory_per_location"] });
    },
    onError: (err: Error) => {
      toast.error(`Greška: ${err.message}`);
    },
  });

  const deleteItemMutation = useMutation({
    mutationFn: async (documentItemId: string) => {
      const { error } = await supabase.rpc("delete_primka_item", { p_document_item_id: documentItemId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Stavka primke uspješno obrisana");
      setDeleteItemDialog(null);
      qc.invalidateQueries({ queryKey: ["documents_full"] });
      qc.invalidateQueries({ queryKey: ["inventory_transactions_full"] });
      qc.invalidateQueries({ queryKey: ["inventory_current"] });
      qc.invalidateQueries({ queryKey: ["inventory_per_location"] });
    },
    onError: (err: Error) => {
      toast.error(`Greška: ${err.message}`);
    },
  });

  const updateInvoiceMutation = useMutation({
    mutationFn: async ({ itemId, fakturirana_kolicina, racun_broj, racun_datum }: {
      itemId: string; fakturirana_kolicina: number; racun_broj: string | null; racun_datum: string | null;
    }) => {
      const { error } = await supabase.from("document_items").update({ fakturirana_kolicina, racun_broj: racun_broj || null, racun_datum: racun_datum || null }).eq("id", itemId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Fakturiranje ažurirano");
      setInvoiceDialog(null);
      qc.invalidateQueries({ queryKey: ["document_items_all"] });
    },
    onError: (err: Error) => { toast.error(`Greška: ${err.message}`); },
  });

  function handleDocumentPDF(documentId: string) {
    const doc = documents?.find(d => d.id === documentId);
    if (!doc) return;
    const docTxns = (transactions || []).filter(t => t.document_id === documentId);
    const project = projects?.find(p => p.id === doc.project_id);
    const location = locations?.find(l => l.id === doc.stock_location_id);

    const titleMap: Record<string, string> = {
      out: "OTPREMNICA", otpremnica: "OTPREMNICA",
      return: "POVRATNICA", povratnica: "POVRATNICA",
      in: "PRIMKA", primka: "PRIMKA",
    };
    const title = titleMap[doc.type] || doc.type.toUpperCase();

    let leftLabel1 = "Primatelj", leftValue1 = doc.recipient_name || "-";
    let leftLabel2: string | undefined, leftValue2: string | undefined;
    let rightLabel = "Projekt / Lokacija";
    let rightValue = [project?.name, location ? `Lok. ${location.code}` : ""].filter(Boolean).join(" / ");
    let sigLeftLabel = "Izdao", sigLeftValue = doc.issued_by || "";
    let sigRightLabel = "Primio", sigRightValue = doc.received_by || "";

    if (doc.type === "return" || doc.type === "povratnica") {
      leftLabel1 = "Projekt"; leftValue1 = project?.name || "-";
      leftLabel2 = "Adresa"; leftValue2 = (project as any)?.site_address || undefined;
      rightLabel = "Lokacija povrata";
      rightValue = location ? `${location.name} (${location.code})` : "-";
      sigLeftLabel = "Vratio"; sigRightLabel = "Preuzeo";
    } else if (doc.type === "in" || doc.type === "primka") {
      leftLabel1 = "Dobavljač"; leftValue1 = doc.recipient_name || "-";
      rightLabel = "Lokacija";
      rightValue = location ? `${location.name} (${location.code})` : "-";
      sigLeftLabel = "Primio"; sigRightLabel = "Dokument pripremio";
    } else {
      leftLabel2 = "Adresa"; leftValue2 = doc.recipient_address || undefined;
    }

    generateDocumentPDF({
      title, doc_number: doc.doc_number, date: doc.date,
      leftLabel1, leftValue1, leftLabel2, leftValue2,
      rightLabel, rightValue,
      sigLeftLabel, sigLeftValue, sigRightLabel, sigRightValue,
      items: docTxns.map((t, idx) => {
        const a = articles?.find(ar => ar.id === t.article_id);
        return { index: idx + 1, code: a?.code || "", name: a?.name || "", unit: a?.unit || "", quantity: Number(t.quantity) };
      }),
      company,
    });
  }

  return (
    <AppLayout title="Izvještaji">
      <Tabs defaultValue="stanje" className="space-y-4">
        <TabsList>
          <TabsTrigger value="stanje">Stanje zalihe</TabsTrigger>
          <TabsTrigger value="prometni">Prometni list</TabsTrigger>
          <TabsTrigger value="projekt">Izvještaj po projektu</TabsTrigger>
          <TabsTrigger value="nefakturirano">Nefakturirano</TabsTrigger>
        </TabsList>

        {/* TAB 1 */}
        <TabsContent value="stanje" className="space-y-4">
          <p className="text-sm text-muted-foreground">Prikaz trenutnog stanja zalihe — prikladno za inspekciju</p>
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <Label className="text-xs">Lokacija</Label>
              <Select value={locFilter} onValueChange={setLocFilter}>
                <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Sve lokacije</SelectItem>
                  {locations?.map(l => <SelectItem key={l.id} value={l.code}>{l.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Kategorija</Label>
              <Select value={catFilter} onValueChange={setCatFilter}>
                <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Sve kategorije</SelectItem>
                  {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" size="sm" onClick={() => {
              generateInventoryPDF({
                company, locationName,
                items: stockData.map(i => ({
                  code: i.code || "", name: i.name || "", unit: i.unit || "",
                  qty: Number(i.current_qty) || 0, price: Number(i.purchase_price) || 0,
                  value: Number(i.current_value) || 0,
                })),
                totalValue: stockTotal,
              });
            }}>
              <Download className="mr-1 h-4 w-4" />PDF
            </Button>
            <Button variant="outline" size="sm" onClick={() => {
              exportExcel(
                ["Šifra", "Naziv", "JMJ", "Količina", "Nab. cijena", "Vrijednost"],
                stockData.map(i => [i.code || "", i.name || "", i.unit || "",
                  Number(i.current_qty || 0).toFixed(2), Number(i.purchase_price || 0).toFixed(2),
                  Number(i.current_value || 0).toFixed(2)]),
                `stanje_zalihe_${new Date().toISOString().slice(0, 10)}`
              );
            }}>
              <Download className="mr-1 h-4 w-4" />Excel
            </Button>
          </div>

          <div className="rounded-lg border bg-card overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Šifra</TableHead><TableHead>Naziv</TableHead><TableHead>JMJ</TableHead>
                  <TableHead className="text-right">Trenutna količina</TableHead>
                  <TableHead className="text-right">Nabavna cijena</TableHead>
                  <TableHead className="text-right">Ukupna vrijednost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stockData.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Nema podataka</TableCell></TableRow>
                ) : (
                  <>
                    {stockData.map((i, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-mono text-sm">{i.code}</TableCell>
                        <TableCell className="font-medium">{i.name}</TableCell>
                        <TableCell>{i.unit}</TableCell>
                        <TableCell className="text-right">{Number(i.current_qty || 0).toFixed(2)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(Number(i.purchase_price || 0))}</TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(Number(i.current_value || 0))}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="font-bold border-t-2">
                      <TableCell colSpan={5} className="text-right">Ukupna vrijednost zalihe:</TableCell>
                      <TableCell className="text-right">{formatCurrency(stockTotal)}</TableCell>
                    </TableRow>
                  </>
                )}
              </TableBody>
            </Table>
          </div>
          <p className="text-xs text-muted-foreground">
            Stanje na dan: {new Date().toLocaleDateString("hr")} {new Date().toLocaleTimeString("hr")}
          </p>
        </TabsContent>

        {/* TAB 2 */}
        <TabsContent value="prometni" className="space-y-4">
          <p className="text-sm text-muted-foreground">Pregled svih kretanja robe</p>
          <div className="flex flex-wrap gap-3 items-end">
            <div><Label className="text-xs">Datum od</Label><Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-[150px]" /></div>
            <div><Label className="text-xs">Datum do</Label><Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-[150px]" /></div>
            <div>
              <Label className="text-xs">Tip</Label>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Svi tipovi</SelectItem>
                  <SelectItem value="in">Primka</SelectItem>
                  <SelectItem value="out">Otpremnica</SelectItem>
                  <SelectItem value="return">Povratnica</SelectItem>
                  <SelectItem value="opening_balance">Početno stanje</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Artikl</Label>
              <Select value={articleFilter} onValueChange={setArticleFilter}>
                <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Svi artikli</SelectItem>
                  {articles?.map(a => <SelectItem key={a.id} value={a.id}>{a.code} — {a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Projekt</Label>
              <Select value={projectFilter} onValueChange={setProjectFilter}>
                <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Svi projekti</SelectItem>
                  {projects?.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Lokacija</Label>
              <Select value={txnLocFilter} onValueChange={setTxnLocFilter}>
                <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Sve</SelectItem>
                  {locations?.map(l => <SelectItem key={l.id} value={l.code}>{l.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" size="sm" onClick={() => {
              exportExcel(
                ["Datum", "Tip", "Dokument br.", "Artikl", "Šifra", "Količina", "Projekt", "Lokacija"],
                filteredTxns.map(t => {
                  const a = articles?.find(ar => ar.id === t.article_id);
                  const d = documents?.find(doc => doc.id === t.document_id);
                  const p = projects?.find(pr => pr.id === t.project_id);
                  const l = locations?.find(lo => lo.id === t.stock_location_id);
                  return [
                    t.created_at ? new Date(t.created_at).toLocaleDateString("hr") : "",
                    t.type, d?.doc_number || "", a?.name || "", a?.code || "",
                    Number(t.quantity).toFixed(2), p?.name || "", l?.code || "",
                  ];
                }),
                `prometni_list_${new Date().toISOString().slice(0, 10)}`
              );
            }}>
              <Download className="mr-1 h-4 w-4" />Excel
            </Button>
          </div>

          <div className="rounded-lg border bg-card overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Datum</TableHead><TableHead>Tip</TableHead><TableHead>Dokument br.</TableHead>
                  <TableHead>Artikl</TableHead><TableHead>Šifra</TableHead>
                  <TableHead className="text-right">Količina</TableHead>
                  <TableHead>Projekt</TableHead><TableHead>Lokacija</TableHead>
                  <TableHead className="text-center w-28">Fakt.</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTxns.length === 0 ? (
                  <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">Nema podataka</TableCell></TableRow>
                ) : (
                  filteredTxns.map(t => {
                    const a = articles?.find(ar => ar.id === t.article_id);
                    const d = documents?.find(doc => doc.id === t.document_id);
                    const p = projects?.find(pr => pr.id === t.project_id);
                    const l = locations?.find(lo => lo.id === t.stock_location_id);
                    const tb = typeBadge[t.type] || { label: t.type, className: "bg-muted text-muted-foreground" };
                    const isStornoed = d?.status === "stornoed";
                    const isFirstForDoc = t.document_id ? firstOccurrenceDocIds.has(t.document_id) : false;
                    const canStorno = isFirstForDoc && !isStornoed && (d?.type === "otpremnica" || d?.type === "primka");
                    const canDeletePrimkaItem = t.type === "in" && d?.type === "primka" && !isStornoed && !!t.document_item_id;
                    const di = (t.type === "out" && t.document_item_id) ? documentItems?.find(i => i.id === t.document_item_id) : undefined;
                    const fk = Number(di?.fakturirana_kolicina) || 0;
                    const diqty = Number(di?.quantity) || 0;
                    return (
                      <TableRow key={t.id} className={isStornoed ? "opacity-50 line-through" : ""}>
                        <TableCell>{d?.date ? formatDateHR(d.date) : (t.created_at ? new Date(t.created_at).toLocaleDateString("hr") : "")}</TableCell>
                        <TableCell>
                          <Badge className={tb.className}>{tb.label}</Badge>
                          {isStornoed && <span className="ml-1 text-xs text-destructive font-semibold">STORNO</span>}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          <span className="flex items-center gap-1.5">
                            {d?.doc_number || "—"}
                            {(d?.type === "otpremnica" || d?.type === "out") && (
                              d?.racun_broj
                                ? <span className="inline-flex items-center rounded px-1 py-0 text-[10px] font-bold bg-green-100 text-green-700 border border-green-300" title={`Račun: ${d.racun_broj}`}>R</span>
                                : <span className="inline-flex items-center rounded px-1 py-0 text-[10px] font-bold bg-orange-100 text-orange-700 border border-orange-300" title="Nema računa">NR</span>
                            )}
                          </span>
                        </TableCell>
                        <TableCell className="font-medium">{a?.name || ""}</TableCell>
                        <TableCell className="font-mono text-sm">{a?.code || ""}</TableCell>
                        <TableCell className="text-right">{Number(t.quantity).toFixed(2)}</TableCell>
                        <TableCell>{p?.name || "—"}</TableCell>
                        <TableCell>{l?.code || ""}</TableCell>
                        <TableCell className="text-center">
                          {di && (
                            <span className="flex items-center gap-1 justify-center">
                              {fk === 0
                                ? <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold bg-orange-100 text-orange-700 border border-orange-300">NF</span>
                                : fk < diqty
                                  ? <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold bg-yellow-100 text-yellow-700 border border-yellow-300">DJELOMIČNO</span>
                                  : <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold bg-green-100 text-green-700 border border-green-300">F</span>
                              }
                              <Button variant="ghost" size="icon" className="h-6 w-6" title="Uredi fakturiranje"
                                onClick={() => setInvoiceDialog({ itemId: t.document_item_id!, quantity: diqty, fakturirana_kolicina: String(fk), racun_broj: di.racun_broj || "", racun_datum: di.racun_datum || "" })}
                              >
                                <Pencil className="h-3 w-3" />
                              </Button>
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="flex gap-1 justify-end">
                          {d && (
                            <Button variant="ghost" size="icon" className="h-7 w-7" title={`Preuzmi PDF: ${d.doc_number}`} onClick={() => handleDocumentPDF(d.id)}>
                              <FileDown className="h-4 w-4" />
                            </Button>
                          )}
                          {canStorno && (
                            <Button
                              variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                              title={`Storniraj: ${d!.doc_number}`}
                              onClick={() => setStornoDialog({ docId: d!.id, docNumber: d!.doc_number, type: d!.type as "otpremnica" | "primka" })}
                            >
                              <RotateCcw className="h-4 w-4" />
                            </Button>
                          )}
                          {canDeletePrimkaItem && (
                            <Button
                              variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                              title="Obriši stavku primke"
                              onClick={() => setDeleteItemDialog({
                                documentItemId: t.document_item_id!,
                                docNumber: d!.doc_number,
                                articleName: a?.name || "",
                              })}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* TAB 3 */}
        <TabsContent value="projekt" className="space-y-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <Label className="text-xs">Projekt</Label>
              <Select value={reportProject} onValueChange={setReportProject}>
                <SelectTrigger className="w-[250px]"><SelectValue placeholder="Odaberi projekt" /></SelectTrigger>
                <SelectContent>
                  {projects?.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {projectReport && (
              <>
                <Button variant="outline" size="sm" onClick={() => {
                  generateProjectReportPDF({
                    company,
                    project: {
                      name: projectReport.project.name,
                      address: projectReport.project.site_address || undefined,
                      status: projectReport.project.status || "active",
                      period: projectReport.period,
                    },
                    items: projectReport.items,
                    totals: projectReport.totals,
                  });
                }}>
                  <Download className="mr-1 h-4 w-4" />PDF
                </Button>
                <Button variant="outline" size="sm" onClick={() => {
                  exportExcel(
                    ["Šifra", "Naziv", "JMJ", "Izdano", "Vraćeno", "Neto utrošak"],
                    [
                      ...projectReport.items.map(i => [i.code, i.name, i.unit, i.issued.toFixed(2), i.returned.toFixed(2), i.net.toFixed(2)]),
                      ["", "UKUPNO", "", projectReport.totals.issued.toFixed(2), projectReport.totals.returned.toFixed(2), projectReport.totals.net.toFixed(2)],
                    ],
                    `izvjestaj_${projectReport.project.name.replace(/\s/g, "_")}_${new Date().toISOString().slice(0, 10)}`
                  );
                }}>
                  <Download className="mr-1 h-4 w-4" />Excel
                </Button>
              </>
            )}
          </div>

          {projectReport && (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>{projectReport.project.name}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm space-y-1">
                  {projectReport.project.site_address && <p>Adresa: {projectReport.project.site_address}</p>}
                  <p>Status: <Badge className={projectReport.project.status === "active" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}>{projectReport.project.status === "active" ? "Aktivan" : projectReport.project.status === "completed" ? "Završen" : "Arhiviran"}</Badge></p>
                  <p>Razdoblje: {projectReport.period}</p>
                </CardContent>
              </Card>

              <div className="rounded-lg border bg-card overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Šifra</TableHead><TableHead>Naziv</TableHead><TableHead>JMJ</TableHead>
                      <TableHead className="text-right">Izdano</TableHead>
                      <TableHead className="text-right">Vraćeno</TableHead>
                      <TableHead className="text-right">Neto utrošak</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {projectReport.items.length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Nema materijala</TableCell></TableRow>
                    ) : (
                      <>
                        {projectReport.items.map((r, i) => (
                          <TableRow key={i}>
                            <TableCell className="font-mono text-sm">{r.code}</TableCell>
                            <TableCell className="font-medium">{r.name}</TableCell>
                            <TableCell>{r.unit}</TableCell>
                            <TableCell className="text-right">{r.issued.toFixed(2)}</TableCell>
                            <TableCell className="text-right">{r.returned.toFixed(2)}</TableCell>
                            <TableCell className="text-right font-medium">{r.net.toFixed(2)}</TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="font-bold border-t-2">
                          <TableCell colSpan={3}>UKUPNO</TableCell>
                          <TableCell className="text-right">{projectReport.totals.issued.toFixed(2)}</TableCell>
                          <TableCell className="text-right">{projectReport.totals.returned.toFixed(2)}</TableCell>
                          <TableCell className="text-right">{projectReport.totals.net.toFixed(2)}</TableCell>
                        </TableRow>
                      </>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {!reportProject && <p className="text-sm text-muted-foreground">Odaberite projekt za prikaz izvještaja</p>}
        </TabsContent>
        {/* TAB 4: Nefakturirano */}
        <TabsContent value="nefakturirano" className="space-y-4">
          <p className="text-sm text-muted-foreground">Stavke otpremnica koje nisu u potpunosti fakturirane</p>
          {nefakturiranoByProject.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">Nema nefakturiranih stavki</p>
          ) : (
            nefakturiranoByProject.map((group, gi) => (
              <div key={gi} className="space-y-2">
                <h3 className="text-base font-semibold">{group.project?.name || "— Bez projekta"}</h3>
                <div className="rounded-lg border bg-card overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Datum otpremnice</TableHead>
                        <TableHead>Projekt</TableHead>
                        <TableHead>Artikl</TableHead>
                        <TableHead>Šifra</TableHead>
                        <TableHead className="text-right">Isporučeno</TableHead>
                        <TableHead className="text-right">Fakturirano</TableHead>
                        <TableHead className="text-right">Razlika</TableHead>
                        <TableHead>Broj računa</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {group.items.map((item, idx) => {
                        const itemFk = Number(item.di.fakturirana_kolicina) || 0;
                        const itemQty = Number(item.di.quantity) || 0;
                        return (
                          <TableRow key={idx}>
                            <TableCell>{item.doc?.date ? formatDateHR(item.doc.date) : "—"}</TableCell>
                            <TableCell>{item.project?.name || "—"}</TableCell>
                            <TableCell className="font-medium">{item.article?.name || "—"}</TableCell>
                            <TableCell className="font-mono text-sm">{item.article?.code || "—"}</TableCell>
                            <TableCell className="text-right">{itemQty.toFixed(2)}</TableCell>
                            <TableCell className="text-right">{itemFk.toFixed(2)}</TableCell>
                            <TableCell className="text-right font-medium">{(itemQty - itemFk).toFixed(2)}</TableCell>
                            <TableCell className="font-mono text-sm">{item.di.racun_broj || "—"}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ))
          )}
        </TabsContent>
      </Tabs>
      <Dialog open={!!stornoDialog} onOpenChange={open => { if (!open) setStornoDialog(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Potvrda storna</DialogTitle>
            <DialogDescription>
              {stornoDialog && (
                <>
                  Jeste li sigurni da želite stornirati dokument{" "}
                  <strong>{stornoDialog.docNumber}</strong>?
                  <br /><br />
                  {stornoDialog.type === "otpremnica"
                    ? "Kreirati će se storno otpremnice koja vraća svu robu natrag na zalihu."
                    : "Kreirati će se storno primke koja uklanja svu robu sa zalihe i recalkulira AVCO."}
                  <br /><br />
                  <span className="text-destructive font-medium">Ova radnja se ne može poništiti.</span>
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStornoDialog(null)} disabled={stornoMutation.isPending}>
              Odustani
            </Button>
            <Button
              variant="destructive"
              disabled={stornoMutation.isPending}
              onClick={() => stornoDialog && stornoMutation.mutate({ docId: stornoDialog.docId, type: stornoDialog.type })}
            >
              {stornoMutation.isPending ? "Storniranje..." : "Potvrdi storno"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={!!deleteItemDialog} onOpenChange={open => { if (!open) setDeleteItemDialog(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Brisanje stavke primke</DialogTitle>
            <DialogDescription>
              {deleteItemDialog && (
                <>
                  Jeste li sigurni da želite obrisati stavku{" "}
                  <strong>{deleteItemDialog.articleName}</strong> iz primke{" "}
                  <strong>{deleteItemDialog.docNumber}</strong>?
                  <br /><br />
                  Vezana inventurna transakcija bit će izbrisana i AVCO za taj artikl bit će recalkuliran.
                  <br /><br />
                  <span className="text-destructive font-medium">Ova radnja se ne može poništiti.</span>
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteItemDialog(null)} disabled={deleteItemMutation.isPending}>
              Odustani
            </Button>
            <Button
              variant="destructive"
              disabled={deleteItemMutation.isPending}
              onClick={() => deleteItemDialog && deleteItemMutation.mutate(deleteItemDialog.documentItemId)}
            >
              {deleteItemMutation.isPending ? "Brisanje..." : "Obriši stavku"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={!!invoiceDialog} onOpenChange={open => { if (!open) setInvoiceDialog(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Uredi fakturiranje stavke</DialogTitle>
            <DialogDescription>Unesite podatke o fakturiranju za ovu stavku otpremnice.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs">Fakturirana količina (maks. {invoiceDialog?.quantity.toFixed(2)})</Label>
              <Input
                type="number" min="0" max={invoiceDialog?.quantity} step="0.01"
                value={invoiceDialog?.fakturirana_kolicina ?? ""}
                onChange={e => setInvoiceDialog(prev => prev ? { ...prev, fakturirana_kolicina: e.target.value } : null)}
              />
            </div>
            <div>
              <Label className="text-xs">Broj računa</Label>
              <Input
                type="text"
                value={invoiceDialog?.racun_broj ?? ""}
                onChange={e => setInvoiceDialog(prev => prev ? { ...prev, racun_broj: e.target.value } : null)}
              />
            </div>
            <div>
              <Label className="text-xs">Datum računa</Label>
              <Input
                type="date"
                value={invoiceDialog?.racun_datum ?? ""}
                onChange={e => setInvoiceDialog(prev => prev ? { ...prev, racun_datum: e.target.value } : null)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInvoiceDialog(null)} disabled={updateInvoiceMutation.isPending}>
              Odustani
            </Button>
            <Button
              disabled={updateInvoiceMutation.isPending}
              onClick={() => {
                if (!invoiceDialog) return;
                updateInvoiceMutation.mutate({
                  itemId: invoiceDialog.itemId,
                  fakturirana_kolicina: Number(invoiceDialog.fakturirana_kolicina) || 0,
                  racun_broj: invoiceDialog.racun_broj || null,
                  racun_datum: invoiceDialog.racun_datum || null,
                });
              }}
            >
              {updateInvoiceMutation.isPending ? "Sprema..." : "Spremi"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
