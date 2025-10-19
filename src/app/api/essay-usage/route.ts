import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/getSession";
import { db } from "@/db";

// Type definitions removed as they were unused

// GET /api/essay-usage - Get user's essay usage statistics
export async function GET() {
  try {
    const sessionUser = await getSession();
    if (!sessionUser) {
      return NextResponse.json(
        { success: false, message: "Not authenticated" },
        { status: 401 }
      );
    }

    // Get user's current plan
    const user = await db.user.findUnique({
      where: { id: sessionUser.user.id },
      include: {
        plans: {
          where: { status: "ACTIVE" },
          take: 1,
          orderBy: { createdAt: "desc" }
        }
      }
    });

    if (!user) {
      return NextResponse.json(
        { success: false, message: "User not found" },
        { status: 404 }
      );
    }

    const currentPlan = user.plans[0] || null;

    // Get usage counts for this month
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    const [essayWriterUsage, essayGraderUsage] = await Promise.all([
      db.essayUsage.count({
        where: {
          userId: sessionUser.user.id,
          type: "essay_writer",
          createdAt: {
            gte: startOfMonth,
            lte: endOfMonth
          }
        }
      }),
      db.essayUsage.count({
        where: {
          userId: sessionUser.user.id,
          type: "essay_grader",
          createdAt: {
            gte: startOfMonth,
            lte: endOfMonth
          }
        }
      })
    ]);

    // For free users (no plan), set limits to 0 (no access)
    const isFreeUser = !currentPlan;
    const essayWriterLimit = isFreeUser ? 0 : (currentPlan?.numberOfEssayWriter || 0);
    const essayGraderLimit = isFreeUser ? 0 : (currentPlan?.numberOfEssayGrader || 0);

    return NextResponse.json({
      success: true,
      usage: {
        essayWriter: {
          used: essayWriterUsage,
          limit: essayWriterLimit,
          unlimited: !isFreeUser && essayWriterLimit === 0 // Only unlimited if user has a plan and limit is 0
        },
        essayGrader: {
          used: essayGraderUsage,
          limit: essayGraderLimit,
          unlimited: !isFreeUser && essayGraderLimit === 0 // Only unlimited if user has a plan and limit is 0
        }
      },
      plan: currentPlan ? {
        id: currentPlan.id,
        name: currentPlan.name,
        numberOfEssayWriter: currentPlan.numberOfEssayWriter,
        numberOfEssayGrader: currentPlan.numberOfEssayGrader
      } : {
        id: 0,
        name: "Free",
        numberOfEssayWriter: 0,
        numberOfEssayGrader: 0
      },
      isFreeUser: isFreeUser
    });
  } catch (error) {
    console.error("Error fetching essay usage:", error);
    return NextResponse.json(
      { error: "Failed to fetch essay usage" },
      { status: 500 }
    );
  }
}

// POST /api/essay-usage - Record essay usage
export async function POST(request: NextRequest) {
  try {
    const sessionUser = await getSession();
    if (!sessionUser) {
      return NextResponse.json(
        { success: false, message: "Not authenticated" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { type, fileId } = body;

    if (!type || !["essay_writer", "essay_grader"].includes(type)) {
      return NextResponse.json(
        { error: "Invalid usage type" },
        { status: 400 }
      );
    }

    // Check if user has reached their limit
    const user = await db.user.findUnique({
      where: { id: sessionUser.user.id },
      include: {
        plans: {
          where: { status: "ACTIVE" },
          take: 1,
          orderBy: { createdAt: "desc" }
        }
      }
    });

    if (!user) {
      return NextResponse.json(
        { success: false, message: "User not found" },
        { status: 404 }
      );
    }

    const currentPlan = user.plans[0];
    if (!currentPlan) {
      return NextResponse.json(
        { 
          success: false, 
          message: "You need to upgrade your plan to use this feature",
          isFreeUser: true
        },
        { status: 403 }
      );
    }

    // Check limits
    const limit = type === "essay_writer" ? currentPlan.numberOfEssayWriter : currentPlan.numberOfEssayGrader;
    if (limit > 0) {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

      const currentUsage = await db.essayUsage.count({
        where: {
          userId: sessionUser.user.id,
          type: type,
          createdAt: {
            gte: startOfMonth,
            lte: endOfMonth
          }
        }
      });

      if (currentUsage >= limit) {
        return NextResponse.json(
          { 
            success: false, 
            message: `You have reached your ${type.replace('_', ' ')} limit for this month`,
            limitReached: true
          },
          { status: 403 }
        );
      }
    }

    // Record the usage
    const usage = await db.essayUsage.create({
      data: {
        userId: sessionUser.user.id,
        type: type,
        fileId: fileId || null
      }
    });

    return NextResponse.json({
      success: true,
      usage: usage
    });
  } catch (error) {
    console.error("Error recording essay usage:", error);
    return NextResponse.json(
      { error: "Failed to record essay usage" },
      { status: 500 }
    );
  }
}
