import { Button } from "@/components/ui/button";

function App() {
  return (
    <main data-testid="app-root" className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-3xl font-bold">CrewHub</h1>
      <p className="text-sm text-muted-foreground">Foundation build — M0</p>
      <Button variant="outline">It works</Button>
    </main>
  );
}

export default App;
