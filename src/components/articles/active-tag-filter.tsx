import Link from "next/link";
import { ArrowLeft, X } from "lucide-react";

interface ActiveTagFilterProps {
  tags: { name: string; slug: string }[];
  /** Bouwt de URL zonder de opgegeven tag, zodat je er één kunt afvinken. */
  urlWithoutTag: (slug: string) => string;
}

export function ActiveTagFilter({ tags, urlWithoutTag }: ActiveTagFilterProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border bg-muted/50 px-4 py-2 text-sm">
      <Link
        href="/tags"
        className="inline-flex items-center gap-1 text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Alle tags
      </Link>

      <span className="text-muted-foreground">
        {tags.length === 1 ? "Gefilterd op tag" : "Gefilterd op tags"}
      </span>

      <div className="flex flex-wrap items-center gap-1.5">
        {tags.map((tag) => (
          <Link
            key={tag.slug}
            href={urlWithoutTag(tag.slug)}
            title={`${tag.name} niet meer meefilteren`}
            className="inline-flex items-center gap-1 rounded-full border bg-background px-2.5 py-0.5 text-xs font-medium transition-colors hover:bg-accent"
          >
            {tag.name}
            <X className="h-3 w-3" />
          </Link>
        ))}
      </div>

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
