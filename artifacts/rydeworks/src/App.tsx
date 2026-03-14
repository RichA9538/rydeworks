import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";

import LoginPage from "@/pages/login";
import LandingPage from "@/pages/landing";
import NotFound from "@/pages/not-found";

import DispatchDashboard from "@/pages/dispatch/dashboard";
import TripDetail from "@/pages/dispatch/trip-detail";
import NewTrip from "@/pages/dispatch/new-trip";
import RidersPage from "@/pages/dispatch/riders";

import DriverDashboard from "@/pages/driver/dashboard";
import DriverTripView from "@/pages/driver/trip-view";

import AdminUsers from "@/pages/admin/users";
import AdminVehicles from "@/pages/admin/vehicles";
import AdminOrg from "@/pages/admin/org";

import ReportsPage from "@/pages/reports";
import SuperAdminPage from "@/pages/super-admin";
import RiderPortal from "@/pages/rider/portal";
import FlyerPage from "@/pages/flyer";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } }
});

function RootRedirect() {
  const { user, isLoading, isAuthenticated } = useAuth();
  if (isLoading) return null;
  if (!isAuthenticated) return <Redirect to="/" />;
  if (user?.roles?.includes('driver') && !user?.roles?.includes('dispatcher') && !user?.roles?.includes('admin')) {
    return <Redirect to="/driver" />;
  }
  return <Redirect to="/dispatch" />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={LandingPage} />
      <Route path="/login" component={LoginPage} />
      <Route path="/rider" component={RiderPortal} />
      <Route path="/dispatch" component={DispatchDashboard} />
      <Route path="/dispatch/trips/new" component={NewTrip} />
      <Route path="/dispatch/trips/:id" component={TripDetail} />
      <Route path="/dispatch/riders" component={RidersPage} />
      <Route path="/driver" component={DriverDashboard} />
      <Route path="/driver/trips/:id" component={DriverTripView} />
      <Route path="/admin" component={AdminUsers} />
      <Route path="/admin/users" component={AdminUsers} />
      <Route path="/admin/vehicles" component={AdminVehicles} />
      <Route path="/admin/org" component={AdminOrg} />
      <Route path="/reports" component={ReportsPage} />
      <Route path="/super-admin" component={SuperAdminPage} />
      <Route path="/flyer/:orgSlug" component={FlyerPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
