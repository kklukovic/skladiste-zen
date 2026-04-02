import { AppLayout } from "@/components/AppLayout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useState, useEffect } from "react";
import { Save } from "lucide-react";
import { toast } from "sonner";

export default function SettingsPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    company_name: "", company_oib: "", company_address: "",
    company_city: "", company_phone: "", company_email: "",
  });

  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("settings").select("*").single();
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

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("settings").update(form).eq("id", true);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["settings"] }); toast.success("Postavke spremljene"); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <AppLayout title="Postavke">
      <Card className="max-w-2xl">
        <CardHeader><CardTitle>Podaci tvrtke</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><Label>Naziv tvrtke</Label><Input value={form.company_name} onChange={e => setForm({ ...form, company_name: e.target.value })} /></div>
              <div><Label>OIB</Label><Input value={form.company_oib} onChange={e => setForm({ ...form, company_oib: e.target.value })} /></div>
              <div><Label>Adresa</Label><Input value={form.company_address} onChange={e => setForm({ ...form, company_address: e.target.value })} /></div>
              <div><Label>Grad</Label><Input value={form.company_city} onChange={e => setForm({ ...form, company_city: e.target.value })} /></div>
              <div><Label>Telefon</Label><Input value={form.company_phone} onChange={e => setForm({ ...form, company_phone: e.target.value })} /></div>
              <div><Label>Email</Label><Input value={form.company_email} onChange={e => setForm({ ...form, company_email: e.target.value })} /></div>
            </div>
            <Button type="submit" disabled={save.isPending}><Save className="mr-2 h-4 w-4" />{save.isPending ? "Spremanje..." : "Spremi postavke"}</Button>
          </form>
        </CardContent>
      </Card>
    </AppLayout>
  );
}
