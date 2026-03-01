import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getTagsWithCounts } from "@/actions/tags";

export default async function TagsPage() {
  const tags = await getTagsWithCounts();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Tags</h1>
        <p className="text-sm text-muted-foreground">
          Blader door artikelen per tag
        </p>
      </div>

      {tags.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-lg font-medium text-muted-foreground">
            Nog geen tags
          </p>
          <p className="text-sm text-muted-foreground">
            Tags worden automatisch aangemaakt wanneer je ze aan artikelen toevoegt.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tags.map((tag) => (
            <Link key={tag.id} href={`/artikelen?tag=${tag.slug}`}>
              <Card className="transition-shadow hover:shadow-md">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">
                    <Badge variant="outline" className="text-sm">
                      {tag.name}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {tag.article_count}{" "}
                    {tag.article_count === 1 ? "artikel" : "artikelen"}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
