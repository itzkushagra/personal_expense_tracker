import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseVoiceInput } from "@/lib/gemini";
import { todayInAppZone } from "@/lib/dates";
import { findSpokenDate, isUsableExpenseDate } from "@/lib/spoken-date";

function fallbackParse(text: string): { amount: number; description: string } {
  const normalized = text.toLowerCase().trim();

  const numberWords: Record<string, number> = {
    zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
    eight: 8, nine: 9, ten: 10, twenty: 20, thirty: 30, forty: 40, fifty: 50,
    sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100, thousand: 1000,
    lakh: 100000, lac: 100000,
  };

  let processed = normalized;
  for (const [word, num] of Object.entries(numberWords)) {
    processed = processed.replace(new RegExp(`\\b${word}\\b`, "g"), String(num));
  }

  const amountPatterns = [
    /(?:rs\.?|₹|rupees?|inr)\s*([\d,]+(?:\.\d+)?)/i,
    /([\d,]+(?:\.\d+)?)\s*(?:rs\.?|₹|rupees?|inr)/i,
    /(?:spent|paid|cost|bought|for|of)\s*([\d,]+(?:\.\d+)?)/i,
    /([\d,]+(?:\.\d+)?)\s*(?:spent|paid|for|on|ka|ki|ke)/i,
    /([\d,]+(?:\.\d+)?)/,
  ];

  let amount = 0;
  let matchedStr = "";

  for (const pattern of amountPatterns) {
    const match = processed.match(pattern);
    if (match && match[1]) {
      const parsed = parseFloat(match[1].replace(/,/g, ""));
      if (parsed > 0 && parsed < 10000000) {
        amount = parsed;
        matchedStr = match[0];
        break;
      }
    }
  }

  let description = normalized;
  if (matchedStr) {
    description = normalized
      .replace(/[\d,]+(?:\.\d+)?/, "")
      .replace(/\b(?:rs\.?|₹|rupees?|inr|spent|paid)\b/gi, "")
      .replace(/\b(?:on|for|at|in)\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  if (!description || description.length < 2) {
    description = normalized.replace(/[\d,]+/g, "").trim() || text;
  }

  return { amount, description };
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { text, today: clientToday } = await request.json();
  // The browser sends its own local date so "yesterday" matches the user's day.
  const today = isUsableExpenseDate(clientToday, todayInAppZone()) ? clientToday : todayInAppZone();

  // Every call spends Gemini quota on your key: accept only a short sentence.
  if (typeof text === "string" && text.length > 500) {
    return NextResponse.json({ error: "Text is too long (max 500 characters)" }, { status: 400 });
  }
  if (!text || typeof text !== "string") {
    return NextResponse.json(
      { error: "Text is required" },
      { status: 400 }
    );
  }

  // Common phrases ("yesterday", "last Sunday", "on 5th Nov") are parsed
  // exactly; Gemini fills in any other way of saying a date.
  const spoken = findSpokenDate(text, today);
  // Without the date words the amount parser can't confuse "5th" with ₹5.
  let withoutDate = text;
  if (spoken) {
    const at = text.toLowerCase().indexOf(spoken.matched);
    if (at >= 0) withoutDate = `${text.slice(0, at)} ${text.slice(at + spoken.matched.length)}`.replace(/\s+/g, " ").trim();
  }

  try {
    const parsed = await parseVoiceInput(text, today);
    if (parsed.amount > 0) {
      const date = spoken?.date ?? (isUsableExpenseDate(parsed.date, today) ? parsed.date : null);
      return NextResponse.json({ amount: parsed.amount, description: parsed.description, date });
    }
  } catch (error) {
    console.error("Voice parse error:", error);
  }

  const fallback = fallbackParse(withoutDate);
  return NextResponse.json({ ...fallback, date: spoken?.date ?? null });
}
