import { GoogleGenAI, Type } from '@google/genai';
import { Souvenir } from './storage';

export interface AnalysisResult {
  isDuplicate: boolean;
  duplicateId: string | null;
  name: string;
  category: string;
  features: string;
  confidence: number;
}

export const analyzeSouvenir = async (
  base64Image: string,
  mimeType: string,
  currentCollection: Souvenir[]
): Promise<AnalysisResult> => {
  let apiKey = localStorage.getItem('GEMINI_CUSTOM_API_KEY') || import.meta.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'undefined' || apiKey === '') {
    throw new Error('API_KEY_MISSING');
  }
  
  const isCustomKey = !!localStorage.getItem('GEMINI_CUSTOM_API_KEY');
  const keyHint = isCustomKey ? `自訂金鑰(...${apiKey.slice(-4)})` : `系統共用金鑰`;

  const ai = new GoogleGenAI({ apiKey });

  const collectionJson = JSON.stringify(currentCollection.map(s => ({
    id: s.id,
    category: s.category,
    name: s.name,
    features: s.features
  })));

  const prompt = `
你是一位專業的「私人收藏辨識與管理助手」。你的核心任務是透過使用者上傳的實體照片，精準比對現有收藏資料庫，防止重複購買，並自動提取藏品特徵進行數位化存檔。

【任務 1：特徵提取】
仔細觀察上傳的圖片，提取該物品的視覺特徵（外型、顏色、文字、圖案）。

【任務 2：與資料庫比對】
以下是使用者目前的收藏資料庫：
${collectionJson}

請將剛才提取的視覺特徵與上述資料庫中的藏品進行比對。
若與某件藏品的視覺特徵重合度高於 90%，請判定為「已收藏」(isDuplicate = true)，並提供對應的 duplicateId。

【任務 3：產出屬性】
如果判定為新藏品，請根據圖片建議：
- category (如：香火袋、紀念幣、多美卡小車、風景區限定等)
- name (藏品名稱，盡量簡明扼要)
- features (例如：「[紀念幣] 金色、直徑約 3cm、正面為阿里山小火車、背面有 2024 字樣」)

如果是已收藏，也請填寫上述名稱與特徵，作為參考。
請嚴格以 JSON 格式回傳結果。
`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: {
      parts: [
        {
          inlineData: {
            data: base64Image,
            mimeType: mimeType,
          },
        },
        {
          text: prompt,
        },
      ],
    },
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          isDuplicate: {
            type: Type.BOOLEAN,
            description: "是否為已收藏的重複品"
          },
          duplicateId: {
            type: Type.STRING,
            description: "若是重複品，請提供現有藏品的 ID。若不是則為空字串"
          },
          confidence: {
            type: Type.NUMBER,
            description: "判定的信心水準 (0 - 100)"
          },
          name: {
            type: Type.STRING,
            description: "藏品名稱"
          },
          category: {
            type: Type.STRING,
            description: "收藏庫名稱/分類"
          },
          features: {
            type: Type.STRING,
            description: "特徵描述"
          }
        },
        required: ["isDuplicate", "confidence", "name", "category", "features"]
      }
    },
  }).catch((err) => {
    throw new Error(`[${keyHint}] ${err.message}`);
  });

  const text = response.text;
  if (!text) {
    throw new Error("No response from Gemini.");
  }

  const result = JSON.parse(text);
  return {
    isDuplicate: result.isDuplicate,
    duplicateId: result.isDuplicate && result.duplicateId ? result.duplicateId : null,
    name: result.name,
    category: result.category,
    features: result.features,
    confidence: result.confidence
  };
};
