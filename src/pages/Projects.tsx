import { AppLayout } from "@/components/AppLayout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { Plus, Pencil, Search } from "lucide-react";
import { toast } from "sonner";

interface ProjectForm { name: string; site_address: string; note: string; status: string; }
const emptyForm: ProjectForm = { name: "", site_address: "", note: "", status: "active" };

export default function Projects() {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<ProjectForm>(emptyForm);
  const qc = useQueryClient();

  const { data: projects, isLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const save = useMutation({
    mutationFn: async (f: ProjectForm) => {
      if (editing) {
        const { error } = await supabase.from("projects").update(f).eq("id", editing);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("projects").insert(f);
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["projects"] }); setOpen(false); setEditing(null); setForm(emptyForm); toast.success("Spremljeno"); },
    onError: (e) => toast.error(e.message),
  });

  const filtered = projects?.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <AppLayout title="Projekti">
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-3 justify-between">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Pretraži..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setEditing(null); setForm(emptyForm); } }}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" />Novi projekt</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{editing ? "Uredi projekt" : "Novi projekt"}</DialogTitle></DialogHeader>
              <form onSubmit={(e) => { e.preventDefault(); save.mutate(form); }} className="space-y-4">
                <div><Label>Naziv</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required /></div>
                <div><Label>Adresa gradilišta</Label><Input value={form.site_address} onChange={e => setForm({ ...form, site_address: e.target.value })} /></div>
                <div><Label>Napomena</Label><Textarea value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} /></div>
                <div>
                  <Label>Status</Label>
                  <select className="w-full border rounded-md px-3 py-2 bg-background text-foreground" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                    <option value="active">Aktivan</option>
                    <option value="completed">Završen</option>
                    <option value="cancelled">Otkazan</option>
                  </select>
                </div>
                <Button type="submit" className="w-full" disabled={save.isPending}>Spremi</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Naziv</TableHead>
                <TableHead>Adresa</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Napomena</TableHead>
                <TableHead className="w-16"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Učitavanje...</TableCell></TableRow>
              ) : filtered?.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Nema projekata</TableCell></TableRow>
              ) : (
                filtered?.map(p => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell>{p.site_address || "—"}</TableCell>
                    <TableCell>
                      <Badge variant={p.status === "active" ? "default" : "secondary"}>
                        {p.status === "active" ? "Aktivan" : p.status === "completed" ? "Završen" : "Otkazan"}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate">{p.note || "—"}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => { setEditing(p.id); setForm({ name: p.name, site_address: p.site_address || "", note: p.note || "", status: p.status || "active" }); setOpen(true); }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TableCell>
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
