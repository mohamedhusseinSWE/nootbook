import { db } from "@/db";
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getUserFromRequest } from "@/lib/auth";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // use your OpenAI key here
  // No need to set baseURL – default points to OpenAI
});

// Define Flashcard type
type Flashcard = {
  question: string;
  answer: string;
};

export async function POST(req: NextRequest) {
  try {
    // Get user session using Better Auth
    const user = await getUserFromRequest();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { fileId } = await req.json();
    console.log("=== CREATE FLASHCARDS API CALLED ===");
    console.log("Create flashcards API called with fileId:", fileId);

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
      take: 30, // Get more content for better generation
      orderBy: { createdAt: "asc" },
    });

    console.log("Number of chunks found:", chunks.length);

    if (!chunks.length) {
      console.log("No chunks found for fileId:", fileId);
      return NextResponse.json(
        { error: "No PDF content found for this file." },
        { status: 400 },
      );
    }

    const pdfContent = chunks.map((c) => c.text).join("\n\n");
    console.log("PDF content length:", pdfContent.length);
    console.log(
      "PDF content preview (first 1000 chars):",
      pdfContent.substring(0, 1000),
    );
    console.log(
      "PDF content preview (last 500 chars):",
      pdfContent.substring(pdfContent.length - 500),
    );

    // Enhanced prompt for real content generation
    const prompt = `
You are an expert flashcard creator. Based on the following PDF content, create 16 educational flashcards that cover specific facts, details, and key information mentioned in the text.

CRITICAL REQUIREMENTS:
1. Create exactly 16 flashcards
2. Each flashcard must have a clear, specific question and a concise, accurate answer
3. Questions MUST be specific to the actual content provided - use real facts, names, dates, and details from the text
4. Do NOT create generic flashcards - make them specific to what's actually in the PDF
5. Use exact names, facts, and details mentioned in the content
6. Cover different types of questions: definitions, facts, achievements, career details, statistics, etc.
7. Return ONLY valid JSON in this exact format:

[
  {
    "question": "Specific question about actual content from the PDF",
    "answer": "Concise, accurate answer based on the specific content"
  }
]

PDF Content to analyze:
${pdfContent}

IMPORTANT: Create flashcards that test knowledge of the specific facts, people, events, achievements, and details mentioned in this exact content. Do not create generic flashcards.

Generate the flashcards now:`;

    console.log("Sending prompt to OpenAI...");

    // Call OpenAI with enhanced retry logic
    let cards: Flashcard[] | null = null;
    let attempts = 0;
    const maxAttempts = 5; // Increased attempts

    while (!cards && attempts < maxAttempts) {
      attempts++;
      console.log(`=== ATTEMPT ${attempts} TO GENERATE FLASHCARDS ===`);

      try {
        const response = await openai.chat.completions.create({
          model: "gpt-4", // Use GPT-4 here

          temperature: 0.1,
          max_tokens: 3500, // Increased tokens
          messages: [
            {
              role: "system",
              content:
                "You are a professional flashcard creator. You must create flashcards that are SPECIFIC to the provided content. Use exact facts, names, dates, and details from the text. Never create generic flashcards. Always respond with valid JSON only. If you cannot create specific flashcards from the content, respond with an empty array [].",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
        });

        const raw = response.choices[0]?.message?.content?.trim();
        console.log("=== LLM RAW RESPONSE ===");
        console.log("LLM raw response:", raw);

        if (!raw) {
          throw new Error("Empty response from LLM");
        }

        // Try multiple parsing strategies
        let parsedCards = null;

        // Strategy 1: Direct JSON parse
        try {
          parsedCards = JSON.parse(raw);
          if (Array.isArray(parsedCards) && parsedCards.length > 0) {
            cards = parsedCards;
            console.log("Successfully parsed JSON directly");
            break;
          }
        } catch {
          console.log("Direct JSON parse failed, trying extraction...");
        }

        // Strategy 2: Extract JSON from markdown code blocks
        const codeBlockMatch = raw.match(/```(?:json)?\s*(\[[\s\S]*?\])\s*```/);
        if (codeBlockMatch) {
          try {
            parsedCards = JSON.parse(codeBlockMatch[1]);
            if (Array.isArray(parsedCards) && parsedCards.length > 0) {
              cards = parsedCards;
              console.log("Successfully parsed JSON from code block");
              break;
            }
          } catch {
            console.log("Code block JSON parse failed");
          }
        }

        // Strategy 3: Extract first JSON array
        const arrayMatch = raw.match(/\[[\s\S]*?\]/);
        if (arrayMatch) {
          try {
            parsedCards = JSON.parse(arrayMatch[0]);
            if (Array.isArray(parsedCards) && parsedCards.length > 0) {
              cards = parsedCards;
              console.log("Successfully parsed JSON array");
              break;
            }
          } catch {
            console.log("Array extraction parse failed");
          }
        }

        // Strategy 4: Clean and try to parse
        const cleaned = raw
          .replace(/^[^{]*/, "")
          .replace(/[^}]*$/, "")
          .replace(/```/g, "")
          .trim();

        try {
          parsedCards = JSON.parse(cleaned);
          if (Array.isArray(parsedCards) && parsedCards.length > 0) {
            cards = parsedCards;
            console.log("Successfully parsed cleaned JSON");
            break;
          }
        } catch {
          console.log("Cleaned JSON parse failed");
        }

        // If all parsing strategies failed, try again
        if (!cards) {
          console.log(`Attempt ${attempts} failed to parse JSON, retrying...`);
          if (attempts < maxAttempts) {
            await new Promise((resolve) => setTimeout(resolve, 2000)); // Increased delay
          }
        }
      } catch (error: unknown) {
        console.error(`Error in attempt ${attempts}:`, error);
        if (attempts < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }
    }

    // If AI fails completely, return error instead of static content
    if (!cards || !Array.isArray(cards) || cards.length === 0) {
      console.log("=== AI GENERATION FAILED COMPLETELY ===");
      console.log("AI generation failed completely after all attempts");
      return NextResponse.json(
        {
          error:
            "Failed to generate flashcards from PDF content. Please try again.",
        },
        { status: 500 },
      );
    }

    // Validate and clean cards
    cards = cards.filter(
      (card) =>
        card.question &&
        card.answer &&
        card.question.trim().length > 10 &&
        card.answer.trim().length > 5,
    );

    if (cards.length === 0) {
      console.log("=== VALIDATION FAILED ===");
      console.log("Generated flashcards are not in the correct format");
      return NextResponse.json(
        {
          error:
            "Generated flashcards are not in the correct format. Please try again.",
        },
        { status: 500 },
      );
    }

    console.log("=== FLASHCARDS GENERATION SUCCESSFUL ===");
    console.log(`Generated ${cards.length} valid flashcards from PDF content:`);
    cards.forEach((card, index) => {
      console.log(`Flashcard ${index + 1}:`, card.question);
      console.log(`Answer:`, card.answer);
    });

    // Save flashcards to DB
    try {
      const flashcards = await db.flashcards.create({
        data: {
          fileId,
          title: "Generated Flashcards",
          cards: {
            create: cards.map((card: Flashcard) => ({
              question: card.question,
              answer: card.answer,
            })),
          },
        },
        include: { cards: true },
      });

      console.log("=== FLASHCARDS SAVED TO DATABASE ===");
      console.log("Flashcards saved to database successfully");
      console.log("Flashcards ID:", flashcards.id);
      console.log("Number of cards saved:", flashcards.cards.length);
      return NextResponse.json({ flashcards });
    } catch (dbError: unknown) {
      console.error("=== DATABASE ERROR ===");
      console.error("Database error:", dbError);
      // Return the generated cards even if DB save fails
      const flashcards = {
        id: "generated-flashcards-id",
        fileId,
        title: "Generated Flashcards",
        cards: cards.map((card: Flashcard, index: number) => ({
          id: `card-${index}`,
          flashcardsId: "generated-flashcards-id",
          question: card.question,
          answer: card.answer,
          createdAt: new Date(),
        })),
        createdAt: new Date(),
      };
      return NextResponse.json({ flashcards });
    }
  } catch (error: unknown) {
    console.error("=== API ERROR ===");
    console.error("API error:", error);
    return NextResponse.json(
      { error: "Failed to create flashcards" },
      { status: 500 },
    );
  }
}
