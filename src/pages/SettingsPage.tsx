import { AppLayout } from "@/components/AppLayout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useState, useEffect } from "react";
import { Save, Plus, Pencil, Trash2, Download, Database } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

export default function SettingsPage() {
  const qc = useQueryClient();

  // ── Company form ──
  const [form, setForm] = useState({
    company_name: "", company_oib: "", company_address: "",
    company_city: "", company_phone: "", company_email: "",
  });

  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("settings").select("*").maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (settings) {
      setForm({
        company_name: settings.company_name || "",
        company_oib: settings.company_oib || "",
        company_address: settings.company_address || "",
        company_city: settings.company_city || "",
        company_phone: settings.company_phone || "",
        company_email: settings.company_email || "",
      });
    }
  }, [settings]);

  const saveSettings = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("settings").update(form).eq("id", true);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["settings"] }); toast.success("Postavke spremljene"); },
    onError: (e: Error) => toast.error(e.message),
  });

  // ── Locations ──
  const { data: locations = [] } = useQuery({
    queryKey: ["stock_locations"],
    queryFn: async () => {
      const { data, error } = await supabase.from("stock_locations").select("*").order("code");
      if (error) throw error;
      return data;
    },
  });

  const [locOpen, setLocOpen] = useState(false);
  const [locEditing, setLocEditing] = useState<any>(null);
  const [locForm, setLocForm] = useState({ code: "", name: "", description: "" });

  const saveLoc = useMutation({
    mutationFn: async () => {
      if (locEditing) {
        const { error } = await supabase.from("stock_locations").update(locForm).eq("id", locEditing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("stock_locations").insert(locForm);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stock_locations"] });
      setLocOpen(false);
      toast.success(locEditing ? "Lokacija ažurirana" : "Lokacija dodana");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteLoc = useMutation({
    mutationFn: async (id: string) => {
      const { count } = await supabase.from("inventory_transactions").select("id", { count: "exact", head: true }).eq("stock_location_id", id);
      if (count && count > 0) throw new Error("Lokacija se ne može obrisati jer ima evidentirane transakcije.");
      const { count: docCount } = await supabase.from("documents").select("id", { count: "exact", head: true }).eq("stock_location_id", id);
      if (docCount && docCount > 0) throw new Error("Lokacija se ne može obrisati jer ima povezane dokumente.");
      const { error } = await supabase.from("stock_locations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["stock_locations"] }); toast.success("Lokacija obrisana"); },
    onError: (e: Error) => toast.error(e.message),
  });

  // ── Backup ──
  const [backupLoading, setBackupLoading] = useState(false);
  const doBackup = async () => {
    setBackupLoading(true);
    try {
      const now = new Date();

      const [{ data: arts }, { data: inv }, { data: txns }, { data: docs }, { data: projs }, { data: locs }, { data: docItems }] = await Promise.all([
        supabase.from("articles").select("*").order("code"),
        supabase.from("inventory_current").select("*"),
        supabase.from("inventory_transactions").select("*").order("created_at", { ascending: false }),
        supabase.from("documents").select("*").order("created_at", { ascending: false }),
        supabase.from("projects").select("*"),
        supabase.from("stock_locations").select("*").order("code"),
        supabase.from("document_items").select("*"),
      ]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(inv || []), "Artikli");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(txns || []), "Transakcije");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(docs || []), "Dokumenti");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(projs || []), "Projekti");

      const dateStr = now.toISOString().slice(0, 10);
      XLSX.writeFile(wb, `CorexING-backup-${dateStr}.xlsx`);
      toast.success("Backup preuzet");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBackupLoading(false);
    }
  };

  // ── Demo data ──
  const [demoLoading, setDemoLoading] = useState(false);
  const loadDemo = async () => {
    setDemoLoading(true);
    try {
      // 1. Articles
      const articles = [
        { code: "KLI-001", name: "Klima uređaj Daikin 12", unit: "kom", category: "Klima uređaji", purchase_price: 450, min_quantity: 2 },
        { code: "KLI-002", name: "Klima uređaj Daikin 18", unit: "kom", category: "Klima uređaji", purchase_price: 580, min_quantity: 2 },
        { code: "KLI-003", name: "Klima uređaj Mitsubishi 12", unit: "kom", category: "Klima uređaji", purchase_price: 520, min_quantity: 2 },
        { code: "CIJ-001", name: "Bakrena cijev 1/4", unit: "m", category: "Bakrene cijevi", purchase_price: 8.50, min_quantity: 20 },
        { code: "CIJ-002", name: "Bakrena cijev 3/8", unit: "m", category: "Bakrene cijevi", purchase_price: 11, min_quantity: 20 },
        { code: "NOS-001", name: "Nosač zidni univerzalni", unit: "kom", category: "Nosači", purchase_price: 12, min_quantity: 10 },
        { code: "SRF-001", name: "Šrafi M6x50", unit: "pak", category: "Šrafi i vijci", purchase_price: 3.50, min_quantity: 20 },
        { code: "IZO-001", name: "Armaflex izolacija", unit: "m", category: "Izolacija", purchase_price: 4.20, min_quantity: 15 },
      ];

      const { data: insertedArticles, error: artErr } = await supabase.from("articles").upsert(articles, { onConflict: "code" }).select();
      if (artErr) throw artErr;

      const artMap = new Map(insertedArticles!.map(a => [a.code, a.id]));

      // 2. Projects
      const projects = [
        { name: "Objekt Čakovec", site_address: "Ulica kralja Tomislava 5", status: "active" },
        { name: "Objekt Varaždin", site_address: "Dravska 12", status: "active" },
        { name: "Objekt Zagreb", site_address: "Ilica 100", status: "active" },
      ];

      const { data: insertedProjects, error: projErr } = await supabase.from("projects").insert(projects).select();
      if (projErr) throw projErr;

      // 3. Get location A
      const { data: locA } = await supabase.from("stock_locations").select("id").eq("code", "A").maybeSingle();
      if (!locA) throw new Error("Lokacija A ne postoji. Dodajte lokaciju s kodom 'A'.");

      // 4. Opening balance via create_primka
      const openingItems = [
        { article_id: artMap.get("KLI-001"), quantity: 15, unit: "kom", unit_price: 450 },
        { article_id: artMap.get("KLI-002"), quantity: 8, unit: "kom", unit_price: 580 },
        { article_id: artMap.get("KLI-003"), quantity: 12, unit: "kom", unit_price: 520 },
        { article_id: artMap.get("CIJ-001"), quantity: 200, unit: "m", unit_price: 8.50 },
        { article_id: artMap.get("CIJ-002"), quantity: 150, unit: "m", unit_price: 11 },
        { article_id: artMap.get("NOS-001"), quantity: 40, unit: "kom", unit_price: 12 },
        { article_id: artMap.get("SRF-001"), quantity: 500, unit: "pak", unit_price: 3.50 },
        { article_id: artMap.get("IZO-001"), quantity: 80, unit: "m", unit_price: 4.20 },
      ];

      const { error: obErr } = await supabase.rpc("create_primka", {
        p_stock_location_id: locA.id,
        p_note: "Početno stanje - demo",
        p_items: openingItems,
      });
      if (obErr) throw obErr;

      // 5. Sample otpremnica — Objekt Čakovec
      const ckProject = insertedProjects!.find(p => p.name === "Objekt Čakovec");
      const { error: otpErr } = await supabase.rpc("create_otpremnica", {
        p_stock_location_id: locA.id,
        p_project_id: ckProject!.id,
        p_recipient_name: "Objekt Čakovec",
        p_recipient_address: "Ulica kralja Tomislava 5",
        p_issued_by: "Ivan Horvat",
        p_received_by: "Marko Novak",
        p_items: [
          { article_id: artMap.get("KLI-001"), quantity: 2, unit: "kom" },
          { article_id: artMap.get("CIJ-001"), quantity: 20, unit: "m" },
          { article_id: artMap.get("NOS-001"), quantity: 4, unit: "kom" },
        ],
      });
      if (otpErr) throw otpErr;

      // 6. Sample povratnica — Objekt Čakovec
      const { error: povErr } = await supabase.rpc("create_povratnica", {
        p_stock_location_id: locA.id,
        p_project_id: ckProject!.id,
        p_returned_by: "Marko Novak",
        p_received_by: "Ivan Horvat",
        p_items: [
          { article_id: artMap.get("CIJ-001"), quantity: 5, unit: "m" },
        ],
      });
      if (povErr) throw povErr;

      // Invalidate all
      qc.invalidateQueries();
      toast.success("Demo podaci uspješno učitani!");
    } catch (e: any) {
      toast.error("Greška: " + e.message);
    } finally {
      setDemoLoading(false);
    }
  };

  return (
    <AppLayout title="Postavke">
      <div className="space-y-6 max-w-3xl">
        {/* SECTION 1 — Company data */}
        <Card>
          <CardHeader><CardTitle>Podaci tvrtke</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={(e) => { e.preventDefault(); saveSettings.mutate(); }} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><Label>Naziv tvrtke</Label><Input value={form.company_name} onChange={e => setForm({ ...form, company_name: e.target.value })} /></div>
                <div><Label>OIB</Label><Input value={form.company_oib} onChange={e => setForm({ ...form, company_oib: e.target.value })} /></div>
                <div><Label>Adresa</Label><Input value={form.company_address} onChange={e => setForm({ ...form, company_address: e.target.value })} /></div>
                <div><Label>Grad</Label><Input value={form.company_city} onChange={e => setForm({ ...form, company_city: e.target.value })} /></div>
                <div><Label>Telefon</Label><Input value={form.company_phone} onChange={e => setForm({ ...form, company_phone: e.target.value })} /></div>
                <div><Label>Email</Label><Input value={form.company_email} onChange={e => setForm({ ...form, company_email: e.target.value })} /></div>
              </div>
              <Button type="submit" disabled={saveSettings.isPending}><Save className="mr-2 h-4 w-4" />{saveSettings.isPending ? "Spremanje..." : "Spremi postavke"}</Button>
            </form>
          </CardContent>
        </Card>

        {/* SECTION 2 — Locations */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Skladišne lokacije</CardTitle>
            <Button size="sm" onClick={() => { setLocEditing(null); setLocForm({ code: "", name: "", description: "" }); setLocOpen(true); }}>
              <Plus className="mr-1 h-4 w-4" />Dodaj
            </Button>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Kod</TableHead><TableHead>Naziv</TableHead><TableHead>Opis</TableHead><TableHead className="w-24">Akcije</TableHead></TableRow></TableHeader>
              <TableBody>
                {locations.map(loc => (
                  <TableRow key={loc.id}>
                    <TableCell className="font-mono font-semibold">{loc.code}</TableCell>
                    <TableCell>{loc.name}</TableCell>
                    <TableCell className="text-muted-foreground">{loc.description}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => { setLocEditing(loc); setLocForm({ code: loc.code, name: loc.name, description: loc.description || "" }); setLocOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => deleteLoc.mutate(loc.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {locations.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">Nema lokacija</TableCell></TableRow>}
              </TableBody>
            </Table>
            <Dialog open={locOpen} onOpenChange={setLocOpen}>
              <DialogContent>
                <DialogHeader><DialogTitle>{locEditing ? "Uredi lokaciju" : "Nova lokacija"}</DialogTitle></DialogHeader>
                <form onSubmit={(e) => { e.preventDefault(); saveLoc.mutate(); }} className="space-y-4">
                  <div><Label>Kod</Label><Input value={locForm.code} onChange={e => setLocForm({ ...locForm, code: e.target.value })} required /></div>
                  <div><Label>Naziv</Label><Input value={locForm.name} onChange={e => setLocForm({ ...locForm, name: e.target.value })} required /></div>
                  <div><Label>Opis</Label><Input value={locForm.description} onChange={e => setLocForm({ ...locForm, description: e.target.value })} /></div>
                  <DialogFooter><Button type="submit" disabled={saveLoc.isPending}>{saveLoc.isPending ? "Spremanje..." : "Spremi"}</Button></DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>

        {/* SECTION 3 — Backup */}
        <Card>
          <CardHeader><CardTitle>Ručni backup</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">Preuzmi Excel backup s artiklima, transakcijama, dokumentima i projektima (zadnjih 90 dana).</p>
            <Button variant="outline" onClick={doBackup} disabled={backupLoading}>
              <Download className="mr-2 h-4 w-4" />{backupLoading ? "Priprema..." : "Preuzmi backup (Excel)"}
            </Button>
          </CardContent>
        </Card>

        {/* SECTION 4 — Demo data */}
        <Card>
          <CardHeader><CardTitle>Demo podaci</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">Učitaj testne artikle, projekte, početno stanje, otpremnicu i povratnicu. Sigurno za korištenje — ne briše postojeće podatke.</p>
            <Button variant="secondary" size="sm" onClick={loadDemo} disabled={demoLoading}>
              <Database className="mr-2 h-4 w-4" />{demoLoading ? "Učitavanje..." : "Učitaj demo podatke"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
