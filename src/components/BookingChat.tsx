import { useState, useRef, useEffect } from 'react';
import { Send, MessageSquare, X, Loader2, Check, CheckCheck, AlertCircle, Clock, MapPin } from 'lucide-react';
import { useBookingChat } from '@/hooks/use-booking-chat';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

/** Turns URLs inside a chat message into tappable links (used for shared locations). */
function renderMessageBody(text: string) {
  const parts = text.split(/(https?:\/\/\S+)/g);
  return parts.map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a
        key={i}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        className="underline break-all font-medium"
      >
        {part}
      </a>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}


interface BookingChatProps {
  bookingId: string;
  isOpen: boolean;
  onClose: () => void;
}

export function BookingChat({ bookingId, isOpen, onClose }: BookingChatProps) {
  const { user } = useAuth();
  const { messages, loading, sending, sendMessage, typingUsers, sendTyping } = useBookingChat(bookingId);
  const [text, setText] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, typingUsers]);

  // Auto-focus the input the moment the chat opens so the mobile keyboard
  // pops up without requiring a second tap. Delay one tick so the modal
  // has actually mounted in the DOM.
  useEffect(() => {
    if (!isOpen) return;
    // Multiple focus attempts handle iOS Safari + Android Chrome quirks where
    // the very first programmatic focus is sometimes ignored if it lands
    // before the modal animation finishes.
    const t1 = setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 50);
    const t2 = setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 200);
    const t3 = setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 500);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [isOpen]);

  // Stop the typing indicator when the chat is closed
  useEffect(() => {
    if (!isOpen) sendTyping(false);
  }, [isOpen, sendTyping]);

  const handleSend = () => {
    if (!text.trim() || sending) return;
    sendMessage(text);
    setText('');
    sendTyping(false);
  };

  // Share live location as a Google Maps link inside the chat
  const [sharingLocation, setSharingLocation] = useState(false);
  const handleShareLocation = () => {
    if (!navigator.geolocation) {
      toast.error('Location is not supported on this device.');
      return;
    }
    setSharingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude.toFixed(6);
        const lng = pos.coords.longitude.toFixed(6);
        sendMessage(`📍 My live location: https://www.google.com/maps?q=${lat},${lng}`);
        setSharingLocation(false);
      },
      (err) => {
        setSharingLocation(false);
        if (err.code === err.PERMISSION_DENIED) {
          toast.error('Location access is disabled. Enable it in your browser/app settings to share your location.');
        } else {
          toast.error('Could not detect your location. Please try again.');
        }
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 15000 }
    );
  };


  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleChange = (val: string) => {
    setText(val);
    if (val.trim().length > 0) sendTyping(true);
    else sendTyping(false);
  };

  if (!isOpen) return null;

  const renderTick = (msg: typeof messages[number]) => {
    if (msg._status === 'sending') return <Clock className="h-3 w-3 opacity-70" />;
    if (msg._status === 'failed') return <AlertCircle className="h-3 w-3 text-destructive" />;
    if (msg.read_at) return <CheckCheck className="h-3 w-3 text-sky-300" />;
    return <Check className="h-3 w-3 opacity-70" />;
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-end sm:items-center justify-center pb-[calc(env(safe-area-inset-bottom)+72px)] sm:pb-0" onClick={onClose}>
      <div className="w-full max-w-md bg-card rounded-2xl border border-border overflow-hidden animate-fade-up flex flex-col mx-2 sm:mx-0"
        style={{ maxHeight: '75dvh' } as React.CSSProperties}
        onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Chat</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[120px]">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 text-primary animate-spin" />
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center py-10">
              <MessageSquare className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">No messages yet</p>
              <p className="text-[0.6rem] text-muted-foreground mt-1">Start the conversation</p>
            </div>
          ) : (
            messages.map(msg => {
              const isMe = msg.sender_id === user?.id;
              return (
                <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[75%] rounded-2xl px-3.5 py-2.5 ${
                    isMe
                      ? 'bg-primary text-primary-foreground rounded-br-md'
                      : 'bg-muted text-foreground rounded-bl-md'
                  }`}>
                    {!isMe && (
                      <p className="text-[0.6rem] font-semibold opacity-70 mb-0.5">{msg.sender_name}</p>
                    )}
                    <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{renderMessageBody(msg.message)}</p>
                    <div className={`flex items-center gap-1 mt-1 ${isMe ? 'justify-end text-primary-foreground/70' : 'text-muted-foreground'}`}>
                      <span className="text-[0.55rem]">
                        {msg.created_at ? formatDistanceToNow(new Date(msg.created_at), { addSuffix: true }) : ''}
                      </span>
                      {isMe && renderTick(msg)}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          {typingUsers.length > 0 && (
            <div className="flex justify-start">
              <div className="bg-muted text-foreground rounded-2xl rounded-bl-md px-3.5 py-2.5 inline-flex items-center gap-1.5">
                <span className="sr-only">Typing</span>
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-[pulse_1s_ease-in-out_infinite]" />
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-[pulse_1s_ease-in-out_0.15s_infinite]" />
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-[pulse_1s_ease-in-out_0.3s_infinite]" />
              </div>
            </div>
          )}
        </div>

        {/* Input - use input instead of textarea for better mobile keyboard */}
        <div className="p-3 border-t border-border shrink-0 bg-card">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleShareLocation}
              disabled={sharingLocation || sending}
              className="shrink-0 p-2.5 rounded-xl bg-muted text-primary btn-press disabled:opacity-40"
              aria-label="Share your live location"
              title="Share your live location"
            >
              {sharingLocation ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
            </button>
            <input

              ref={inputRef}
              type="text"
              value={text}
              onChange={e => handleChange(e.target.value)}
              onInput={e => handleChange((e.target as HTMLInputElement).value)}
              onCompositionEnd={e => handleChange((e.target as HTMLInputElement).value)}
              onBlur={() => sendTyping(false)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
              autoComplete="off"
              autoCorrect="on"
              autoCapitalize="sentences"
              spellCheck
              autoFocus
              enterKeyHint="send"
              inputMode="text"
              className="flex-1 min-w-0 px-3.5 py-2.5 bg-muted rounded-xl border-2 border-transparent focus:border-primary focus:outline-none text-foreground placeholder:text-muted-foreground caret-primary"
              style={{ fontSize: '16px', color: 'hsl(var(--foreground))' }}
            />
            <button
              onClick={handleSend}
              disabled={!text.trim() || sending}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold btn-press disabled:opacity-40 shrink-0"
              aria-label="Send message"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              <span>Send</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
