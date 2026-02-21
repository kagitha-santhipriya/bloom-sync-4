import { GoogleGenAI, Type, Modality } from "@google/genai";

let aiInstance: GoogleGenAI | null = null;

function getAI() {
  if (!aiInstance) {
    aiInstance = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
  }
  return aiInstance;
}

export interface FarmerAdvisory {
  whatMayHappen: string;
  expectedYieldChange: string;
  optionA: {
    suggestion: string;
    crops: string[];
  };
  optionB: {
    precautionSteps: string[];
  };
}

export interface AnalysisResult {
  bloomingData: { date: string; activity: number }[];
  pollinationData: { date: string; activity: number }[];
  riskLevel: 'low' | 'medium' | 'high';
  riskScore: number;
  mismatchDays: number;
  yieldRiskPercentage: number;
  lat: number;
  lng: number;
  advisory: FarmerAdvisory;
  climaticConditions: string;
}

export async function analyzeCropMismatch(
  crop: string,
  location: string,
  date: string,
  language: string
): Promise<AnalysisResult> {
  const ai = getAI();
  const model = "gemini-3.1-pro-preview";
  
  const prompt = `
    Act as a NASA agricultural scientist and climate expert. 
    Analyze the blooming and pollination mismatch for:
    Crop: ${crop}
    Location: ${location}
    Target Date: ${date}
    Response Language: ${language}

    SYSTEM STRUCTURE:
    Layer 1 – Global Climate Intelligence Engine (Internal Processing)
    - Process temperature/rainfall forecasts, seasonal anomalies, vegetation trends, and pollinator activity.
    - Calculate Risk Score (0-10) and Yield Impact.

    Layer 2 – Farmer Advisory Layer (Output)
    - CONVERT technical output into simple farmer-understandable language.
    - DO NOT use scientific jargon like NDVI, Anomaly, Correlation, Thermal deviation, or Pollination deficit.
    - Use simple phrases: "Too hot this season", "Too much rain during flowering", "Less insects seen", "Flowers may fall", "Fruit count may reduce".

    ADVISORY FORMAT:
    1. What may happen: Simple explanation of the climate impact on the crop.
    2. Expected Yield: Percentage change (e.g., "10-15% lower than normal").
    3. Option A (Change Crop): Suggest 2-3 safer alternative crops for that season.
    4. Option B (Continue Same Crop): Provide 4-5 practical precaution steps in simple language.

    Return the data in the following JSON format:
    {
      "bloomingData": [{"date": "Jan", "activity": 20}, ...],
      "pollinationData": [{"date": "Jan", "activity": 15}, ...],
      "riskLevel": "high",
      "riskScore": 8.5,
      "mismatchDays": 12,
      "yieldRiskPercentage": 45,
      "lat": 17.3850,
      "lng": 78.4867,
      "climaticConditions": "Simple weather description in ${language}",
      "advisory": {
        "whatMayHappen": "Simple explanation in ${language}",
        "expectedYieldChange": "e.g., 10-15% lower than normal in ${language}",
        "optionA": {
          "suggestion": "Why these crops are better in ${language}",
          "crops": ["Crop 1", "Crop 2"]
        },
        "optionB": {
          "precautionSteps": ["Step 1", "Step 2", "Step 3", "Step 4", "Step 5"]
        }
      }
    }
  `;

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          bloomingData: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                date: { type: Type.STRING },
                activity: { type: Type.NUMBER }
              },
              required: ["date", "activity"]
            }
          },
          pollinationData: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                date: { type: Type.STRING },
                activity: { type: Type.NUMBER }
              },
              required: ["date", "activity"]
            }
          },
          riskLevel: { type: Type.STRING },
          riskScore: { type: Type.NUMBER },
          mismatchDays: { type: Type.NUMBER },
          yieldRiskPercentage: { type: Type.NUMBER },
          lat: { type: Type.NUMBER },
          lng: { type: Type.NUMBER },
          climaticConditions: { type: Type.STRING },
          advisory: {
            type: Type.OBJECT,
            properties: {
              whatMayHappen: { type: Type.STRING },
              expectedYieldChange: { type: Type.STRING },
              optionA: {
                type: Type.OBJECT,
                properties: {
                  suggestion: { type: Type.STRING },
                  crops: { type: Type.ARRAY, items: { type: Type.STRING } }
                },
                required: ["suggestion", "crops"]
              },
              optionB: {
                type: Type.OBJECT,
                properties: {
                  precautionSteps: { type: Type.ARRAY, items: { type: Type.STRING } }
                },
                required: ["precautionSteps"]
              }
            },
            required: ["whatMayHappen", "expectedYieldChange", "optionA", "optionB"]
          }
        },
        required: ["bloomingData", "pollinationData", "riskLevel", "riskScore", "mismatchDays", "yieldRiskPercentage", "lat", "lng", "climaticConditions", "advisory"]
      }
    }
  });

  return JSON.parse(response.text || "{}");
}

export async function generateSpeech(text: string): Promise<string | undefined> {
  try {
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Puck' },
          },
        },
      },
    });

    return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  } catch (error) {
    console.error("TTS failed", error);
    return undefined;
  }
}

export async function extractDetailsFromVoice(transcript: string): Promise<{ crop?: string; location?: string; date?: string }> {
  try {
    const ai = getAI();
    const model = "gemini-3-flash-preview";
    const prompt = `
      Extract agricultural details from this transcript: "${transcript}"
      Return a JSON object with "crop", "location", and "date" (YYYY-MM-DD format if possible).
      If a detail is missing, omit it.
    `;

    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            crop: { type: Type.STRING },
            location: { type: Type.STRING },
            date: { type: Type.STRING }
          }
        }
      }
    });

    return JSON.parse(response.text || "{}");
  } catch (error) {
    console.error("Voice extraction failed", error);
    return {};
  }
}
