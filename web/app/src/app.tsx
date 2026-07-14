// Placeholder shell. The real sidebar/router shell lands in Step 2.3; this only exists to prove the
// design tokens from src/styles/index.css reach the DOM. Colors come from tokens — never raw hex.
export function App() {
  return (
    <main className="flex h-full flex-col items-center justify-center gap-2 bg-background px-6 text-center text-foreground">
      <h1 className="text-2xl font-semibold">cezar</h1>
      <p className="text-sm text-muted-foreground">
        The redesigned cockpit is being assembled. The current UI is available at{' '}
        <code className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[12.5px]">?legacy=1</code>.
      </p>
    </main>
  )
}
