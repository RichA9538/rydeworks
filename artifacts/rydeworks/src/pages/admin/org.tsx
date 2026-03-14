import { useState } from "react";
import { PlatformLayout } from "@/components/layout/platform-layout";
import { useGetOrganization, useUpdateOrganization } from "@workspace/api-client-react";
import { Save, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { RiderQR } from "@/components/rider-qr";

export default function AdminOrg() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading } = useGetOrganization();
  const org = data?.org;

  const [branding, setBranding] = useState({ name: "", appName: "", primaryColor: "", accentColor: "", logo: "" });
  const [homeBases, setHomeBases] = useState<any[]>([]);
  const [fareZones, setFareZones] = useState<any[]>([]);
  const [initialized, setInitialized] = useState(false);

  if (org && !initialized) {
    setBranding({
      name: org.name || "",
      appName: (org as any).appName || "",
      primaryColor: (org as any).primaryColor || "#00D4C8",
      accentColor: (org as any).accentColor || "#0A1628",
      logo: (org as any).logo || ""
    });
    setHomeBases((org as any).homeBases || []);
    setFareZones((org as any).fareZones || []);
    setInitialized(true);
  }

  const updateMutation = useUpdateOrganization({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['/api/admin/org'] });
        toast({ title: "Settings saved successfully" });
      },
      onError: (err: any) => {
        toast({ variant: "destructive", title: "Error", description: err.error?.error || "Failed to save." });
      }
    }
  });

  const saveAll = () => {
    updateMutation.mutate({
      data: {
        name: branding.name,
        appName: branding.appName,
        primaryColor: branding.primaryColor,
        accentColor: branding.accentColor,
        logo: branding.logo,
        homeBases: homeBases.map(b => ({ ...b })),
        fareZones: fareZones.map(z => ({
          ...z,
          minMiles: parseFloat(z.minMiles) || 0,
          maxMiles: z.maxMiles !== "" ? parseFloat(z.maxMiles) : null,
          oneWayFare: parseFloat(z.oneWayFare) || 0,
          roundTripFare: parseFloat(z.roundTripFare) || 0,
        }))
      }
    } as any);
  };

  if (isLoading) return (
    <PlatformLayout title="Org Settings">
      <div className="space-y-4 max-w-2xl">
        {[...Array(3)].map((_, i) => <div key={i} className="h-24 bg-white/5 animate-pulse rounded-2xl" />)}
      </div>
    </PlatformLayout>
  );

  return (
    <PlatformLayout
      title="Organization Settings"
      action={
        <Button className="rounded-full shadow-lg shadow-primary/20" onClick={saveAll} disabled={updateMutation.isPending}>
          <Save className="w-4 h-4 mr-2" />
          {updateMutation.isPending ? "Saving..." : "Save Changes"}
        </Button>
      }
    >
      <div className="max-w-2xl">
        <Tabs defaultValue="branding">
          <TabsList className="bg-card border border-white/10 rounded-xl mb-6 h-10">
            <TabsTrigger value="branding" className="rounded-lg text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Branding</TabsTrigger>
            <TabsTrigger value="homebases" className="rounded-lg text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Home Bases</TabsTrigger>
            <TabsTrigger value="farezones" className="rounded-lg text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Fare Zones</TabsTrigger>
            <TabsTrigger value="riderqr" className="rounded-lg text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Rider QR</TabsTrigger>
          </TabsList>

          {/* Branding */}
          <TabsContent value="branding">
            <Card className="bg-card border-white/5 rounded-2xl">
              <CardHeader><CardTitle className="text-base text-white">Organization Identity</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1">
                  <Label className="text-white/70 text-xs">Organization Name</Label>
                  <Input className="bg-black/20 border-white/10 rounded-xl h-10" value={branding.name}
                    onChange={e => setBranding({ ...branding, name: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-white/70 text-xs">App Name (shown in header)</Label>
                  <Input className="bg-black/20 border-white/10 rounded-xl h-10" value={branding.appName}
                    onChange={e => setBranding({ ...branding, appName: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-white/70 text-xs">Logo URL</Label>
                  <Input className="bg-black/20 border-white/10 rounded-xl h-10" placeholder="https://..." value={branding.logo}
                    onChange={e => setBranding({ ...branding, logo: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-white/70 text-xs">Primary Color</Label>
                    <div className="flex gap-2">
                      <input type="color" value={branding.primaryColor}
                        onChange={e => setBranding({ ...branding, primaryColor: e.target.value })}
                        className="w-10 h-10 rounded-lg border-0 cursor-pointer bg-transparent" />
                      <Input className="bg-black/20 border-white/10 rounded-xl h-10 font-mono" value={branding.primaryColor}
                        onChange={e => setBranding({ ...branding, primaryColor: e.target.value })} />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-white/70 text-xs">Accent Color</Label>
                    <div className="flex gap-2">
                      <input type="color" value={branding.accentColor}
                        onChange={e => setBranding({ ...branding, accentColor: e.target.value })}
                        className="w-10 h-10 rounded-lg border-0 cursor-pointer bg-transparent" />
                      <Input className="bg-black/20 border-white/10 rounded-xl h-10 font-mono" value={branding.accentColor}
                        onChange={e => setBranding({ ...branding, accentColor: e.target.value })} />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Home Bases */}
          <TabsContent value="homebases">
            <Card className="bg-card border-white/5 rounded-2xl">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base text-white">Home Bases</CardTitle>
                <Button size="sm" variant="outline" className="border-white/10 bg-white/5 rounded-xl h-8 text-xs"
                  onClick={() => setHomeBases([...homeBases, { name: "", address: "", lat: null, lng: null, isDefault: false }])}>
                  <Plus className="w-3 h-3 mr-1" /> Add Base
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                {homeBases.map((base, i) => (
                  <div key={i} className="p-4 rounded-xl border border-white/10 bg-black/20 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-white/50 font-medium">Home Base {i + 1}</span>
                      <Button type="button" size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground hover:text-red-400"
                        onClick={() => setHomeBases(homeBases.filter((_, j) => j !== i))}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                    <div className="space-y-2">
                      <Input placeholder="Name (e.g. PERC St. Pete)" className="bg-black/20 border-white/10 rounded-lg h-9 text-sm"
                        value={base.name} onChange={e => setHomeBases(homeBases.map((b, j) => j === i ? { ...b, name: e.target.value } : b))} />
                      <Input placeholder="Full address..." className="bg-black/20 border-white/10 rounded-lg h-9 text-sm"
                        value={base.address} onChange={e => setHomeBases(homeBases.map((b, j) => j === i ? { ...b, address: e.target.value } : b))} />
                    </div>
                  </div>
                ))}
                {homeBases.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">No home bases configured</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Fare Zones */}
          <TabsContent value="farezones">
            <Card className="bg-card border-white/5 rounded-2xl">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base text-white">Fare Zones</CardTitle>
                <Button size="sm" variant="outline" className="border-white/10 bg-white/5 rounded-xl h-8 text-xs"
                  onClick={() => setFareZones([...fareZones, { name: "", minMiles: "0", maxMiles: "", oneWayFare: "0", roundTripFare: "0" }])}>
                  <Plus className="w-3 h-3 mr-1" /> Add Zone
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                {fareZones.map((zone, i) => (
                  <div key={i} className="p-4 rounded-xl border border-white/10 bg-black/20 space-y-3">
                    <div className="flex items-center justify-between">
                      <Input placeholder="Zone Name (e.g. Zone 1 - Local)" className="bg-transparent border-0 text-sm font-semibold text-white p-0 h-6 focus-visible:ring-0 flex-1"
                        value={zone.name} onChange={e => setFareZones(fareZones.map((z, j) => j === i ? { ...z, name: e.target.value } : z))} />
                      <Button type="button" size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground hover:text-red-400"
                        onClick={() => setFareZones(fareZones.filter((_, j) => j !== i))}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="space-y-1">
                        <Label className="text-white/60 text-xs">Min Miles</Label>
                        <Input type="number" className="bg-black/20 border-white/10 rounded-lg h-8 text-xs" value={zone.minMiles}
                          onChange={e => setFareZones(fareZones.map((z, j) => j === i ? { ...z, minMiles: e.target.value } : z))} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-white/60 text-xs">Max Miles (blank = no limit)</Label>
                        <Input type="number" placeholder="∞" className="bg-black/20 border-white/10 rounded-lg h-8 text-xs" value={zone.maxMiles}
                          onChange={e => setFareZones(fareZones.map((z, j) => j === i ? { ...z, maxMiles: e.target.value } : z))} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-white/60 text-xs">One-Way Fare ($)</Label>
                        <Input type="number" step="0.01" className="bg-black/20 border-white/10 rounded-lg h-8 text-xs" value={zone.oneWayFare}
                          onChange={e => setFareZones(fareZones.map((z, j) => j === i ? { ...z, oneWayFare: e.target.value } : z))} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-white/60 text-xs">Round-Trip Fare ($)</Label>
                        <Input type="number" step="0.01" className="bg-black/20 border-white/10 rounded-lg h-8 text-xs" value={zone.roundTripFare}
                          onChange={e => setFareZones(fareZones.map((z, j) => j === i ? { ...z, roundTripFare: e.target.value } : z))} />
                      </div>
                    </div>
                  </div>
                ))}
                {fareZones.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">No fare zones configured</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Rider QR Code */}
          <TabsContent value="riderqr">
            <Card className="bg-card border-white/5 rounded-2xl">
              <CardHeader>
                <CardTitle className="text-base text-white">Rider Booking QR Code</CardTitle>
                <p className="text-sm text-muted-foreground">Print or display this code so riders can instantly access the booking portal on their phone.</p>
              </CardHeader>
              <CardContent className="flex flex-col items-center gap-8 py-6">
                <RiderQR orgName={org?.name || "RydeWorks"} orgSlug={(org as any)?.slug || "perc"} size={220} showActions />
                <div className="w-full bg-white/[0.03] border border-white/5 rounded-2xl p-5 text-sm text-muted-foreground space-y-3">
                  <p className="text-white font-medium">How to use this QR code:</p>
                  <ul className="space-y-2 list-none">
                    <li className="flex items-start gap-2">
                      <span className="text-primary font-bold shrink-0">1.</span>
                      Click <span className="text-white font-medium">Open Flyer</span> to open a print-ready branded flyer — perfect for lobbies, vans, or waiting rooms.
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary font-bold shrink-0">2.</span>
                      Click <span className="text-white font-medium">SVG</span> to download just the QR code for use in your own flyers, emails, or posters.
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary font-bold shrink-0">3.</span>
                      Click <span className="text-white font-medium">Copy Link</span> to share the rider portal link via text or email blast.
                    </li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </PlatformLayout>
  );
}
