import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-8 px-4 py-16">
      <header className="text-center">
        <h1 className="text-4xl font-bold tracking-tight">Docentra</h1>
        <p className="mt-2 text-lg text-muted-foreground">
          Intelligent business document management.
        </p>
      </header>

      <Card className="w-full">
        <CardHeader>
          <CardTitle>Getting started</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <p>
            DocFlow, the first Docentra module, manages vendor purchase
            documents from draft through approval.
          </p>
        </CardContent>
      </Card>

      <Button>Explore DocFlow</Button>
    </main>
  );
}
