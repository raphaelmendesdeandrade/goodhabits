import { GoogleGenAI, Type } from "@google/genai";
import { Activity } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export interface AIUpdate {
  activityId: string; // Empty string if it's a new activity
  activityTitle: string;
  completed: boolean;
  duration?: number;
  note?: string;
  day?: string;
  isNew?: boolean;
  suggestedCategoryName?: string;
  suggestedCategoryIcon?: string;
}

export async function processDictation(transcript: string, activities: Activity[], customPrompt?: string): Promise<AIUpdate[]> {
  const activityList = activities.map(a => ({ title: a.title, id: a.id }));
  
  const defaultPrompt = `User transcript: "${transcript}"
    
    Available activities: ${JSON.stringify(activityList)}
    
    Current date context: ${new Date().toLocaleDateString()} (Today is ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date().getDay()]})
    
    Task: Parse the transcript and identify which activities were mentioned as completed. 
    1. If an activity matches one in the "Available activities" list, use its ID.
    2. If an activity is mentioned but DOES NOT match any in the list, mark it as isNew: true and suggest a category name and icon.
    3. Extract the day of the week (e.g. "Monday", "Tuesday", etc.) if mentioned, otherwise assume today.
    4. Extract duration (in minutes) and any specific notes if mentioned.
    
    Return a JSON array of updates. Only include activities that were explicitly mentioned or strongly implied as completed.`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: customPrompt 
      ? customPrompt
          .replace('{{transcript}}', transcript)
          .replace('{{activities}}', JSON.stringify(activityList))
          .replace('{{today}}', ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date().getDay()])
          .replace('{{date}}', new Date().toLocaleDateString())
      : defaultPrompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            activityId: { type: Type.STRING },
            activityTitle: { type: Type.STRING },
            completed: { type: Type.BOOLEAN },
            duration: { type: Type.NUMBER, description: "Duration in minutes" },
            note: { type: Type.STRING },
            day: { type: Type.STRING, description: "Day of the week, e.g. 'Monday'" },
            isNew: { type: Type.BOOLEAN },
            suggestedCategoryName: { type: Type.STRING },
            suggestedCategoryIcon: { type: Type.STRING }
          },
          required: ["activityId", "activityTitle", "completed"]
        }
      }
    }
  });

  try {
    return JSON.parse(response.text || "[]");
  } catch (e) {
    console.error("Failed to parse AI response", e);
    return [];
  }
}
