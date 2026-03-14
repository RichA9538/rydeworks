import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { motion, AnimatePresence } from "framer-motion";
import { format, addDays, isBefore, startOfDay } from "date-fns";
import {
  Phone, MapPin, Calendar, ArrowRight, CheckCircle2,
  Clock, Car, User, ChevronLeft, RefreshCw, LogOut,
  ArrowUpDown, Info
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const ORG_SLUG = new URLSearchParams(window.location.search).get("org") || "perc";

type RiderInfo = {
  _id: string;
  riderId: string;
  firstName: string;
  lastName: string;
  homeAddress?: string;
  commonDestinations?: { label: string; address: string }[];
};

type Trip = {
  _id: string;
  tripNumber: string;
  tripDate: string;
  status: string;
  stops: { type: string; address: string; riderName: string; scheduledTime?: string; appointmentTime?: string; status: string }[];
  driver?: { firstName: string; lastName: string; phone?: string };
  vehicle?: { name: string; color?: string };
};

const phoneSchema = z.object({
  phone: z.string().min(10, "Please enter a valid phone number"),
});

const requestSchema = z.object({
  pickupAddress: z.string().min(5, "Enter a pickup address"),
  dropoffAddress: z.string().min(5, "Enter a dropoff address"),
  tripDate: z.string().min(1, "Select a date"),
  appointmentTime: z.string().optional(),
  notes: z.string().optional(),
  isRoundTrip: z.boolean().default(false),
});

type PhoneForm = z.infer<typeof phoneSchema>;
type RequestForm = z.infer<typeof requestSchema>;

function getStatusColor(status: string) {
  switch (status) {
    case "scheduled": return "bg-blue-500/15 text-blue-400 border-blue-500/20";
    case "in_progress": return "bg-yellow-500/15 text-yellow-400 border-yellow-500/20";
    case "completed": return "bg-emerald-500/15 text-emerald-400 border-emerald-500/20";
    case "canceled": return "bg-red-500/15 text-red-400 border-red-500/20";
    default: return "bg-white/5 text-white/60 border-white/10";
  }
}

export default function RiderPortal() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [rider, setRider] = useState<RiderInfo | null>(null);
  const [view, setView] = useState<"login" | "home" | "request" | "success">("login");
  const [successTrip, setSuccessTrip] = useState<string>("");

  const phoneForm = useForm<PhoneForm>({ resolver: zodResolver(phoneSchema) });
  const requestForm = useForm<RequestForm>({
    resolver: zodResolver(requestSchema),
    defaultValues: { isRoundTrip: false },
  });

  const lookupMutation = useMutation({
    mutationFn: async (data: PhoneForm) => {
      const res = await fetch("/api/rider-portal/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: data.phone, orgSlug: ORG_SLUG }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      return json.rider as RiderInfo;
    },
    onSuccess: (r) => {
      setRider(r);
      setView("home");
    },
    onError: (e: Error) => {
      toast({ variant: "destructive", title: "Not found", description: e.message });
    },
  });

  const { data: tripsData, isLoading: tripsLoading, refetch } = useQuery({
    queryKey: ["rider-trips", rider?._id],
    queryFn: async () => {
      const res = await fetch(`/api/rider-portal/trips/${rider?._id}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      return json.trips as Trip[];
    },
    enabled: !!rider?._id,
    refetchInterval: 30000,
  });

  const requestMutation = useMutation({
    mutationFn: async (data: RequestForm) => {
      const res = await fetch("/api/rider-portal/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, riderId: rider?._id, orgSlug: ORG_SLUG }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      return json;
    },
    onSuccess: (data) => {
      setSuccessTrip(data.tripNumber);
      setView("success");
      queryClient.invalidateQueries({ queryKey: ["rider-trips"] });
    },
    onError: (e: Error) => {
      toast({ variant: "destructive", title: "Request failed", description: e.message });
    },
  });

  const trips = tripsData || [];
  const upcoming = trips.filter(t => t.status !== "canceled" && t.status !== "completed");
  const past = trips.filter(t => t.status === "completed" || t.status === "canceled");

  const minDate = format(addDays(new Date(), 1), "yyyy-MM-dd");

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-white/5 bg-background/80 backdrop-blur-xl">
        <div className="max-w-lg mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {view !== "login" && view !== "home" && (
              <button onClick={() => setView("home")} className="mr-1 text-muted-foreground hover:text-white transition-colors">
                <ChevronLeft className="w-5 h-5" />
              </button>
            )}
            <img src={`${import.meta.env.BASE_URL}images/logo-mark.png`} alt="RydeWorks" className="w-7 h-7 object-contain" />
            <span className="font-display font-bold text-lg tracking-tight">Rider Portal</span>
          </div>
          {rider && (
            <button onClick={() => { setRider(null); setView("login"); }} className="text-muted-foreground hover:text-white transition-colors">
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 max-w-lg mx-auto w-full px-4 py-8">
        <AnimatePresence mode="wait">

          {/* LOGIN */}
          {view === "login" && (
            <motion.div key="login" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="space-y-8">
              <div className="text-center pt-8">
                <div className="w-20 h-20 bg-primary/10 rounded-3xl flex items-center justify-center mx-auto mb-6 border border-primary/20">
                  <Phone className="w-9 h-9 text-primary" />
                </div>
                <h1 className="text-3xl font-bold font-display text-white mb-2">Welcome Rider</h1>
                <p className="text-muted-foreground">Enter your phone number to access your trips and request rides.</p>
              </div>

              <Card className="bg-card border-white/5 rounded-3xl p-6">
                <form onSubmit={phoneForm.handleSubmit(d => lookupMutation.mutate(d))} className="space-y-5">
                  <div className="space-y-2">
                    <Label className="text-white/80">Phone Number</Label>
                    <Input
                      type="tel"
                      placeholder="(813) 555-0100"
                      className="h-14 text-lg bg-black/20 border-white/10 rounded-2xl px-4"
                      {...phoneForm.register("phone")}
                    />
                    {phoneForm.formState.errors.phone && (
                      <p className="text-destructive text-sm">{phoneForm.formState.errors.phone.message}</p>
                    )}
                  </div>
                  <Button type="submit" className="w-full h-14 rounded-2xl text-base font-semibold" disabled={lookupMutation.isPending}>
                    {lookupMutation.isPending ? <RefreshCw className="w-5 h-5 animate-spin" /> : <>Find My Trips <ArrowRight className="ml-2 w-5 h-5" /></>}
                  </Button>
                </form>
              </Card>

              <p className="text-center text-sm text-muted-foreground">
                Not registered? Contact your PERC dispatcher to get set up.
              </p>
            </motion.div>
          )}

          {/* HOME */}
          {view === "home" && rider && (
            <motion.div key="home" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold font-display text-white">Hi, {rider.firstName}!</h2>
                  <p className="text-sm text-muted-foreground">{rider.riderId}</p>
                </div>
                <Button onClick={() => setView("request")} className="rounded-full shadow-lg shadow-primary/20">
                  <MapPin className="w-4 h-4 mr-2" /> Request Ride
                </Button>
              </div>

              {/* Upcoming trips */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-white font-display">Upcoming Trips</h3>
                  <button onClick={() => refetch()} className="text-muted-foreground hover:text-white transition-colors">
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>

                {tripsLoading ? (
                  <div className="space-y-3">
                    {[1,2].map(i => <div key={i} className="h-28 bg-white/5 animate-pulse rounded-2xl" />)}
                  </div>
                ) : upcoming.length === 0 ? (
                  <Card className="bg-card/40 border-white/5 border-dashed rounded-3xl p-10 text-center">
                    <Calendar className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-40" />
                    <p className="text-white font-medium mb-1">No upcoming trips</p>
                    <p className="text-muted-foreground text-sm">Request a ride below to get started.</p>
                    <Button onClick={() => setView("request")} className="mt-5 rounded-full" size="sm">Request a Ride</Button>
                  </Card>
                ) : (
                  <div className="space-y-3">
                    {upcoming.map(trip => {
                      const myPickup = trip.stops.find(s => s.type === "pickup" && s.riderName?.includes(rider.firstName));
                      const myDropoff = trip.stops.find(s => s.type === "dropoff" && s.riderName?.includes(rider.firstName));
                      return (
                        <Card key={trip._id} className="bg-card border-white/5 rounded-2xl overflow-hidden">
                          <div className="p-4 border-b border-white/5 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-sm text-muted-foreground">{trip.tripNumber}</span>
                              <Badge variant="outline" className={`${getStatusColor(trip.status)} text-xs`}>
                                {trip.status.replace("_", " ").toUpperCase()}
                              </Badge>
                            </div>
                            <span className="text-sm text-white font-medium">{format(new Date(trip.tripDate), "EEE, MMM d")}</span>
                          </div>
                          <div className="p-4 space-y-3">
                            {myPickup && (
                              <div className="flex items-start gap-3 text-sm">
                                <div className="w-6 h-6 rounded-full bg-primary/15 flex items-center justify-center mt-0.5 shrink-0">
                                  <MapPin className="w-3 h-3 text-primary" />
                                </div>
                                <div>
                                  <p className="text-xs text-muted-foreground mb-0.5">Pickup</p>
                                  <p className="text-white">{myPickup.address}</p>
                                  {myPickup.scheduledTime && <p className="text-xs text-primary mt-0.5 flex items-center gap-1"><Clock className="w-3 h-3" />{format(new Date(myPickup.scheduledTime), "h:mm a")}</p>}
                                </div>
                              </div>
                            )}
                            {myDropoff && (
                              <div className="flex items-start gap-3 text-sm">
                                <div className="w-6 h-6 rounded-full bg-indigo-500/15 flex items-center justify-center mt-0.5 shrink-0">
                                  <MapPin className="w-3 h-3 text-indigo-400" />
                                </div>
                                <div>
                                  <p className="text-xs text-muted-foreground mb-0.5">Drop-off</p>
                                  <p className="text-white">{myDropoff.address}</p>
                                  {myDropoff.appointmentTime && <p className="text-xs text-yellow-400 mt-0.5 flex items-center gap-1"><Clock className="w-3 h-3" />Appt: {format(new Date(myDropoff.appointmentTime), "h:mm a")}</p>}
                                </div>
                              </div>
                            )}
                            {trip.driver && (
                              <div className="flex items-center gap-3 pt-1 border-t border-white/5 text-xs text-muted-foreground">
                                <User className="w-3.5 h-3.5" /> {trip.driver.firstName} {trip.driver.lastName}
                                {trip.vehicle && <><Car className="w-3.5 h-3.5 ml-2" /> {trip.vehicle.name}</>}
                              </div>
                            )}
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Past trips */}
              {past.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold text-white font-display mb-3">Trip History</h3>
                  <div className="space-y-2">
                    {past.slice(0, 5).map(trip => (
                      <div key={trip._id} className="flex items-center justify-between p-4 bg-white/[0.02] border border-white/5 rounded-2xl text-sm">
                        <div>
                          <span className="font-mono text-muted-foreground text-xs">{trip.tripNumber}</span>
                          <p className="text-white mt-0.5">{format(new Date(trip.tripDate), "EEE, MMM d, yyyy")}</p>
                          <p className="text-muted-foreground text-xs">{trip.stops.length} stops</p>
                        </div>
                        <Badge variant="outline" className={`${getStatusColor(trip.status)} text-xs`}>
                          {trip.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* REQUEST RIDE */}
          {view === "request" && rider && (
            <motion.div key="request" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold font-display text-white">Request a Ride</h2>
                <p className="text-muted-foreground text-sm mt-1">Fill out the details below. Your dispatcher will confirm your trip.</p>
              </div>

              <Card className="bg-card border-white/5 rounded-3xl p-6">
                <form onSubmit={requestForm.handleSubmit(d => requestMutation.mutate(d))} className="space-y-5">

                  <div className="space-y-2">
                    <Label className="text-white/80 flex items-center gap-2"><MapPin className="w-4 h-4 text-primary" /> Pickup Address</Label>
                    {rider.homeAddress && (
                      <button type="button" onClick={() => requestForm.setValue("pickupAddress", rider.homeAddress!)}
                        className="text-xs text-primary hover:underline flex items-center gap-1">
                        Use my home address
                      </button>
                    )}
                    <Input placeholder="123 Main St, St. Petersburg, FL" className="h-12 bg-black/20 border-white/10 rounded-xl" {...requestForm.register("pickupAddress")} />
                    {requestForm.formState.errors.pickupAddress && <p className="text-destructive text-xs">{requestForm.formState.errors.pickupAddress.message}</p>}
                  </div>

                  <div className="space-y-2">
                    <Label className="text-white/80 flex items-center gap-2"><MapPin className="w-4 h-4 text-indigo-400" /> Drop-off Address</Label>
                    {rider.commonDestinations && rider.commonDestinations.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {rider.commonDestinations.map(d => (
                          <button type="button" key={d.label} onClick={() => requestForm.setValue("dropoffAddress", d.address)}
                            className="text-xs px-3 py-1 rounded-full bg-white/5 border border-white/10 text-white/70 hover:bg-primary/10 hover:text-primary hover:border-primary/20 transition-all">
                            {d.label}
                          </button>
                        ))}
                      </div>
                    )}
                    <Input placeholder="Tampa General Hospital, Tampa, FL" className="h-12 bg-black/20 border-white/10 rounded-xl" {...requestForm.register("dropoffAddress")} />
                    {requestForm.formState.errors.dropoffAddress && <p className="text-destructive text-xs">{requestForm.formState.errors.dropoffAddress.message}</p>}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-white/80 flex items-center gap-2"><Calendar className="w-4 h-4" /> Trip Date</Label>
                      <Input type="date" min={minDate} className="h-12 bg-black/20 border-white/10 rounded-xl" {...requestForm.register("tripDate")} />
                      {requestForm.formState.errors.tripDate && <p className="text-destructive text-xs">{requestForm.formState.errors.tripDate.message}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label className="text-white/80 flex items-center gap-2"><Clock className="w-4 h-4 text-yellow-400" /> Appointment Time</Label>
                      <Input type="time" className="h-12 bg-black/20 border-white/10 rounded-xl" {...requestForm.register("appointmentTime")} />
                      <p className="text-xs text-muted-foreground">When you need to arrive</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-4 bg-white/[0.03] border border-white/5 rounded-xl">
                    <Checkbox
                      id="roundTrip"
                      onCheckedChange={(v) => requestForm.setValue("isRoundTrip", !!v)}
                    />
                    <div>
                      <label htmlFor="roundTrip" className="text-sm font-medium text-white cursor-pointer flex items-center gap-2">
                        <ArrowUpDown className="w-4 h-4 text-primary" /> Round Trip
                      </label>
                      <p className="text-xs text-muted-foreground mt-0.5">I need a return ride back home</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-white/80">Notes (optional)</Label>
                    <Textarea placeholder="Wheelchair accessible needed, or any other details..." className="bg-black/20 border-white/10 rounded-xl resize-none" rows={3} {...requestForm.register("notes")} />
                  </div>

                  <div className="flex items-start gap-2 p-3 bg-primary/5 border border-primary/10 rounded-xl text-xs text-muted-foreground">
                    <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                    Your dispatcher will review and confirm your trip. Requests submitted at least 24 hours in advance are prioritized.
                  </div>

                  <Button type="submit" className="w-full h-14 rounded-2xl text-base font-semibold shadow-lg shadow-primary/20" disabled={requestMutation.isPending}>
                    {requestMutation.isPending ? <RefreshCw className="w-5 h-5 animate-spin" /> : <>Submit Request <ArrowRight className="ml-2 w-5 h-5" /></>}
                  </Button>
                </form>
              </Card>
            </motion.div>
          )}

          {/* SUCCESS */}
          {view === "success" && (
            <motion.div key="success" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="text-center py-16 space-y-6">
              <div className="w-24 h-24 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto border border-emerald-500/20">
                <CheckCircle2 className="w-12 h-12 text-emerald-400" />
              </div>
              <div>
                <h2 className="text-3xl font-bold font-display text-white mb-2">Request Submitted!</h2>
                <p className="text-muted-foreground">Trip <span className="text-white font-mono font-semibold">{successTrip}</span> has been sent to your dispatcher for review.</p>
              </div>
              <Card className="bg-card/40 border-white/5 rounded-2xl p-5 text-sm text-muted-foreground text-left">
                <p className="font-medium text-white mb-2">What happens next?</p>
                <ul className="space-y-2">
                  <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" /> Your dispatcher reviews and assigns a driver</li>
                  <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" /> You'll see the confirmed trip appear in your Upcoming Trips</li>
                  <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" /> Check back here the day of your trip to track your ride</li>
                </ul>
              </Card>
              <Button onClick={() => setView("home")} className="w-full h-14 rounded-2xl text-base font-semibold">
                Back to My Trips
              </Button>
            </motion.div>
          )}

        </AnimatePresence>
      </main>
    </div>
  );
}
