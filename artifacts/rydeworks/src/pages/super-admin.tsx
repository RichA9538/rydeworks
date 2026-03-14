import { useState } from "react";
import { PlatformLayout } from "@/components/layout/platform-layout";
import { useListOrganizations, useCreateOrganization, useUpdateOrganizationById } from "@workspace/api-client-react";
import { Building2, Plus, Users, CheckCircle, XCircle } from "lucide-react";
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
  active: 'border-emerald-500/30 text-emerald-400',
  suspended: 'border-red-500/30 text-red-400',
  terminated: 'border-gray-500/30 text-gray-500',
  trial: 'border-amber-500/30 text-amber-400',
};

const PLANS = ['trial', 'basic', 'professional', 'enterprise'];

export default function SuperAdminPage() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "", slug: "", email: "", primaryColor: "#00D4C8", accentColor: "#0A1628",
    adminFirstName: "", adminLastName: "", adminEmail: "", adminPassword: ""
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useListOrganizations();
  const orgs = data?.organizations || [];

  const createMutation = useCreateOrganization({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['/api/super-admin/organizations'] });
        toast({ title: "Organization created", description: `${form.name} is now active.` });
        setOpen(false);
        setForm({ name: "", slug: "", email: "", primaryColor: "#00D4C8", accentColor: "#0A1628", adminFirstName: "", adminLastName: "", adminEmail: "", adminPassword: "" });
      },
      onError: (err: any) => {
        toast({ variant: "destructive", title: "Error", description: err.error?.error || "Failed to create organization." });
      }
    }
  });

  const updateMutation = useUpdateOrganizationById({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['/api/super-admin/organizations'] });
        toast({ title: "Organization updated" });
      }
    }
  });

  const autoSlug = (name: string) => name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

  return (
    <PlatformLayout
      title="Super Admin — Organizations"
      action={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="rounded-full shadow-lg shadow-primary/20">
              <Plus className="w-4 h-4 mr-2" /> New Organization
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-card border-white/10 rounded-2xl max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-white">Create New Organization</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-1">
                <Label className="text-white/70 text-xs">Organization Name *</Label>
                <Input className="bg-black/20 border-white/10 rounded-xl h-10" value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value, slug: autoSlug(e.target.value) })} />
              </div>
              <div className="space-y-1">
                <Label className="text-white/70 text-xs">Slug (subdomain) *</Label>
                <div className="flex items-center gap-2">
                  <Input className="bg-black/20 border-white/10 rounded-xl h-10 font-mono" value={form.slug}
                    onChange={e => setForm({ ...form, slug: e.target.value })} />
                  <span className="text-xs text-muted-foreground shrink-0">.rydeworks.com</span>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-white/70 text-xs">Contact Email</Label>
                <Input className="bg-black/20 border-white/10 rounded-xl h-10" type="email" value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-white/70 text-xs">Primary Color</Label>
                  <div className="flex gap-2">
                    <input type="color" value={form.primaryColor}
                      onChange={e => setForm({ ...form, primaryColor: e.target.value })}
                      className="w-10 h-10 rounded-lg border-0 cursor-pointer" />
                    <Input className="bg-black/20 border-white/10 rounded-xl h-10 font-mono text-xs" value={form.primaryColor}
                      onChange={e => setForm({ ...form, primaryColor: e.target.value })} />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-white/70 text-xs">Accent Color</Label>
                  <div className="flex gap-2">
                    <input type="color" value={form.accentColor}
                      onChange={e => setForm({ ...form, accentColor: e.target.value })}
                      className="w-10 h-10 rounded-lg border-0 cursor-pointer" />
                    <Input className="bg-black/20 border-white/10 rounded-xl h-10 font-mono text-xs" value={form.accentColor}
                      onChange={e => setForm({ ...form, accentColor: e.target.value })} />
                  </div>
                </div>
              </div>

              <div className="border-t border-white/10 pt-4">
                <p className="text-xs font-semibold text-white/60 mb-3 uppercase tracking-wider">Admin Account</p>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div className="space-y-1">
                    <Label className="text-white/70 text-xs">Admin First Name *</Label>
                    <Input className="bg-black/20 border-white/10 rounded-xl h-10" value={form.adminFirstName}
                      onChange={e => setForm({ ...form, adminFirstName: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-white/70 text-xs">Admin Last Name *</Label>
                    <Input className="bg-black/20 border-white/10 rounded-xl h-10" value={form.adminLastName}
                      onChange={e => setForm({ ...form, adminLastName: e.target.value })} />
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label className="text-white/70 text-xs">Admin Email *</Label>
                    <Input className="bg-black/20 border-white/10 rounded-xl h-10" type="email" value={form.adminEmail}
                      onChange={e => setForm({ ...form, adminEmail: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-white/70 text-xs">Admin Password *</Label>
                    <Input className="bg-black/20 border-white/10 rounded-xl h-10" type="password" value={form.adminPassword}
                      onChange={e => setForm({ ...form, adminPassword: e.target.value })} />
                  </div>
                </div>
              </div>

              <Button className="w-full h-11 rounded-xl font-semibold"
                disabled={createMutation.isPending || !form.name || !form.slug || !form.adminFirstName || !form.adminLastName || !form.adminEmail || !form.adminPassword}
                onClick={() => createMutation.mutate({ data: { ...form } } as any)}>
                {createMutation.isPending ? "Creating..." : "Create Organization"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      }
    >
      {isLoading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => <div key={i} className="h-24 bg-white/5 animate-pulse rounded-2xl" />)}
        </div>
      ) : orgs.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <Building2 className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p className="text-sm">No organizations yet</p>
        </div>
      ) : (
        <div className="space-y-4">
          {orgs.map((org: any) => (
            <Card key={org._id} className="bg-card border-white/5 rounded-2xl p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ backgroundColor: org.primaryColor + '20' }}>
                    <Building2 className="w-5 h-5" style={{ color: org.primaryColor }} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-white">{org.name}</h3>
                      <Badge variant="outline" className={`text-xs px-2 py-0.5 rounded-md ${STATUS_COLORS[org.settings?.status || 'active']}`}>
                        {org.settings?.status || 'active'}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground font-mono">{org.slug}.rydeworks.com</p>
                    {org.email && <p className="text-xs text-muted-foreground">{org.email}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Select defaultValue={org.plan || 'trial'}
                    onValueChange={v => updateMutation.mutate({ id: org._id, data: { plan: v } } as any)}>
                    <SelectTrigger className="w-32 h-8 text-xs bg-black/20 border-white/10 rounded-lg">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-popover border-white/10">
                      {PLANS.map(p => (
                        <SelectItem key={p} value={p} className="text-xs capitalize">{p}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {org.settings?.status !== 'suspended' ? (
                    <Button size="sm" variant="outline" className="h-8 text-xs border-red-500/30 text-red-400 hover:bg-red-500/10 rounded-lg"
                      onClick={() => updateMutation.mutate({ id: org._id, data: { 'settings.status': 'suspended' } } as any)}>
                      Suspend
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" className="h-8 text-xs border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 rounded-lg"
                      onClick={() => updateMutation.mutate({ id: org._id, data: { 'settings.status': 'active' } } as any)}>
                      Reactivate
                    </Button>
                  )}
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-white/5 flex gap-4 text-xs text-muted-foreground">
                <span>Plan: <span className="text-white capitalize">{org.plan || 'trial'}</span></span>
                <span>Created: <span className="text-white">{org.createdAt ? new Date(org.createdAt).toLocaleDateString() : '—'}</span></span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </PlatformLayout>
  );
}
