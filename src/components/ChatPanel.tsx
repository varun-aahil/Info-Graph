import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, MousePointerClick } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { sendChatMessage, type ChatSelection } from '@/lib/api';
import type { ChatMessage } from '@/lib/mock-data';
import { toast } from '@/hooks/use-toast';

interface ChatPanelProps {
  clusterContext: string | null;
  hasSelection: boolean;
  selection: ChatSelection | null;
}

export default function ChatPanel({ clusterContext, hasSelection, selection }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content:
        'Welcome to InfoGraph! Click on a cluster or point on the scatter plot to start chatting about your documents.',
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isTyping || !hasSelection || !selection) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    try {
      const reply = await sendChatMessage(text, selection, [...messages, userMsg]);
      setMessages((prev) => [...prev, reply]);
    } catch (error) {
      toast({
        title: 'Chat failed',
        description: error instanceof Error ? error.message : 'Could not get a response.',
        variant: 'destructive',
      });
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Context */}
      {clusterContext && (
        <div className="border-b border-border px-4 py-2">
          <p className="text-xs text-muted-foreground">
            Context: <span className="font-medium text-foreground">{clusterContext}</span>
          </p>
        </div>
      )}

      {/* Messages */}
      <ScrollArea className="flex-1 px-4">
        <div className="flex flex-col gap-3 py-4">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
            >
              <div
                className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                  msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'
                }`}
              >
                {msg.role === 'user' ? (
                  <User className="h-3.5 w-3.5" />
                ) : (
                  <Bot className="h-3.5 w-3.5" />
                )}
              </div>
              <div
                className={`max-w-[85%] rounded-xl px-3 py-2.5 text-[13px] leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-foreground'
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))}

          {isTyping && (
            <div className="flex gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted">
                <Bot className="h-3.5 w-3.5" />
              </div>
              <div className="rounded-xl bg-muted px-4 py-3">
                <div className="flex gap-1">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:0ms]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:150ms]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:300ms]" />
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="border-t border-border p-3">
        {!hasSelection && (
          <div className="mb-2.5 flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
            <MousePointerClick className="h-3.5 w-3.5 shrink-0" />
            <span>Click a point or cluster to start chatting</span>
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex gap-2"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={hasSelection ? 'Type a message...' : 'Select a document first…'}
            disabled={!hasSelection}
            className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-40"
          />
          <Button
            type="submit"
            size="icon"
            disabled={!input.trim() || isTyping || !hasSelection}
            className="shrink-0 rounded-lg"
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
