import { Loader2 } from "lucide-react";

/**
 * Shown the moment you tap a menu item, while the next page is fetched. The server runs far from
 * the database, so without this a tap looks like it did nothing for a second or two.
 */
export default function Loading() {
  return (
    <div className="flex h-64 items-center justify-center" role="status" aria-label="Loading">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}
