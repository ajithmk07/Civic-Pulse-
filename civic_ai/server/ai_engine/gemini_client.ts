import { GoogleGenAI } from '@google/genai';

let cachedClient: GoogleGenAI | null = null;

export function hasConfiguredGeminiKey(): boolean {
  const key = (process.env.GEMINI_API_KEY ?? '').trim();
  if (!key) return false;
  if (key === 'MY_GEMINI_API_KEY' || key === 'YOUR_GEMINI_API_KEY' || key.length < 20) {
    return false;
  }
  return true;
}

export function getGeminiClient(): GoogleGenAI | null {
  if (!hasConfiguredGeminiKey()) {
    return null;
  }
  if (!cachedClient) {
    cachedClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return cachedClient;
}
