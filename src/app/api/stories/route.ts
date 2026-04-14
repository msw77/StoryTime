import { auth } from "@clerk/nextjs/server";
import { createServiceClient } from "@/lib/supabase";
import { generateTtsWithTimings, WordTiming } from "@/lib/tts";
import { NextResponse } from "next/server";

// GET /api/stories — load user's saved AI stories
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    const supabase = createServiceClient();

    // Find the user by Clerk ID
    const { data: user } = await supabase
      .from("users")
      .select("id")
      .eq("clerk_id", userId)
      .single();

    if (!user) {
      return NextResponse.json([]);
    }

    // Get all their generated stories, newest first
    const { data: stories, error } = await supabase
      .from("stories")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_generated", true)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Failed to load stories:", error);
      return NextResponse.json({ error: "Failed to load stories" }, { status: 500 });
    }

    return NextResponse.json(stories || []);
  } catch (err) {
    console.error("Stories GET error:", err);
    return NextResponse.json({ error: "Failed to load stories" }, { status: 500 });
  }
}

// DELETE /api/stories — delete a saved story
export async function DELETE(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    const supabase = createServiceClient();

    // Find the user by Clerk ID
    const { data: user } = await supabase
      .from("users")
      .select("id")
      .eq("clerk_id", userId)
      .single();

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const { searchParams } = new URL(req.url);
    const storyId = searchParams.get("id");

    if (!storyId) {
      return NextResponse.json({ error: "Missing story id" }, { status: 400 });
    }

    // Only allow deleting their own stories
    const { error } = await supabase
      .from("stories")
      .delete()
      .eq("id", storyId)
      .eq("user_id", user.id);

    if (error) {
      console.error("Failed to delete story:", error);
      return NextResponse.json({ error: "Failed to delete story" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Stories DELETE error:", err);
    return NextResponse.json({ error: "Failed to delete story" }, { status: 500 });
  }
}

// POST /api/stories — save a generated story
export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    const supabase = createServiceClient();

    // Find the user by Clerk ID
    const { data: user } = await supabase
      .from("users")
      .select("id")
      .eq("clerk_id", userId)
      .single();

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const body = await req.json();
    const { title, emoji, genre, age, pages, duration, heroName, heroType, lesson, extras, childProfileId, fullPages, characterDescription, illustrationUrls } = body;

    const { data: story, error } = await supabase
      .from("stories")
      .insert({
        user_id: user.id,
        child_profile_id: childProfileId || null,
        title,
        emoji: emoji || "✨",
        genre,
        age_group: age,
        pages: JSON.stringify(pages),
        hero_name: heroName || null,
        hero_type: heroType || null,
        lesson: lesson || null,
        extras: extras || null,
        full_pages: fullPages || null,
        character_description: characterDescription || null,
        illustration_urls: Array.isArray(illustrationUrls) ? illustrationUrls : null,
        is_generated: true,
        is_built_in: false,
        page_count: pages?.length || 0,
      })
      .select()
      .single();

    if (error) {
      console.error("Failed to save story:", error);
      return NextResponse.json({ error: "Failed to save story" }, { status: 500 });
    }

    // ── Phase B: persist audio ────────────────────────────────────────────
    // For each page, generate TTS+Whisper once and upload the mp3 to
    // Supabase Storage. Record the public URL and word timings on the row.
    // Next time the user opens this story, the reader plays straight from
    // the stored URL — no /api/tts round trip, no OpenAI cost.
    //
    // Parallelized with a concurrency cap so we don't hammer OpenAI or run
    // out of Vercel function memory on long stories.
    const audioUrls: (string | null)[] = new Array(pages?.length || 0).fill(null);
    const wordTimingsAll: (WordTiming[] | null)[] = new Array(pages?.length || 0).fill(null);

    const CONCURRENCY = 3;
    const pageEntries: [number, string][] = Array.isArray(pages)
      ? (pages as [string, string][])
          .map((p, i) => [i, p?.[1]] as [number, string])
          .filter(([, text]) => typeof text === "string" && text.trim().length > 0)
      : [];

    async function persistOnePage(pageIdx: number, text: string): Promise<void> {
      try {
        const { audioBuffer, wordTimings } = await generateTtsWithTimings(text, "nova");
        const objectPath = `${story.id}/page-${pageIdx}.mp3`;
        const { error: uploadErr } = await supabase.storage
          .from("story-audio")
          .upload(objectPath, audioBuffer, {
            contentType: "audio/mpeg",
            upsert: true,
          });
        if (uploadErr) {
          console.warn(`Audio upload failed for page ${pageIdx}:`, uploadErr.message);
          return;
        }
        const { data: pub } = supabase.storage.from("story-audio").getPublicUrl(objectPath);
        audioUrls[pageIdx] = pub?.publicUrl || null;
        wordTimingsAll[pageIdx] = wordTimings;
      } catch (e) {
        console.warn(`TTS/upload failed for page ${pageIdx}:`, (e as Error).message);
      }
    }

    // Simple concurrency-limited runner — batches of CONCURRENCY pages
    for (let i = 0; i < pageEntries.length; i += CONCURRENCY) {
      const batch = pageEntries.slice(i, i + CONCURRENCY);
      await Promise.all(batch.map(([idx, text]) => persistOnePage(idx, text)));
    }

    // Update the row with the audio URLs + timings we collected. We tolerate
    // partial failures — rows may end up with some null entries, and the
    // reader will fall back to /api/tts for those pages only.
    const gotAny = audioUrls.some((u) => u) || wordTimingsAll.some((w) => w);
    if (gotAny) {
      const { data: updated, error: updateErr } = await supabase
        .from("stories")
        .update({
          audio_urls: audioUrls,
          word_timings: wordTimingsAll,
        })
        .eq("id", story.id)
        .select()
        .single();
      if (updateErr) {
        console.warn("Failed to attach audio to story row:", updateErr.message);
        return NextResponse.json(story);
      }
      return NextResponse.json(updated);
    }

    return NextResponse.json(story);
  } catch (err) {
    console.error("Stories POST error:", err);
    return NextResponse.json({ error: "Failed to save story" }, { status: 500 });
  }
}
