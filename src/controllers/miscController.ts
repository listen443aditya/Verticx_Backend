import { Request, Response } from 'express';
import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

export async function generateContent(req: Request, res: Response) {
  const { prompt, base64Data, mimeType } = req.body;
  if (!prompt) return res.status(400).json({ error: 'prompt required' });

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) return res.status(500).json({ error: 'Provider API key not configured' });

  try {
    // Replace URL + payload per provider docs
    interface GeminiResponse {
      text: string;
      [key: string]: any;
    }
    const response = await axios.post<GeminiResponse>('https://api.gemini.example/generate', { prompt, base64Data, mimeType }, { headers: { Authorization: `Bearer ${GEMINI_API_KEY}` } });
    const text = response.data?.text ?? '';
    res.status(200).json({ text });
  } catch (err: any) {
    console.error(err?.response?.data ?? err.message);
    res.status(500).json({ error: 'Failed to generate content' });
  }
}
