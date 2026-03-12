import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import Calculator from "@/pages/calculator";
import History from "@/pages/history";

const queryClient = new QueryClient();

function App() {
  const [tab, setTab] = useState<"calc" | "history">("calc");

  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen bg-background flex flex-col max-w-md mx-auto relative">
        {/* Content area with bottom padding for nav */}
        <div className="flex-1 overflow-y-auto pb-20">
          {tab === "calc" ? <Calculator /> : <History />}
        </div>

        {/* Bottom tab bar */}
        <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-card border-t border-card-border z-50 flex">
          <button
            onClick={() => setTab("calc")}
            className={`flex-1 flex flex-col items-center gap-1 py-3 transition ${tab === "calc" ? "text-primary" : "text-muted-foreground"}`}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={tab === "calc" ? 2.5 : 1.5} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
            <span className="text-xs font-medium">Calculate</span>
          </button>
          <button
            onClick={() => setTab("history")}
            className={`flex-1 flex flex-col items-center gap-1 py-3 transition ${tab === "history" ? "text-primary" : "text-muted-foreground"}`}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={tab === "history" ? 2.5 : 1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <span className="text-xs font-medium">Saved</span>
          </button>
        </nav>
      </div>
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;
