import { OpenAI } from "openai";
import { NextResponse } from "next/server";

const openai = new OpenAI({
  baseURL: "https://api.deepseek.com",
  apiKey: process.env.DEEPSEEK_API_KEY_DEV,
});

export async function POST(request: Request) {
  try {
    const { text } = await request.json();

    if (!text) {
      return NextResponse.json({ error: "No text provided" }, { status: 400 });
    }

    const response = await openai.chat.completions.create({
      model: "deepseek-chat",
      messages: [
        {
          role: "system",
          content: `Analyze the email content and rewrite it to improve its Flesch-Kincaid readability score between 70-90. Also make sure it's spam score is 0. Ensure the revised version:
          Maintains the original tone and meaning.
          Uses professional language.
          Optimizes paragraph structure for clarity.
          Avoids unnecessary complexity or wordiness.
          Return only the rewritten email without explanations or additional commentary.`,
        },
        {
          role: "user",
          content: text,
        },
      ],
      temperature: 0.8,
      max_tokens: 1000,
    });

    const improvedText = response.choices[0].message.content;

    return NextResponse.json({ text: improvedText });
  } catch (error) {
    console.error("Error improving readability:", error);
    return NextResponse.json(
      { error: "Failed to improve readability" },
      { status: 500 }
    );
  }
}
