import { useState } from "react";
import { PlatformLayout } from "@/components/layout/platform-layout";
import { useListUsers, useCreateUser, useUpdateUser, useDeleteUser } from "@workspace/api-client-react";
import { UserPlus, Mail, Phone, Shield, CheckCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

const ROLES = ['admin', 'dispatcher', 'driver'];

const ROLE_COLORS: Record<string, string> = {
  super_admin: 'border-amber-500/30 text-amber-400',
  admin: 'border-purple-500/30 text-purple-400',
  dispatcher: 'border-blue-500/30 text-blue-400',
  driver: 'border-emerald-500/30 text-emerald-400',
};

export default function AdminUsers() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", phone: "", password: "", roles: ["driver"] as string[] });
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useListUsers({ all: 'true' });
  const users = data?.users || [];

  const createMutation = useCreateUser({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
        toast({ title: "Staff member added" });
        setOpen(false);
        setForm({ firstName: "", lastName: "", email: "", phone: "", password: "", roles: ["driver"] });
      },
      onError: (err: any) => {
        toast({ variant: "destructive", title: "Error", description: err.error?.error || "Failed to create user." });
      }
    }
  });

  const deactivateMutation = useDeleteUser({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
        toast({ title: "User deactivated" });
      }
    }
  });

  const toggleRole = (role: string) => {
    setForm(prev => ({
      ...prev,
      roles: prev.roles.includes(role)
        ? prev.roles.filter(r => r !== role)
        : [...prev.roles, role]
    }));
  };

  return (
    <PlatformLayout
      title="Staff & Drivers"
      action={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="rounded-full shadow-lg shadow-primary/20">
              <UserPlus className="w-4 h-4 mr-2" /> Add Staff
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-card border-white/10 rounded-2xl max-w-md">
            <DialogHeader>
              <DialogTitle className="text-white">Add Staff Member</DialogTitle>
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
                <Label className="text-white/70 text-xs">Email *</Label>
                <Input className="bg-black/20 border-white/10 rounded-xl h-10" type="email" value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-white/70 text-xs">Phone</Label>
                <Input className="bg-black/20 border-white/10 rounded-xl h-10" type="tel" value={form.phone}
                  onChange={e => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-white/70 text-xs">Password *</Label>
                <Input className="bg-black/20 border-white/10 rounded-xl h-10" type="password" value={form.password}
                  onChange={e => setForm({ ...form, password: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label className="text-white/70 text-xs block">Roles</Label>
                <div className="flex gap-3">
                  {ROLES.map(role => (
                    <label key={role} className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={form.roles.includes(role)}
                        onCheckedChange={() => toggleRole(role)}
                        className="border-white/30"
                      />
                      <span className="text-sm text-white/80 capitalize">{role}</span>
                    </label>
                  ))}
                </div>
              </div>
              <Button className="w-full h-11 rounded-xl font-semibold"
                disabled={createMutation.isPending || !form.firstName || !form.lastName || !form.email || !form.password}
                onClick={() => createMutation.mutate({ data: form } as any)}>
                {createMutation.isPending ? "Saving..." : "Add Staff Member"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      }
    >
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => <div key={i} className="h-16 bg-white/5 animate-pulse rounded-xl" />)}
        </div>
      ) : (
        <div className="space-y-3">
          {users.map((user: any) => (
            <Card key={user._id} className={`bg-card border-white/5 rounded-2xl p-4 transition-colors ${!user.isActive ? 'opacity-50' : ''}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${user.isActive ? 'bg-gradient-to-tr from-primary/30 to-blue-500/30 text-white' : 'bg-white/10 text-white/40'}`}>
                    {user.firstName?.[0]}{user.lastName?.[0]}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-white">{user.firstName} {user.lastName}</p>
                      {!user.isActive && <span className="text-xs text-red-400">(inactive)</span>}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      {user.email && <span className="text-xs text-muted-foreground flex items-center gap-1"><Mail className="w-3 h-3" />{user.email}</span>}
                      {user.phone && <span className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="w-3 h-3" />{user.phone}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    {user.roles?.map((role: string) => (
                      <Badge key={role} variant="outline" className={`text-xs px-2 py-0.5 rounded-md ${ROLE_COLORS[role] || 'border-white/20 text-white/60'}`}>
                        {role}
                      </Badge>
                    ))}
                  </div>
                  {user.isActive && !user.roles?.includes('super_admin') && (
                    <Button size="sm" variant="ghost" className="h-8 text-xs text-muted-foreground hover:text-red-400 hover:bg-red-500/10 rounded-lg"
                      onClick={() => deactivateMutation.mutate({ id: user._id } as any)}>
                      Deactivate
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </PlatformLayout>
  );
}
