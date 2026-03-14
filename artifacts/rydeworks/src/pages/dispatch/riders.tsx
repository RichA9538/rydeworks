import { useState } from "react";
import { PlatformLayout } from "@/components/layout/platform-layout";
import { useListRiders, useCreateRider } from "@workspace/api-client-react";
import { Search, UserPlus, Phone, MapPin, Car } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

export default function RidersPage() {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ firstName: "", lastName: "", phone: "", email: "", homeAddress: "" });
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useListRiders({ q: search });
  const riders = data?.riders || [];

  const createMutation = useCreateRider({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['/api/trips/riders'] });
        toast({ title: "Rider added successfully" });
        setOpen(false);
        setForm({ firstName: "", lastName: "", phone: "", email: "", homeAddress: "" });
      },
      onError: (err: any) => {
        toast({ variant: "destructive", title: "Error", description: err.error?.error || "Failed to create rider." });
      }
    }
  });

  return (
    <PlatformLayout
      title="Riders"
      action={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="rounded-full shadow-lg shadow-primary/20">
              <UserPlus className="w-4 h-4 mr-2" /> Add Rider
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-card border-white/10 rounded-2xl max-w-md">
            <DialogHeader>
              <DialogTitle className="text-white">New Rider</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-white/70 text-xs">First Name *</Label>
                  <Input className="bg-black/20 border-white/10 rounded-xl h-10" value={form.firstName}
                    onChange={e => setForm({ ...form, firstName: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-white/70 text-xs">Last Name *</Label>
                  <Input className="bg-black/20 border-white/10 rounded-xl h-10" value={form.lastName}
                    onChange={e => setForm({ ...form, lastName: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-white/70 text-xs">Phone</Label>
                <Input className="bg-black/20 border-white/10 rounded-xl h-10" type="tel" value={form.phone}
                  onChange={e => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-white/70 text-xs">Email</Label>
                <Input className="bg-black/20 border-white/10 rounded-xl h-10" type="email" value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-white/70 text-xs">Home Address</Label>
                <Input className="bg-black/20 border-white/10 rounded-xl h-10" value={form.homeAddress}
                  onChange={e => setForm({ ...form, homeAddress: e.target.value })} />
              </div>
              <Button className="w-full h-11 rounded-xl font-semibold"
                disabled={createMutation.isPending || !form.firstName || !form.lastName}
                onClick={() => createMutation.mutate({ data: form } as any)}>
                {createMutation.isPending ? "Saving..." : "Add Rider"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      }
    >
      <div className="space-y-6">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search riders by name, phone, or ID..."
            className="pl-9 bg-card border-white/10 h-11 rounded-xl"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-16 bg-white/5 animate-pulse rounded-xl" />
            ))}
          </div>
        ) : riders.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <UserPlus className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p className="text-sm">{search ? "No riders match your search" : "No riders yet — add your first rider above"}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {riders.map((rider: any) => (
              <Card key={rider._id} className="bg-card border-white/5 rounded-2xl p-4 hover:border-white/10 transition-colors">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-primary/30 to-blue-500/30 flex items-center justify-center text-white font-semibold text-sm shrink-0">
                    {rider.firstName?.[0]}{rider.lastName?.[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-white truncate">{rider.firstName} {rider.lastName}</p>
                    <p className="text-xs text-muted-foreground font-mono">{rider.riderId}</p>
                    {rider.phone && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                        <Phone className="w-3 h-3" /> {rider.phone}
                      </p>
                    )}
                    {rider.homeAddress && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                        <MapPin className="w-3 h-3 shrink-0" /> {rider.homeAddress}
                      </p>
                    )}
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Car className="w-3 h-3" /> {rider.totalTrips || 0} trips
                  </span>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </PlatformLayout>
  );
}
