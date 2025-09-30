import { GoogleGenAI } from "@google/genai";

// The user has requested to replace the mock with a real implementation.
const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  // A simple check, though the prompt guarantees it will be available.
  console.error("Gemini API key not found in environment variables.");
}

const ai = new GoogleGenAI({ apiKey: API_KEY! });

class GeminiService {
  /**
   * Generates an AI-driven response based on a provided prompt.
   * @param prompt The detailed prompt containing data for analysis.
   * @returns The text response from the AI model.
   */
  async generateResponse(prompt: string): Promise<string> {
    if (!API_KEY) {
      return "Gemini API Key is not configured. Please contact the administrator.";
    }
    try {
      console.log("Sending prompt to Gemini...");
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
      });

      console.log("Received response from Gemini.");
      // FIX: Handle cases where the API response might not contain text by providing a fallback string.
      return response.text ?? "The model did not provide a text response.";
    } catch (error) {
      console.error("Error calling Gemini API:", error);
      return "An error occurred while generating the response. Please try again later.";
    }
  }
}

export const geminiService = new GeminiService();
