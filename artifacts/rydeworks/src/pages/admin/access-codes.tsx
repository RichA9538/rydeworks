import { useState } from "react";
import { PlatformLayout } from "@/components/layout/platform-layout";
import { useListAccessCodes, useCreateAccessCode, useRevokeAccessCode, useListRiders } from "@workspace/api-client-react";
import { Ticket, Plus, X, Search, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";

const STATUS_COLORS: Record<string, string> = {
  available: 'border-emerald-500/30 text-emerald-400 bg-emerald-500/5',
  used: 'border-blue-500/30 text-blue-400 bg-blue-500/5',
  expired: 'border-orange-500/30 text-orange-400 bg-orange-500/5',
  revoked: 'border-red-500/30 text-red-400 bg-red-500/5',
};

export default function AdminAccessCodes() {
  const [open, setOpen] = useState(false);
  const [riderSearch, setRiderSearch] = useState("");
  const [selectedRider, setSelectedRider] = useState<any>(null);
  const [ridesAllowed, setRidesAllowed] = useState("1");
  const [copied, setCopied] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useListAccessCodes();
  const { data: ridersData } = useListRiders({ q: riderSearch });
  const codes = data?.codes || [];
  const riders = ridersData?.riders || [];

  const createMutation = useCreateAccessCode({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['/api/admin/access-codes'] });
        toast({ title: "Free ride code generated" });
        setOpen(false);
        setSelectedRider(null);
        setRiderSearch("");
        setRidesAllowed("1");
      },
      onError: (err: any) => {
        toast({ variant: "destructive", title: "Error", description: err.error?.error || "Failed to create code." });
      }
    }
  });

  const revokeMutation = useRevokeAccessCode({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['/api/admin/access-codes'] });
        toast({ title: "Code revoked" });
      }
    }
  });

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(code);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  const availableCount = codes.filter((c: any) => c.status === 'available').length;

  return (
    <PlatformLayout
      title="Free Ride Codes"
      action={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="rounded-full shadow-lg shadow-primary/20">
              <Plus className="w-4 h-4 mr-2" /> Generate Code
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-card border-white/10 rounded-2xl max-w-md">
            <DialogHeader>
              <DialogTitle className="text-white">Generate Free Ride Code</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-1">
                <Label className="text-white/70 text-xs">Link to Rider (optional)</Label>
                {selectedRider ? (
                  <div className="flex items-center justify-between bg-black/20 rounded-xl px-3 py-2 border border-white/10">
                    <span className="text-sm text-white">{selectedRider.firstName} {selectedRider.lastName} — <span className="font-mono text-xs text-primary">{selectedRider.riderId}</span></span>
                    <Button type="button" size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground" onClick={() => setSelectedRider(null)}>
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                      <Input placeholder="Search riders..." className="pl-9 bg-black/20 border-white/10 rounded-xl h-10 text-sm"
                        value={riderSearch} onChange={e => setRiderSearch(e.target.value)} />
                    </div>
                    {riderSearch && riders.length > 0 && (
                      <div className="bg-black/50 rounded-xl border border-white/10 max-h-40 overflow-y-auto">
                        {riders.map((r: any) => (
                          <button key={r._id} type="button"
                            className="w-full text-left px-3 py-2 text-sm hover:bg-white/5 transition-colors flex items-center justify-between"
                            onClick={() => { setSelectedRider(r); setRiderSearch(""); }}>
                            <span>{r.firstName} {r.lastName}</span>
                            <span className="text-xs text-muted-foreground font-mono">{r.riderId}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {riderSearch && riders.length === 0 && (
                      <p className="text-xs text-muted-foreground px-1">No riders found for "{riderSearch}"</p>
                    )}
                  </div>
                )}
              </div>
              <div className="space-y-1">
                <Label className="text-white/70 text-xs">Number of Free Rides</Label>
                <Select value={ridesAllowed} onValueChange={setRidesAllowed}>
                  <SelectTrigger className="bg-black/20 border-white/10 rounded-xl h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-white/10">
                    {[1,2,3,5,10].map(n => (
                      <SelectItem key={n} value={n.toString()}>{n} ride{n !== 1 ? 's' : ''}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="p-3 rounded-xl bg-primary/5 border border-primary/20 text-xs text-primary/80">
                Code expires automatically after 30 days.
              </div>
              <Button className="w-full h-11 rounded-xl font-semibold"
                disabled={createMutation.isPending}
                onClick={() => createMutation.mutate({
                  data: {
                    type: 'free_ride',
                    ridesAllowed: parseInt(ridesAllowed),
                    riderId: selectedRider?._id
                  }
                } as any)}>
                {createMutation.isPending ? "Generating..." : "Generate Code"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      }
    >
      <div className="space-y-6">
        {/* Stats row */}
        <div className="grid grid-cols-3 gap-4">
          <Card className="bg-card border-white/5 rounded-2xl p-4 text-center">
            <p className="text-2xl font-bold text-emerald-400">{availableCount}</p>
            <p className="text-xs text-muted-foreground mt-1">Active Codes</p>
          </Card>
          <Card className="bg-card border-white/5 rounded-2xl p-4 text-center">
            <p className="text-2xl font-bold text-white">{codes.filter((c: any) => c.status === 'used').length}</p>
            <p className="text-xs text-muted-foreground mt-1">Used</p>
          </Card>
          <Card className="bg-card border-white/5 rounded-2xl p-4 text-center">
            <p className="text-2xl font-bold text-muted-foreground">{codes.length}</p>
            <p className="text-xs text-muted-foreground mt-1">Total Generated</p>
          </Card>
        </div>

        {/* Codes List */}
        {isLoading ? (
          <div className="space-y-3">{[...Array(5)].map((_, i) => <div key={i} className="h-16 bg-white/5 animate-pulse rounded-xl" />)}</div>
        ) : codes.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <Ticket className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p className="text-sm">No free ride codes yet — generate one above</p>
          </div>
        ) : (
          <div className="space-y-3">
            {codes.map((code: any) => (
              <Card key={code._id} className="bg-card border-white/5 rounded-2xl p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Ticket className="w-5 h-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-mono text-white text-sm font-bold">{code.code}</p>
                        <Badge variant="outline" className={`text-xs px-2 py-0.5 rounded-md ${STATUS_COLORS[code.status] || 'border-white/20'}`}>
                          {code.status}
                        </Badge>
                        {code.freeRide?.ridesAllowed > 1 && (
                          <span className="text-xs text-muted-foreground">{code.freeRide.ridesUsed || 0}/{code.freeRide.ridesAllowed} rides</span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 mt-0.5">
                        {code.rider && (
                          <p className="text-xs text-muted-foreground">
                            Rider: <span className="text-white">{code.rider.firstName} {code.rider.lastName}</span>
                            {code.rider.riderId && <span className="font-mono text-primary ml-1">{code.rider.riderId}</span>}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          Expires: <span className="text-white">{code.freeRide?.expiresAt ? format(new Date(code.freeRide.expiresAt), 'MMM d, yyyy') : 'N/A'}</span>
                        </p>
                        {code.createdBy && (
                          <p className="text-xs text-muted-foreground">
                            By: <span className="text-white">{code.createdBy.firstName}</span>
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-white"
                      onClick={() => copyCode(code.code)}>
                      {copied === code.code ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    </Button>
                    {code.status === 'available' && (
                      <Button size="sm" variant="ghost"
                        className="h-8 text-xs text-muted-foreground hover:text-red-400 hover:bg-red-500/10 rounded-lg"
                        onClick={() => revokeMutation.mutate({ id: code._id } as any)}>
                        Revoke
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </PlatformLayout>
  );
}
