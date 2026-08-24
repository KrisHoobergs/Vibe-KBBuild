import Link from "next/link";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface ActiveTagFilterProps {
  tagName: string;
}

export function ActiveTagFilter({ tagName }: ActiveTagFilterProps) {
  return (
    <div className="flex items-center gap-2 rounded-lg border bg-muted/50 px-4 py-2 text-sm">
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
