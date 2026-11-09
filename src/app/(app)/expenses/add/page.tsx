import { redirect } from "next/navigation";

// Adding an expense now happens in a dialog on the Expenses page. This keeps
// old links and bookmarks working.
export default function AddExpensePage() {
  redirect("/expenses?add=1");
}
