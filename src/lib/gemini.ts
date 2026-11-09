import { GoogleGenerativeAI } from "@google/generative-ai";
import { EXPENSE_CATEGORIES } from "@/types";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

// gemini-2.0-flash-lite was retired by Google (404 "no longer available"),
// which silently pushed categorising, voice parsing and tips onto the keyword
// fallbacks. GEMINI_MODEL lets you switch models from Netlify without a code
// change the next time one is retired.
export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";

export const geminiModel = genAI.getGenerativeModel({
  model: GEMINI_MODEL,
});

export async function categorizeExpense(
  description: string
): Promise<string> {
  const prompt = `You are an expense categorizer for someone living in a rented flat in India. Given an expense description, return ONLY the category name from this list:
${EXPENSE_CATEGORIES.map((c) => `- ${c}`).join("\n")}

Guidance:
- Rent: monthly flat rent paid to the landlord
- Home & Maintenance: society maintenance, repairs, plumber, electrician, painting, furniture, appliances, cleaning supplies
- Household Help: maid, cook, cleaner, laundry/ironing, house help salary
- Bills & Utilities: electricity, water, gas cylinder/PNG, internet/WiFi, mobile recharge
- Personal Care: skincare, makeup, haircare, salon, grooming, toiletries
- Investments: SIP, mutual funds, stocks, FD deposits, gold, PPF/NPS contributions
- Savings: money moved to a savings account, RD deposits, emergency fund, saving towards a goal (e.g. bike down payment)

Expense description: "${description}"

Return ONLY the category name, nothing else.`;

  const result = await geminiModel.generateContent(prompt);
  const category = result.response.text().trim();

  return (EXPENSE_CATEGORIES as readonly string[]).includes(category) ? category : "Miscellaneous";
}

export async function parseVoiceInput(
  text: string,
  today: string
): Promise<{ amount: number; description: string; date?: string | null }> {
  const weekday = new Date(`${today}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "long", timeZone: "UTC" });
  const prompt = `Extract the expense amount, description and date from this spoken text. The amount is in Indian Rupees (₹/INR).
Today is ${weekday}, ${today}. The expense already happened, so the date is today or in the past, never in the future.
Words like "yesterday", "kal", "last Sunday", "on the 5th", "3 days ago" give the date. If no date is mentioned, use null.
Leave the date words out of the description.

Spoken text: "${text}"

Return ONLY valid JSON in this exact format, no markdown:
{"amount": <number>, "description": "<what the expense was for>", "date": "<YYYY-MM-DD>" or null}

Examples (today is Tuesday, 2026-11-10):
"spent 450 on groceries at BigBazaar" → {"amount": 450, "description": "groceries at BigBazaar", "date": null}
"yesterday paid 2000 for electricity bill" → {"amount": 2000, "description": "electricity bill", "date": "2026-11-09"}
"auto ride for 80 rupees last Saturday" → {"amount": 80, "description": "auto ride", "date": "2026-11-07"}`;

  const result = await geminiModel.generateContent(prompt);
  const responseText = result.response.text().trim();

  try {
    const cleaned = responseText.replace(/```json\n?|\n?```/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    return { amount: 0, description: text };
  }
}

export async function generateTips(
  categoryBreakdown: Record<string, number>,
  totalSpent: number,
  prevMonthTotal: number | null
): Promise<string[]> {
  const prompt = `You are a personal finance advisor. Based on this month's spending data, give 3-5 specific, actionable tips to save money. Be concise (1-2 sentences each).
The user lives in a rented flat. Rent is a fixed cost, so focus on variable spending (utilities, household help, food, transport, shopping); mention rent only if housing costs look unusually high relative to total spending. Amounts are out-of-pocket only: company-reimbursable expenses are already excluded. Use Indian Rupees (₹).

Total spent this month: ₹${totalSpent}
${prevMonthTotal !== null ? `Last month total: ₹${prevMonthTotal}` : "No previous month data."}

Category breakdown:
${Object.entries(categoryBreakdown)
  .sort(([, a], [, b]) => b - a)
  .map(([cat, amount]) => `- ${cat}: ₹${amount}`)
  .join("\n")}

Return ONLY a JSON array of strings, no markdown:
["tip 1", "tip 2", "tip 3"]`;

  const result = await geminiModel.generateContent(prompt);
  const responseText = result.response.text().trim();

  try {
    const cleaned = responseText.replace(/```json\n?|\n?```/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    return ["Track your daily expenses to identify spending patterns."];
  }
}
