import { AppLayout } from "@/components/AppLayout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useState, useMemo } from "react";
import { Search, Package, TrendingDown, AlertTriangle, Boxes, ClipboardList } from "lucide-react";
import { toast } from "sonner";

type InventoryRow = {
  id: string | null; code: string | null; name: string | null; unit: string | null;
  category: string | null; purchase_price: number | null; min_quantity: number | null;
  current_qty: number | null; current_value: number | null;
};

type PerLocationRow = {
  article_id: string | null; code: string | null; name: string | null; unit: string | null;
  purchase_price: number | null; stock_location_id: string | null; location_code: string | null;
  current_qty: number | null;
};

function getStatus(qty: number, minQty: number) {
  if (qty === 0) return "nema";
  if (minQty > 0 && qty < minQty) return "niska";
  return "ok";
}

export default function Inventory() {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [locationFilter, setLocationFilter] = useState("all");
  const [openingBalanceOpen, setOpeningBalanceOpen] = useState(false);
  const qc = useQueryClient();

  const { data: inventory, isLoading } = useQuery({
    queryKey: ["inventory_current"],
    queryFn: async () => {
      const { data, error } = await supabase.from("inventory_current").select("*");
      if (error) throw error;
      return data as InventoryRow[];
    },
  });

  const { data: perLocation } = useQuery({
    queryKey: ["inventory_per_location"],
    queryFn: async () => {
      const { data, error } = await supabase.from("inventory_current_per_location").select("*");
      if (error) throw error;
      return data as PerLocationRow[];
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

  const { data: articles } = useQuery({
    queryKey: ["articles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("articles").select("*").order("code");
      if (error) throw error;
      return data;
    },
  });

  const categories = useMemo(() => {
    if (!inventory) return [];
    const cats = new Set(inventory.map(i => i.category).filter(Boolean));
    return Array.from(cats) as string[];
  }, [inventory]);

  const dataSource = useMemo(() => {
    if (locationFilter !== "all" && perLocation) {
      return perLocation
        .filter(pl => pl.location_code === locationFilter)
        .map(pl => {
          const inv = inventory?.find(i => i.id === pl.article_id);
          return {
            id: pl.article_id,
            code: pl.code,
            name: pl.name,
            unit: pl.unit,
            category: inv?.category ?? null,
            purchase_price: pl.purchase_price,
            min_quantity: inv?.min_quantity ?? 0,
            current_qty: pl.current_qty,
            current_value: (Number(pl.current_qty) || 0) * (Number(pl.purchase_price) || 0),
          } as InventoryRow;
        });
    }
    return inventory || [];
  }, [inventory, perLocation, locationFilter]);

  const filtered = useMemo(() => {
    return dataSource.filter(i => {
      const matchSearch = !search ||
        i.code?.toLowerCase().includes(search.toLowerCase()) ||
        i.name?.toLowerCase().includes(search.toLowerCase());
      const matchCategory = categoryFilter === "all" || i.category === categoryFilter;
      const status = getStatus(Number(i.current_qty) || 0, Number(i.min_quantity) || 0);
      const matchStatus = statusFilter === "all" ||
        (statusFilter === "ok" && status === "ok") ||
        (statusFilter === "niska" && status === "niska") ||
        (statusFilter === "nema" && status === "nema");
      return matchSearch && matchCategory && matchStatus;
    });
  }, [dataSource, search, categoryFilter, statusFilter]);

  const totalArticles = inventory?.length || 0;
  const totalValue = inventory?.reduce((s, i) => s + (Number(i.current_value) || 0), 0) || 0;
  const lowStockItems = inventory?.filter(i => {
    const qty = Number(i.current_qty) || 0;
    const min = Number(i.min_quantity) || 0;
    return qty > 0 && min > 0 && qty < min;
  }) || [];
  const outOfStockItems = inventory?.filter(i => Number(i.current_qty) === 0) || [];

  // Opening balance state
  const [obLocation, setObLocation] = useState("");
  const [obQuantities, setObQuantities] = useState<Record<string, number>>({});

  const initOpeningBalance = () => {
    const quantities: Record<string, number> = {};
    articles?.forEach(a => {
      const inv = inventory?.find(i => i.id === a.id);
      quantities[a.id] = Number(inv?.current_qty) || 0;
    });
    setObQuantities(quantities);
    setObLocation("");
    setOpeningBalanceOpen(true);
  };

  const submitOpeningBalance = useMutation({
    mutationFn: async () => {
      if (!obLocation) throw new Error("Odaberite lokaciju");
      const itemsToCreate = Object.entries(obQuantities).filter(([, qty]) => qty > 0);
      if (itemsToCreate.length === 0) throw new Error("Unesite barem jednu količinu");

      const year = new Date().getFullYear();
      const { count } = await supabase
        .from("documents")
        .select("*", { count: "exact", head: true })
        .eq("type", "opening_balance")
        .gte("date", `${year}-01-01`);
      const docNumber = `POC-${year}-${String((count || 0) + 1).padStart(4, "0")}`;

      const { data: doc, error: docErr } = await supabase
        .from("documents")
        .insert({
          type: "opening_balance",
          doc_number: docNumber,
          stock_location_id: obLocation,
          date: new Date().toISOString().slice(0, 10),
          status: "posted",
        })
        .select().single();
      if (docErr) throw docErr;

      for (const [articleId, qty] of itemsToCreate) {
        const article = articles?.find(a => a.id === articleId);
        const { data: item, error: itemErr } = await supabase
          .from("document_items")
          .insert({
            document_id: doc.id,
            article_id: articleId,
            quantity: qty,
            unit: article?.unit || "kom",
            unit_price: article?.purchase_price || 0,
          })
          .select().single();
        if (itemErr) throw itemErr;

        const { error: txnErr } = await supabase
          .from("inventory_transactions")
          .insert({
            article_id: articleId,
            type: "opening_balance",
            quantity: qty,
            stock_location_id: obLocation,
            document_id: doc.id,
            document_item_id: item.id,
          });
        if (txnErr) throw txnErr;
      }
      return docNumber;
    },
    onSuccess: (docNumber) => {
      qc.invalidateQueries({ queryKey: ["inventory_current"] });
      qc.invalidateQueries({ queryKey: ["inventory_per_location"] });
      toast.success(`Početno stanje ${docNumber} uspješno postavljeno`);
      setOpeningBalanceOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <AppLayout title="Pregled zalihe">
      <div className="space-y-4">
        {/* Summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Ukupno artikala</CardTitle>
              <Package className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent><div className="text-2xl font-bold">{totalArticles}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Ukupna vrijednost zalihe</CardTitle>
              <Boxes className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent><div className="text-2xl font-bold">{totalValue.toFixed(2)} €</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Niska zaliha</CardTitle>
              <TrendingDown className="h-4 w-4 text-[hsl(30,90%,50%)]" />
            </CardHeader>
            <CardContent><div className="text-2xl font-bold text-[hsl(30,90%,50%)]">{lowStockItems.length}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Nema na zalihi</CardTitle>
              <AlertTriangle className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent><div className="text-2xl font-bold text-destructive">{outOfStockItems.length}</div></CardContent>
          </Card>
        </div>

        {/* Notification bars */}
        {outOfStockItems.length > 0 && (
          <div className="rounded-lg bg-destructive/10 border border-destructive/30 px-4 py-3 text-sm text-destructive font-medium">
            ⚠️ Nema na zalihi: {outOfStockItems.map(i => i.name).join(", ")}
          </div>
        )}
        {lowStockItems.length > 0 && (
          <div className="rounded-lg bg-[hsl(30,90%,95%)] border border-[hsl(30,90%,70%)] px-4 py-3 text-sm text-[hsl(30,90%,35%)] font-medium">
            📉 Niska zaliha: {lowStockItems.map(i => i.name).join(", ")}
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 flex-wrap items-end">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Pretraži po šifri ili nazivu..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="Kategorija" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Sve kategorije</SelectItem>
              {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Svi statusi</SelectItem>
              <SelectItem value="ok">OK</SelectItem>
              <SelectItem value="niska">Niska zaliha</SelectItem>
              <SelectItem value="nema">Nema</SelectItem>
            </SelectContent>
          </Select>
          <Select value={locationFilter} onValueChange={setLocationFilter}>
            <SelectTrigger className="w-[150px]"><SelectValue placeholder="Lokacija" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Sve lokacije</SelectItem>
              {locations?.map(l => <SelectItem key={l.id} value={l.code}>{l.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={initOpeningBalance}>
            <ClipboardList className="mr-2 h-4 w-4" />Postavi početno stanje
          </Button>
        </div>

        {/* Main table */}
        <div className="rounded-lg border bg-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Šifra</TableHead>
                <TableHead>Naziv</TableHead>
                <TableHead>Kategorija</TableHead>
                <TableHead>JMJ</TableHead>
                <TableHead className="text-right">Trenutna količina</TableHead>
                <TableHead className="text-right">Min. količina</TableHead>
                <TableHead className="text-right">Nabavna cijena</TableHead>
                <TableHead className="text-right">Vrijednost</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Učitavanje...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Nema podataka</TableCell></TableRow>
              ) : (
                filtered.map((item) => {
                  const qty = Number(item.current_qty) || 0;
                  const min = Number(item.min_quantity) || 0;
                  const status = getStatus(qty, min);
                  return (
                    <TableRow key={item.id}>
                      <TableCell className="font-mono text-sm">{item.code}</TableCell>
                      <TableCell className="font-medium">{item.name}</TableCell>
                      <TableCell>{item.category || "—"}</TableCell>
                      <TableCell>{item.unit}</TableCell>
                      <TableCell className="text-right">{qty.toFixed(2)}</TableCell>
                      <TableCell className="text-right">{min}</TableCell>
                      <TableCell className="text-right">{Number(item.purchase_price || 0).toFixed(2)} €</TableCell>
                      <TableCell className="text-right font-medium">{Number(item.current_value || 0).toFixed(2)} €</TableCell>
                      <TableCell>
                        {status === "ok" && <Badge className="bg-primary text-primary-foreground">OK</Badge>}
                        {status === "niska" && <Badge className="bg-[hsl(30,90%,50%)] text-primary-foreground">NISKA ZALIHA</Badge>}
                        {status === "nema" && <Badge variant="destructive">NEMA</Badge>}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* Opening Balance Modal */}
        <Dialog open={openingBalanceOpen} onOpenChange={setOpeningBalanceOpen}>
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Postavi početno stanje</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Skladišna lokacija *</Label>
                <Select value={obLocation} onValueChange={setObLocation}>
                  <SelectTrigger><SelectValue placeholder="Odaberi lokaciju" /></SelectTrigger>
                  <SelectContent>
                    {locations?.map(l => <SelectItem key={l.id} value={l.id}>{l.name} ({l.code})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="rounded-lg border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Šifra</TableHead>
                      <TableHead>Naziv</TableHead>
                      <TableHead>JMJ</TableHead>
                      <TableHead className="w-32">Količina</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {articles?.map(a => (
                      <TableRow key={a.id}>
                        <TableCell className="font-mono text-sm">{a.code}</TableCell>
                        <TableCell>{a.name}</TableCell>
                        <TableCell>{a.unit}</TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={obQuantities[a.id] || 0}
                            onChange={(e) => setObQuantities(prev => ({ ...prev, [a.id]: Number(e.target.value) }))}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <Button
                onClick={() => submitOpeningBalance.mutate()}
                disabled={submitOpeningBalance.isPending}
                className="w-full"
              >
                {submitOpeningBalance.isPending ? "Spremanje..." : "Spremi početno stanje"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
