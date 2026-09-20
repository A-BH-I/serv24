import { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Grid3X3, Users, CalendarDays,
  Wallet, LifeBuoy, Settings, LogOut, BarChart3, Wrench, Trash2, Banknote,
  ShoppingBag, Package, Boxes, Mail
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { NotificationBell } from '@/components/NotificationBell';

const navItems = [
  { path: '/admin/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/admin/analytics', icon: BarChart3, label: 'Analytics' },
  { path: '/admin/users', icon: Users, label: 'Users' },
  { path: '/admin/categories', icon: Grid3X3, label: 'Categories' },
  { path: '/admin/services', icon: Wrench, label: 'Services' },
  { path: '/admin/providers', icon: Users, label: 'Providers' },
  { path: '/admin/bookings', icon: CalendarDays, label: 'Bookings' },
  { path: '/admin/payments', icon: Wallet, label: 'Payments' },
  { path: '/admin/cash-collections', icon: Banknote, label: 'Cash Collections' },
  { path: '/admin/withdrawals', icon: Wallet, label: 'Withdrawals' },
  { path: '/admin/shop/categories', icon: Boxes, label: 'Shop Categories' },
  { path: '/admin/shop/products', icon: Package, label: 'Shop Products' },
  { path: '/admin/shop/orders', icon: ShoppingBag, label: 'Shop Orders' },
  { path: '/admin/support', icon: LifeBuoy, label: 'Support' },
  { path: '/admin/subscribers', icon: Mail, label: 'Subscribers' },
  { path: '/admin/deleted-accounts', icon: Trash2, label: 'Deleted Accounts' },
  { path: '/admin/settings', icon: Settings, label: 'Settings' },
];

export function AdminLayout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { logout, user } = useAuth();

  return (
    <div className="min-h-screen bg-background flex">
      <aside className="w-64 bg-card border-r border-border flex flex-col fixed h-full z-40">
        <div className="p-6 border-b border-border">
          <h1 className="text-lg font-bold text-primary tracking-tight">Serv24</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Admin Panel</p>
        </div>
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {navItems.map(item => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors relative ${
                  isActive
                    ? 'bg-secondary text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                {isActive && <span className="absolute left-0 w-1 h-6 bg-primary rounded-r" />}
                <item.icon className="h-4 w-4" />
                <span className="flex-1">{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t border-border">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-sm font-semibold">
              {user?.name?.[0] || 'A'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user?.name || 'Admin'}</p>
              <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-destructive transition-colors w-full px-3 py-2 rounded-lg hover:bg-muted"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 ml-64">
        <div className="flex items-center justify-end p-4 border-b border-border">
          <NotificationBell />
        </div>
        <div className="p-8">{children}</div>
      </main>
    </div>
  );
}
