import { GoogleGenAI, Type, Modality } from "@google/genai";

let aiInstance: GoogleGenAI | null = null;

function getAI() {
  if (!aiInstance) {
    aiInstance = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
  }
  return aiInstance;
}

export interface ClimateIntelligence {
  temperatureAnomaly: number;
  ndviTrend: string;
  rainfallAnomaly: number;
  globalClimateSignal: string;
}

export interface FarmerAdvisory {
  riskScore: number;
  yieldImpactPercentage: number;
  stageRecommendations: string;
  actionableSteps: string[];
}

export interface AnalysisResult {
  bloomingData: { date: string; activity: number }[];
  pollinationData: { date: string; activity: number }[];
  riskLevel: 'low' | 'medium' | 'high';
  mismatchDays: number;
  suggestions: string;
  climaticConditions: string;
  yieldRiskPercentage: number;
  lat: number;
  lng: number;
  climateIntelligence: ClimateIntelligence;
  farmerAdvisory: FarmerAdvisory;
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
    Analyze the blooming and pollination mismatch for the following:
    Crop: ${crop}
    Location: ${location}
    Target Date: ${date}
    Response Language: ${language}

    Architecture Requirements:
    1. Global Climate Intelligence Layer: Extract satellite-derived temperature anomalies, NDVI trends, and rainfall data for this specific location.
    2. Local Farmer Advisory Layer: Convert these climate signals into crop-specific risk scoring, yield impact percentage, and stage-based actionable recommendations.

    Analysis Tasks:
    1. Generate a 12-month series of blooming activity (0-100) and pollination activity (0-100) centered around the target date.
    2. Calculate the mismatch in days between peak blooming and peak pollination.
    3. Assess the risk level (low, medium, high) and yield risk percentage.
    4. Provide detailed suggestions and solutions in ${language}.
    5. Describe the climatic conditions at that location in ${language}.
    6. Provide the exact latitude and longitude for the location: "${location}".

    Return the data in the following JSON format:
    {
      "bloomingData": [{"date": "Jan", "activity": 20}, ...],
      "pollinationData": [{"date": "Jan", "activity": 15}, ...],
      "riskLevel": "high",
      "mismatchDays": 12,
      "suggestions": "Detailed suggestions in ${language}...",
      "climaticConditions": "Description of weather/climate in ${language}...",
      "yieldRiskPercentage": 45,
      "lat": 17.3850,
      "lng": 78.4867,
      "climateIntelligence": {
        "temperatureAnomaly": 1.5,
        "ndviTrend": "Decreasing due to heat stress",
        "rainfallAnomaly": -20,
        "globalClimateSignal": "El Niño influence detected"
      },
      "farmerAdvisory": {
        "riskScore": 85,
        "yieldImpactPercentage": 30,
        "stageRecommendations": "Specific advice for current crop stage in ${language}",
        "actionableSteps": ["Step 1 in ${language}", "Step 2 in ${language}"]
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
          mismatchDays: { type: Type.NUMBER },
          suggestions: { type: Type.STRING },
          climaticConditions: { type: Type.STRING },
          yieldRiskPercentage: { type: Type.NUMBER },
          lat: { type: Type.NUMBER },
          lng: { type: Type.NUMBER },
          climateIntelligence: {
            type: Type.OBJECT,
            properties: {
              temperatureAnomaly: { type: Type.NUMBER },
              ndviTrend: { type: Type.STRING },
              rainfallAnomaly: { type: Type.NUMBER },
              globalClimateSignal: { type: Type.STRING }
            },
            required: ["temperatureAnomaly", "ndviTrend", "rainfallAnomaly", "globalClimateSignal"]
          },
          farmerAdvisory: {
            type: Type.OBJECT,
            properties: {
              riskScore: { type: Type.NUMBER },
              yieldImpactPercentage: { type: Type.NUMBER },
              stageRecommendations: { type: Type.STRING },
              actionableSteps: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              }
            },
            required: ["riskScore", "yieldImpactPercentage", "stageRecommendations", "actionableSteps"]
          }
        },
        required: ["bloomingData", "pollinationData", "riskLevel", "mismatchDays", "suggestions", "climaticConditions", "yieldRiskPercentage", "lat", "lng", "climateIntelligence", "farmerAdvisory"]
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
