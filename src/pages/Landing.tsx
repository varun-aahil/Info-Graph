import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layers, MessageSquare, ShieldCheck, Github, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import AuthModal, { type AuthMode } from '@/components/AuthModal';
import Logo from '@/components/Logo';
import { useAuth } from '@/contexts/AuthContext';
import crystalHero from '@/assets/crystal-hero.png';

const features = [
  {
    icon: Layers,
    title: 'Visual Clustering',
    description:
      'Automatically group documents by semantic similarity using high-dimensional clustering. Explore your data as an interactive 2D scatter plot.',
  },
  {
    icon: MessageSquare,
    title: 'Contextual Chat',
    description:
      'Select any cluster or data point and instantly query it with an Interactive RAG pipeline. Get precise, context-aware answers from your documents.',
  },
  {
    icon: ShieldCheck,
    title: 'Secure Processing',
    description:
      'Your documents never leave your environment. All semantic analysis and embedding generation runs locally with end-to-end encryption.',
  },
];

export default function Landing() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>('signup');

  const openAuth = (mode: AuthMode) => {
    setAuthMode(mode);
    setAuthOpen(true);
  };

  const handleGetStarted = () => {
    if (user) navigate('/dashboard');
    else openAuth('signup');
  };

  const initials = user
    ? (user.name
        .split(' ')
        .map((p) => p[0])
        .filter(Boolean)
        .slice(0, 2)
        .join('')
        .toUpperCase() || user.email[0].toUpperCase())
    : '';

  return (
    <div className="min-h-screen bg-background">
      {/* Navbar */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <Logo className="h-6 w-6 text-foreground" />
            <span className="text-lg font-semibold tracking-tight text-foreground">InfoGraph</span>
          </div>

          <nav className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
            <a href="#" className="transition-colors hover:text-foreground">Home</a>
            <a
              href="#features"
              onClick={(e) => {
                e.preventDefault();
                document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="transition-colors hover:text-foreground"
            >
              Features
            </a>
          </nav>

          <div className="flex items-center gap-2">
            {user ? (
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full">
                    <Avatar className="h-8 w-8">
                      {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt={user.name} />}
                      <AvatarFallback className="text-xs font-medium">{initials}</AvatarFallback>
                    </Avatar>
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-56 p-2">
                  <div className="mb-1 border-b border-border px-3 py-2">
                    <p className="truncate text-sm font-semibold text-foreground">{user.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                  </div>
                  <button
                    onClick={() => navigate('/dashboard')}
                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent"
                  >
                    Open dashboard
                  </button>
                  <button
                    onClick={signOut}
                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-destructive transition-colors hover:bg-accent"
                  >
                    <LogOut className="h-4 w-4" /> Log out
                  </button>
                </PopoverContent>
              </Popover>
            ) : (
              <>
                <Button variant="ghost" size="sm" onClick={() => openAuth('signin')}>
                  Log in
                </Button>
                <Button size="sm" className="rounded-full" onClick={() => openAuth('signup')}>
                  Sign up
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-6 pb-24 pt-20 md:flex-row md:gap-12 md:pt-28">
        <div className="flex flex-1 flex-col items-start gap-6 animate-fade-in">
          <h1 className="text-5xl font-bold leading-[1.1] tracking-tight text-foreground md:text-6xl lg:text-7xl">
            Visualize Your<br />Documents
          </h1>
          <p className="max-w-md text-lg text-muted-foreground">
            Transform unstructured PDFs into explorable knowledge graphs.
            High-dimensional clustering meets Interactive RAG—so you can
            understand thousands of documents at a glance.
          </p>
          <div className="flex items-center gap-4 pt-2">
            <Button
              size="lg"
              className="rounded-full px-8 text-base"
              onClick={handleGetStarted}
            >
              Get Started
            </Button>
          </div>
        </div>

        <div className="flex flex-1 items-center justify-center animate-fade-in">
          <div className="relative w-full max-w-lg" style={{ perspective: '800px' }}>
            <img
              src={crystalHero}
              alt="3D crystal geometric shape representing document clustering"
              className="w-full drop-shadow-2xl animate-float"
              loading="eager"
              style={{
                maskImage: 'radial-gradient(circle closest-side, black 60%, transparent 100%)',
                WebkitMaskImage: 'radial-gradient(circle closest-side, black 60%, transparent 100%)',
              }}
            />
            {/* Dynamic ground shadow */}
            <div
              className="absolute left-1/2 bottom-4 -translate-x-1/2 w-2/3 h-6 rounded-full bg-foreground/20 blur-xl animate-float-shadow"
            />
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="border-t border-border bg-muted/30 py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-16 text-center">
            <h2 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">
              Built for Semantic Analysis
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
              A complete pipeline from raw PDFs to interactive insight—powered by embeddings, clustering, and retrieval-augmented generation.
            </p>
          </div>

          <div className="grid gap-8 md:grid-cols-3">
            {features.map((f) => (
              <div
                key={f.title}
                className="rounded-xl border border-border bg-card p-8 transition-all hover:shadow-md hover-scale"
              >
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <f.icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="mb-2 text-lg font-semibold text-foreground">{f.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-16">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-6 text-center">
          <p className="text-lg font-medium text-foreground">
            Want to know more about this project?
          </p>
          <Button variant="outline" size="sm" className="gap-2" asChild>
            <a href="https://github.com/varun-aahil/Info-Graph.git" target="_blank" rel="noopener noreferrer">
              <Github className="h-4 w-4" />
              View on GitHub
            </a>
          </Button>
        </div>
      </footer>

      <AuthModal
        open={authOpen}
        onOpenChange={setAuthOpen}
        defaultMode={authMode}
        onSuccess={() => navigate('/dashboard')}
      />
    </div>
  );
}
