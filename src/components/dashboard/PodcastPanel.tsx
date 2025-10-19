"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Play,
  Pause,
  Headphones,
  RefreshCw,
  Rewind,
  FastForward,
} from "lucide-react";
import { getPodcast } from "@/lib/actions";

interface PodcastPanelProps {
  fileId: string;
  initialPodcast?: Podcast;
}

interface PodcastSection {
  id: string;
  title: string;
  description: string;
  content: string;
  duration: string;
  audioUrl?: string | null;
  // Enhanced fields
  audioStorageKey?: string | null;
  audioFileSize?: number | null;
  audioFormat?: string | null;
  isProcessed?: boolean;
  processingError?: string | null;
  generationMethod?: string | null;
}

interface Speaker {
  id: string;
  name: string;
  role?: string; // optional, e.g., "host" or "guest"
}

interface VoiceSettings {
  pitch?: number;
  speed?: number;
  voiceName?: string;
  language?: string;
}


interface Podcast {
  id: string;
  title: string;
  description: string;
  totalDuration: string;
  sections: PodcastSection[];
  // Enhanced fields
  audioStorageKey?: string | null;
  audioFileSize?: number | null;
  audioFormat?: string | null;
  autoDeleteAt?: string | null;
  isProcessed?: boolean;
  processingError?: string | null;
  generationMethod?: string | null;
  speakers?: Speaker[];           // <-- fixed
  voiceSettings?: VoiceSettings;  // <-- fixed
}

const PodcastPanel: React.FC<PodcastPanelProps> = ({
  fileId,
  initialPodcast,
}) => {
  const [podcast, setPodcast] = useState<Podcast | null>(
    initialPodcast || null,
  );
  const [loading, setLoading] = useState(!initialPodcast);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentSection, setCurrentSection] = useState<PodcastSection | null>(
    null,
  );

  // Use refs to maintain audio state across renders
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentSectionRef = useRef<PodcastSection | null>(null);

  const fetchPodcast = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Use server action instead of API route
      const result = await getPodcast(fileId);
      console.log("Podcast data fetched:", result);

      if (result.error) {
        setError("No podcast found");
      } else if (result.podcast) {
        setPodcast(result.podcast);
        if (result.podcast.sections.length > 0) {
          setCurrentSection(result.podcast.sections[0]);
          currentSectionRef.current = result.podcast.sections[0];
        }
      } else {
        setError("No podcast found");
      }
    } catch (err) {
      console.error("Error fetching podcast:", err);
      setError("Failed to load podcast");
    } finally {
      setLoading(false);
    }
  }, [fileId]);

  const handleRegenerate = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      console.log("🔄 Regenerating podcast...");
      
      // Import the createPodcast action
      const { createPodcast } = await import('@/lib/actions');
      
      // Regenerate the podcast
      const result = await createPodcast(fileId);
      
      if (result.error) {
        setError(result.error);
      } else if (result.podcast) {
        setPodcast(result.podcast);
        if (result.podcast.sections.length > 0) {
          setCurrentSection(result.podcast.sections[0]);
          currentSectionRef.current = result.podcast.sections[0];
        }
        console.log("✅ Podcast regenerated successfully!");
      }
    } catch (err) {
      console.error("Error regenerating podcast:", err);
      setError("Failed to regenerate podcast");
    } finally {
      setLoading(false);
    }
  }, [fileId]);

  useEffect(() => {
    if (!initialPodcast) {
      fetchPodcast();
    } else if (initialPodcast.sections.length > 0) {
      setCurrentSection(initialPodcast.sections[0]);
      currentSectionRef.current = initialPodcast.sections[0];
    }
  }, [fileId, initialPodcast, fetchPodcast]);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const setupAudio = (audioUrl: string) => {
    console.log("Setting up audio with URL:", audioUrl);

    // Clean up existing audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.removeEventListener("timeupdate", handleTimeUpdate);
      audioRef.current.removeEventListener(
        "loadedmetadata",
        handleLoadedMetadata,
      );
      audioRef.current.removeEventListener("ended", handleEnded);
      audioRef.current.removeEventListener("error", handleError);
    }

    // Create new audio element
    const audio = new Audio(audioUrl);
    audioRef.current = audio;

    // Add event listeners
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);

    // Add load event listener for debugging
    audio.addEventListener("loadstart", () => {
      console.log("Audio load started for:", audioUrl);
    });

    audio.addEventListener("canplay", () => {
      console.log("Audio can play for:", audioUrl);
    });

    audio.addEventListener("canplaythrough", () => {
      console.log("Audio can play through for:", audioUrl);
    });

    return audio;
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      console.log(
        "Audio metadata loaded, duration:",
        audioRef.current.duration,
      );
      setDuration(audioRef.current.duration);
    }
  };

  const handleEnded = () => {
    setIsPlaying(false);
    setCurrentTime(0);
  };

  const handleError = (e: Event) => {
    const audioElement = e.target as HTMLAudioElement;
    console.error("Audio error:", {
      error: audioElement.error,
      networkState: audioElement.networkState,
      readyState: audioElement.readyState,
      src: audioElement.src,
      currentSrc: audioElement.currentSrc,
    });

    let errorMessage = "Failed to load audio file";
    if (audioElement.error) {
      switch (audioElement.error.code) {
        case MediaError.MEDIA_ERR_ABORTED:
          errorMessage = "Audio playback was aborted";
          break;
        case MediaError.MEDIA_ERR_NETWORK:
          errorMessage = "Network error while loading audio";
          break;
        case MediaError.MEDIA_ERR_DECODE:
          errorMessage = "Audio decoding error";
          break;
        case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
          errorMessage = "Audio format not supported";
          break;
        default:
          errorMessage = `Audio error: ${audioElement.error.message}`;
      }
    }

    setError(errorMessage);
    setIsPlaying(false);
  };

  const handlePlayPause = (section?: PodcastSection) => {
    const targetSection = section || currentSection;
    if (!targetSection?.audioUrl || targetSection.audioUrl === null) {
      console.error("No audio URL available for section:", targetSection);
      return;
    }

    console.log("Attempting to play audio from URL:", targetSection.audioUrl);

    // If we're already playing this section, just pause/resume
    if (
      currentSectionRef.current?.id === targetSection.id &&
      audioRef.current
    ) {
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        audioRef.current
          .play()
          .then(() => {
            setIsPlaying(true);
          })
          .catch((error) => {
            console.error("Error resuming audio:", error);
            setError("Failed to resume audio. Please try again.");
          });
      }
      return;
    }

    // If we're playing a different section, stop current and play new
    if (audioRef.current && isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    }

    // Setup and play new section
    const audio = setupAudio(targetSection.audioUrl!);

    audio
      .play()
      .then(() => {
        console.log("Audio started playing successfully");
        setIsPlaying(true);
        setCurrentSection(targetSection);
        currentSectionRef.current = targetSection;
      })
      .catch((error) => {
        console.error("Error playing audio:", error);
        setError("Failed to play audio. Please try again.");
      });
  };

  const handleSkipForward = () => {
    if (audioRef.current) {
      const newTime = Math.min(
        audioRef.current.currentTime + 30,
        audioRef.current.duration,
      );
      audioRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };

  const handleSkipBackward = () => {
    if (audioRef.current) {
      const newTime = Math.max(audioRef.current.currentTime - 30, 0);
      audioRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || duration === 0) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = clickX / rect.width;
    const newTime = percentage * duration;

    audioRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const regeneratePodcast = async () => {
    try {
      setLoading(true);
      setError(null);

      console.log("Regenerating podcast for fileId:", fileId);

      // Use API route to create podcast
      const response = await fetch("/api/create-podcast", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ fileId }),
      });

      const result = await response.json();
      console.log("Podcast regeneration result:", result);

      if (!response.ok) {
        console.error("Failed to regenerate podcast:", result.error);
        setError(`Failed to regenerate podcast: ${result.error}`);
      } else if (result.podcast) {
        console.log("Podcast regenerated successfully:", result.podcast);
        setPodcast(result.podcast);
        if (result.podcast.sections.length > 0) {
          setCurrentSection(result.podcast.sections[0]);
          currentSectionRef.current = result.podcast.sections[0];
        }
      } else {
        setError("Failed to regenerate podcast: No podcast data received");
      }
    } catch (error) {
      console.error("Error regenerating podcast:", error);
      setError("Failed to regenerate podcast. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-purple-600" />
          <p className="text-gray-600">Loading podcast...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Headphones className="w-8 h-8 mx-auto mb-4 text-red-400" />
          <p className="text-red-600 mb-4">{error}</p>
          <Button onClick={fetchPodcast} className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (!podcast) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Headphones className="w-8 h-8 mx-auto mb-4 text-gray-400" />
          <p className="text-gray-600 mb-4">No podcast available</p>
          <Button
            onClick={regeneratePodcast}
            className="flex items-center gap-2"
          >
            <Headphones className="w-4 h-4" />
            Generate Podcast
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Main Content Area */}
      <div className="flex-1 p-6">
        {/* Podcast Info */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            {podcast.title}
          </h1>
          <p className="text-gray-600 mb-4">{podcast.description}</p>
          <div className="flex items-center gap-4 flex-wrap">
            <Badge variant="outline" className="flex items-center gap-1">
              <Headphones className="w-3 h-3" />
              {podcast.totalDuration || "Duration not available"}
            </Badge>
            <Badge variant="outline">
              {podcast.sections.length} section
              {podcast.sections.length !== 1 ? "s" : ""}
            </Badge>
            
            {/* Enhanced status badges */}
            {podcast.isProcessed ? (
              <Badge variant="default" className="bg-green-100 text-green-800">
                ✅ Processed
              </Badge>
            ) : (
              <Badge variant="destructive">
                ⚠️ Processing Failed
              </Badge>
            )}
            
            {podcast.generationMethod && (
              <Badge variant="secondary">
                🎙️ {podcast.generationMethod.replace('-', ' ').toUpperCase()}
              </Badge>
            )}
            
            {podcast.audioFileSize && (
              <Badge variant="outline">
                📦 {(podcast.audioFileSize / 1024 / 1024).toFixed(1)} MB
              </Badge>
            )}
            
            {podcast.autoDeleteAt && (
              <Badge variant="outline" className="text-orange-600">
                🗑️ Auto-delete: {new Date(podcast.autoDeleteAt).toLocaleDateString()}
              </Badge>
            )}
          </div>
          
          {/* Regeneration button */}
          <div className="mt-4">
            <Button
              onClick={handleRegenerate}
              disabled={loading}
              variant="outline"
              className="flex items-center gap-2"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              Regenerate Podcast
            </Button>
          </div>
        </div>

        {/* Podcast Sections */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Podcast Sections
          </h2>

          {podcast.sections.map((section) => (
            <Card
              key={section.id}
              className="hover:shadow-md transition-shadow"
            >
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-purple-600 mb-2">
                      {section.title}
                    </h3>
                    <p className="text-gray-600 text-sm leading-relaxed mb-3">
                      {section.content}
                    </p>
                    <div className="flex items-center gap-4 flex-wrap">
                      <Badge variant="outline">
                        {section.duration || "Duration not available"}
                      </Badge>
                      
                      {/* Enhanced section status */}
                      {section.isProcessed ? (
                        <Badge variant="default" className="bg-green-100 text-green-800">
                          ✅ Ready
                        </Badge>
                      ) : section.processingError ? (
                        <Badge variant="destructive">
                          ❌ Failed
                        </Badge>
                      ) : (
                        <Badge variant="secondary">
                          ⏳ Processing...
                        </Badge>
                      )}
                      
                      {section.audioFileSize && (
                        <Badge variant="outline">
                          📦 {(section.audioFileSize / 1024 / 1024).toFixed(1)} MB
                        </Badge>
                      )}
                      
                      {section.generationMethod && (
                        <Badge variant="outline">
                          🎙️ {section.generationMethod.replace('-', ' ').toUpperCase()}
                        </Badge>
                      )}
                      
                      {section.audioUrl && (
                        <Badge variant="outline" className="text-green-600">
                          🔊 Audio Available
                        </Badge>
                      )}
                    </div>
                    
                    {/* Show processing error if any */}
                    {section.processingError && (
                      <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                        <strong>Error:</strong> {section.processingError}
                      </div>
                    )}
                  </div>
                  <div className="ml-4">
                    <Button
                      onClick={() => handlePlayPause(section)}
                      disabled={!section.audioUrl || section.audioUrl === null}
                      variant="outline"
                      size="sm"
                      className="flex items-center gap-2"
                    >
                      {isPlaying && currentSection?.id === section.id ? (
                        <Pause className="w-4 h-4" />
                      ) : (
                        <Play className="w-4 h-4" />
                      )}
                      {isPlaying && currentSection?.id === section.id
                        ? "Pause"
                        : "Play"}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Player Panel */}
      <div className="w-80 bg-white border-l border-gray-200 p-6">
        <div className="flex flex-col h-full">
          {/* Podcast Cover */}
          <div className="bg-gradient-to-br from-purple-600 to-blue-600 w-full aspect-square rounded-lg mb-6 flex items-center justify-center">
            <div className="text-center text-white">
              <Headphones className="w-12 h-12 mx-auto mb-2" />
              <p className="text-sm font-medium">Podcasts by</p>
              <p className="text-sm">NotebookLama</p>
            </div>
          </div>

          {/* Podcast Title */}
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            {podcast.title}
          </h3>
          <p className="text-sm text-gray-600 mb-6">
            {podcast.totalDuration || "Duration not available"}
          </p>

          {/* Audio Player */}
          <div className="space-y-4">
            {/* Progress Bar */}
            <div className="space-y-2">
              <div
                className="w-full bg-gray-200 rounded-full h-2 cursor-pointer"
                onClick={handleSeek}
              >
                <div
                  className="bg-purple-600 h-2 rounded-full transition-all duration-300"
                  style={{
                    width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%`,
                  }}
                />
              </div>
              <div className="flex justify-between text-sm text-gray-500">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            {/* Player Controls */}
            <div className="flex items-center justify-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSkipBackward}
                disabled={
                  !currentSection?.audioUrl || currentSection.audioUrl === null
                }
                className="text-gray-600 hover:text-gray-900"
              >
                <Rewind className="w-5 h-5" />
              </Button>
              <Button
                onClick={() => handlePlayPause()}
                disabled={
                  !currentSection?.audioUrl || currentSection.audioUrl === null
                }
                size="lg"
                className="w-12 h-12 rounded-full bg-purple-600 hover:bg-purple-700"
              >
                {isPlaying ? (
                  <Pause className="w-6 h-6" />
                ) : (
                  <Play className="w-6 h-6" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSkipForward}
                disabled={
                  !currentSection?.audioUrl || currentSection.audioUrl === null
                }
                className="text-gray-600 hover:text-gray-900"
              >
                <FastForward className="w-5 h-5" />
              </Button>
            </div>
          </div>

          {/* Regenerate Button */}
          <div className="mt-auto pt-6">
            <Button
              onClick={regeneratePodcast}
              variant="outline"
              className="w-full flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Regenerate Podcast
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PodcastPanel;
