import { redirect } from "next/navigation";

// Editing now happens in a pop-up on the Expenses page. This keeps old links
// and bookmarks working.
export default async function EditExpensePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/expenses?edit=${encodeURIComponent(id)}`);
}
