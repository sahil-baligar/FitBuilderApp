import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppProvider } from "@/contexts/AppContext";
import { BottomNav } from "@/components/BottomNav";
import Home from "./pages/Home";
import Wardrobe from "./pages/Wardrobe";
import Build from "./pages/Build";
import AIStylist from "./pages/AIStylist";
import Library from "./pages/Library";
import Settings from "./pages/Settings";
import Login from "./pages/auth/Login";
import Signup from "./pages/auth/Signup";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AppProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/wardrobe" element={<Wardrobe />} />
            <Route path="/build" element={<Build />} />
            <Route path="/ai-stylist" element={<AIStylist />} />
            <Route path="/library" element={<Library />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/auth/login" element={<Login />} />
            <Route path="/auth/signup" element={<Signup />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
          <BottomNav />
        </BrowserRouter>
      </TooltipProvider>
    </AppProvider>
  </QueryClientProvider>
);

export default App;
