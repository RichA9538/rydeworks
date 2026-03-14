import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useForm, useFieldArray } from "react-hook-form";
import { PlatformLayout } from "@/components/layout/platform-layout";
import {
  useCreateTrip, useListUsers, useListVehicles, useListRiders, useCreateRider, useGetOrganization
} from "@workspace/api-client-react";
import { format } from "date-fns";
import { ArrowLeft, Plus, Trash2, Search, UserPlus, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

const PAYMENT_TYPES = [
  { value: 'grant', label: 'Grant Funded' },
  { value: 'self_pay', label: 'Self Pay (Stripe)' },
  { value: 'free_ride', label: 'Free Ride Code' },
  { value: 'partner', label: 'Partner / Invoice' },
  { value: 'none', label: 'No Payment' },
];

const STOP_STATUSES = ['pending', 'en_route', 'arrived', 'aboard', 'completed', 'no_show', 'canceled'];

export default function NewTrip() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [riderSearch, setRiderSearch] = useState("");
  const [showRiderSearch, setShowRiderSearch] = useState<number | null>(null);
  const [newRiderForm, setNewRiderForm] = useState<{ [key: number]: boolean }>({});

  const { data: usersData } = useListUsers({ all: 'false' });
  const { data: vehiclesData } = useListVehicles();
  const { data: ridersData } = useListRiders({ q: riderSearch });
  const { data: orgData } = useGetOrganization();

  const drivers = (usersData?.users || []).filter((u: any) => u.roles?.includes('driver'));
  const vehicles = vehiclesData?.vehicles || [];
  const riders = ridersData?.riders || [];
  const org = orgData?.org;
  const homeBases = org?.homeBases || [];

  const { register, handleSubmit, control, watch, setValue, formState: { errors } } = useForm({
    defaultValues: {
      tripDate: format(new Date(), "yyyy-MM-dd"),
      tripTime: "09:00",
      driverId: "",
      vehicleId: "",
      homeBaseId: "",
      paymentType: "none",
      notes: "",
      stops: [
        { type: "pickup", address: "", riderName: "", riderPhone: "", riderId: "", scheduledTime: "09:00", notes: "" },
        { type: "dropoff", address: "", riderName: "", riderPhone: "", riderId: "", scheduledTime: "10:00", notes: "" }
      ]
    }
  });

  const { fields: stopFields, append, remove } = useFieldArray({ control, name: "stops" as any });

  const createTripMutation = useCreateTrip({
    mutation: {
      onSuccess: (data: any) => {
        queryClient.invalidateQueries({ queryKey: ['/api/trips'] });
        toast({ title: "Trip created!", description: `Trip ${data.trip?.tripNumber} has been scheduled.` });
        navigate(`/dispatch/trips/${data.trip?._id}`);
      },
      onError: (err: any) => {
        toast({ variant: "destructive", title: "Failed to create trip", description: err.error?.error || "Something went wrong." });
      }
    }
  });

  const createRiderMutation = useCreateRider({
    mutation: {
      onSuccess: (data: any, variables: any, context: any) => {
        queryClient.invalidateQueries({ queryKey: ['/api/trips/riders'] });
        toast({ title: "Rider created!", description: `${data.rider?.firstName} ${data.rider?.lastName} added.` });
      }
    }
  });

  const onSubmit = (data: any) => {
    const tripDatetime = new Date(`${data.tripDate}T${data.tripTime}:00`);
    const payload = {
      tripDate: tripDatetime.toISOString(),
      driverId: data.driverId || undefined,
      vehicleId: data.vehicleId || undefined,
      homeBaseId: data.homeBaseId || undefined,
      payment: { type: data.paymentType },
      notes: data.notes,
      stops: data.stops.map((s: any, i: number) => ({
        stopOrder: i,
        type: s.type,
        address: s.address,
        riderName: s.riderName,
        riderPhone: s.riderPhone,
        riderId: s.riderId || undefined,
        scheduledTime: s.scheduledTime ? new Date(`${data.tripDate}T${s.scheduledTime}:00`).toISOString() : undefined,
        status: 'pending',
        notes: s.notes
      }))
    };
    createTripMutation.mutate({ data: payload } as any);
  };

  const selectRiderForStop = (index: number, rider: any) => {
    setValue(`stops.${index}.riderId` as any, rider._id);
    setValue(`stops.${index}.riderName` as any, `${rider.firstName} ${rider.lastName}`);
    setValue(`stops.${index}.riderPhone` as any, rider.phone || "");
    if (rider.homeAddress) {
      const oppositeType = (watch(`stops.${index}.type` as any) === 'pickup') ? 'dropoff' : 'pickup';
      const oppositeIdx = stopFields.findIndex((s: any, i: number) =>
        i !== index && (watch(`stops.${i}.type` as any) === oppositeType) && !(watch(`stops.${i}.riderId` as any))
      );
      if (oppositeIdx >= 0 && watch(`stops.${index}.type` as any) === 'dropoff') {
        setValue(`stops.${index}.address` as any, rider.homeAddress);
      }
    }
    setShowRiderSearch(null);
    setRiderSearch("");
  };

  const stopValues = watch("stops");

  return (
    <PlatformLayout
      title="Schedule New Trip"
      action={
        <Button variant="outline" asChild className="bg-card border-white/10">
          <Link href="/dispatch"><ArrowLeft className="w-4 h-4 mr-2" /> Back</Link>
        </Button>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="max-w-3xl mx-auto space-y-6 pb-16">
        {/* Date & Assignment */}
        <Card className="bg-card border-white/5 rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold text-white">Trip Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-white/70 text-xs">Trip Date</Label>
                <Input type="date" className="bg-black/20 border-white/10 rounded-xl h-10" {...register("tripDate", { required: true })} />
              </div>
              <div className="space-y-1">
                <Label className="text-white/70 text-xs">Departure Time</Label>
                <Input type="time" className="bg-black/20 border-white/10 rounded-xl h-10" {...register("tripTime")} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-white/70 text-xs">Driver</Label>
                <Select onValueChange={(v) => setValue("driverId", v)}>
                  <SelectTrigger className="bg-black/20 border-white/10 rounded-xl h-10">
                    <SelectValue placeholder="Assign driver..." />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-white/10">
                    {drivers.map((d: any) => (
                      <SelectItem key={d._id} value={d._id}>{d.firstName} {d.lastName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-white/70 text-xs">Vehicle</Label>
                <Select onValueChange={(v) => setValue("vehicleId", v)}>
                  <SelectTrigger className="bg-black/20 border-white/10 rounded-xl h-10">
                    <SelectValue placeholder="Assign vehicle..." />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-white/10">
                    {vehicles.map((v: any) => (
                      <SelectItem key={v._id} value={v._id}>{v.name} — {v.licensePlate}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-white/70 text-xs">Home Base</Label>
                <Select onValueChange={(v) => setValue("homeBaseId", v)}>
                  <SelectTrigger className="bg-black/20 border-white/10 rounded-xl h-10">
                    <SelectValue placeholder="Select home base..." />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-white/10">
                    {homeBases.map((b: any) => (
                      <SelectItem key={b._id} value={b._id}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-white/70 text-xs">Payment Type</Label>
                <Select defaultValue="none" onValueChange={(v) => setValue("paymentType", v)}>
                  <SelectTrigger className="bg-black/20 border-white/10 rounded-xl h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-white/10">
                    {PAYMENT_TYPES.map(p => (
                      <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stops */}
        <Card className="bg-card border-white/5 rounded-2xl">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-base font-semibold text-white">Stops ({stopFields.length})</CardTitle>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="outline" className="border-white/10 bg-white/5 text-xs h-8 rounded-lg"
                onClick={() => append({ type: "pickup", address: "", riderName: "", riderPhone: "", riderId: "", scheduledTime: "09:00", notes: "" })}>
                <Plus className="w-3 h-3 mr-1" /> Pickup
              </Button>
              <Button type="button" size="sm" variant="outline" className="border-white/10 bg-white/5 text-xs h-8 rounded-lg"
                onClick={() => append({ type: "dropoff", address: "", riderName: "", riderPhone: "", riderId: "", scheduledTime: "10:00", notes: "" })}>
                <Plus className="w-3 h-3 mr-1" /> Dropoff
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {stopFields.map((field, index) => {
              const stopType = watch(`stops.${index}.type` as any);
              const riderName = watch(`stops.${index}.riderName` as any);
              return (
                <div key={field.id} className={`p-4 rounded-xl border ${stopType === 'pickup' ? 'border-blue-500/20 bg-blue-500/5' : 'border-emerald-500/20 bg-emerald-500/5'}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-white/50">Stop {index + 1}</span>
                      <Badge variant="outline" className={`text-xs px-2 py-0.5 rounded-md ${stopType === 'pickup' ? 'border-blue-500/30 text-blue-400' : 'border-emerald-500/30 text-emerald-400'}`}>
                        {stopType}
                      </Badge>
                    </div>
                    <Button type="button" size="icon" variant="ghost"
                      className="h-7 w-7 text-muted-foreground hover:text-red-400 hover:bg-red-500/10"
                      onClick={() => remove(index)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>

                  {/* Rider Selection */}
                  <div className="mb-3">
                    <Label className="text-white/70 text-xs mb-1 block">Rider</Label>
                    {riderName ? (
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-white font-medium">{riderName}</span>
                        <Button type="button" size="sm" variant="ghost" className="h-6 text-xs text-muted-foreground hover:text-white px-2"
                          onClick={() => { setValue(`stops.${index}.riderId` as any, ""); setValue(`stops.${index}.riderName` as any, ""); }}>
                          Change
                        </Button>
                      </div>
                    ) : (
                      <div className="relative">
                        {showRiderSearch === index ? (
                          <div className="space-y-2">
                            <div className="relative">
                              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                              <Input
                                placeholder="Search riders..."
                                className="pl-8 bg-black/30 border-white/10 rounded-lg h-9 text-sm"
                                value={riderSearch}
                                onChange={e => setRiderSearch(e.target.value)}
                                autoFocus
                              />
                            </div>
                            {riders.length > 0 && (
                              <div className="bg-black/50 rounded-lg border border-white/10 max-h-40 overflow-y-auto">
                                {riders.map((r: any) => (
                                  <button key={r._id} type="button"
                                    className="w-full text-left px-3 py-2 text-sm hover:bg-white/5 transition-colors flex items-center justify-between"
                                    onClick={() => selectRiderForStop(index, r)}>
                                    <span>{r.firstName} {r.lastName}</span>
                                    <span className="text-xs text-muted-foreground">{r.riderId}</span>
                                  </button>
                                ))}
                              </div>
                            )}
                            <Button type="button" size="sm" variant="ghost" className="h-7 text-xs text-primary hover:text-primary"
                              onClick={() => setShowRiderSearch(null)}>Cancel</Button>
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <Button type="button" size="sm" variant="outline" className="border-white/10 bg-white/5 text-xs h-8 rounded-lg flex-1"
                              onClick={() => setShowRiderSearch(index)}>
                              <Search className="w-3 h-3 mr-1" /> Search existing riders
                            </Button>
                            <Button type="button" size="sm" variant="outline" className="border-white/10 bg-white/5 text-xs h-8 rounded-lg"
                              onClick={() => setNewRiderForm({ ...newRiderForm, [index]: !newRiderForm[index] })}>
                              <UserPlus className="w-3 h-3 mr-1" /> New
                            </Button>
                          </div>
                        )}
                        {newRiderForm[index] && (
                          <div className="mt-2 p-3 rounded-lg bg-black/30 border border-white/10 space-y-2">
                            <p className="text-xs text-white/60 font-medium">Quick-add new rider</p>
                            <div className="grid grid-cols-2 gap-2">
                              <Input placeholder="First name" className="bg-black/30 border-white/10 rounded-lg h-8 text-xs"
                                id={`new-rider-fn-${index}`} />
                              <Input placeholder="Last name" className="bg-black/30 border-white/10 rounded-lg h-8 text-xs"
                                id={`new-rider-ln-${index}`} />
                            </div>
                            <Input placeholder="Phone number" className="bg-black/30 border-white/10 rounded-lg h-8 text-xs"
                              id={`new-rider-ph-${index}`} />
                            <Button type="button" size="sm" className="h-7 text-xs w-full"
                              onClick={() => {
                                const fn = (document.getElementById(`new-rider-fn-${index}`) as HTMLInputElement)?.value;
                                const ln = (document.getElementById(`new-rider-ln-${index}`) as HTMLInputElement)?.value;
                                const ph = (document.getElementById(`new-rider-ph-${index}`) as HTMLInputElement)?.value;
                                if (fn && ln) {
                                  createRiderMutation.mutate(
                                    { data: { firstName: fn, lastName: ln, phone: ph } } as any,
                                    {
                                      onSuccess: (data: any) => {
                                        selectRiderForStop(index, data.rider);
                                        setNewRiderForm({ ...newRiderForm, [index]: false });
                                      }
                                    }
                                  );
                                }
                              }}>
                              Save Rider
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div>
                      <Label className="text-white/70 text-xs mb-1 block">Address</Label>
                      <Input placeholder="Full address..."
                        className="bg-black/20 border-white/10 rounded-lg h-9 text-sm"
                        {...register(`stops.${index}.address` as any, { required: true })} />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-white/70 text-xs mb-1 block">Scheduled Time</Label>
                        <Input type="time" className="bg-black/20 border-white/10 rounded-lg h-9 text-sm"
                          {...register(`stops.${index}.scheduledTime` as any)} />
                      </div>
                      <div>
                        <Label className="text-white/70 text-xs mb-1 block">Phone</Label>
                        <Input placeholder="Contact phone..."
                          className="bg-black/20 border-white/10 rounded-lg h-9 text-sm"
                          {...register(`stops.${index}.riderPhone` as any)} />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            {stopFields.length === 0 && (
              <div className="text-center py-8 text-muted-foreground text-sm">
                Add pickup and dropoff stops above
              </div>
            )}
          </CardContent>
        </Card>

        {/* Notes */}
        <Card className="bg-card border-white/5 rounded-2xl">
          <CardContent className="pt-4">
            <Label className="text-white/70 text-xs mb-1 block">Trip Notes</Label>
            <Textarea placeholder="Any special instructions or notes..."
              className="bg-black/20 border-white/10 rounded-xl min-h-[80px] text-sm resize-none"
              {...register("notes")} />
          </CardContent>
        </Card>

        <div className="flex gap-3 pt-2">
          <Button type="submit" className="flex-1 h-12 rounded-xl font-semibold shadow-lg shadow-primary/20"
            disabled={createTripMutation.isPending}>
            {createTripMutation.isPending ? "Scheduling..." : "Schedule Trip"}
          </Button>
          <Button type="button" variant="outline" className="h-12 rounded-xl border-white/10 bg-card px-6"
            onClick={() => navigate("/dispatch")}>
            Cancel
          </Button>
        </div>
      </form>
    </PlatformLayout>
  );
}
