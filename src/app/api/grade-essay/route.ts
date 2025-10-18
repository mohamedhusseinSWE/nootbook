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
    const { essay, criteria, fileId, context } = body;

    if (!essay || !essay.trim()) {
      return NextResponse.json(
        { error: "Essay text is required" },
        { status: 400 }
      );
    }

    console.log("Grading essay for user:", sessionUser.user.id);
    console.log("Essay length:", essay.length);

    // Create a comprehensive prompt for essay grading
    const systemPrompt = `You are an expert academic writing instructor and essay grader. Your task is to provide comprehensive feedback and grading for the submitted essay.

Grading criteria to evaluate:
1. Content and Ideas (25 points): Thesis clarity, argument strength, evidence quality, depth of analysis
2. Organization and Structure (20 points): Logical flow, paragraph structure, transitions, introduction/conclusion
3. Language and Style (20 points): Clarity, conciseness, vocabulary, sentence variety
4. Grammar and Mechanics (15 points): Grammar, punctuation, spelling, sentence structure
5. Originality and Creativity (10 points): Unique insights, creative approach, fresh perspective
6. Adherence to Requirements (10 points): Following prompt, word count, format requirements

${criteria ? `Additional grading criteria: ${criteria}` : ''}

${context ? `Additional context: ${context}` : ''}

Provide:
1. Overall score out of 100
2. Letter grade (A+, A, B+, B, C+, C, D, F)
3. Detailed feedback explaining the score
4. At least 3 specific strengths
5. At least 3 specific areas for improvement
6. Actionable suggestions for improvement

Format your response as JSON with the following structure:
{
  "score": number (0-100),
  "grade": string (A+, A, B+, B, C+, C, D, F),
  "feedback": string (detailed feedback),
  "strengths": string[] (array of strengths),
  "improvements": string[] (array of improvement areas)
}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo", // Using more reliable model
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: `Please grade this essay:\n\n${essay}`,
        },
      ],
      max_tokens: 1500,
      temperature: 0.3,
    });

    const response = completion.choices[0]?.message?.content;

    if (!response) {
      return NextResponse.json(
        { error: "Failed to grade essay" },
        { status: 500 }
      );
    }

    try {
      // Parse the JSON response
      const grading = JSON.parse(response);
      
      // Validate the response structure
      if (!grading.score || !grading.grade || !grading.feedback || !grading.strengths || !grading.improvements) {
        throw new Error("Invalid grading response structure");
      }

      return NextResponse.json({
        success: true,
        grading: grading,
      });
    } catch (parseError) {
      console.error("Error parsing grading response:", parseError);
      // Fallback response if JSON parsing fails
      return NextResponse.json({
        success: true,
        grading: {
          score: 75,
          grade: "B",
          feedback: response,
          strengths: ["Good effort", "Clear structure", "Relevant content"],
          improvements: ["Improve grammar", "Strengthen arguments", "Add more evidence"]
        }
      });
    }
  } catch (error) {
    console.error("Error grading essay:", error);
    return NextResponse.json(
      { 
        error: "Failed to grade essay. Please try again.",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}