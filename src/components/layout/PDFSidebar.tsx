"use client";

import React, { useState } from "react";
import {
  MessageSquare,
  Headphones,
  Brain,
  CreditCard,
  FileAudio,
  FileText,
  CheckSquare,
  Menu,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Image from "next/image";
import BillingModal from "../BillingModal";

interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  answer: string;
}

interface Quiz {
  title: string;
  questions: QuizQuestion[];
}

interface QuizPanelProps {
  quiz: Quiz | null;
}

interface PDFSidebarProps {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  activeView: string;
  setActiveView: (view: string) => void;
  fileId: string;
  setLoading: (loading: boolean) => void;
  setLoadingMessage?: (message: string) => void;
  onToggleSidebar?: () => void;
}

export function QuizPanel({ quiz }: QuizPanelProps) {
  const [selected, setSelected] = useState<Record<number, string>>({});
  const [showResult, setShowResult] = useState(false);

  if (!quiz) return null;

  return (
    <div>
      <h2>{quiz.title}</h2>
      {quiz.questions.map((q, idx) => (
        <div key={q.id} style={{ marginBottom: 24 }}>
          <div>
            <b>Question {idx + 1}:</b> {q.question}
          </div>
          {q.options.map((opt, oidx) => (
            <div key={oidx}>
              <label>
                <input
                  type="radio"
                  name={`q${idx}`}
                  value={opt}
                  checked={selected[idx] === opt}
                  onChange={() =>
                    setSelected((prev) => ({ ...prev, [idx]: opt }))
                  }
                  disabled={showResult}
                />
                {opt}
              </label>
            </div>
          ))}
          {showResult && (
            <div>
              {selected[idx] === q.answer ? (
                <span style={{ color: "green" }}>Correct!</span>
              ) : (
                <span style={{ color: "red" }}>
                  Incorrect. Correct answer: {q.answer}
                </span>
              )}
            </div>
          )}
        </div>
      ))}
      {!showResult && (
        <button onClick={() => setShowResult(true)}>Submit</button>
      )}
    </div>
  );
}

const PDFSidebar: React.FC<Omit<PDFSidebarProps, "setSidebarOpen">> = ({
  sidebarOpen,
  activeView,
  setActiveView,
  fileId,
  setLoading,
  setLoadingMessage,
  onToggleSidebar,
}) => {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isBillingModalOpen, setIsBillingModalOpen] = useState(false);

  const pdfSidebarItems = [
    { id: "chatbot", icon: MessageSquare, label: "Chat Bot" },
    { id: "podcast", icon: Headphones, label: "Podcast" },
    { id: "flashcards", icon: CreditCard, label: "Flashcards" },
    { id: "quiz", icon: Brain, label: "Quiz" },
    { id: "transcript", icon: FileAudio, label: "Transcript" },
    { id: "essay-writer", icon: FileText, label: "AI Essay Writer" },
    { id: "essay-grader", icon: CheckSquare, label: "AI Essay Grader" },
  ];

  const handleNav = async (itemId: string) => {
    console.log("Navigation clicked:", itemId);
    setActiveView(itemId);

    // For generation pages, trigger the unified generation in background and navigate
    if (
      itemId === "quiz" ||
      itemId === "flashcards" ||
      itemId === "transcript"
    ) {
      setLoading(true);
      setLoadingMessage?.("Generating Content...");
      setError(null);

      // Navigate immediately to the page
      router.push(`/dashboard/${fileId}/${itemId}`);

      // Generate all content in background using unified API
      try {
        const response = await fetch("/api/create-all-content", {
          method: "POST",
          body: JSON.stringify({ fileId }),
          headers: { "Content-Type": "application/json" },
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          console.error("API Error Response:", errorData);
          throw new Error(
            `Failed to create content: ${response.status} - ${
              errorData.error || "Unknown error"
            }`
          );
        }

        const data = await response.json();
        console.log("Content generated successfully:", data.message);
      } catch (err) {
        const errorObj = err as Error;
        console.error("Error creating content:", errorObj);
        setError(errorObj.message || "An unexpected error occurred.");
      } finally {
        setLoading(false);
      }
    } else if (itemId === "podcast") {
      setLoading(true);
      setLoadingMessage?.("Generating Podcast...");
      setError(null);

      // Navigate immediately to podcast page
      router.push(`/dashboard/${fileId}/podcast`);

      // Generate podcast in background
      try {
        const response = await fetch("/api/create-podcast", {
          method: "POST",
          body: JSON.stringify({ fileId }),
          headers: { "Content-Type": "application/json" },
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          console.error("API Error Response:", errorData);
          throw new Error(
            `Failed to create podcast: ${response.status} - ${
              errorData.error || "Unknown error"
            }`
          );
        }
      } catch (err) {
        const errorObj = err as Error;
        console.error("Error creating podcast:", errorObj);
        setError(errorObj.message || "An unexpected error occurred.");
      } finally {
        setLoading(false);
      }
    } else if (itemId === "chatbot") {
      router.push(`/dashboard/${fileId}/chatbot`);
    } else if (itemId === "essay-writer") {
      router.push("/dashboard/essay-writer");
    } else if (itemId === "essay-grader") {
      router.push("/dashboard/essay-grader");
    } else {
      router.push(`/dashboard/${fileId}?view=${itemId}`);
    }
  };

  return (
    <>
      <div
        className={`${
          sidebarOpen ? "w-64" : "w-16"
        } bg-white border-r border-gray-200 transition-all duration-300 fixed top-16 left-0 h-[calc(100vh-4rem)] flex flex-col overflow-hidden z-40`}
      >
        {/* Header - Fixed */}
        <div className="flex-shrink-0 p-4 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <Link
              href="/dashboard"
              className="flex items-center space-x-3 cursor-pointer hover:opacity-80 transition-opacity"
            >
              <Image
                src="/logo.png"
                alt="NotebookLama Logo"
                width={32}
                height={24}
                className="rounded-sm"
              />
              {sidebarOpen && (
                <span className="font-bold text-lg text-gray-800">
                  NotebookLama
                </span>
              )}
            </Link>
            {onToggleSidebar && (
              <button
                onClick={onToggleSidebar}
                className="p-1 hover:bg-gray-100 rounded-md transition-colors"
              >
                {sidebarOpen ? (
                  <X className="w-4 h-4" />
                ) : (
                  <Menu className="w-4 h-4" />
                )}
              </button>
            )}
          </div>
        </div>

        {/* Navigation - Scrollable */}
        <nav className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100 hover:scrollbar-thumb-gray-400">
          <div className="py-4 space-y-1">
            {pdfSidebarItems.map((item) => (
              <button
                key={item.id}
                onClick={() => handleNav(item.id)}
                className={`w-full flex items-center space-x-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors ${
                  activeView === item.id
                    ? "bg-blue-50 text-blue-600 border-r-2 border-blue-600"
                    : "text-gray-700 hover:text-gray-900"
                }`}
                type="button"
              >
                <item.icon className="w-5 h-5 flex-shrink-0" />
                {sidebarOpen && (
                  <span className="font-medium truncate">{item.label}</span>
                )}
              </button>
            ))}

            {/* Error State */}
            {error && (
              <div className="px-4 py-2 text-sm text-red-600">{error}</div>
            )}
          </div>
        </nav>
      </div>

      {/* Billing Modal */}
      <BillingModal
        isOpen={isBillingModalOpen}
        onClose={() => setIsBillingModalOpen(false)}
      />
    </>
  );
};

export default PDFSidebar;
