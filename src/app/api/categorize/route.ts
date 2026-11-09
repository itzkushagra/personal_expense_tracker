import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { categorizeExpense } from "@/lib/gemini";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { description } = await request.json();

  if (!description) {
    return NextResponse.json(
      { error: "Description is required" },
      { status: 400 }
    );
  }

  try {
    const category = await categorizeExpense(description);
    return NextResponse.json({ category });
  } catch (error) {
    console.error("Categorization error:", error);
    const category = fallbackCategorize(description);
    return NextResponse.json({ category });
  }
}

// Used only when the AI categorizer is unavailable. Checked in order, so
// savings/investments and housing win over generic words like "monthly".
const categoryKeywords: [string, string[]][] = [
  ["Investments", ["sip", "mutual fund", "mutual funds", "mf", "stock", "stocks", "shares", "fd", "fixed deposit", "gold", "ppf", "nps", "invest", "investment", "investments", "zerodha", "groww"]],
  ["Savings", ["saving", "savings", "saved", "rd", "recurring deposit", "emergency fund", "down payment", "set aside", "piggy bank"]],
  ["Rent", ["rent", "landlord"]],
  ["Household Help", ["maid", "cook", "cleaner", "bai", "laundry", "ironing", "house help", "dhobi"]],
  ["Home & Maintenance", ["maintenance", "society", "plumber", "electrician", "repair", "repairs", "painting", "furniture", "appliance"]],
  ["Bills & Utilities", ["bill", "electricity", "water", "internet", "wifi", "broadband", "phone", "mobile", "recharge", "emi", "loan", "insurance", "gas cylinder", "png"]],
  ["Groceries", ["grocery", "groceries", "vegetable", "vegetables", "fruit", "fruits", "milk", "doodh", "bread", "rice", "dal", "atta", "oil", "sugar", "bigbazaar", "dmart", "supermarket", "kirana", "sabzi", "blinkit", "zepto", "instamart"]],
  ["Food & Dining", ["food", "restaurant", "cafe", "coffee", "tea", "chai", "lunch", "dinner", "breakfast", "biryani", "pizza", "burger", "zomato", "swiggy", "eat", "meal", "snack", "snacks"]],
  ["Transport", ["auto", "uber", "ola", "rapido", "cab", "taxi", "bus", "metro", "train", "petrol", "diesel", "fuel", "parking", "toll", "ride"]],
  ["Personal Care", ["salon", "haircut", "skincare", "makeup", "grooming", "toiletries", "shampoo"]],
  ["Health", ["doctor", "hospital", "medicine", "medicines", "pharmacy", "medical", "health", "gym", "fitness", "dental", "checkup", "whey", "protein"]],
  ["Shopping", ["shopping", "clothes", "kurta", "shirt", "jeans", "shoes", "amazon", "flipkart", "myntra", "bought", "purchase", "mall"]],
  ["Entertainment", ["movie", "movies", "game", "games", "concert", "show", "theatre", "cinema", "outing", "party"]],
  ["Subscriptions", ["subscription", "netflix", "spotify", "prime", "hotstar", "youtube premium", "membership"]],
  ["Education", ["book", "books", "course", "class", "tuition", "school", "college", "study", "exam", "udemy", "coursera"]],
  ["Travel", ["hotel", "flight", "trip", "vacation", "holiday", "airbnb", "tour"]],
  ["Gifts", ["gift", "present", "birthday", "wedding", "anniversary", "donation"]],
];

function fallbackCategorize(description: string): string {
  const lower = ` ${description.toLowerCase().replace(/[^a-z0-9]+/g, " ")} `;
  for (const [category, keywords] of categoryKeywords) {
    // Whole words only, so "fund" doesn't match "fun" and "card" doesn't match "rd".
    if (keywords.some((kw) => lower.includes(` ${kw} `))) return category;
  }
  return "Miscellaneous";
}
