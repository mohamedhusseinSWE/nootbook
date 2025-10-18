import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/getSession";
import { db } from "@/db";

// GET /api/library/topics - Get all topics for the user
export async function GET(request: NextRequest) {
  try {
    const sessionUser = await getSession();
    if (!sessionUser)
      return NextResponse.json(
        { success: false, message: "Not authenticated" },
        { status: 401 },
      );

    const topics = await (db as any).libraryTopic.findMany({
      where: {
        userId: sessionUser.user.id,
      },
      include: {
        _count: {
          select: {
            notes: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    const topicsWithCount = topics.map((topic: any) => ({
      id: topic.id,
      name: topic.name,
      description: topic.description,
      createdAt: topic.createdAt.toISOString(),
      updatedAt: topic.updatedAt.toISOString(),
      noteCount: topic._count.notes,
      tags: topic.tags,
    }));

    return NextResponse.json({ 
      success: true, 
      topics: topicsWithCount 
    });
  } catch (error) {
    console.error("Error fetching topics:", error);
    return NextResponse.json(
      { error: "Failed to fetch topics" },
      { status: 500 }
    );
  }
}

// POST /api/library/topics - Create a new topic
export async function POST(request: NextRequest) {
  try {
    const sessionUser = await getSession();
    if (!sessionUser)
      return NextResponse.json(
        { success: false, message: "Not authenticated" },
        { status: 401 },
      );

    const body = await request.json();
    const { name, description } = body;

    if (!name || !name.trim()) {
      return NextResponse.json(
        { error: "Topic name is required" },
        { status: 400 }
      );
    }

    const topic = await (db as any).libraryTopic.create({
      data: {
        name: name.trim(),
        description: description?.trim() || "",
        userId: sessionUser.user.id,
        tags: [],
      },
    });

    return NextResponse.json({
      success: true,
      topic: {
        id: topic.id,
        name: topic.name,
        description: topic.description,
        createdAt: topic.createdAt.toISOString(),
        updatedAt: topic.updatedAt.toISOString(),
        noteCount: 0,
        tags: topic.tags,
      },
    });
  } catch (error) {
    console.error("Error creating topic:", error);
    return NextResponse.json(
      { error: "Failed to create topic" },
      { status: 500 }
    );
  }
}
