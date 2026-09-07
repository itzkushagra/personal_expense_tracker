import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export const geminiModel = genAI.getGenerativeModel({
  model: "gemini-2.0-flash-lite",
});

export async function categorizeExpense(
  description: string
): Promise<string> {
  const prompt = `You are an expense categorizer. Given an expense description, return ONLY the category name from this list:
- Food & Dining
- Groceries
- Transport
- Shopping
- Bills & Utilities
- Entertainment
- Health
- Education
- Subscriptions
- Travel
- Gifts
- Miscellaneous

Expense description: "${description}"

Return ONLY the category name, nothing else.`;

  const result = await geminiModel.generateContent(prompt);
  const category = result.response.text().trim();

  const validCategories = [
    "Food & Dining",
    "Groceries",
    "Transport",
    "Shopping",
    "Bills & Utilities",
    "Entertainment",
    "Health",
    "Education",
    "Subscriptions",
    "Travel",
    "Gifts",
    "Miscellaneous",
  ];

  return validCategories.includes(category) ? category : "Miscellaneous";
}

export async function parseVoiceInput(
  text: string
): Promise<{ amount: number; description: string }> {
  const prompt = `Extract the expense amount and description from this spoken text. The amount is in Indian Rupees (₹/INR).

Spoken text: "${text}"

Return ONLY valid JSON in this exact format, no markdown:
{"amount": <number>, "description": "<what the expense was for>"}

Examples:
"spent 450 on groceries at BigBazaar" → {"amount": 450, "description": "groceries at BigBazaar"}
"paid 2000 for electricity bill" → {"amount": 2000, "description": "electricity bill"}
"auto ride for 80 rupees" → {"amount": 80, "description": "auto ride"}`;

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
  const prompt = `You are a personal finance advisor. Based on this month's spending data, give 3-5 specific, actionable tips to save money. Be concise (1-2 sentences each). Use Indian Rupees (₹).

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
