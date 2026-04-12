import { Webhook } from "svix";
import { headers } from "next/headers";
import { WebhookEvent } from "@clerk/nextjs/server";
import { createServiceClient } from "@/lib/supabase";

export async function POST(req: Request) {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;

  if (!WEBHOOK_SECRET) {
    throw new Error("Missing CLERK_WEBHOOK_SECRET environment variable");
  }

  // Get the headers
  const headerPayload = await headers();
  const svix_id = headerPayload.get("svix-id");
  const svix_timestamp = headerPayload.get("svix-timestamp");
  const svix_signature = headerPayload.get("svix-signature");

  if (!svix_id || !svix_timestamp || !svix_signature) {
    return new Response("Missing svix headers", { status: 400 });
  }

  // Get the body
  const payload = await req.json();
  const body = JSON.stringify(payload);

  // Verify the webhook
  const wh = new Webhook(WEBHOOK_SECRET);
  let evt: WebhookEvent;

  try {
    evt = wh.verify(body, {
      "svix-id": svix_id,
      "svix-timestamp": svix_timestamp,
      "svix-signature": svix_signature,
    }) as WebhookEvent;
  } catch (err) {
    console.error("Webhook verification failed:", err);
    return new Response("Invalid signature", { status: 400 });
  }

  const supabase = createServiceClient();

  // Handle the event
  if (evt.type === "user.created" || evt.type === "user.updated") {
    const { id, email_addresses, first_name, last_name } = evt.data;
    const email = email_addresses?.[0]?.email_address;
    const name = [first_name, last_name].filter(Boolean).join(" ");

    const { error } = await supabase
      .from("users")
      .upsert(
        {
          clerk_id: id,
          email,
          name: name || null,
        },
        { onConflict: "clerk_id" }
      );

    if (error) {
      console.error("Failed to sync user to Supabase:", error);
      return new Response("Database error", { status: 500 });
    }
  }

  if (evt.type === "user.deleted") {
    const { id } = evt.data;
    if (id) {
      await supabase.from("users").delete().eq("clerk_id", id);
    }
  }

  return new Response("OK", { status: 200 });
}
