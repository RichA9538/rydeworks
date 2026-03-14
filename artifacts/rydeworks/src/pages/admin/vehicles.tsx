import { useState } from "react";
import { PlatformLayout } from "@/components/layout/platform-layout";
import { useListVehicles, useCreateVehicle, useUpdateVehicle } from "@workspace/api-client-react";
import { Car, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

const STATUS_COLORS: Record<string, string> = {
  available: 'border-emerald-500/30 text-emerald-400',
  in_use: 'border-yellow-500/30 text-yellow-400',
  maintenance: 'border-orange-500/30 text-orange-400',
  out_of_service: 'border-red-500/30 text-red-400',
};

const STATUSES = ['available', 'in_use', 'maintenance', 'out_of_service'];

export default function AdminVehicles() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "", make: "", model: "", year: "", licensePlate: "", color: "", capacity: "7",
    baseLocationName: "", baseLocationAddress: ""
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useListVehicles();
  const vehicles = data?.vehicles || [];

  const createMutation = useCreateVehicle({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['/api/admin/vehicles'] });
        toast({ title: "Vehicle added" });
        setOpen(false);
        setForm({ name: "", make: "", model: "", year: "", licensePlate: "", color: "", capacity: "7", baseLocationName: "", baseLocationAddress: "" });
      },
      onError: (err: any) => {
        toast({ variant: "destructive", title: "Error", description: err.error?.error || "Failed to add vehicle." });
      }
    }
  });

  const updateMutation = useUpdateVehicle({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['/api/admin/vehicles'] });
        toast({ title: "Vehicle updated" });
      }
    }
  });

  return (
    <PlatformLayout
      title="Fleet Management"
      action={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="rounded-full shadow-lg shadow-primary/20">
              <Plus className="w-4 h-4 mr-2" /> Add Vehicle
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-card border-white/10 rounded-2xl max-w-md">
            <DialogHeader>
              <DialogTitle className="text-white">Add Vehicle</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-1">
                <Label className="text-white/70 text-xs">Vehicle Name *</Label>
                <Input placeholder="e.g. Van 1" className="bg-black/20 border-white/10 rounded-xl h-10" value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-white/70 text-xs">Make</Label>
                  <Input placeholder="Ford" className="bg-black/20 border-white/10 rounded-xl h-10" value={form.make}
                    onChange={e => setForm({ ...form, make: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-white/70 text-xs">Model</Label>
                  <Input placeholder="Transit" className="bg-black/20 border-white/10 rounded-xl h-10" value={form.model}
                    onChange={e => setForm({ ...form, model: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-white/70 text-xs">Year</Label>
                  <Input placeholder="2022" type="number" className="bg-black/20 border-white/10 rounded-xl h-10" value={form.year}
                    onChange={e => setForm({ ...form, year: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-white/70 text-xs">License Plate</Label>
                  <Input placeholder="VAN-001" className="bg-black/20 border-white/10 rounded-xl h-10" value={form.licensePlate}
                    onChange={e => setForm({ ...form, licensePlate: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-white/70 text-xs">Capacity (passengers)</Label>
                  <Input type="number" className="bg-black/20 border-white/10 rounded-xl h-10" value={form.capacity}
                    onChange={e => setForm({ ...form, capacity: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-white/70 text-xs">Home Base Name</Label>
                <Input placeholder="PERC St. Pete" className="bg-black/20 border-white/10 rounded-xl h-10" value={form.baseLocationName}
                  onChange={e => setForm({ ...form, baseLocationName: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-white/70 text-xs">Home Base Address</Label>
                <Input placeholder="Full address..." className="bg-black/20 border-white/10 rounded-xl h-10" value={form.baseLocationAddress}
                  onChange={e => setForm({ ...form, baseLocationAddress: e.target.value })} />
              </div>
              <Button className="w-full h-11 rounded-xl font-semibold"
                disabled={createMutation.isPending || !form.name}
                onClick={() => createMutation.mutate({
                  data: {
                    name: form.name,
                    make: form.make,
                    model: form.model,
                    year: form.year ? parseInt(form.year) : undefined,
                    licensePlate: form.licensePlate,
                    color: form.color,
                    capacity: parseInt(form.capacity) || 7,
                    baseLocation: form.baseLocationName ? { name: form.baseLocationName, address: form.baseLocationAddress } : undefined
                  }
                } as any)}>
                {createMutation.isPending ? "Saving..." : "Add Vehicle"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      }
    >
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-32 bg-white/5 animate-pulse rounded-2xl" />)}
        </div>
      ) : vehicles.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <Car className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p className="text-sm">No vehicles yet — add your fleet above</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {vehicles.map((vehicle: any) => (
            <Card key={vehicle._id} className="bg-card border-white/5 rounded-2xl p-5">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Car className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-bold text-white">{vehicle.name}</p>
                    <p className="text-xs text-muted-foreground">{vehicle.year} {vehicle.make} {vehicle.model}</p>
                  </div>
                </div>
                <Select defaultValue={vehicle.status}
                  onValueChange={v => updateMutation.mutate({ id: vehicle._id, data: { status: v } } as any)}>
                  <SelectTrigger className={`w-36 h-8 text-xs border rounded-lg bg-transparent ${STATUS_COLORS[vehicle.status]}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-white/10">
                    {STATUSES.map(s => (
                      <SelectItem key={s} value={s} className="text-xs capitalize">{s.replace('_', ' ')}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <div>Plate: <span className="text-white font-mono">{vehicle.licensePlate || '—'}</span></div>
                <div>Cap: <span className="text-white">{vehicle.capacity} passengers</span></div>
                {vehicle.baseLocation?.name && (
                  <div className="col-span-2">Base: <span className="text-white">{vehicle.baseLocation.name}</span></div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </PlatformLayout>
  );
}
