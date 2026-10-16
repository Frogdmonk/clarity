"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { usePref } from "@/lib/use-pref";

/** Applies the saved theme preference (system | light | dark) to <html>. */
function ThemeApplier() {
  const [theme] = usePref("pref:theme", "system");
  useEffect(() => {
    const el = document.documentElement;
    if (theme === "light" || theme === "dark") el.dataset.theme = theme;
    else delete el.dataset.theme;
  }, [theme]);
  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 2_000, retry: 1, refetchOnWindowFocus: true } },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <ThemeApplier />
      {children}
    </QueryClientProvider>
  );
}
