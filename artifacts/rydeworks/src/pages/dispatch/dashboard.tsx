import { useState } from "react";
import { Link } from "wouter";
import { PlatformLayout } from "@/components/layout/platform-layout";
import { useListTrips } from "@workspace/api-client-react";
import { format } from "date-fns";
import { Plus, Search, Calendar as CalendarIcon, Clock, MapPin, Users, MoreVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";

export default function DispatchDashboard() {
  const [date, setDate] = useState<Date>(new Date());
  const [search, setSearch] = useState("");
  
  // Convert date to YYYY-MM-DD for API
  const dateStr = format(date, 'yyyy-MM-dd');
  
  const { data: tripsData, isLoading } = useListTrips({
    date: dateStr
  }, {
    query: {
      refetchInterval: 10000 // Poll every 10s for real-time feel
    }
  });

  const trips = tripsData?.trips || [];
  
  const filteredTrips = trips.filter(t => 
    t.tripNumber.toLowerCase().includes(search.toLowerCase()) || 
    t.stops.some(s => s.riderName?.toLowerCase().includes(search.toLowerCase()))
  );

  const getStatusColor = (status: string) => {
    switch(status) {
      case 'scheduled': return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      case 'in_progress': return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20';
      case 'completed': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'canceled': return 'bg-red-500/10 text-red-400 border-red-500/20';
      default: return 'bg-gray-500/10 text-gray-400 border-gray-500/20';
    }
  };

  const getStatusLabel = (status: string) => {
    return status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  return (
    <PlatformLayout 
      title="Dispatch Center" 
      action={
        <Button asChild className="rounded-full shadow-lg shadow-primary/20">
          <Link href="/dispatch/trips/new">
            <Plus className="w-4 h-4 mr-2" /> New Trip
          </Link>
        </Button>
      }
    >
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-4 w-full sm:w-auto">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full sm:w-[240px] justify-start text-left font-normal bg-card border-white/10 h-11 rounded-xl hover-elevate">
                <CalendarIcon className="mr-2 h-4 w-4 text-muted-foreground" />
                {date ? format(date, "EEEE, MMMM d, yyyy") : <span>Pick a date</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 glass-panel border-white/10" align="start">
              <Calendar
                mode="single"
                selected={date}
                onSelect={(d) => d && setDate(d)}
                initialFocus
                className="bg-card text-foreground"
              />
            </PopoverContent>
          </Popover>
          
          <div className="relative flex-1 sm:w-[300px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search rider or trip ID..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-card border-white/10 h-11 rounded-xl focus-visible:ring-primary/20"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto pb-2 sm:pb-0">
          <Badge variant="outline" className="px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 cursor-pointer text-sm whitespace-nowrap">All ({trips.length})</Badge>
          <Badge variant="outline" className="px-3 py-1.5 rounded-full bg-blue-500/10 text-blue-400 border-blue-500/20 cursor-pointer text-sm whitespace-nowrap">Scheduled</Badge>
          <Badge variant="outline" className="px-3 py-1.5 rounded-full bg-yellow-500/10 text-yellow-400 border-yellow-500/20 cursor-pointer text-sm whitespace-nowrap">In Progress</Badge>
        </div>
      </div>

      {isLoading ? (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-6">
          {[1,2,3,4,5,6].map(i => (
            <Card key={i} className="h-64 animate-pulse bg-card/50 border-white/5 rounded-2xl" />
          ))}
        </div>
      ) : filteredTrips.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-32 text-center border border-white/5 rounded-3xl bg-card/30 border-dashed">
          <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
            <CalendarIcon className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="text-xl font-semibold text-white mb-2">No trips scheduled</h3>
          <p className="text-muted-foreground max-w-sm">There are no trips scheduled for this date. Create a new trip to get started.</p>
          <Button asChild className="mt-6 rounded-full" variant="outline">
            <Link href="/dispatch/trips/new">Create First Trip</Link>
          </Button>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredTrips.map(trip => {
            const firstStop = trip.stops.find(s => s.type === 'pickup');
            const lastStop = trip.stops.find(s => s.type === 'dropoff');
            const passengerCount = new Set(trip.stops.map(s => s.riderId)).size;
            
            return (
              <Link key={trip._id} href={`/dispatch/trips/${trip._id}`}>
                <Card className="group bg-card/60 backdrop-blur-sm border-white/5 hover:border-primary/30 transition-all duration-300 rounded-2xl overflow-hidden hover:shadow-xl hover:shadow-primary/5 cursor-pointer flex flex-col h-full hover-elevate">
                  <div className="p-5 border-b border-white/5 flex justify-between items-start bg-white/[0.02]">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-mono text-muted-foreground">{trip.tripNumber}</span>
                      </div>
                      <Badge variant="outline" className={`${getStatusColor(trip.status)} border rounded-full`}>
                        {getStatusLabel(trip.status)}
                      </Badge>
                    </div>
                    <Button size="icon" variant="ghost" className="h-8 w-8 -mr-2 text-muted-foreground group-hover:text-white opacity-0 group-hover:opacity-100 transition-opacity">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </div>
                  
                  <div className="p-5 flex-1 flex flex-col gap-4">
                    <div className="flex items-center gap-3 text-sm">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary flex-shrink-0">
                        <Users className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="font-medium text-white">{firstStop?.riderName} {passengerCount > 1 ? `+${passengerCount-1} others` : ''}</p>
                        <p className="text-muted-foreground text-xs mt-0.5">{passengerCount} Passenger{passengerCount !== 1 ? 's' : ''}</p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3 text-sm relative mt-2">
                      <div className="absolute left-[15px] top-7 bottom-3 w-px bg-white/10" />
                      <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-400 flex-shrink-0 z-10 ring-4 ring-card">
                        <MapPin className="w-4 h-4" />
                      </div>
                      <div className="pt-1">
                        <p className="text-white line-clamp-1">{firstStop?.address || 'No pickup specified'}</p>
                        <p className="text-muted-foreground text-xs mt-0.5 flex items-center gap-1">
                          <Clock className="w-3 h-3" /> 
                          {firstStop?.scheduledTime ? format(new Date(firstStop.scheduledTime), 'h:mm a') : 'TBD'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3 text-sm">
                      <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400 flex-shrink-0 z-10 ring-4 ring-card">
                        <MapPin className="w-4 h-4" />
                      </div>
                      <div className="pt-1">
                        <p className="text-white line-clamp-1">{lastStop?.address || 'No dropoff specified'}</p>
                        <p className="text-muted-foreground text-xs mt-0.5 flex items-center gap-1">
                          <Clock className="w-3 h-3" /> 
                          {lastStop?.appointmentTime ? format(new Date(lastStop.appointmentTime), 'h:mm a') : 'TBD'}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="px-5 py-3 border-t border-white/5 bg-black/20 flex items-center justify-between text-xs text-muted-foreground mt-auto">
                    <span className="flex items-center gap-1.5">
                      <div className={`w-2 h-2 rounded-full ${trip.driver ? 'bg-emerald-500' : 'bg-yellow-500'}`} />
                      {trip.driver ? (trip.driver as any).firstName : 'Unassigned Driver'}
                    </span>
                    <span>{trip.vehicle ? (trip.vehicle as any).name : 'No Vehicle'}</span>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </PlatformLayout>
  );
}
