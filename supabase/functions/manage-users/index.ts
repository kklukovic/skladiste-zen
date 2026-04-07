import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Verify caller is admin
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) throw new Error("Not authenticated");
    const { data: { user: caller } } = await adminClient.auth.getUser(token);
    if (!caller) throw new Error("Not authenticated");
    const { data: callerProfile } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", caller.id)
      .single();
    if (callerProfile?.role !== "admin") throw new Error("Not admin");

    const { action, users, emails_to_delete } = await req.json();

    if (action === "delete_and_create") {
      // Delete old users by email
      if (emails_to_delete?.length) {
        const { data: { users: allUsers } } = await adminClient.auth.admin.listUsers({ perPage: 1000 });
        for (const email of emails_to_delete) {
          const existing = allUsers?.find((u: any) => u.email === email);
          if (existing) {
            // Delete profile first
            await adminClient.from("profiles").delete().eq("id", existing.id);
            await adminClient.auth.admin.deleteUser(existing.id);
          }
        }
      }

      // Create new users
      const results = [];
      for (const u of users) {
        // Check if already exists
        const { data: { users: existing } } = await adminClient.auth.admin.listUsers({ perPage: 1000 });
        const found = existing?.find((ex: any) => ex.email === u.email);
        if (found) {
          // Update password and profile
          await adminClient.auth.admin.updateUserById(found.id, { password: u.password });
          await adminClient.from("profiles").update({ username: u.username, role: u.role }).eq("id", found.id);
          results.push({ email: u.email, status: "updated" });
        } else {
          const { data: newUser, error } = await adminClient.auth.admin.createUser({
            email: u.email,
            password: u.password,
            email_confirm: true,
            user_metadata: { username: u.username, role: u.role },
          });
          if (error) {
            results.push({ email: u.email, status: "error", message: error.message });
          } else {
            results.push({ email: u.email, status: "created", id: newUser.user?.id });
          }
        }
      }

      return new Response(JSON.stringify({ success: true, results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
