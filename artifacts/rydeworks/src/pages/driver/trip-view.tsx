import { useState } from "react";
import { useParams, Link, useLocation } from "wouter";
import { DriverLayout } from "@/components/layout/driver-layout";
import { useGetTrip, useUpdateStopStatus, useUpdateTripStatus } from "@workspace/api-client-react";
import { format } from "date-fns";
import { MapPin, Phone, CheckCircle2, User, ChevronLeft, AlertCircle, Navigation } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Stop, StopStatus } from "@workspace/api-client-react/src/generated/api.schemas";

export default function DriverTripView() {
  const params = useParams();
  const id = params.id as string;
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useGetTrip(id);
  const trip = data?.trip;

  const stopStatusMutation = useUpdateStopStatus({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: [`/api/trips/${id}`] })
    }
  });

  const tripStatusMutation = useUpdateTripStatus({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: [`/api/trips/${id}`] })
    }
  });

  if (isLoading) return <DriverLayout hideNav title="Loading..."><div className="p-4">Loading...</div></DriverLayout>;
  if (!trip) return <DriverLayout hideNav title="Error"><div className="p-4">Trip not found</div></DriverLayout>;

  // Find current active stop (first one that isn't completed/canceled)
  const currentStop = trip.stops.find(s => !['completed', 'canceled', 'no_show', 'dropped_off'].includes(s.status));
  const isAllDone = !currentStop;

  const handleStopAction = (status: StopStatus) => {
    if(!currentStop?._id) return;
    stopStatusMutation.mutate({ 
      id, 
      stopId: currentStop._id, 
      data: { status } 
    });
    
    // Auto-start trip if first action taken
    if(trip.status === 'scheduled' && status === 'en_route') {
      tripStatusMutation.mutate({ id, data: { status: 'in_progress' } });
    }
  };

  const handleCompleteTrip = () => {
    tripStatusMutation.mutate({ id, data: { status: 'completed' } }, {
      onSuccess: () => {
        toast({ title: "Trip Completed!" });
        setLocation('/driver');
      }
    });
  };

  return (
    <DriverLayout hideNav title={`Trip ${trip.tripNumber.split('-').pop()}`}>
      <div className="flex flex-col h-[calc(100vh-64px)]">
        {/* Map Area Placeholder */}
        <div className="h-48 shrink-0 bg-black/40 relative border-b border-white/5 flex items-center justify-center">
          <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(255,255,255,0.15) 1px, transparent 0)', backgroundSize: '24px 24px' }}></div>
          <Button variant="outline" className="bg-card/80 backdrop-blur-md border-white/10 shadow-xl rounded-full px-6">
            <Navigation className="w-4 h-4 mr-2 text-primary" /> Open Navigation
          </Button>
        </div>

        {/* Current Stop Content */}
        <div className="flex-1 p-4 bg-background overflow-y-auto">
          {isAllDone ? (
            <div className="text-center py-10">
              <div className="w-20 h-20 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-6 glow-primary">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <h2 className="text-2xl font-bold font-display text-white mb-2">All Stops Complete!</h2>
              <p className="text-muted-foreground mb-8">You've successfully completed all stops for this trip.</p>
              <Button onClick={handleCompleteTrip} className="w-full h-14 rounded-2xl text-lg font-bold bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/25">
                Mark Trip Complete
              </Button>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Current Stop Info */}
              <Card className="bg-card border-white/10 rounded-3xl p-6 shadow-xl relative overflow-hidden">
                {currentStop?.status === 'en_route' && <div className="absolute top-0 left-0 right-0 h-1 bg-primary animate-pulse" />}
                
                <div className="flex items-center justify-between mb-4">
                  <span className="px-3 py-1 bg-white/10 rounded-lg text-xs font-bold tracking-wider uppercase text-white/80">
                    {currentStop?.type}
                  </span>
                  <span className="text-sm font-medium text-primary">
                    Stop {currentStop?.stopOrder! + 1} of {trip.stops.length}
                  </span>
                </div>
                
                <h2 className="text-2xl font-bold text-white mb-2 leading-tight">
                  {currentStop?.address}
                </h2>
                
                <div className="flex items-center justify-between mt-6 pt-6 border-t border-white/5">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center">
                      <User className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="font-semibold text-white text-lg">{currentStop?.riderName}</p>
                      {currentStop?.scheduledTime && (
                        <p className="text-sm text-muted-foreground">Sch: {format(new Date(currentStop.scheduledTime), 'h:mm a')}</p>
                      )}
                    </div>
                  </div>
                  <Button size="icon" className="h-12 w-12 rounded-full bg-green-500 hover:bg-green-600 text-white shadow-lg shadow-green-500/20">
                    <Phone className="w-5 h-5" />
                  </Button>
                </div>
              </Card>

              {/* Big Action Buttons based on status */}
              <div className="space-y-3">
                {currentStop?.status === 'pending' && (
                  <Button 
                    onClick={() => handleStopAction('en_route')}
                    disabled={stopStatusMutation.isPending}
                    className="w-full h-16 rounded-2xl text-lg font-bold bg-primary hover:bg-primary/90 text-primary-foreground shadow-xl shadow-primary/25"
                  >
                    I'm En Route
                  </Button>
                )}

                {currentStop?.status === 'en_route' && (
                  <Button 
                    onClick={() => handleStopAction('arrived')}
                    disabled={stopStatusMutation.isPending}
                    className="w-full h-16 rounded-2xl text-lg font-bold bg-blue-500 hover:bg-blue-600 text-white shadow-xl shadow-blue-500/25"
                  >
                    I've Arrived
                  </Button>
                )}

                {currentStop?.status === 'arrived' && currentStop.type === 'pickup' && (
                  <div className="grid grid-cols-2 gap-3">
                    <Button 
                      onClick={() => handleStopAction('aboard')}
                      disabled={stopStatusMutation.isPending}
                      className="h-16 rounded-2xl text-base font-bold bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/25"
                    >
                      Passenger Aboard
                    </Button>
                    <Button 
                      onClick={() => handleStopAction('no_show')}
                      disabled={stopStatusMutation.isPending}
                      variant="outline"
                      className="h-16 rounded-2xl text-base font-bold border-red-500/30 text-red-400 bg-red-500/10"
                    >
                      No Show
                    </Button>
                  </div>
                )}

                {currentStop?.status === 'arrived' && currentStop.type === 'dropoff' && (
                  <Button 
                    onClick={() => handleStopAction('completed')}
                    disabled={stopStatusMutation.isPending}
                    className="w-full h-16 rounded-2xl text-lg font-bold bg-emerald-500 hover:bg-emerald-600 text-white shadow-xl shadow-emerald-500/25"
                  >
                    Passenger Dropped Off
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </DriverLayout>
  );
}
