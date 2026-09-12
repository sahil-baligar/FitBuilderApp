import { createRoot } from "react-dom/client";
import { setCoreConfig, setStorageDriver } from "@fitbuilder/core";
import { createWebStorageDriver } from "./lib/storage.web";
import App from "./App.tsx";
import "./index.css";

// Platform wiring must happen before the first render: the AppProvider reads
// storage on mount and the API client reads config on every request.
setStorageDriver(createWebStorageDriver());
setCoreConfig({
  apiBaseUrl: (import.meta.env.VITE_API_BASE_URL as string | undefined) || "/api",
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL as string | undefined,
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined,
});

createRoot(document.getElementById("root")!).render(<App />);
