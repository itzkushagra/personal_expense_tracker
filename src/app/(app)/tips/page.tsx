"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Lightbulb, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

export default function TipsPage() {
  const [tips, setTips] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  async function fetchTips() {
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
      setLoaded(true);
    } catch {
      toast.error("Failed to load tips");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Saving Tips</h1>
        <p className="text-muted-foreground">
          AI-powered suggestions based on your spending patterns
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Lightbulb className="h-5 w-5 text-yellow-500" />
                Personalized Tips
              </CardTitle>
              <CardDescription>
                Based on your current month&apos;s spending
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchTips}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              <span className="ml-2">{loaded ? "Refresh" : "Generate"}</span>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!loaded && !loading && (
            <div className="py-8 text-center">
              <Lightbulb className="mx-auto mb-4 h-12 w-12 text-muted-foreground/30" />
              <p className="text-muted-foreground">
                Click &quot;Generate&quot; to get AI-powered saving tips based on your
                spending this month.
              </p>
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <span className="ml-3 text-muted-foreground">
                Analyzing your spending...
              </span>
            </div>
          )}

          {loaded && !loading && tips.length > 0 && (
            <ul className="space-y-4">
              {tips.map((tip, i) => (
                <li
                  key={i}
                  className="flex gap-4 rounded-lg border p-4 transition-colors hover:bg-muted/50"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                    {i + 1}
                  </span>
                  <p className="pt-1 text-sm leading-relaxed">{tip}</p>
                </li>
              ))}
            </ul>
          )}

          {loaded && !loading && tips.length === 0 && (
            <p className="py-8 text-center text-muted-foreground">
              Add more expenses to get meaningful tips.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
