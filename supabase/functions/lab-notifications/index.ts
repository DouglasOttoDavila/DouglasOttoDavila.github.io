import { jsonResponse, serviceRpc } from "../_shared/lab.ts";
Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }
  const workerSecret = Deno.env.get("LAB_NOTIFICATION_SECRET");
  if (
    !workerSecret ||
    request.headers.get("Authorization") !== `Bearer ${workerSecret}`
  ) return jsonResponse({ error: "Unauthorized worker." }, 401);
  const key = Deno.env.get("RESEND_API_KEY"),
    from = Deno.env.get("LAB_EMAIL_FROM"),
    site = Deno.env.get("LAB_SITE_URL");
  if (!key || !from || !site) {
    return jsonResponse({
      error: "Configure RESEND_API_KEY, LAB_EMAIL_FROM and LAB_SITE_URL.",
    }, 503);
  }
  try {
    const rows = await serviceRpc("lab_claim_emails");
    let sent = 0, failed = 0;
    for (const row of rows) {
      try {
        const approval = row.kind === "approved";
        const subject = approval
          ? "Your Lab access is approved"
          : "New recruiter Lab access request";
        const text = approval
          ? `Your access to Douglas Davila's experimentation Lab is approved. Open ${
            site.replace(/\/$/, "")
          }/lab/ to sign in and view your execution allowance.`
          : `A Google-authenticated visitor requested access to your Lab. Review the request at ${
            site.replace(/\/$/, "")
          }/settings/. Request reference: ${row.user_id}. Sign in with your administrator account to approve or deny access.`;
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
            "Idempotency-Key": row.id,
          },
          body: JSON.stringify({ from, to: [row.recipient], subject, text }),
          signal: AbortSignal.timeout(20000),
        });
        if (!response.ok) {
          throw new Error(`Email provider returned ${response.status}.`);
        }
        await serviceRpc("lab_finish_email", { p_id: row.id, p_error: null });
        sent++;
      } catch (error) {
        await serviceRpc("lab_finish_email", {
          p_id: row.id,
          p_error: error instanceof Error ? error.message : "Email failed.",
        });
        failed++;
      }
    }
    return jsonResponse({ sent, failed });
  } catch {
    return jsonResponse({
      error:
        "Notification worker failed; queued emails remain available for retry.",
    }, 500);
  }
});
