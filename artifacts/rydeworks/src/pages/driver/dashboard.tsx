import { useState } from "react";
import { Link } from "wouter";
import { DriverLayout } from "@/components/layout/driver-layout";
import { useListTrips, useUpdateDriverLog } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { format } from "date-fns";
import { Car, MapPin, Users, ChevronRight, CheckCircle2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export default function DriverDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isShiftStarted, setIsShiftStarted] = useState(false);
  const [startMileage, setStartMileage] = useState("");
  
  const today = format(new Date(), 'yyyy-MM-dd');
  
  // Use driver ID from user profile
  const { data, isLoading } = useListTrips({
    date: today,
    driverId: user?._id
  }, {
    query: { refetchInterval: 15000 }
  });

  const trips = data?.trips || [];
  
  const startShift = () => {
    if(!startMileage) return toast({ variant: "destructive", title: "Enter mileage to start shift" });
    setIsShiftStarted(true);
    toast({ title: "Shift Started", description: `Drive safely! Mileage logged at ${startMileage}` });
  };

  return (
    <DriverLayout title="My Shift">
      <div className="p-4 space-y-6">
        {/* Shift Control Card */}
        <Card className="bg-card border-white/10 rounded-3xl overflow-hidden shadow-xl">
          <div className="p-6 bg-gradient-to-br from-primary/20 via-background to-background relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <Car className="w-24 h-24" />
            </div>
            
            <div className="relative z-10">
              <h2 className="text-xl font-bold font-display text-white mb-1">
                {format(new Date(), 'EEEE, MMMM d')}
              </h2>
              <p className="text-sm text-muted-foreground mb-6">
                {isShiftStarted ? "You are currently on duty." : "Start your shift to begin taking trips."}
              </p>

              {!isShiftStarted ? (
                <Dialog>
                  <DialogTrigger asChild>
                    <Button size="lg" className="w-full h-14 rounded-2xl text-lg font-bold shadow-lg shadow-primary/25">
                      Start Shift
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="glass-panel border-white/10 sm:max-w-md rounded-3xl p-6">
                    <DialogHeader>
                      <DialogTitle className="text-2xl font-display">Pre-Trip Inspection</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-6 py-4">
                      <div className="space-y-2">
                        <Label>Starting Mileage</Label>
                        <Input 
                          type="number" 
                          value={startMileage} 
                          onChange={(e) => setStartMileage(e.target.value)}
                          placeholder="e.g. 145200" 
                          className="h-14 text-lg bg-black/20 border-white/10 rounded-xl"
                        />
                      </div>
                      <div className="bg-white/5 rounded-xl p-4 space-y-3">
                        <p className="text-sm font-medium">Quick Checklist:</p>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> Tires checked</div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> Lights working</div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> Interior clean</div>
                      </div>
                      <Button onClick={startShift} className="w-full h-14 rounded-xl text-lg font-bold">
                        Confirm & Start Shift
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              ) : (
                <Button variant="outline" className="w-full h-14 rounded-2xl text-lg font-bold border-red-500/20 text-red-400 hover:bg-red-500/10">
                  End Shift
                </Button>
              )}
            </div>
          </div>
        </Card>

        {/* Trips List */}
        <div>
          <h3 className="text-lg font-bold font-display text-white mb-4 pl-2">Today's Itinerary</h3>
          
          {isLoading ? (
            <div className="space-y-4">
              {[1,2,3].map(i => <div key={i} className="h-32 bg-white/5 animate-pulse rounded-3xl" />)}
            </div>
          ) : trips.length === 0 ? (
            <div className="text-center py-12 px-4 bg-white/[0.02] rounded-3xl border border-white/5 border-dashed">
              <img src={`${import.meta.env.BASE_URL}images/empty-van.png`} alt="Empty" className="w-48 mx-auto mb-4 opacity-50 mix-blend-screen" />
              <h4 className="text-lg font-semibold text-white">No trips assigned</h4>
              <p className="text-muted-foreground text-sm mt-1">You have no trips scheduled for today yet.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {trips.map(trip => {
                const isNext = trip.status === 'scheduled' || trip.status === 'in_progress';
                const firstStop = trip.stops.find(s => s.type === 'pickup');
                const passengerCount = new Set(trip.stops.map(s => s.riderId)).size;
                
                return (
                  <Link key={trip._id} href={`/driver/trips/${trip._id}`}>
                    <Card className={`group relative overflow-hidden border transition-all duration-300 rounded-3xl cursor-pointer ${isNext ? 'bg-card border-primary/30 shadow-lg shadow-primary/10 hover-elevate' : 'bg-black/40 border-white/5 opacity-70'}`}>
                      {isNext && (
                        <div className="absolute top-0 left-0 w-1 h-full bg-primary" />
                      )}
                      <div className="p-5 flex items-center gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-xs font-mono px-2 py-1 rounded-md bg-white/10 text-white/70">
                              {format(new Date(trip.tripDate), 'h:mm a')}
                            </span>
                            {trip.status === 'in_progress' && (
                              <span className="text-xs font-bold px-2 py-1 rounded-md bg-primary/20 text-primary uppercase animate-pulse">
                                Active Now
                              </span>
                            )}
                          </div>
                          <h4 className="text-base font-semibold text-white truncate mb-1">
                            {firstStop?.address || 'Multiple Stops'}
                          </h4>
                          <div className="flex items-center gap-3 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {passengerCount}</span>
                            <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {trip.stops.length} stops</span>
                          </div>
                        </div>
                        
                        <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-white group-hover:bg-primary group-hover:text-primary-foreground transition-colors shrink-0">
                          <ChevronRight className="w-5 h-5" />
                        </div>
                      </div>
                    </Card>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </DriverLayout>
  );
}
