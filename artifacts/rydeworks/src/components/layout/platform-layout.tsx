import { ReactNode } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./app-sidebar";
import { useAuth } from "@/hooks/use-auth";
import { Bell, LogOut, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface PlatformLayoutProps {
  children: ReactNode;
  title?: string;
  action?: ReactNode;
}

export function PlatformLayout({ children, title, action }: PlatformLayoutProps) {
  const { user, logout } = useAuth();
  
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "4rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full bg-background overflow-hidden selection:bg-primary/30">
        <AppSidebar />
        
        <div className="flex flex-col flex-1 min-w-0">
          <header className="h-16 flex-shrink-0 flex items-center justify-between px-4 sm:px-6 lg:px-8 border-b border-white/5 bg-background/50 backdrop-blur-md z-10">
            <div className="flex items-center gap-4">
              <SidebarTrigger className="hover-elevate text-muted-foreground hover:text-foreground" />
              {title && (
                <>
                  <div className="h-4 w-px bg-white/10 hidden sm:block" />
                  <h1 className="text-lg font-semibold font-display hidden sm:block text-foreground">{title}</h1>
                </>
              )}
            </div>
            
            <div className="flex items-center gap-3 sm:gap-4">
              {action}
              
              <Button size="icon" variant="ghost" className="text-muted-foreground hover:text-foreground rounded-full h-9 w-9">
                <Bell className="w-5 h-5" />
              </Button>
              
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="h-9 gap-2 pl-2 pr-3 rounded-full hover:bg-white/5">
                    <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-primary to-blue-500 flex items-center justify-center text-xs font-bold text-background">
                      {user?.firstName?.charAt(0) || 'U'}
                    </div>
                    <span className="text-sm font-medium hidden sm:inline-block">
                      {user?.firstName}
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 glass-panel border-white/10 mt-2">
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium leading-none">{user?.firstName} {user?.lastName}</p>
                      <p className="text-xs leading-none text-muted-foreground">
                        {user?.email}
                      </p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator className="bg-white/10" />
                  <DropdownMenuItem onClick={() => logout()} className="text-red-400 focus:text-red-300 focus:bg-red-400/10 cursor-pointer">
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Log out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>
          
          <main className="flex-1 overflow-auto bg-background/30 relative">
            {/* Ambient background glow */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[300px] bg-primary/5 blur-[120px] rounded-full pointer-events-none -z-10" />
            
            <div className="p-4 sm:p-6 lg:p-8 max-w-[1600px] mx-auto z-0">
              {children}
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
