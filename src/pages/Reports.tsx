import { AppLayout } from "@/components/AppLayout";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { Boxes, Package, FileText, TrendingDown } from "lucide-react";

export default function Reports() {
  const [locationFilter, setLocationFilter] = useState<string>("all");

  const { data: inventory } = useQuery({
    queryKey: ["inventory_current"],
    queryFn: async () => {
      const { data, error } = await supabase.from("inventory_current").select("*");
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

  const { data: locations } = useQuery({
    queryKey: ["stock_locations"],
    queryFn: async () => {
      const { data, error } = await supabase.from("stock_locations").select("*").order("code");
      if (error) throw error;
      return data;
    },
  });

  const { data: documents } = useQuery({
    queryKey: ["documents"],
    queryFn: async () => {
      const { data, error } = await supabase.from("documents").select("*").order("date", { ascending: false }).limit(20);
      if (error) throw error;
      return data;
    },
  });

  const totalValue = inventory?.reduce((s, i) => s + Number(i.current_value || 0), 0) || 0;
  const totalItems = inventory?.length || 0;
  const lowStock = inventory?.filter(i => Number(i.current_qty) <= Number(i.min_quantity) && Number(i.min_quantity) > 0) || [];
  const docCount = documents?.length || 0;

  const filteredPerLoc = locationFilter === "all"
    ? perLocation?.filter(i => Number(i.current_qty) !== 0)
    : perLocation?.filter(i => i.stock_location_id === locationFilter && Number(i.current_qty) !== 0);

  return (
    <AppLayout title="Izvještaji">
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Ukupna vrijednost</CardTitle>
              <Boxes className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent><div className="text-2xl font-bold">{totalValue.toFixed(2)} €</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Artikala</CardTitle>
              <Package className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent><div className="text-2xl font-bold">{totalItems}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Ispod min. zalihe</CardTitle>
              <TrendingDown className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent><div className="text-2xl font-bold text-destructive">{lowStock.length}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Posljednji dokumenti</CardTitle>
              <FileText className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent><div className="text-2xl font-bold">{docCount}</div></CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-semibold">Zaliha po lokaciji</h3>
            <Select value={locationFilter} onValueChange={setLocationFilter}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Sve lokacije</SelectItem>
                {locations?.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Šifra</TableHead>
                  <TableHead>Naziv</TableHead>
                  <TableHead>Lokacija</TableHead>
                  <TableHead className="text-right">Količina</TableHead>
                  <TableHead>JM</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPerLoc?.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Nema podataka</TableCell></TableRow>
                ) : (
                  filteredPerLoc?.map((i, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-mono text-sm">{i.code}</TableCell>
                      <TableCell className="font-medium">{i.name}</TableCell>
                      <TableCell>{i.location_code}</TableCell>
                      <TableCell className="text-right">{Number(i.current_qty).toFixed(2)}</TableCell>
                      <TableCell>{i.unit}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Posljednji dokumenti</h3>
          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Broj</TableHead>
                  <TableHead>Tip</TableHead>
                  <TableHead>Datum</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Napomena</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents?.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Nema dokumenata</TableCell></TableRow>
                ) : (
                  documents?.map(d => (
                    <TableRow key={d.id}>
                      <TableCell className="font-mono text-sm">{d.doc_number}</TableCell>
                      <TableCell>{d.type === "in" ? "Primka" : d.type === "out" ? "Otpremnica" : "Povrat"}</TableCell>
                      <TableCell>{d.date}</TableCell>
                      <TableCell>{d.status === "posted" ? "Proknjiženo" : d.status}</TableCell>
                      <TableCell className="max-w-[200px] truncate">{d.note || "—"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
