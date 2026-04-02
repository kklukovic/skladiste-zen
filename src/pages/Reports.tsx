import { AppLayout } from "@/components/AppLayout";
import { useQuery } from "@tanstack/react-query";
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
import { Download } from "lucide-react";
import { generateInventoryPDF, generateProjectReportPDF, formatDateHR } from "@/lib/pdf-generators";

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
  };

  const filteredTxns = useMemo(() => {
    let txns = transactions || [];
    if (dateFrom) txns = txns.filter(t => t.created_at && t.created_at >= dateFrom);
    if (dateTo) txns = txns.filter(t => t.created_at && t.created_at <= dateTo + "T23:59:59");
    if (typeFilter !== "all") txns = txns.filter(t => t.type === typeFilter);
    if (articleFilter !== "all") txns = txns.filter(t => t.article_id === articleFilter);
    if (projectFilter !== "all") txns = txns.filter(t => t.project_id === projectFilter);
    if (txnLocFilter !== "all") {
      const loc = locations?.find(l => l.code === txnLocFilter);
      if (loc) txns = txns.filter(t => t.stock_location_id === loc.id);
    }
    return txns;
  }, [transactions, dateFrom, dateTo, typeFilter, articleFilter, projectFilter, txnLocFilter, locations]);

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

  return (
    <AppLayout title="Izvještaji">
      <Tabs defaultValue="stanje" className="space-y-4">
        <TabsList>
          <TabsTrigger value="stanje">Stanje zalihe</TabsTrigger>
          <TabsTrigger value="prometni">Prometni list</TabsTrigger>
          <TabsTrigger value="projekt">Izvještaj po projektu</TabsTrigger>
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
                        <TableCell className="text-right">{Number(i.purchase_price || 0).toFixed(2)} €</TableCell>
                        <TableCell className="text-right font-medium">{Number(i.current_value || 0).toFixed(2)} €</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="font-bold border-t-2">
                      <TableCell colSpan={5} className="text-right">Ukupna vrijednost zalihe:</TableCell>
                      <TableCell className="text-right">{stockTotal.toFixed(2)} €</TableCell>
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTxns.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Nema podataka</TableCell></TableRow>
                ) : (
                  filteredTxns.map(t => {
                    const a = articles?.find(ar => ar.id === t.article_id);
                    const d = documents?.find(doc => doc.id === t.document_id);
                    const p = projects?.find(pr => pr.id === t.project_id);
                    const l = locations?.find(lo => lo.id === t.stock_location_id);
                    const tb = typeBadge[t.type] || { label: t.type, className: "bg-muted text-muted-foreground" };
                    return (
                      <TableRow key={t.id}>
                        <TableCell>{t.created_at ? new Date(t.created_at).toLocaleDateString("hr") : ""}</TableCell>
                        <TableCell><Badge className={tb.className}>{tb.label}</Badge></TableCell>
                        <TableCell className="font-mono text-sm">{d?.doc_number || "—"}</TableCell>
                        <TableCell className="font-medium">{a?.name || ""}</TableCell>
                        <TableCell className="font-mono text-sm">{a?.code || ""}</TableCell>
                        <TableCell className="text-right">{Number(t.quantity).toFixed(2)}</TableCell>
                        <TableCell>{p?.name || "—"}</TableCell>
                        <TableCell>{l?.code || ""}</TableCell>
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
      </Tabs>
    </AppLayout>
  );
}
