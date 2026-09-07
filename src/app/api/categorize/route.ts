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

const categoryKeywords: Record<string, string[]> = {
  "Food & Dining": ["food", "restaurant", "cafe", "coffee", "tea", "lunch", "dinner", "breakfast", "biryani", "pizza", "burger", "zomato", "swiggy", "eat", "meal", "snack", "drink"],
  "Groceries": ["grocery", "groceries", "vegetable", "fruit", "milk", "bread", "rice", "dal", "oil", "sugar", "bigbazaar", "dmart", "supermarket", "kirana", "sabzi"],
  "Transport": ["auto", "uber", "ola", "cab", "taxi", "bus", "metro", "train", "petrol", "diesel", "fuel", "gas", "parking", "toll", "ride", "travel"],
  "Shopping": ["shopping", "clothes", "shoes", "amazon", "flipkart", "myntra", "buy", "bought", "purchase", "mall"],
  "Bills & Utilities": ["bill", "electricity", "water", "internet", "wifi", "phone", "mobile", "recharge", "rent", "emi", "loan", "insurance", "gas cylinder"],
  "Entertainment": ["movie", "netflix", "spotify", "game", "concert", "show", "theatre", "cinema", "outing", "party", "fun"],
  "Health": ["doctor", "hospital", "medicine", "pharmacy", "medical", "health", "gym", "fitness", "dental", "eye", "checkup"],
  "Education": ["book", "course", "class", "tuition", "school", "college", "study", "exam", "udemy", "coursera"],
  "Subscriptions": ["subscription", "premium", "plan", "membership", "annual", "monthly"],
  "Travel": ["hotel", "flight", "trip", "vacation", "holiday", "airbnb", "booking", "tour"],
  "Gifts": ["gift", "present", "birthday", "wedding", "anniversary", "donation"],
};

function fallbackCategorize(description: string): string {
  const lower = description.toLowerCase();
  for (const [category, keywords] of Object.entries(categoryKeywords)) {
    if (keywords.some((kw) => lower.includes(kw))) {
      return category;
    }
  }
  return "Miscellaneous";
}
