import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";

export function ServerSectionPlaceholder({
  description,
  title,
}: {
  description: string;
  title: string;
}) {
  return (
    <Card className="min-h-60">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="rounded-2xl border border-dashed p-6 text-muted-foreground text-sm">
          {title} content scaffold.
        </div>
      </CardContent>
    </Card>
  );
}
