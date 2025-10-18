import { db } from "@/db";
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getUserFromRequest } from "@/lib/auth";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: NextRequest) {
  try {
    // Get user session using Better Auth
    const user = await getUserFromRequest();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { fileId } = await req.json();
    console.log("Create transcript API called with fileId:", fileId);

    // Verify user owns the file
    const file = await db.file.findFirst({
      where: { id: fileId, userId: user.id },
    });

    if (!file) {
      return NextResponse.json({ error: "File not found or access denied" }, { status: 404 });
    }

    // Fetch PDF content (chunks)
    const chunks = await db.chunk.findMany({
      where: { fileId },
      take: 30, // Get more chunks for comprehensive transcript
      orderBy: { createdAt: "asc" }, // Ensure we get content in order
    });

    if (!chunks.length) {
      return NextResponse.json(
        { error: "No PDF content found for this file." },
        { status: 400 },
      );
    }

    const pdfContent = chunks.map((c) => c.text).join("\n\n");
    console.log("PDF content length:", pdfContent.length);
    console.log("PDF content preview:", pdfContent.substring(0, 500));

    // Enhanced prompt for better transcript generation
    const prompt = `
You are an expert transcript creator. Based on the following PDF content, create a comprehensive, well-structured transcript that maintains all the important information while improving readability and organization.

CRITICAL REQUIREMENTS:
1. Preserve ALL important facts, names, dates, and details from the original content
2. Organize the content into logical sections with clear headings
3. Maintain the chronological order and flow of information
4. Use proper paragraph breaks and formatting
5. Make the text more readable while keeping all original information
6. Do NOT add any information that is not in the original content
7. Do NOT remove any important details from the original content
8. Return ONLY the formatted transcript text

PDF Content to transcribe:
${pdfContent}

Create a well-structured transcript now:`;

    // Call OpenAI with enhanced retry logic
    let transcriptText = null;
    let attempts = 0;
    const maxAttempts = 5; // Increased attempts

    while (!transcriptText && attempts < maxAttempts) {
      attempts++;
      console.log(`Attempt ${attempts} to generate transcript...`);

      try {
        const response = await openai.chat.completions.create({
          model: "gpt-4", // Use GPT-4 here

          temperature: 0.1, // Very low temperature for consistent output
          max_tokens: 4000, // Increased for longer transcripts
          messages: [
            {
              role: "system",
              content:
                "You are a professional transcript creator. You must preserve ALL information from the provided content while improving formatting and readability. Never add or remove important facts. If you cannot create a proper transcript from the content, respond with 'Unable to generate transcript from provided content.'",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
        });

        transcriptText = response.choices[0]?.message?.content?.trim();
        console.log("Transcript generated successfully");

        if (!transcriptText) {
          throw new Error("Empty response from LLM");
        }

        // Check if the response indicates failure
        if (
          transcriptText.toLowerCase().includes("unable to generate") ||
          transcriptText.toLowerCase().includes("cannot create")
        ) {
          throw new Error("LLM indicated it cannot generate transcript");
        }

        break;
      } catch (error) {
        console.error(`Error in attempt ${attempts}:`, error);
        if (attempts < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, 2000)); // Increased delay
        }
      }
    }

    // If AI fails completely, return error instead of static content
    if (!transcriptText) {
      console.log("AI generation failed completely after all attempts");
      return NextResponse.json(
        {
          error:
            "Failed to generate transcript from PDF content. Please try again.",
        },
        { status: 500 },
      );
    }

    // Save transcript to DB
    try {
      const transcript = await db.transcript.create({
        data: {
          fileId,
          title: "Generated Transcript",
          content: transcriptText,
        },
      });

      console.log("Transcript saved to database successfully");
      return NextResponse.json({ transcript });
    } catch (dbError: unknown) {
      console.error("Database error:", dbError);
      // Return the generated transcript even if DB save fails
      console.log("Database save failed, returning generated transcript");
      const transcript = {
        id: "generated-transcript-id",
        fileId,
        title: "Generated Transcript",
        content: transcriptText,
        createdAt: new Date(),
      };
      return NextResponse.json({ transcript });
    }
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json(
      { error: "Failed to create transcript" },
      { status: 500 },
    );
  }
}
