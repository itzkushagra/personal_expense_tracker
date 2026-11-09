import { GoogleGenerativeAI } from "@google/generative-ai";
import { EXPENSE_CATEGORIES } from "@/types";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export const geminiModel = genAI.getGenerativeModel({
  model: "gemini-2.0-flash-lite",
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
