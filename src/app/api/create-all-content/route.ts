import { db } from "@/db";
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getUserFromRequest } from "@/lib/auth";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // use your OpenAI key here
  // No need to set baseURL – default points to OpenAI
});

export async function POST(req: NextRequest) {
  try {
    // Get user session using Better Auth
    const user = await getUserFromRequest();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { fileId } = await req.json();
    console.log("Create all content API called with fileId:", fileId);

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
      take: 30, // Get more chunks for comprehensive content
      orderBy: { createdAt: "asc" },
    });

    if (!chunks.length) {
      return NextResponse.json(
        { error: "No PDF content found for this file." },
        { status: 400 },
      );
    }

    const pdfContent = chunks.map((c) => c.text).join("\n\n");
    console.log("PDF content length:", pdfContent.length);

    // Check if content already exists
    const existingQuiz = await db.quiz.findFirst({ where: { fileId } });
    const existingFlashcards = await db.flashcards.findFirst({
      where: { fileId },
    });
    const existingTranscript = await db.transcript.findFirst({
      where: { fileId },
    });

    if (existingQuiz && existingFlashcards && existingTranscript) {
      console.log("All content already exists, returning existing data");
      return NextResponse.json({
        quiz: existingQuiz,
        flashcards: existingFlashcards,
        transcript: existingTranscript,
        message: "Content already exists",
      });
    }

    // Enhanced prompts for real content generation
    const quizPrompt = `
You are an expert quiz creator. Based on the following PDF content, create 5 challenging multiple-choice questions that test understanding of the specific facts, details, and key information mentioned in the text.

CRITICAL REQUIREMENTS:
1. Create exactly 5 questions
2. Each question must have exactly 4 options (A, B, C, D)
3. Only one option should be correct
4. Questions MUST be specific to the actual content provided - use real facts, names, dates, and details from the text
5. Do NOT create generic questions - make them specific to what's actually in the PDF
6. Use exact names, facts, and details mentioned in the content
7. Return ONLY valid JSON in this exact format:

[
  {
    "question": "Specific question about actual content from the PDF",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "answer": "A"
  }
]

PDF Content to analyze:
${pdfContent}

IMPORTANT: Create questions that test knowledge of the specific facts, people, events, and details mentioned in this exact content. Do not create generic questions.`;

    const flashcardsPrompt = `
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

IMPORTANT: Create flashcards that test knowledge of the specific facts, people, events, achievements, and details mentioned in this exact content. Do not create generic flashcards.`;

    const transcriptPrompt = `
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

    // Generate all content in parallel with enhanced retry logic
    const [quizResponse, flashcardsResponse, transcriptResponse] =
      await Promise.all([
        // Quiz generation
        openai.chat.completions.create({
          model: "deepseek/deepseek-r1:free",
          temperature: 0.1,
          max_tokens: 3000,
          messages: [
            {
              role: "system",
              content:
                "You are a professional quiz creator. You must create questions that are SPECIFIC to the provided content. Use exact facts, names, dates, and details from the text. Never create generic questions. Always respond with valid JSON only. If you cannot create specific questions from the content, respond with an empty array [].",
            },
            {
              role: "user",
              content: quizPrompt,
            },
          ],
        }),
        // Flashcards generation
        openai.chat.completions.create({
          model: "deepseek/deepseek-r1:free",
          temperature: 0.1,
          max_tokens: 3500,
          messages: [
            {
              role: "system",
              content:
                "You are a professional flashcard creator. You must create flashcards that are SPECIFIC to the provided content. Use exact facts, names, dates, and details from the text. Never create generic flashcards. Always respond with valid JSON only. If you cannot create specific flashcards from the content, respond with an empty array [].",
            },
            {
              role: "user",
              content: flashcardsPrompt,
            },
          ],
        }),
        // Transcript generation
        openai.chat.completions.create({
          model: "deepseek/deepseek-r1:free",
          temperature: 0.1,
          max_tokens: 4000,
          messages: [
            {
              role: "system",
              content:
                "You are a professional transcript creator. You must preserve ALL information from the provided content while improving formatting and readability. Never add or remove important facts. If you cannot create a proper transcript from the content, respond with 'Unable to generate transcript from provided content.'",
            },
            {
              role: "user",
              content: transcriptPrompt,
            },
          ],
        }),
      ]);

    // Add types for quiz and flashcards
    type QuizQuestion = {
      question: string;
      options: string[];
      answer: "A" | "B" | "C" | "D";
    };

    type Flashcard = {
      question: string;
      answer: string;
    };

    // Parse responses with enhanced error handling
    let quizQuestions: QuizQuestion[] | undefined,
      flashcardCards: Flashcard[] | undefined;

    // Parse quiz response
    try {
      const quizRaw = quizResponse.choices[0]?.message?.content?.trim();
      if (!quizRaw) {
        throw new Error("Empty quiz response");
      }

      // Try multiple parsing strategies for quiz
      let parsedQuiz: unknown = null;

      // Strategy 1: Direct JSON parse
      try {
        parsedQuiz = JSON.parse(quizRaw);
        if (Array.isArray(parsedQuiz) && parsedQuiz.length > 0) {
          quizQuestions = parsedQuiz as QuizQuestion[];
        }
      } catch {
        // Strategy 2: Extract JSON from markdown code blocks
        const codeBlockMatch = quizRaw.match(
          /```(?:json)?\s*(\[[\s\S]*?\])\s*```/,
        );
        if (codeBlockMatch) {
          try {
            parsedQuiz = JSON.parse(codeBlockMatch[1]);
            if (Array.isArray(parsedQuiz) && parsedQuiz.length > 0) {
              quizQuestions = parsedQuiz as QuizQuestion[];
            }
          } catch {
            // Strategy 3: Extract first JSON array
            const arrayMatch = quizRaw.match(/\[[\s\S]*?\]/);
            if (arrayMatch) {
              try {
                parsedQuiz = JSON.parse(arrayMatch[0]);
                if (Array.isArray(parsedQuiz) && parsedQuiz.length > 0) {
                  quizQuestions = parsedQuiz as QuizQuestion[];
                }
              } catch {
                throw new Error("Failed to parse quiz JSON");
              }
            }
          }
        }
      }

      if (!quizQuestions) {
        throw new Error("No valid quiz questions found");
      }
    } catch {
      console.error("Error parsing quiz response:");
      return NextResponse.json(
        {
          error:
            "Failed to generate quiz questions from PDF content. Please try again.",
        },
        { status: 500 },
      );
    }

    // Parse flashcards response
    try {
      const flashcardsRaw =
        flashcardsResponse.choices[0]?.message?.content?.trim();
      if (!flashcardsRaw) {
        throw new Error("Empty flashcards response");
      }

      // Try multiple parsing strategies for flashcards
      let parsedFlashcards: unknown = null;

      // Strategy 1: Direct JSON parse
      try {
        parsedFlashcards = JSON.parse(flashcardsRaw);
        if (Array.isArray(parsedFlashcards) && parsedFlashcards.length > 0) {
          flashcardCards = parsedFlashcards as Flashcard[];
        }
      } catch {
        // Strategy 2: Extract JSON from markdown code blocks
        const codeBlockMatch = flashcardsRaw.match(
          /```(?:json)?\s*(\[[\s\S]*?\])\s*```/,
        );
        if (codeBlockMatch) {
          try {
            parsedFlashcards = JSON.parse(codeBlockMatch[1]);
            if (
              Array.isArray(parsedFlashcards) &&
              parsedFlashcards.length > 0
            ) {
              flashcardCards = parsedFlashcards as Flashcard[];
            }
          } catch {
            // Strategy 3: Extract first JSON array
            const arrayMatch = flashcardsRaw.match(/\[[\s\S]*?\]/);
            if (arrayMatch) {
              try {
                parsedFlashcards = JSON.parse(arrayMatch[0]);
                if (
                  Array.isArray(parsedFlashcards) &&
                  parsedFlashcards.length > 0
                ) {
                  flashcardCards = parsedFlashcards as Flashcard[];
                }
              } catch {
                throw new Error("Failed to parse flashcards JSON");
              }
            }
          }
        }
      }

      if (!flashcardCards) {
        throw new Error("No valid flashcards found");
      }
    } catch {
      console.error("Error parsing flashcards response:");
      return NextResponse.json(
        {
          error:
            "Failed to generate flashcards from PDF content. Please try again.",
        },
        { status: 500 },
      );
    }

    // Parse transcript response
    const transcriptContent =
      transcriptResponse.choices[0]?.message?.content?.trim();
    if (!transcriptContent) {
      return NextResponse.json(
        {
          error:
            "Failed to generate transcript from PDF content. Please try again.",
        },
        { status: 500 },
      );
    }

    // Check if transcript response indicates failure
    if (
      transcriptContent.toLowerCase().includes("unable to generate") ||
      transcriptContent.toLowerCase().includes("cannot create")
    ) {
      return NextResponse.json(
        {
          error:
            "Failed to generate transcript from PDF content. Please try again.",
        },
        { status: 500 },
      );
    }

    // Validate quiz questions
    quizQuestions = quizQuestions.filter(
      (q) =>
        q.question &&
        Array.isArray(q.options) &&
        q.options.length === 4 &&
        q.answer &&
        ["A", "B", "C", "D"].includes(q.answer),
    );

    if (quizQuestions.length === 0) {
      return NextResponse.json(
        {
          error:
            "Generated quiz questions are not in the correct format. Please try again.",
        },
        { status: 500 },
      );
    }

    // Validate flashcards
    flashcardCards = flashcardCards.filter(
      (card) =>
        card.question &&
        card.answer &&
        card.question.trim().length > 10 &&
        card.answer.trim().length > 5,
    );

    if (flashcardCards.length === 0) {
      return NextResponse.json(
        {
          error:
            "Generated flashcards are not in the correct format. Please try again.",
        },
        { status: 500 },
      );
    }

    console.log(
      `Generated ${quizQuestions.length} quiz questions, ${flashcardCards.length} flashcards, and transcript from PDF content`,
    );

    // Save all content to database
    const [quiz, flashcards, transcript] = await Promise.all([
      // Save quiz if it doesn't exist
      existingQuiz ||
        db.quiz.create({
          data: {
            fileId,
            title: "Generated Quiz",
            questions: {
              create: quizQuestions.map((q) => ({
                question: q.question,
                options: q.options,
                answer: q.answer,
              })),
            },
          },
          include: { questions: true },
        }),
      // Save flashcards if they don't exist
      existingFlashcards ||
        db.flashcards.create({
          data: {
            fileId,
            title: "Generated Flashcards",
            cards: {
              create: flashcardCards.map((card) => ({
                question: card.question,
                answer: card.answer,
              })),
            },
          },
          include: { cards: true },
        }),
      // Save transcript if it doesn't exist
      existingTranscript ||
        db.transcript.create({
          data: {
            fileId,
            title: "Generated Transcript",
            content: transcriptContent,
          },
        }),
    ]);

    console.log("All content saved to database successfully");
    return NextResponse.json({
      quiz,
      flashcards,
      transcript,
      message: "All content generated and saved successfully",
    });
  } catch {
    console.error("API error:");
    return NextResponse.json(
      { error: "Failed to create content" },
      { status: 500 },
    );
  }
}
