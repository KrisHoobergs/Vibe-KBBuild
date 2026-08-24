import Link from "next/link";
import { ArrowLeft, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface ActiveTagFilterProps {
  tagName: string;
}

export function ActiveTagFilter({ tagName }: ActiveTagFilterProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border bg-muted/50 px-4 py-2 text-sm">
      <Link
        href="/tags"
        className="inline-flex items-center gap-1 text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Alle tags
      </Link>

      <span className="text-muted-foreground">Gefilterd op tag</span>
      <Badge variant="outline">{tagName}</Badge>

      <Link
        href="/artikelen"
        className="ml-auto inline-flex items-center gap-1 text-muted-foreground transition-colors hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" />
        Filter wissen
      </Link>
    </div>
  );
}
