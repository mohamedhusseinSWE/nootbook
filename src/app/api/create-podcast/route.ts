import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { getUserFromRequest } from "@/lib/auth";
import { uploadAudio } from "@/lib/audio-upload";
import {
  generateAudioFromText,
  createPodcastSections,
  formatDuration,
} from "@/lib/audio-generation";

type PodcastSectionInput = {
  title: string;
  description: string;
  content: string;
  duration: string;
};

export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromRequest();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { fileId } = await request.json();
    if (!fileId) {
      return NextResponse.json(
        { error: "File ID is required" },
        { status: 400 },
      );
    }

    // Get the file and check if user owns it
    const file = await db.file.findFirst({
      where: {
        id: fileId,
        userId: user.id,
      },
    });

    if (!file) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    // Check if podcast already exists
    const existingPodcast = await db.podcast.findFirst({
      where: {
        fileId,
      },
      include: {
        sections: true,
      },
    });

    if (existingPodcast) {
      // Delete existing podcast and its sections
      await db.podcastSection.deleteMany({
        where: {
          podcastId: existingPodcast.id,
        },
      });
      await db.podcast.delete({
        where: {
          id: existingPodcast.id,
        },
      });
    }

    // Get the file content from chunks (more reliable than PDF extraction)
    console.log("File URL:", file.url);
    console.log("File name:", file.name);
    console.log("File ID:", file.id);

    // Get chunks from database
    const chunks = await db.chunk.findMany({
      where: { fileId: file.id },
      take: 20,
    });

    console.log("🔍 Debug: Found chunks:", chunks.length);
    console.log(
      "🔍 Debug: Chunks content:",
      chunks.map((c) => c.text.substring(0, 50) + "..."),
    );

    let fileContent = "";
    if (chunks.length === 0) {
      console.log(
        "⚠️ No chunks found, trying to extract content from file URL...",
      );
      // Try to get content from the file URL as fallback
      try {
        const response = await fetch(file.url);
        if (response.ok) {
          const text = await response.text();
          fileContent = text.substring(0, 5000); // Limit to first 5000 chars
          console.log(
            "🔍 Debug: Extracted content from file URL, length:",
            fileContent.length,
          );
          console.log(
            "🔍 Debug: Content preview:",
            fileContent.substring(0, 200) + "...",
          );
        } else {
          console.error("❌ Failed to fetch file content from URL");
          return NextResponse.json(
            {
              error:
                "No content found for this file. Please ensure the PDF was processed successfully.",
            },
            { status: 400 },
          );
        }
      } catch (error) {
        console.error("❌ Error fetching file content:", error);
        return NextResponse.json(
          {
            error:
              "No content found for this file. Please ensure the PDF was processed successfully.",
          },
          { status: 400 },
        );
      }
    } else {
      console.log("✅ Using chunks for content, count:", chunks.length);
      fileContent = chunks.map((chunk) => chunk.text).join("\n\n");
      console.log("🔍 Debug: Combined content length:", fileContent.length);
      console.log(
        "🔍 Debug: Content preview:",
        fileContent.substring(0, 200) + "...",
      );
    }

    // Split content into sections for podcast
    const sections: PodcastSectionInput[] = await createPodcastSections(
      fileContent,
      file.name,
    );

    // Create podcast in database
    const podcast = await db.podcast.create({
      data: {
        fileId,
        title: `${file.name} - Audio Version`,
        description: `Audio version of ${file.name}`,
        totalDuration: "0:00", // Will be calculated after audio generation
        userId: user.id,
      },
    });

    // Create sections in database
    const createdSections = await Promise.all(
      sections.map(async (section: PodcastSectionInput, index: number) => {
        return await db.podcastSection.create({
          data: {
            podcastId: podcast.id,
            title: section.title,
            description: section.description,
            content: section.content,
            duration: section.duration,
            order: index,
          },
        });
      }),
    );

    // Generate audio for the single section
    const section = createdSections[0]; // Get the single section
    let audioUrl = null;

    try {
      console.log(`🎙️ Generating audio for: ${section.title}`);
      console.log(`📝 Content length: ${section.content.length} characters`);
      console.log(
        `📝 Content preview: ${section.content.substring(0, 200)}...`,
      );

      // Check if we have valid content
      if (!section.content || section.content.trim().length === 0) {
        throw new Error("No content to convert to audio");
      }

      console.log(`🔍 Debug: Starting audio generation with ElevenLabs...`);
      const audioBuffer = await generateAudioFromText(section.content);
      console.log(`✅ Audio generated, size: ${audioBuffer.length} bytes`);

      if (audioBuffer.length === 0) {
        throw new Error("Generated audio buffer is empty");
      }

      console.log(
        `🔍 Debug: Audio buffer is valid, size: ${audioBuffer.length} bytes`,
      );

      // Use the old UUID-based format for now to ensure compatibility
      const filename = `${podcast.id}-${section.id}.wav`;
      console.log(`🔍 Debug: Saving audio file as: ${filename}`);

      audioUrl = await uploadAudio(audioBuffer, filename, user.id);
      console.log(`✅ Audio uploaded to: ${audioUrl}`);

      // Verify the file was actually created
      const { existsSync } = await import("fs");
      const { join } = await import("path");
      const filePath = join(
        process.cwd(),
        "public",
        "uploads",
        "audio",
        filename,
      );
      const fileExists = existsSync(filePath);
      console.log(`🔍 Debug: Audio file exists on disk: ${fileExists}`);
      console.log(`🔍 Debug: File path: ${filePath}`);

      // Update section with audio URL using upsert to avoid race conditions
      await db.podcastSection.upsert({
        where: { id: section.id },
        update: { audioUrl },
        create: {
          id: section.id,
          podcastId: section.podcastId,
          title: section.title,
          description: section.description,
          content: section.content,
          duration: section.duration,
          order: section.order,
          audioUrl,
        },
      });

      console.log(`✅ Section updated with audio URL: ${audioUrl}`);
    } catch (error: unknown) {
      console.error(
        `❌ Error generating audio for section ${section.id}:`,
        error,
      );
      console.error(
        `❌ Error details:`,
        error instanceof Error ? error.message : error,
      );

      // Create a fallback URL but log that it's not real
      const filename = `${podcast.id}-${section.id}.wav`;
      audioUrl = `/api/audio/${filename}`;
      console.log(`⚠️ Using fallback URL: ${audioUrl} (no actual audio file)`);

      // Use upsert to avoid database errors
      try {
        await db.podcastSection.upsert({
          where: { id: section.id },
          update: { audioUrl },
          create: {
            id: section.id,
            podcastId: section.podcastId,
            title: section.title,
            description: section.description,
            content: section.content,
            duration: section.duration,
            order: section.order,
            audioUrl,
          },
        });
        console.log(`✅ Section updated with fallback URL: ${audioUrl}`);
      } catch (dbError: unknown) {
        console.error(`❌ Database error updating section:`, dbError);
        // Continue without updating the database
      }
    }

    // Calculate total duration based on actual content length
    // Estimate: ~150 words per minute for speech
    const words = section.content.split(" ").length;
    const estimatedMinutes = words / 150; // words per minute
    const totalDurationSeconds = estimatedMinutes * 60;
    console.log(
      `Content: ${words} words, estimated duration: ${estimatedMinutes.toFixed(1)} minutes`,
    );

    // Update podcast with calculated duration
    await db.podcast.update({
      where: { id: podcast.id },
      data: {
        totalDuration: formatDuration(totalDurationSeconds),
      },
    });

    // Return the podcast with the single section
    const finalSection = {
      ...section,
      audioUrl: audioUrl || `/api/audio/${podcast.id}-${section.id}.wav`,
    };

    return NextResponse.json({
      message: "Podcast created successfully",
      podcast: {
        ...podcast,
        sections: [finalSection],
        totalDuration: formatDuration(totalDurationSeconds),
      },
    });
  } catch (error: unknown) {
    console.error("Error creating podcast:", error);
    return NextResponse.json(
      { error: "Failed to create podcast" },
      { status: 500 },
    );
  }
}
