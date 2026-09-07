import { NextResponse } from "next/server";

// POST /api/contact  { name, email, subject?, message }
// Sends via Resend when RESEND_API_KEY is set; otherwise logs server-side so
// nothing is lost during setup.
export async function POST(request: Request) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const name = (body.name ?? "").toString().trim();
  const email = (body.email ?? "").toString().trim();
  const subject = (body.subject ?? "New message from the website").toString().trim();
  const message = (body.message ?? "").toString().trim();

  if (!name || !email || !message) {
    return NextResponse.json({ error: "Name, email, and message are required." }, { status: 400 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.CONTACT_TO_EMAIL || "hello@southcoastcane.com";

  if (!apiKey) {
    console.log("[contact] (no email provider configured yet)", { name, email, subject, message });
    return NextResponse.json({ ok: true, delivered: false });
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "South Coast Cane <onboarding@resend.dev>",
        to: [to],
        reply_to: email,
        subject: `[Website] ${subject}`,
        text: `From: ${name} <${email}>\n\n${message}`,
      }),
    });
    if (!res.ok) {
      const detail = await res.text();
      console.error("[contact] resend error", detail);
      return NextResponse.json({ error: "Could not send message." }, { status: 502 });
    }
    return NextResponse.json({ ok: true, delivered: true });
  } catch (err) {
    console.error("[contact] send failed", err);
    return NextResponse.json({ error: "Could not send message." }, { status: 500 });
  }
}
