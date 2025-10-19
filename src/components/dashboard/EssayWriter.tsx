"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  FileText,
  Star,
  Upload,
  Check,
  Loader2,
  Crown,
  Sparkles,
  AlertCircle,
  PenTool,
  Copy,
  Download,
} from "lucide-react";
import { toast } from "sonner";
import R2UploadButton from "@/components/R2UploadButton";
import BillingModal from "@/components/BillingModal";
import { isPremiumPlan } from "@/lib/plan-utils";

interface EssayFormData {
  topic: string;
  academicLevel: string;
  essayType: string;
  keyPoints: string;
  writingStyle: string;
  useAdvancedModel: boolean;
}

interface UsageData {
  essayWriter: {
    used: number;
    limit: number;
    unlimited: boolean;
  };
  essayGrader: {
    used: number;
    limit: number;
    unlimited: boolean;
  };
}

interface Plan {
  id: number;
  name: string;
  numberOfEssayWriter: number;
  numberOfEssayGrader: number;
  isPremium: boolean;
}

interface UsageResponse {
  success: boolean;
  usage: UsageData;
  plan: Plan;
  isFreeUser?: boolean;
  message?: string;
}

const EssayWriter = () => {
  const [formData, setFormData] = useState<EssayFormData>({
    topic: "The Impact of Climate Change on Global Economics",
    academicLevel: "Undergraduate, Graduate, High School, PhD",
    essayType: "Argumentative, Expository, Analytical, Research Paper",
    keyPoints:
      "1. Main argument\n2. Supporting evidence\n3. Counter-arguments\n4. Conclusion points",
    writingStyle:
      "Formal academic tone, APA format, 2000 words, include recent studies",
    useAdvancedModel: false,
  });

  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedEssay, setGeneratedEssay] = useState<string>("");
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [, setLoading] = useState(true);
  const [fileId, ] = useState<string | null>(null);
  const [isFreeUser, setIsFreeUser] = useState(false);
  const [showBillingModal, setShowBillingModal] = useState(false);

  const fetchUsage = async () => {
    try {
      const response = await fetch("/api/essay-usage");
      if (response.status === 401) {
        toast.error("Please log in to use this feature");
        return;
      }
      const data: UsageResponse = await response.json();
      if (data.success) {
        setUsage(data.usage);
        setPlan({
          ...data.plan,
          isPremium: data.plan ? isPremiumPlan(data.plan.name) : false
        });
        setIsFreeUser(data.isFreeUser || false);
      } else {
        toast.error(data.message || "Failed to fetch usage data");
      }
    } catch (error) {
      console.error("Failed to fetch usage:", error);
      toast.error("Failed to fetch usage data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsage();
  }, []);


  const handleInputChange = (
    field: keyof EssayFormData,
    value: string | boolean
  ) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleGenerate = async () => {
    // Validate required fields
    if (
      !formData.topic.trim() ||
      !formData.academicLevel.trim() ||
      !formData.essayType.trim() ||
      !formData.keyPoints.trim() ||
      !formData.writingStyle.trim()
    ) {
      toast.error("Please fill in all required fields");
      return;
    }

    if (!usage) {
      toast.error("Usage data not available");
      return;
    }

    // Check if user is free user
    if (isFreeUser) {
      toast.error("You need to upgrade your plan to use the AI Essay Writer");
      return;
    }

    // Check if user has reached their limit
    if (
      !usage.essayWriter.unlimited &&
      usage.essayWriter.used >= usage.essayWriter.limit
    ) {
      toast.error("You have reached your essay writer limit for this month");
      return;
    }

    setIsGenerating(true);
    try {
      // Record usage first
      const usageResponse = await fetch("/api/essay-usage", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: "essay_writer",
          fileId: fileId,
        }),
      });

      const usageData = await usageResponse.json();
      if (!usageData.success) {
        if (usageData.limitReached) {
          toast.error(usageData.message);
          return;
        }
        throw new Error(usageData.message || "Failed to record usage");
      }

      // Generate essay
      const response = await fetch("/api/generate-essay", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: `Topic: ${formData.topic}\nAcademic Level: ${formData.academicLevel}\nEssay Type: ${formData.essayType}\nKey Points: ${formData.keyPoints}\nWriting Style: ${formData.writingStyle}`,
          fileId: fileId,
          context: fileId ? `Based on the uploaded file` : "",
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to generate essay");
      }

      const result = await response.json();
      setGeneratedEssay(result.essay);
      toast.success("Essay generated successfully!");
      // Refresh usage data
      fetchUsage();
    } catch (error) {
      console.error("Error generating essay:", error);
      toast.error("Failed to generate essay. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const getCharacterCount = (text: string) => {
    return text.length;
  };

  const getMaxLength = (field: string) => {
    switch (field) {
      case "keyPoints":
        return 5000;
      default:
        return 500;
    }
  };

  const handleCopyToClipboard = async () => {
    if (!generatedEssay) return;
    
    try {
      await navigator.clipboard.writeText(generatedEssay);
      toast.success("Essay copied to clipboard!");
    } catch (error) {
      console.error("Failed to copy to clipboard:", error);
      toast.error("Failed to copy to clipboard");
    }
  };

  const handleDownloadPDF = async () => {
    if (!generatedEssay) return;
    
    try {
      // Create a new window with the essay content
      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        toast.error("Please allow popups to download PDF");
        return;
      }
      
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Generated Essay</title>
          <style>
            body {
              font-family: 'Times New Roman', serif;
              line-height: 1.6;
              margin: 40px;
              color: #333;
            }
            h1 {
              text-align: center;
              margin-bottom: 30px;
              color: #2c3e50;
            }
            .essay-content {
              white-space: pre-wrap;
              font-size: 12pt;
            }
            @media print {
              body { margin: 20px; }
            }
          </style>
        </head>
        <body>
          <h1>Generated Essay</h1>
          <div class="essay-content">${generatedEssay.replace(/\n/g, '<br>')}</div>
        </body>
        </html>
      `);
      
      printWindow.document.close();
      
      // Wait for content to load then trigger print
      setTimeout(() => {
        printWindow.print();
        printWindow.close();
      }, 500);
      
      toast.success("PDF download initiated!");
    } catch (error) {
      console.error("Failed to download PDF:", error);
      toast.error("Failed to download PDF");
    }
  };

  const handleDownloadTXT = async () => {
    if (!generatedEssay) return;
    
    try {
      const blob = new Blob([generatedEssay], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `essay-${new Date().toISOString().split('T')[0]}.txt`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success("Essay downloaded as TXT file!");
    } catch (error) {
      console.error("Failed to download TXT:", error);
      toast.error("Failed to download TXT file");
    }
  };

  const handleDownloadDOC = async () => {
    if (!generatedEssay) return;
    
    try {
      // Create HTML content for Word document
      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Generated Essay</title>
        </head>
        <body>
          <h1>Generated Essay</h1>
          <div style="white-space: pre-wrap; font-family: 'Times New Roman', serif; line-height: 1.6;">
            ${generatedEssay}
          </div>
        </body>
        </html>
      `;
      
      const blob = new Blob([htmlContent], { type: 'application/msword' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `essay-${new Date().toISOString().split('T')[0]}.doc`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success("Essay downloaded as DOC file!");
    } catch (error) {
      console.error("Failed to download DOC:", error);
      toast.error("Failed to download DOC file");
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold text-gray-900">AI Essay Generator</h1>
        <p className="text-gray-600">
          Generate comprehensive, research-backed academic essays with proper
          citations and scholarly insights.
        </p>
      </div>

      {/* Usage Status */}
      {usage && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PenTool className="h-5 w-5" />
              Usage Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">
                  Essay Writer: {usage.essayWriter.used} /{" "}
                  {usage.essayWriter.unlimited ? "∞" : usage.essayWriter.limit}
                </p>
                {plan && (
                  <p className="text-xs text-gray-500">Plan: {plan.name}</p>
                )}
              </div>
              {isFreeUser ? (
                <Alert className="w-auto">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Free plan - Upgrade to use AI Essay Writer
                  </AlertDescription>
                </Alert>
              ) : !usage.essayWriter.unlimited &&
                usage.essayWriter.used >= usage.essayWriter.limit && (
                  <Alert className="w-auto">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                    You&apos;ve reached your monthly limit. Upgrade your plan for more usage.

                    </AlertDescription>
                  </Alert>
                )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* File Upload Section */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Upload Document (Optional)
          </CardTitle>
          <p className="text-sm text-gray-600">
            Upload a document to provide context for your essay generation
          </p>
        </CardHeader>
        <CardContent>
          <R2UploadButton
            disabled={
              !!(usage &&
              !usage.essayWriter.unlimited &&
              usage.essayWriter.used >= usage.essayWriter.limit)
            }
          />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Input Form */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Essay Parameters
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Essay Topic */}
            <div className="space-y-2">
              <Label htmlFor="topic" className="text-sm font-medium">
                Essay topic <span className="text-red-500">*</span>
              </Label>
              <div className="relative">
                <Input
                  id="topic"
                  value={formData.topic}
                  onChange={(e) => handleInputChange("topic", e.target.value)}
                  placeholder="Enter your essay topic"
                  maxLength={500}
                />
                <div className="absolute right-2 top-2 text-xs text-gray-500">
                  {getCharacterCount(formData.topic)}/{getMaxLength("topic")}
                </div>
              </div>
            </div>

            {/* Academic Level */}
            <div className="space-y-2">
              <Label htmlFor="academicLevel" className="text-sm font-medium">
                Academic level <span className="text-red-500">*</span>
              </Label>
              <div className="relative">
                <Input
                  id="academicLevel"
                  value={formData.academicLevel}
                  onChange={(e) =>
                    handleInputChange("academicLevel", e.target.value)
                  }
                  placeholder="e.g., Undergraduate, Graduate, High School, PhD"
                  maxLength={500}
                />
                <div className="absolute right-2 top-2 text-xs text-gray-500">
                  {getCharacterCount(formData.academicLevel)}/
                  {getMaxLength("academicLevel")}
                </div>
              </div>
            </div>

            {/* Essay Type */}
            <div className="space-y-2">
              <Label htmlFor="essayType" className="text-sm font-medium">
                Essay type <span className="text-red-500">*</span>
              </Label>
              <div className="relative">
                <Input
                  id="essayType"
                  value={formData.essayType}
                  onChange={(e) =>
                    handleInputChange("essayType", e.target.value)
                  }
                  placeholder="e.g., Argumentative, Expository, Analytical, Research Paper"
                  maxLength={500}
                />
                <div className="absolute right-2 top-2 text-xs text-gray-500">
                  {getCharacterCount(formData.essayType)}/
                  {getMaxLength("essayType")}
                </div>
              </div>
            </div>

            {/* Key Points */}
            <div className="space-y-2">
              <Label htmlFor="keyPoints" className="text-sm font-medium">
                Key points to cover <span className="text-red-500">*</span>
              </Label>
              <div className="relative">
                <Textarea
                  id="keyPoints"
                  value={formData.keyPoints}
                  onChange={(e) =>
                    handleInputChange("keyPoints", e.target.value)
                  }
                  placeholder="List the key points you want to cover in your essay"
                  rows={4}
                  maxLength={5000}
                  className="resize-none"
                />
                <div className="absolute right-2 top-2 text-xs text-gray-500">
                  {getCharacterCount(formData.keyPoints)}/
                  {getMaxLength("keyPoints")}
                </div>
              </div>
            </div>

            {/* Writing Style */}
            <div className="space-y-2">
              <Label htmlFor="writingStyle" className="text-sm font-medium">
                Writing style & requirements{" "}
                <span className="text-red-500">*</span>
              </Label>
              <div className="relative">
                <Input
                  id="writingStyle"
                  value={formData.writingStyle}
                  onChange={(e) =>
                    handleInputChange("writingStyle", e.target.value)
                  }
                  placeholder="e.g., Formal academic tone, APA format, 2000 words"
                  maxLength={500}
                />
                <div className="absolute right-2 top-2 text-xs text-gray-500">
                  {getCharacterCount(formData.writingStyle)}/
                  {getMaxLength("writingStyle")}
                </div>
              </div>
            </div>

            {/* Attachments - Premium Feature */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                Attachments (Optional)
              </Label>
              {plan?.isPremium ? (
                <div className="border-2 border-dashed border-green-300 rounded-lg p-6 text-center bg-green-50">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <Star className="w-4 h-4 text-green-500" />
                    <span className="text-sm font-medium text-green-600">
                      Premium Feature Active
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mb-3">
                    Upload images and PDFs to enhance your AI-generated content
                  </p>
                  <R2UploadButton
                    disabled={
                      !!(usage &&
                      !usage.essayWriter.unlimited &&
                      usage.essayWriter.used >= usage.essayWriter.limit)
                    }
                  />
                </div>
              ) : (
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <Star className="w-4 h-4 text-yellow-500" />
                    <span className="text-sm font-medium text-yellow-600">
                      Premium Feature
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mb-3">
                    Upload images and PDFs to enhance your AI-generated content
                  </p>
                  <Button 
                    onClick={() => setShowBillingModal(true)}
                    className="w-full gap-2"
                    size="sm"
                  >
                    <Crown className="w-4 h-4" />
                    Upgrade to Premium
                  </Button>
                </div>
              )}
            </div>

            {/* Advanced AI Model */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">
                  Use advanced AI model?
                </Label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-green-600 font-medium">
                    Best Results
                  </span>
                  <Switch
                    checked={formData.useAdvancedModel}
                    onCheckedChange={(checked) =>
                      handleInputChange("useAdvancedModel", checked)
                    }
                  />
                </div>
              </div>
              <p className="text-xs text-gray-600">
                Enable this feature to leverage cutting-edge AI for superior
                performance and more accurate results!
              </p>
            </div>

            {/* Generate Button */}
            <Button
              onClick={handleGenerate}
              disabled={
                isGenerating ||
                isFreeUser ||
                !!(usage &&
                  !usage.essayWriter.unlimited &&
                  usage.essayWriter.used >= usage.essayWriter.limit)
              }
              className="w-full gap-2"
              size="lg"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Generate
                </>
              )}
            </Button>

            {/* Quality Hint */}
            <p className="text-xs text-gray-500 text-center">
              Getting low quality results? Use an advanced AI model or write a
              better description.
            </p>

            {/* Limit Warning */}
            {isFreeUser ? (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  You need to upgrade your plan to use the AI Essay Writer feature.
                </AlertDescription>
              </Alert>
            ) : usage &&
              !usage.essayWriter.unlimited &&
              usage.essayWriter.used >= usage.essayWriter.limit && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    You have reached your essay writer limit for this month.
                    Please upgrade your plan to continue.
                  </AlertDescription>
                </Alert>
              )}
          </CardContent>
        </Card>

        {/* Generated Essay */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Generated Essay
            </CardTitle>
          </CardHeader>
          <CardContent>
            {generatedEssay ? (
              <div className="space-y-4">
                <div className="bg-gray-50 p-4 rounded-lg">
                  <pre className="whitespace-pre-wrap text-sm text-gray-800 font-mono">
                    {generatedEssay}
                  </pre>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={handleCopyToClipboard}
                    className="gap-2"
                  >
                    <Copy className="w-4 h-4" />
                    Copy to Clipboard
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={handleDownloadPDF}
                    className="gap-2"
                  >
                    <Download className="w-4 h-4" />
                    Download PDF
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={handleDownloadTXT}
                    className="gap-2"
                  >
                    <Download className="w-4 h-4" />
                    Download TXT
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={handleDownloadDOC}
                    className="gap-2"
                  >
                    <Download className="w-4 h-4" />
                    Download DOC
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <FileText className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                <p>Your generated essay will appear here</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Upgrade Section */}
      <Card className="bg-gradient-to-r from-purple-50 to-blue-50 border-purple-200">
        <CardContent className="p-6">
          <div className="text-center space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">
              Get access to more features by upgrading your plan.
            </h3>
            <div className="grid grid-cols-2 gap-4 max-w-md mx-auto">
              <div className="flex items-center gap-2 text-sm">
                <Check className="w-4 h-4 text-green-500" />
                <span>10x smarter AI</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Check className="w-4 h-4 text-green-500" />
                <span>More customization options</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Check className="w-4 h-4 text-green-500" />
                <span>100% commercial use rights</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Check className="w-4 h-4 text-green-500" />
                <span>Faster generation</span>
              </div>
            </div>
            <Button 
              onClick={() => setShowBillingModal(true)}
              className="w-full gap-2"
              size="lg"
            >
              <Crown className="w-4 h-4" />
              Upgrade to Pro
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Billing Modal */}
      <BillingModal 
        isOpen={showBillingModal} 
        onClose={() => setShowBillingModal(false)} 
      />
    </div>
  );
};

export default EssayWriter;
