import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import logo from "@/assets/corex_logo.jpg";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetMode, setResetMode] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) toast.error(error.message);
    setLoading(false);
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) toast.error(error.message);
    else toast.success("Link za resetiranje lozinke poslan na email");
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center space-y-3">
          <img src={logo} alt="SkladišteApp" className="h-12 mx-auto" />
          <CardTitle className="text-xl">
            {resetMode ? "Resetiranje lozinke" : "Prijava"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={resetMode ? handleReset : handleLogin} className="space-y-4">
            <div>
              <Label>Email</Label>
              <Input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus />
            </div>
            {!resetMode && (
              <div>
                <Label>Lozinka</Label>
                <Input type="password" value={password} onChange={e => setPassword(e.target.value)} required />
              </div>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Učitavanje..." : resetMode ? "Pošalji link" : "Prijavi se"}
            </Button>
          </form>
          <div className="mt-4 text-center">
            <button
              type="button"
              className="text-sm text-primary hover:underline"
              onClick={() => setResetMode(!resetMode)}
            >
              {resetMode ? "← Natrag na prijavu" : "Zaboravili ste lozinku?"}
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
