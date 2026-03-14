import { Link, useLocation } from "wouter";
import { 
  Building2, 
  Car, 
  LayoutDashboard, 
  LogOut, 
  PieChart, 
  QrCode,
  Settings, 
  Users, 
  ShieldAlert,
  Ticket
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAuth } from "@/hooks/use-auth";
import { RiderQR } from "@/components/rider-qr";

export function AppSidebar() {
  const [location] = useLocation();
  const { user, logout } = useAuth();

  const isSuperAdmin = user?.roles.includes('super_admin');
  const isAdmin = user?.roles.includes('admin');
  const isDispatcher = user?.roles.includes('dispatcher');

  return (
    <Sidebar className="border-r border-white/5 bg-background">
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3 px-2">
          <div className="w-8 h-8 rounded-lg bg-primary/20 text-primary flex items-center justify-center glow-primary">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-5 h-5">
              <path d="M13 5L20 12L13 19" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M4 12H20" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <span className="font-display font-bold text-xl tracking-tight">RydeWorks</span>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {/* Dispatcher Section */}
        {(isAdmin || isDispatcher) && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-muted-foreground text-xs uppercase tracking-wider">Dispatch Center</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={location === '/dispatch'}>
                    <Link href="/dispatch">
                      <LayoutDashboard />
                      <span>Dashboard</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={location === '/dispatch/riders'}>
                    <Link href="/dispatch/riders">
                      <Users />
                      <span>Riders</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={location === '/reports'}>
                    <Link href="/reports">
                      <PieChart />
                      <span>Reports</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Admin Section */}
        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-muted-foreground text-xs uppercase tracking-wider">Administration</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={location === '/admin/users'}>
                    <Link href="/admin/users">
                      <ShieldAlert />
                      <span>Staff & Drivers</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={location === '/admin/vehicles'}>
                    <Link href="/admin/vehicles">
                      <Car />
                      <span>Fleet Management</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={location === '/admin/access-codes'}>
                    <Link href="/admin/access-codes">
                      <Ticket />
                      <span>Free Ride Codes</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={location === '/admin/org'}>
                    <Link href="/admin/org">
                      <Settings />
                      <span>Org Settings</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Super Admin Section */}
        {isSuperAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-primary text-xs uppercase tracking-wider">Super Admin</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={location === '/super-admin'}>
                    <Link href="/super-admin">
                      <Building2 className="text-primary" />
                      <span className="text-primary font-medium">Organizations</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="p-4 space-y-1">
        <SidebarMenu>
          <SidebarMenuItem>
            <Popover>
              <PopoverTrigger asChild>
                <SidebarMenuButton className="text-muted-foreground hover:text-primary transition-colors">
                  <QrCode />
                  <span>Rider Portal QR</span>
                </SidebarMenuButton>
              </PopoverTrigger>
              <PopoverContent
                side="right"
                align="end"
                sideOffset={12}
                className="w-72 bg-card border border-white/10 rounded-2xl shadow-2xl shadow-black/40 p-5"
              >
                <p className="text-xs font-semibold text-white mb-4 uppercase tracking-widest">Rider Booking Portal</p>
                <RiderQR size={160} orgSlug="perc" showActions />
              </PopoverContent>
            </Popover>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={() => logout()} className="text-muted-foreground hover:text-white transition-colors">
              <LogOut />
              <span>Log out</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
