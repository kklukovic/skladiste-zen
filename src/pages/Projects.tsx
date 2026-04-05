import { AppLayout } from "@/components/AppLayout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useState } from "react";
import { Plus, Pencil, ArrowLeft, Download, FileText, MoreHorizontal, Archive, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

interface ProjectForm { name: string; site_address: string; note: string; status: string; }
const emptyForm: ProjectForm = { name: "", site_address: "", note: "", status: "active" };

const statusConfig: Record<string, { label: string; className: string }> = {
  active: { label: "Aktivan", className: "bg-primary text-primary-foreground" },
  completed: { label: "Završen", className: "bg-blue-500 text-primary-foreground" },
  archived: { label: "Arhiviran", className: "bg-muted text-muted-foreground" },
};

export default function Projects() {
  const [statusFilter, setStatusFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<ProjectForm>(emptyForm);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data: projects, isLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: documents } = useQuery({
    queryKey: ["documents"],
    queryFn: async () => {
      const { data, error } = await supabase.from("documents").select("*").order("date", { ascending: false });
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

  const { data: articles } = useQuery({
    queryKey: ["articles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("articles").select("*");
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

  const archiveProject = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("projects").update({ status: "archived" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["projects"] }); toast.success("Projekt arhiviran"); },
    onError: (e) => toast.error(e.message),
  });

  const deleteProject = useMutation({
    mutationFn: async (id: string) => {
      const { count } = await supabase.from("documents").select("id", { count: "exact", head: true }).eq("project_id", id);
      if (count && count > 0) throw new Error("Projekt ima povezane dokumente i ne može se obrisati");
      const { error } = await supabase.from("projects").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["projects"] }); toast.success("Projekt obrisan"); },
    onError: (e) => toast.error(e.message),
  });

  const filtered = projects?.filter(p => statusFilter === "all" || p.status === statusFilter);

  const getDocCount = (projectId: string) => documents?.filter(d => d.project_id === projectId).length || 0;

  // Project detail view
  if (selectedProject) {
    const project = projects?.find(p => p.id === selectedProject);
    if (!project) return null;

    const projectDocs = documents?.filter(d => d.project_id === selectedProject) || [];
    const projectTxns = transactions?.filter(t => t.project_id === selectedProject) || [];

    const materialMap = new Map<string, { issued: number; returned: number }>();
    projectTxns.forEach(t => {
      const key = t.article_id;
      const current = materialMap.get(key) || { issued: 0, returned: 0 };
      if (t.type === "out") current.issued += Number(t.quantity);
      if (t.type === "return") current.returned += Number(t.quantity);
      materialMap.set(key, current);
    });

    const materialRows = Array.from(materialMap.entries()).map(([articleId, data]) => {
      const article = articles?.find(a => a.id === articleId);
      return {
        code: article?.code || "", name: article?.name || "", unit: article?.unit || "",
        issued: data.issued, returned: data.returned, net: data.issued - data.returned,
      };
    });

    const totalIssued = materialRows.reduce((s, r) => s + r.issued, 0);
    const totalReturned = materialRows.reduce((s, r) => s + r.returned, 0);
    const totalNet = materialRows.reduce((s, r) => s + r.net, 0);

    const exportMaterialExcel = () => {
      const header = `Projekt: ${project.name}\nAdresa: ${project.site_address || "-"}\nDatum: ${new Date().toLocaleDateString("hr")}\n\n`;
      const csvHeader = "Šifra,Naziv,JMJ,Izdano,Vraćeno,Neto utrošak";
      const rows = materialRows.map(r => `"${r.code}","${r.name}","${r.unit}",${r.issued.toFixed(2)},${r.returned.toFixed(2)},${r.net.toFixed(2)}`);
      rows.push(`"","UKUPNO","",${totalIssued.toFixed(2)},${totalReturned.toFixed(2)},${totalNet.toFixed(2)}`);
      const csv = header + csvHeader + "\n" + rows.join("\n");
      const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `materijal_${project.name.replace(/\s/g, "_")}_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click(); URL.revokeObjectURL(url);
    };

    const sc = statusConfig[project.status || "active"];

    return (
      <AppLayout title={project.name}>
        <div className="space-y-6">
          <div className="flex items-center gap-4 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => setSelectedProject(null)}>
              <ArrowLeft className="mr-2 h-4 w-4" />Natrag
            </Button>
            <Badge className={sc.className}>{sc.label}</Badge>
            {project.site_address && <span className="text-muted-foreground">{project.site_address}</span>}
            <span className="text-sm text-muted-foreground">Kreirano: {new Date(project.created_at).toLocaleDateString("hr")}</span>
          </div>

          <Tabs defaultValue="dokumenti">
            <TabsList>
              <TabsTrigger value="dokumenti">Dokumenti</TabsTrigger>
              <TabsTrigger value="materijal">Materijal</TabsTrigger>
            </TabsList>

            <TabsContent value="dokumenti" className="space-y-4">
              <div className="flex justify-end">
                <Button onClick={() => navigate(`/otpremnica?project=${selectedProject}`)}>
                  <Plus className="mr-2 h-4 w-4" />Dodaj materijal na projekt
                </Button>
              </div>
              <div className="rounded-lg border bg-card">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Datum</TableHead>
                      <TableHead>Broj</TableHead>
                      <TableHead>Tip</TableHead>
                      <TableHead>Izdao/Vratio</TableHead>
                      <TableHead>Akcije</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {projectDocs.length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Nema dokumenata</TableCell></TableRow>
                    ) : (
                      projectDocs.map(d => (
                        <TableRow key={d.id}>
                          <TableCell>{d.date}</TableCell>
                          <TableCell className="font-mono text-sm">{d.doc_number}</TableCell>
                          <TableCell>
                            {d.type === "out" && <Badge className="bg-blue-500 text-primary-foreground">OTPREMNICA</Badge>}
                            {d.type === "return" && <Badge className="bg-primary text-primary-foreground">POVRATNICA</Badge>}
                            {d.type === "primka" && <Badge variant="secondary">PRIMKA</Badge>}
                            {d.type === "opening_balance" && <Badge variant="secondary">POČETNO STANJE</Badge>}
                          </TableCell>
                          <TableCell>{d.issued_by || d.received_by || "—"}</TableCell>
                          <TableCell>
                            <Button variant="ghost" size="icon"><FileText className="h-4 w-4" /></Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            <TabsContent value="materijal" className="space-y-4">
              <div className="flex justify-end">
                <Button variant="outline" onClick={exportMaterialExcel}>
                  <Download className="mr-2 h-4 w-4" />Preuzmi popis materijala (Excel)
                </Button>
              </div>
              <div className="rounded-lg border bg-card">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Šifra</TableHead>
                      <TableHead>Naziv</TableHead>
                      <TableHead>JMJ</TableHead>
                      <TableHead className="text-right">Izdano</TableHead>
                      <TableHead className="text-right">Vraćeno</TableHead>
                      <TableHead className="text-right">Neto utrošak</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {materialRows.length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Nema materijala</TableCell></TableRow>
                    ) : (
                      <>
                        {materialRows.map((r, i) => (
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
                          <TableCell className="text-right">{totalIssued.toFixed(2)}</TableCell>
                          <TableCell className="text-right">{totalReturned.toFixed(2)}</TableCell>
                          <TableCell className="text-right">{totalNet.toFixed(2)}</TableCell>
                        </TableRow>
                      </>
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Projekti">
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-3 justify-between">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Svi statusi</SelectItem>
              <SelectItem value="active">Aktivan</SelectItem>
              <SelectItem value="completed">Završen</SelectItem>
              <SelectItem value="archived">Arhiviran</SelectItem>
            </SelectContent>
          </Select>
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setEditing(null); setForm(emptyForm); } }}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" />Novi projekt</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{editing ? "Uredi projekt" : "Novi projekt"}</DialogTitle></DialogHeader>
              <form onSubmit={(e) => { e.preventDefault(); save.mutate(form); }} className="space-y-4">
                <div><Label>Naziv projekta *</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required /></div>
                <div><Label>Adresa objekta</Label><Input value={form.site_address} onChange={e => setForm({ ...form, site_address: e.target.value })} /></div>
                <div><Label>Napomena</Label><Textarea value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} /></div>
                <div>
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Aktivan</SelectItem>
                      <SelectItem value="completed">Završen</SelectItem>
                      <SelectItem value="archived">Arhiviran</SelectItem>
                    </SelectContent>
                  </Select>
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
                <TableHead>Adresa objekta</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Br. dokumenata</TableHead>
                <TableHead className="w-24">Akcije</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Učitavanje...</TableCell></TableRow>
              ) : filtered?.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Nema projekata</TableCell></TableRow>
              ) : (
                filtered?.map(p => {
                  const sc = statusConfig[p.status || "active"];
                  return (
                    <TableRow key={p.id}>
                      <TableCell>
                        <button
                          className="font-medium text-primary hover:underline text-left"
                          onClick={() => setSelectedProject(p.id)}
                        >
                          {p.name}
                        </button>
                      </TableCell>
                      <TableCell>{p.site_address || "—"}</TableCell>
                      <TableCell><Badge className={sc.className}>{sc.label}</Badge></TableCell>
                      <TableCell className="text-right">{getDocCount(p.id)}</TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => {
                              setEditing(p.id);
                              setForm({ name: p.name, site_address: p.site_address || "", note: p.note || "", status: p.status || "active" });
                              setOpen(true);
                            }}>
                              <Pencil className="mr-2 h-4 w-4" />Uredi
                            </DropdownMenuItem>
                            {p.status !== "archived" && (
                              <DropdownMenuItem onClick={() => archiveProject.mutate(p.id)}>
                                <Archive className="mr-2 h-4 w-4" />Arhiviraj
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => deleteProject.mutate(p.id)}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />Obriši
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </AppLayout>
  );
}
