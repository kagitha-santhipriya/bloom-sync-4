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
  sources?: { title: string; url: string }[];
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

    MANDATORY: Use Google Search to find:
    1. Current and forecasted weather (temperature, rainfall, humidity, wind speed) for ${location} around ${date}.
    2. Specific agricultural challenges, pest alerts (e.g., mango hopper, thrips, powdery mildew), or government advisories in ${location} for ${crop} during this season.
    3. Historical blooming and harvest patterns of ${crop} in this specific region and how this year's weather compares to the 10-year average.
    4. Soil moisture trends and irrigation requirements for ${crop} in ${location} given the current weather.

    SYSTEM STRUCTURE:
    Layer 1 – Global Climate Intelligence Engine (Internal Processing)
    - Process temperature/rainfall forecasts, seasonal anomalies, vegetation trends, and pollinator activity.
    - Calculate Risk Score (0-10) and Yield Impact based on REAL-TIME data found via search.
    - If search results indicate a heatwave, drought, or unseasonal rain, reflect this in the risk score.
    - Analyze the specific growth stage of ${crop} (e.g., flowering, fruit set) for the target date.

    Layer 2 – Farmer Advisory Layer (Output)
    - CONVERT technical output into simple farmer-understandable language.
    - DO NOT use scientific jargon like NDVI, Anomaly, Correlation, Thermal deviation, or Pollination deficit.
    - Use simple phrases: "Too hot this season", "Too much rain during flowering", "Less insects seen", "Flowers may fall", "Fruit count may reduce".
    - IMPORTANT: Ensure the "climaticConditions" field provides a clear, simple summary of the weather for that location and date in ${language}.
    - ADVICE MUST BE SPECIFIC: If you suggest a precaution, make sure it's relevant to the specific weather threat found in search (e.g., "Use shade nets if it's too hot" or "Ensure drainage if heavy rain is expected").
    - Mention real local factors if found (e.g., "Local reports from ${location} say this year is drier than usual").
    - CONSISTENCY CHECK: 
      - If Expected Yield loss is > 30%, Risk Level MUST be 'high'.
      - If Expected Yield loss is 10-30%, Risk Level MUST be 'medium'.
      - If Expected Yield loss is < 10%, Risk Level MUST be 'low'.
      - Ensure the "whatMayHappen" description matches the Risk Level (e.g., don't say "everything is fine" if risk is high).

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
    
    If you cannot find specific data for a location, use regional averages for that crop and season.
  `;

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      tools: [{ googleSearch: {} }],
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

  const result = JSON.parse(response.text || "{}");
  
  // Extract grounding sources
  const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
  if (chunks) {
    result.sources = chunks
      .filter((c: any) => c.web)
      .map((c: any) => ({
        title: c.web.title,
        url: c.web.uri
      }));
  }

  return result;
}

export async function generateSpeech(text: string, language: string): Promise<string | undefined> {
  try {
    const ai = getAI();
    const langName = language === 'te' ? 'Telugu' : 
                     language === 'hi' ? 'Hindi' :
                     language === 'ta' ? 'Tamil' :
                     language === 'kn' ? 'Kannada' :
                     language === 'ml' ? 'Malayalam' : 'English';
    
    // For TTS models, it's often better to just provide the text if it's already in the target language,
    // but a clear instruction can help with tone/accent.
    const prompt = `Read this text aloud in ${langName}: ${text}`;
    
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: prompt }] }],
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

export async function extractDetailsFromVoice(transcript: string, language: string): Promise<{ crop?: string; location?: string; date?: string }> {
  try {
    const ai = getAI();
    const model = "gemini-3-flash-preview";
    const langName = language === 'te' ? 'Telugu' : 
                     language === 'hi' ? 'Hindi' :
                     language === 'ta' ? 'Tamil' :
                     language === 'kn' ? 'Kannada' :
                     language === 'ml' ? 'Malayalam' : 'English';

    const prompt = `
      You are an expert agricultural data extractor. 
      The following transcript is from a farmer speaking about their crop, location, and target date.
      The transcript is primarily in ${langName}, but may contain some English words or be entirely in English.
      
      Transcript: "${transcript}"
      
      TASK:
      Extract the following details from the transcript and translate them to English:
      1. "crop": The name of the crop in English (e.g., Mango, Rice, Cotton, Tomato, Wheat, Maize).
      2. "location": The city, district, village, or region in English.
      3. "date": The target date, month, or season. If a month is mentioned, convert it to a date format like "2026-03-01". If only a month is mentioned, assume the year 2026.
      
      RULES:
      - Return a valid JSON object ONLY.
      - If a detail is missing, set it to null.
      - Be smart about synonyms (e.g., "Paddy" -> "Rice", "Mirchi" -> "Chilli").
      - If the transcript mentions multiple crops or locations, pick the most prominent one.
      - Ensure the output is in English regardless of the input language.
      
      JSON OUTPUT ONLY:
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

export async function askFollowUp(
  question: string,
  context: AnalysisResult,
  language: string
): Promise<string> {
  try {
    const ai = getAI();
    const model = "gemini-3-flash-preview";
    const langName = language === 'te' ? 'Telugu' : 
                     language === 'hi' ? 'Hindi' :
                     language === 'ta' ? 'Tamil' :
                     language === 'kn' ? 'Kannada' :
                     language === 'ml' ? 'Malayalam' : 'English';

    const prompt = `
      You are a NASA agricultural scientist assistant. 
      The user has just received an analysis for their crop:
      
      CONTEXT:
      Crop: ${context.climaticConditions} (Summary)
      Risk Level: ${context.riskLevel}
      Risk Score: ${context.riskScore}/10
      Advisory: ${context.advisory.whatMayHappen}
      Expected Yield: ${context.advisory.expectedYieldChange}
      
      USER QUESTION: "${question}"
      
      TASK:
      Answer the user's question based on the provided context and your general agricultural knowledge.
      Keep the answer simple, practical, and helpful for a farmer.
      Respond in ${langName}.
      
      RESPONSE:
    `;

    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }]
      }
    });

    return response.text || "I'm sorry, I couldn't process that question.";
  } catch (error) {
    console.error("Follow-up question failed", error);
    return "An error occurred while processing your question.";
  }
}
