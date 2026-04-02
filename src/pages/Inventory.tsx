import { AppLayout } from "@/components/AppLayout";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { Search } from "lucide-react";

export default function Inventory() {
  const [search, setSearch] = useState("");

  const { data: inventory, isLoading } = useQuery({
    queryKey: ["inventory_current"],
    queryFn: async () => {
      const { data, error } = await supabase.from("inventory_current").select("*");
      if (error) throw error;
      return data;
    },
  });

  const filtered = inventory?.filter(
    (i) =>
      i.name?.toLowerCase().includes(search.toLowerCase()) ||
      i.code?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AppLayout title="Pregled zalihe">
      <div className="space-y-4">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Pretraži artikle..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Šifra</TableHead>
                <TableHead>Naziv</TableHead>
                <TableHead>Kategorija</TableHead>
                <TableHead>JM</TableHead>
                <TableHead className="text-right">Zaliha</TableHead>
                <TableHead className="text-right">Nab. cijena</TableHead>
                <TableHead className="text-right">Vrijednost</TableHead>
                <TableHead className="text-right">Min.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    Učitavanje...
                  </TableCell>
                </TableRow>
              ) : filtered?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    Nema podataka
                  </TableCell>
                </TableRow>
              ) : (
                filtered?.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-mono text-sm">{item.code}</TableCell>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell>{item.category || "—"}</TableCell>
                    <TableCell>{item.unit}</TableCell>
                    <TableCell className="text-right">
                      <span className={Number(item.current_qty) <= Number(item.min_quantity) ? "text-destructive font-semibold" : ""}>
                        {Number(item.current_qty).toFixed(2)}
                      </span>
                      {Number(item.current_qty) <= Number(item.min_quantity) && (
                        <Badge variant="destructive" className="ml-2 text-xs">Low</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">{Number(item.purchase_price).toFixed(2)} €</TableCell>
                    <TableCell className="text-right font-medium">{Number(item.current_value).toFixed(2)} €</TableCell>
                    <TableCell className="text-right">{Number(item.min_quantity).toFixed(0)}</TableCell>
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
