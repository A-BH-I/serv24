import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';

interface ProtectedRouteProps {
  children: ReactNode;
  allowedRoles?: ('client' | 'provider' | 'admin')[];
  redirectTo?: string;
}

export function ProtectedRoute({ children, allowedRoles, redirectTo = '/login' }: ProtectedRouteProps) {
  const { isAuthenticated, user } = useAuth();

  if (!isAuthenticated || !user) {
    return <Navigate to={redirectTo} replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    // Redirect to the appropriate home for their role
    const roleHome = user.role === 'admin' ? '/admin/dashboard' : user.role === 'provider' ? '/provider' : '/home';
    return <Navigate to={roleHome} replace />;
  }

  return <>{children}</>;
}
