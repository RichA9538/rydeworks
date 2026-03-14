import { useGetMe, useLogin, useLogout } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";

export function useAuth() {
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const token = localStorage.getItem('rydeworks_token');

  // useGetMe wraps the generated API hook
  const { data, isLoading, error } = useGetMe({
    query: {
      retry: false,
      enabled: !!token,
    }
  });

  const loginMutation = useLogin({
    mutation: {
      onSuccess: (data) => {
        localStorage.setItem('rydeworks_token', data.token);
        queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
        toast({ title: "Welcome back", description: "Successfully logged in." });
        
        // Redirect based on role
        if (data.user.roles.includes('super_admin')) setLocation('/super-admin');
        else if (data.user.roles.includes('admin') || data.user.roles.includes('dispatcher')) setLocation('/dispatch');
        else if (data.user.roles.includes('driver')) setLocation('/driver');
        else setLocation('/');
      },
      onError: (err) => {
        toast({
          variant: "destructive",
          title: "Login failed",
          description: err.error?.error || "Invalid credentials. Please try again."
        });
      }
    }
  });

  const logoutMutation = useLogout({
    mutation: {
      onSettled: () => {
        localStorage.removeItem('rydeworks_token');
        queryClient.clear();
        setLocation('/login');
      }
    }
  });

  return {
    user: data?.user || null,
    isAuthenticated: !!data?.user,
    isLoading: isLoading && !!token,
    error,
    login: loginMutation.mutate,
    isLoggingIn: loginMutation.isPending,
    logout: logoutMutation.mutate,
  };
}
