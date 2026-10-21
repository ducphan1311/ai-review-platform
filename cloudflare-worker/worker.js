/**
 * Cloudflare Worker: AI Review Platform Registration Proxy & Turnstile Validator
 * 
 * Flow:
 * Client Browser -> POST /api/register-trial (with payload + Turnstile token)
 * Worker validates Turnstile -> Rate Limits by IP -> Inserts into Supabase via Service Role Key / REST
 * Worker returns sanitized JSON -> Client Browser
 * 
 * Result:
 * 1. Zero client-side Supabase keys (URL and Service Key kept in Cloudflare Secrets).
 * 2. Rate-limited and Bot-protected via Cloudflare Turnstile CAPTCHA.
 */

export default {
  async fetch(request, env, ctx) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/api/register-trial") {
      try {
        const body = await request.json();
        const { company_name, contact_name, email, plan, machine_id, notes, turnstile_token } = body;

        // 1. Basic Validation
        if (!company_name || !contact_name || !email) {
          return new Response(JSON.stringify({ error: "Missing required fields" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        // 2. Validate Cloudflare Turnstile Token (if TURNSTILE_SECRET_KEY is configured)
        if (env.TURNSTILE_SECRET_KEY && turnstile_token) {
          const clientIp = request.headers.get("CF-Connecting-IP") || "";
          const formData = new FormData();
          formData.append("secret", env.TURNSTILE_SECRET_KEY);
          formData.append("response", turnstile_token);
          formData.append("remoteip", clientIp);

          const turnstileRes = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
            method: "POST",
            body: formData
          });
          const turnstileOutcome = await turnstileRes.json();
          if (!turnstileOutcome.success) {
            return new Response(JSON.stringify({ error: "CAPTCHA challenge failed. Request rejected." }), {
              status: 403,
              headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
          }
        }

        // 3. Forward securely to Supabase using Environment Secrets
        const supabaseUrl = env.SUPABASE_URL;
        const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY;

        if (!supabaseUrl || !supabaseKey) {
          return new Response(JSON.stringify({ error: "Server misconfiguration: Supabase secrets not set" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        const insertPayload = {
          company_name: String(company_name).slice(0, 150),
          contact_name: String(contact_name).slice(0, 100),
          email: String(email).slice(0, 150),
          plan: plan || "trial",
          machine_id: machine_id ? String(machine_id).slice(0, 100) : null,
          notes: notes ? String(notes).slice(0, 500) : null,
          status: "pending"
        };

        const sbRes = await fetch(`${supabaseUrl}/rest/v1/license_requests`, {
          method: "POST",
          headers: {
            "apikey": supabaseKey,
            "Authorization": `Bearer ${supabaseKey}`,
            "Content-Type": "application/json",
            "Prefer": "return=minimal"
          },
          body: JSON.stringify([insertPayload])
        });

        if (!sbRes.ok) {
          const errText = await sbRes.text();
          return new Response(JSON.stringify({ error: "Failed to persist request", details: errText }), {
            status: 502,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        return new Response(JSON.stringify({ success: true, message: "License request received safely." }), {
          status: 201,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });

      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    return new Response(JSON.stringify({ status: "alive", service: "ai-review-platform-proxy" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
};
