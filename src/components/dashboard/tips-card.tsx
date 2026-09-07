"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Lightbulb, RefreshCw, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface TipsCardProps {
  initialTips: string[];
}

export function TipsCard({ initialTips }: TipsCardProps) {
  const [tips, setTips] = useState<string[]>(initialTips);
  const [loading, setLoading] = useState(false);

  async function refreshTips() {
    setLoading(true);
    try {
      const now = new Date();
      const res = await fetch("/api/tips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          month: now.getMonth() + 1,
          year: now.getFullYear(),
        }),
      });
      const data = await res.json();
      setTips(data.tips || []);
    } catch {
      toast.error("Failed to refresh tips");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-base">
          <Lightbulb className="h-4 w-4 text-yellow-500" />
          Saving Tips
        </CardTitle>
        <Button
          variant="ghost"
          size="sm"
          onClick={refreshTips}
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
        </Button>
      </CardHeader>
      <CardContent>
        {tips.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Add some expenses to get personalized tips.
          </p>
        ) : (
          <ul className="space-y-3">
            {tips.map((tip, i) => (
              <li key={i} className="flex gap-3 text-sm">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                  {i + 1}
                </span>
                <span>{tip}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
