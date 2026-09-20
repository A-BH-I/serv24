import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical } from 'lucide-react';

interface ActionItem {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  variant?: 'default' | 'danger';
  disabled?: boolean;
  hidden?: boolean;
}

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  variant?: 'danger' | 'default';
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
  children?: React.ReactNode;
}

export function ConfirmDialog({ open, title, message, confirmLabel = 'Confirm', variant = 'default', onConfirm, onCancel, loading, children }: ConfirmDialogProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center p-4" onClick={onCancel}>
      <div className="bg-card rounded-2xl border border-border w-full max-w-sm animate-fade-up" onClick={e => e.stopPropagation()}>
        <div className="p-5">
          <h3 className="text-base font-bold text-foreground mb-2">{title}</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">{message}</p>
          {children}
        </div>
        <div className="flex gap-2 justify-end p-4 pt-0">
          <button onClick={onCancel} className="px-4 py-2 border border-border rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted active:scale-[0.97]">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`px-4 py-2 rounded-lg text-sm font-semibold active:scale-[0.97] disabled:opacity-50 ${
              variant === 'danger'
                ? 'bg-destructive text-destructive-foreground'
                : 'bg-primary text-primary-foreground'
            }`}
          >
            {loading ? 'Processing...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function AdminActionMenu({ actions }: { actions: ActionItem[] }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    // Position menu above the trigger, aligned to the right edge
    setPos({
      top: rect.top,
      left: rect.right,
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePosition();
    const handler = (e: MouseEvent) => {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    window.addEventListener('scroll', () => setOpen(false), true);
    window.addEventListener('resize', () => setOpen(false));
    return () => {
      document.removeEventListener('mousedown', handler);
      window.removeEventListener('scroll', () => setOpen(false), true);
      window.removeEventListener('resize', () => setOpen(false));
    };
  }, [open, updatePosition]);

  const visible = actions.filter(a => !a.hidden);
  if (visible.length === 0) return null;

  return (
    <>
      <button
        ref={triggerRef}
        onClick={() => setOpen(!open)}
        className="p-1.5 rounded-lg hover:bg-muted transition-colors active:scale-[0.95]"
      >
        <MoreVertical className="h-4 w-4 text-muted-foreground" />
      </button>
      {open && pos && createPortal(
        <div
          ref={menuRef}
          className="fixed w-44 bg-card rounded-xl border border-border shadow-lg z-[60] py-1 animate-fade-up"
          style={{
            top: pos.top,
            left: pos.left - 176, // 11rem = 176px (w-44)
            transform: 'translateY(-100%)',
          }}
        >
          {visible.map((action, i) => (
            <button
              key={i}
              onClick={() => { setOpen(false); action.onClick(); }}
              disabled={action.disabled}
              className={`w-full flex items-center gap-2 px-3 py-2 text-xs font-medium transition-colors disabled:opacity-40 ${
                action.variant === 'danger'
                  ? 'text-destructive hover:bg-destructive/10'
                  : 'text-foreground hover:bg-muted'
              }`}
            >
              {action.icon}
              {action.label}
            </button>
          ))}
        </div>,
        document.body
      )}
    </>
  );
}
