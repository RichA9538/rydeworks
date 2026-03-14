import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const { login, isLoggingIn } = useAuth();
  
  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = (data: LoginFormValues) => {
    login({ data });
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 relative overflow-hidden selection:bg-primary/30">
      {/* Background Effects */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-primary/10 blur-[150px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-blue-500/10 blur-[150px] rounded-full pointer-events-none" />

      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="w-full max-w-md z-10"
      >
        <div className="flex flex-col items-center mb-10 text-center">
          <div className="w-14 h-14 bg-card border border-white/10 rounded-2xl flex items-center justify-center mb-6 shadow-2xl shadow-primary/20 glow-primary">
            <img src={`${import.meta.env.BASE_URL}images/logo-mark.png`} alt="Logo" className="w-8 h-8 object-contain drop-shadow-md" />
          </div>
          <h1 className="text-3xl font-display font-bold text-white tracking-tight">Welcome back</h1>
          <p className="text-muted-foreground mt-2">Sign in to RydeWorks Dispatch</p>
        </div>

        <Card className="bg-card/50 backdrop-blur-xl border-white/10 shadow-2xl p-2 sm:p-4 rounded-3xl">
          <CardContent className="pt-6">
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-white/80 ml-1">Email address</Label>
                <div className="relative">
                  <Input
                    id="email"
                    type="email"
                    placeholder="name@organization.org"
                    className="h-12 bg-black/20 border-white/10 focus:border-primary focus:ring-primary/20 rounded-xl pl-4 transition-all"
                    {...form.register("email")}
                  />
                  {form.formState.errors.email && (
                    <p className="text-destructive text-xs mt-1 ml-1">{form.formState.errors.email.message}</p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between ml-1">
                  <Label htmlFor="password" className="text-white/80">Password</Label>
                  <a href="#" className="text-xs font-medium text-primary hover:text-primary/80 transition-colors">Forgot password?</a>
                </div>
                <div className="relative">
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    className="h-12 bg-black/20 border-white/10 focus:border-primary focus:ring-primary/20 rounded-xl pl-4 transition-all"
                    {...form.register("password")}
                  />
                  {form.formState.errors.password && (
                    <p className="text-destructive text-xs mt-1 ml-1">{form.formState.errors.password.message}</p>
                  )}
                </div>
              </div>

              <Button 
                type="submit" 
                disabled={isLoggingIn}
                className="w-full h-12 rounded-xl text-base font-semibold shadow-lg shadow-primary/25 hover:-translate-y-0.5 transition-all mt-4"
              >
                {isLoggingIn ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>Sign In <ArrowRight className="ml-2 w-5 h-5" /></>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
        
        <p className="text-center text-sm text-muted-foreground mt-8">
          Need an account? <a href="mailto:sales@rydeworks.com" className="text-primary font-medium hover:underline">Contact Sales</a>
        </p>
      </motion.div>
    </div>
  );
}
