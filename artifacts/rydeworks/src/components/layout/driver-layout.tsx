import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { Home, User, LogOut, Navigation } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

interface DriverLayoutProps {
  children: ReactNode;
  title?: string;
  hideNav?: boolean;
}

export function DriverLayout({ children, title, hideNav = false }: DriverLayoutProps) {
  const [location] = useLocation();
  const { user, logout } = useAuth();

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground">
      {/* Driver Top Header */}
      <header className="h-16 flex-shrink-0 flex items-center justify-between px-4 border-b border-white/5 bg-card/80 backdrop-blur-xl sticky top-0 z-40">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary text-background flex items-center justify-center glow-primary">
            <Navigation className="w-5 h-5 fill-current" />
          </div>
          <span className="font-display font-bold text-lg">{title || "Driver App"}</span>
        </div>
        
        <button onClick={() => logout()} className="w-10 h-10 flex items-center justify-center rounded-full bg-white/5 text-muted-foreground hover:text-white transition-colors active-elevate-2">
          <LogOut className="w-5 h-5" />
        </button>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto relative pb-24">
        {children}
      </main>

      {/* Bottom Mobile Navigation */}
      {!hideNav && (
        <nav className="fixed bottom-0 left-0 right-0 h-20 bg-card/90 backdrop-blur-xl border-t border-white/5 flex items-center justify-around px-6 z-50 pb-safe">
          <Link 
            href="/driver" 
            className={`flex flex-col items-center gap-1.5 p-2 rounded-xl transition-colors ${location === '/driver' ? 'text-primary' : 'text-muted-foreground hover:text-white'}`}
          >
            <Home className={`w-6 h-6 ${location === '/driver' ? 'fill-primary/20' : ''}`} />
            <span className="text-[10px] font-medium tracking-wide uppercase">My Shift</span>
          </Link>
          
          <Link 
            href="/driver/profile" 
            className={`flex flex-col items-center gap-1.5 p-2 rounded-xl transition-colors ${location === '/driver/profile' ? 'text-primary' : 'text-muted-foreground hover:text-white'}`}
          >
            <User className={`w-6 h-6 ${location === '/driver/profile' ? 'fill-primary/20' : ''}`} />
            <span className="text-[10px] font-medium tracking-wide uppercase">Profile</span>
          </Link>
        </nav>
      )}
    </div>
  );
}
