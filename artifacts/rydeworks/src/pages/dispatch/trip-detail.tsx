import { useState } from "react";
import { useParams, Link } from "wouter";
import { PlatformLayout } from "@/components/layout/platform-layout";
import { useGetTrip, useUpdateTripStatus, useOptimizeTrip } from "@workspace/api-client-react";
import { format } from "date-fns";
import { ArrowLeft, Clock, MapPin, Navigation, User, Car, CheckCircle2, XCircle, AlertCircle, RefreshCw } from "lucide-react";
import { TripMap } from "@/components/map/trip-map";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

export default function TripDetail() {
  const params = useParams();
  const id = params.id as string;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useGetTrip(id);
  const trip = data?.trip;

  const statusMutation = useUpdateTripStatus({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: [`/api/trips/${id}`] });
        toast({ title: "Status updated successfully" });
      }
    }
  });

  const optimizeMutation = useOptimizeTrip({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: [`/api/trips/${id}`] });
        toast({ title: "Route optimized successfully" });
      }
    }
  });

  if (isLoading) {
    return (
      <PlatformLayout title="Trip Details">
        <div className="animate-pulse space-y-8">
          <div className="h-10 bg-white/5 rounded-lg w-1/4"></div>
          <div className="h-64 bg-white/5 rounded-2xl"></div>
        </div>
      </PlatformLayout>
    );
  }

  if (!trip) {
    return (
      <PlatformLayout title="Trip Not Found">
        <div className="text-center py-20">
          <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
          <h2 className="text-xl font-bold">Trip not found</h2>
          <Button asChild className="mt-4" variant="outline">
            <Link href="/dispatch">Back to Dashboard</Link>
          </Button>
        </div>
      </PlatformLayout>
    );
  }

  const getStatusColor = (status: string) => {
    switch(status) {
      case 'scheduled': return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      case 'in_progress': return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20';
      case 'completed': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'canceled': return 'bg-red-500/10 text-red-400 border-red-500/20';
      default: return 'bg-gray-500/10 text-gray-400 border-gray-500/20';
    }
  };

  const getStopStatusColor = (status: string) => {
    if (['completed', 'aboard', 'dropped_off'].includes(status)) return 'bg-emerald-500';
    if (status === 'en_route') return 'bg-yellow-500';
    if (status === 'arrived') return 'bg-blue-500';
    if (status === 'canceled' || status === 'no_show') return 'bg-red-500';
    return 'bg-white/20'; // pending
  };

  return (
    <PlatformLayout 
      title={`Trip ${trip.tripNumber}`}
      action={
        <Button variant="outline" asChild className="bg-card">
          <Link href="/dispatch">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back
          </Link>
        </Button>
      }
    >
      <div className="grid lg:grid-cols-3 gap-8">
        {/* Left Column: Details & Map Placeholder */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="bg-card border-white/5 rounded-2xl overflow-hidden shadow-lg">
            <div className="p-6 border-b border-white/5 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold font-display text-white">{format(new Date(trip.tripDate), 'EEEE, MMMM d, yyyy')}</h2>
                <div className="flex items-center gap-3 mt-2">
                  <Badge variant="outline" className={`${getStatusColor(trip.status)} px-3 py-1 text-sm rounded-full`}>
                    {trip.status.replace('_', ' ').toUpperCase()}
                  </Badge>
                  <span className="text-sm text-muted-foreground font-mono">{trip.tripNumber}</span>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                {trip.status === 'scheduled' && (
                  <>
                    <Button 
                      variant="outline" 
                      onClick={() => optimizeMutation.mutate({ id })}
                      disabled={optimizeMutation.isPending}
                      className="bg-white/5 border-white/10 hover:bg-white/10"
                    >
                      <RefreshCw className={`w-4 h-4 mr-2 ${optimizeMutation.isPending ? 'animate-spin' : ''}`} />
                      Optimize Route
                    </Button>
                    <Button 
                      onClick={() => statusMutation.mutate({ id, data: { status: 'in_progress' } })}
                      className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20"
                    >
                      Start Trip
                    </Button>
                  </>
                )}
                {trip.status === 'in_progress' && (
                  <Button 
                    onClick={() => statusMutation.mutate({ id, data: { status: 'completed' } })}
                    className="bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/20"
                  >
                    Mark Completed
                  </Button>
                )}
              </div>
            </div>

            <div className="p-0">
              {/* Live Map */}
              <TripMap
                stops={trip.stops.map(s => ({
                  type: s.type,
                  address: s.address,
                  riderName: s.riderName,
                  lat: (s as any).lat,
                  lng: (s as any).lng,
                  status: s.status,
                }))}
                routeGeometry={(trip as any).routeGeometry || null}
                className="h-[400px] w-full border-b border-white/5"
              />

              {/* Stops Timeline */}
              <div className="p-6">
                <h3 className="text-lg font-semibold text-white mb-6 font-display flex items-center gap-2">
                  <Navigation className="w-5 h-5 text-primary" /> Route Stops
                </h3>
                
                <div className="relative pl-4 space-y-8">
                  {/* Vertical Line */}
                  <div className="absolute left-[27px] top-2 bottom-2 w-0.5 bg-white/10 rounded-full" />
                  
                  {trip.stops.map((stop, index) => (
                    <div key={stop._id || index} className="relative flex gap-6 items-start">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 z-10 mt-1 ring-4 ring-card ${getStopStatusColor(stop.status)}`}>
                        {['completed', 'aboard', 'dropped_off'].includes(stop.status) ? (
                          <CheckCircle2 className="w-4 h-4 text-white" />
                        ) : (
                          <span className="text-[10px] font-bold text-white">{index + 1}</span>
                        )}
                      </div>
                      
                      <div className="flex-1 bg-white/[0.02] border border-white/5 rounded-xl p-4 hover:border-white/10 transition-colors">
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="bg-black/30 border-white/10">
                              {stop.type.toUpperCase()}
                            </Badge>
                            <span className="font-medium text-white">{stop.riderName}</span>
                          </div>
                          <Badge variant="outline" className="capitalize text-xs bg-transparent border-white/10 text-muted-foreground">
                            {stop.status.replace('_', ' ')}
                          </Badge>
                        </div>
                        
                        <p className="text-sm text-muted-foreground mb-3">{stop.address}</p>
                        
                        <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                          {stop.scheduledTime && (
                            <span className="flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5" /> 
                              Sch: {format(new Date(stop.scheduledTime), 'h:mm a')}
                            </span>
                          )}
                          {stop.appointmentTime && (
                            <span className="flex items-center gap-1 text-primary">
                              <AlertCircle className="w-3.5 h-3.5" /> 
                              Appt: {format(new Date(stop.appointmentTime), 'h:mm a')}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* Right Column: Meta info */}
        <div className="space-y-6">
          <Card className="bg-card border-white/5 rounded-2xl p-6 shadow-lg">
            <h3 className="text-lg font-semibold text-white mb-4 font-display">Assignments</h3>
            
            <div className="space-y-4">
              <div className="flex items-center gap-4 p-3 rounded-xl bg-white/[0.02] border border-white/5">
                <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                  <User className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-white">Driver</p>
                  <p className="text-sm text-muted-foreground">{trip.driver ? (trip.driver as any).firstName + ' ' + (trip.driver as any).lastName : 'Unassigned'}</p>
                </div>
              </div>

              <div className="flex items-center gap-4 p-3 rounded-xl bg-white/[0.02] border border-white/5">
                <div className="w-10 h-10 rounded-full bg-blue-500/10 text-blue-400 flex items-center justify-center">
                  <Car className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-white">Vehicle</p>
                  <p className="text-sm text-muted-foreground">{trip.vehicle ? (trip.vehicle as any).name : 'Unassigned'}</p>
                </div>
              </div>
            </div>
          </Card>

          <Card className="bg-card border-white/5 rounded-2xl p-6 shadow-lg">
            <h3 className="text-lg font-semibold text-white mb-4 font-display">Payment Details</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between py-2 border-b border-white/5">
                <span className="text-muted-foreground">Type</span>
                <span className="font-medium text-white capitalize">{(trip.payment as any)?.type || 'None'}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-white/5">
                <span className="text-muted-foreground">Status</span>
                <Badge variant="outline" className={(trip.payment as any)?.isPaid ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'}>
                  {(trip.payment as any)?.isPaid ? 'Paid' : 'Pending'}
                </Badge>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-muted-foreground">Estimated Fare</span>
                <span className="font-medium text-white">${((trip.payment as any)?.estimatedFare || 0).toFixed(2)}</span>
              </div>
            </div>
          </Card>

          {trip.notes && (
            <Card className="bg-card border-white/5 rounded-2xl p-6 shadow-lg">
              <h3 className="text-lg font-semibold text-white mb-2 font-display">Notes</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{trip.notes}</p>
            </Card>
          )}

          {trip.status !== 'canceled' && trip.status !== 'completed' && (
            <Button 
              variant="outline" 
              className="w-full border-red-500/20 text-red-400 hover:bg-red-500/10 hover:text-red-300"
              onClick={() => {
                if(confirm('Are you sure you want to cancel this trip?')) {
                  statusMutation.mutate({ id, data: { status: 'canceled' } });
                }
              }}
            >
              <XCircle className="w-4 h-4 mr-2" /> Cancel Trip
            </Button>
          )}
        </div>
      </div>
    </PlatformLayout>
  );
}
