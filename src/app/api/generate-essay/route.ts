import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/getSession";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const sessionUser = await getSession();
    if (!sessionUser) {
      return NextResponse.json(
        { success: false, message: "Not authenticated" },
        { status: 401 }
      );
    }

    // Check if OpenAI API key is configured
    if (!process.env.OPENAI_API_KEY) {
      console.error("OpenAI API key not configured");
      return NextResponse.json(
        { error: "AI service not configured. Please contact support." },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { prompt, fileId, context } = body;

    if (!prompt || !prompt.trim()) {
      return NextResponse.json(
        { error: "Essay prompt is required" },
        { status: 400 }
      );
    }

    console.log("Generating essay for user:", sessionUser.user.id);
    console.log("Prompt:", prompt.substring(0, 100) + "...");

    // Create a comprehensive prompt for essay generation
    const systemPrompt = `You are an expert essay writer and academic writing assistant. Your task is to generate a well-structured, high-quality essay based on the given prompt.

Guidelines for essay generation:
1. Create a clear and compelling thesis statement
2. Use proper essay structure (introduction, body paragraphs, conclusion)
3. Include relevant examples and evidence
4. Maintain academic tone and style
5. Ensure logical flow and coherence
6. Use proper transitions between paragraphs
7. Write in clear, concise language
8. Aim for 500-1000 words unless specified otherwise

${context ? `Additional context: ${context}` : ''}

Generate a comprehensive essay that addresses the prompt thoroughly and professionally.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo", // Using more reliable model
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      max_tokens: 2000,
      temperature: 0.7,
    });

    const essay = completion.choices[0]?.message?.content;

    if (!essay) {
      return NextResponse.json(
        { error: "Failed to generate essay" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      essay: essay,
    });
  } catch (error) {
    console.error("Error generating essay:", error);
    return NextResponse.json(
      { 
        error: "Failed to generate essay. Please try again.",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}