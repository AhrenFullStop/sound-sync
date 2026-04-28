import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
dotenv.config();
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
async function run() {
  const response = await ai.models.list();
  for await (const model of response) {
    if (model.name.includes('imagen')) {
      console.log(model);
    }
  }
}
run().catch(console.error);
