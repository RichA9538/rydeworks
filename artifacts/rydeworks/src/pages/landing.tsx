import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowRight, Map, ShieldCheck, Zap, Phone, Calendar, Briefcase, ChevronRight, Users, BarChart3, Star } from "lucide-react";
import { motion } from "framer-motion";
import { useState } from "react";

const CAL_DISCOVERY = "https://cal.com/rich-alvarez-x7b4oz/free-discovery-call";
const CAL_STRATEGY  = "https://cal.com/rich-alvarez-x7b4oz/strategy-consult";
const CAL_WORKING   = "https://cal.com/rich-alvarez-x7b4oz/full-working-meeting";

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6, delay, ease: "easeOut" },
});

export default function LandingPage() {
  const [activePlan, setActivePlan] = useState<"monthly" | "annual">("monthly");

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary/30 relative overflow-hidden">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/5 bg-background/70 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={`${import.meta.env.BASE_URL}images/logo-mark.png`} alt="RydeWorks" className="w-8 h-8 object-contain" />
            <span className="font-display font-bold text-2xl tracking-tight">RydeWorks</span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-muted-foreground">
            <a href="#features" className="hover:text-white transition-colors">Features</a>
            <a href="#how-it-works" className="hover:text-white transition-colors">How It Works</a>
            <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
            <a href="#contact" className="hover:text-white transition-colors">Contact</a>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm font-medium text-muted-foreground hover:text-white transition-colors hidden sm:block">Sign In</Link>
            <Button asChild className="rounded-full shadow-lg shadow-primary/20 font-semibold" size="sm">
              <a href={CAL_DISCOVERY} target="_blank" rel="noopener noreferrer">Get Demo</a>
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative pt-40 pb-24 lg:pt-52 lg:pb-36 overflow-hidden">
        <div className="absolute inset-0 z-0">
          <img
            src={`${import.meta.env.BASE_URL}images/hero-bg.png`}
            alt=""
            className="w-full h-full object-cover opacity-50 mix-blend-screen"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-background/30 via-background/70 to-background" />
        </div>
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-primary/10 rounded-full blur-[120px] pointer-events-none" />

        <div className="max-w-7xl mx-auto px-6 relative z-10 text-center">
          <motion.div {...fadeUp()} className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-primary text-sm font-medium mb-8">
            <span className="flex h-2 w-2 rounded-full bg-primary animate-pulse" />
            Built for nonprofits. Loved by dispatchers.
          </motion.div>

          <motion.h1 {...fadeUp(0.1)} className="text-5xl md:text-7xl lg:text-8xl font-bold font-display tracking-tight text-white max-w-5xl mx-auto leading-[1.05]">
            Nonprofit transport,<br/>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-teal-300 to-blue-400">beautifully solved.</span>
          </motion.h1>

          <motion.p {...fadeUp(0.2)} className="mt-8 text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            A complete dispatch platform for organizations managing fleets, drivers, and riders. Route optimization, flexible payments, real-time tracking — built for impact.
          </motion.p>

          <motion.div {...fadeUp(0.3)} className="mt-12 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button size="lg" asChild className="rounded-full px-8 h-14 text-base font-semibold shadow-xl shadow-primary/25 hover:-translate-y-0.5 transition-transform w-full sm:w-auto">
              <Link href="/login">Launch Dispatch <ArrowRight className="ml-2 w-5 h-5" /></Link>
            </Button>
            <Button size="lg" variant="outline" asChild className="rounded-full px-8 h-14 text-base font-semibold bg-white/5 border-white/15 hover:bg-white/10 hover:text-white w-full sm:w-auto">
              <a href={CAL_DISCOVERY} target="_blank" rel="noopener noreferrer">
                <Phone className="mr-2 w-5 h-5" /> Free Discovery Call
              </a>
            </Button>
          </motion.div>

          {/* Social proof */}
          <motion.div {...fadeUp(0.45)} className="mt-16 flex flex-col sm:flex-row items-center justify-center gap-6 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <div className="flex -space-x-2">
                {["bg-blue-500","bg-teal-500","bg-purple-500","bg-orange-500"].map((c,i) => (
                  <div key={i} className={`w-8 h-8 rounded-full ${c} border-2 border-background flex items-center justify-center text-white text-xs font-bold`}>{["M","A","G","B"][i]}</div>
                ))}
              </div>
              <span>Trusted by nonprofits nationwide</span>
            </div>
            <div className="hidden sm:block w-px h-4 bg-white/10" />
            <div className="flex items-center gap-1">
              {[1,2,3,4,5].map(i => <Star key={i} className="w-4 h-4 fill-yellow-400 text-yellow-400" />)}
              <span className="ml-1">5.0 from PERC team</span>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-28 relative z-10 bg-background">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold font-display text-white mb-4">Everything your team needs</h2>
            <p className="text-muted-foreground text-lg max-w-xl mx-auto">Three dashboards, one platform. Built for dispatchers, drivers, and riders.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { icon: Map, color: "blue", title: "Smart Route Optimization", desc: "Multi-stop OSRM routing sequences trips for maximum efficiency — automatically. Save fuel and driver hours every single day." },
              { icon: Zap, color: "primary", title: "Driver App Built-In", desc: "One-tap status updates, pre-trip inspections, turn-by-turn guidance and live itineraries on any phone. No hardware required." },
              { icon: ShieldCheck, color: "purple", title: "Flexible Payments", desc: "Stripe cards, Apple Pay, Cash App, Venmo, or 30-day free-ride codes. Built for banked and unbanked riders alike." },
              { icon: Users, color: "teal", title: "Rider Self-Service", desc: "Riders can request trips, track arrival times, and manage their profile from a simple mobile-friendly portal." },
              { icon: BarChart3, color: "orange", title: "Reporting & Grants", desc: "Exportable trip logs, mileage summaries, and rider reports ready for grant compliance reporting." },
              { icon: Briefcase, color: "green", title: "Multi-Tenant Ready", desc: "Each nonprofit gets their own branded subdomain, isolated data, and custom fare zones. Scale from 1 org to 100." },
            ].map(({ icon: Icon, color, title, desc }) => (
              <div key={title} className="glass-panel p-8 rounded-3xl group hover:border-primary/40 transition-all duration-500">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-6 ${
                  color === "blue" ? "bg-blue-500/15 text-blue-400" :
                  color === "primary" ? "bg-primary/15 text-primary" :
                  color === "purple" ? "bg-purple-500/15 text-purple-400" :
                  color === "teal" ? "bg-teal-500/15 text-teal-400" :
                  color === "orange" ? "bg-orange-500/15 text-orange-400" :
                  "bg-emerald-500/15 text-emerald-400"
                }`}>
                  <Icon className="w-7 h-7" />
                </div>
                <h3 className="text-xl font-bold font-display text-white mb-3">{title}</h3>
                <p className="text-muted-foreground leading-relaxed text-sm">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-28 relative z-10">
        <div className="absolute inset-0 bg-gradient-to-b from-background via-primary/5 to-background pointer-events-none" />
        <div className="max-w-7xl mx-auto px-6 relative z-10">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold font-display text-white mb-4">Up and running in days</h2>
            <p className="text-muted-foreground text-lg">We handle the setup. You handle the mission.</p>
          </div>
          <div className="grid md:grid-cols-4 gap-8">
            {[
              { step: "01", title: "Discovery Call", desc: "We learn your org's needs, fleet size, and service area in a free 30-min call." },
              { step: "02", title: "Custom Setup", desc: "We configure your subdomain, fare zones, home bases, and onboard your team." },
              { step: "03", title: "Train & Launch", desc: "A 90-minute working session gets your dispatchers and drivers live and confident." },
              { step: "04", title: "Ongoing Support", desc: "Monthly strategy calls keep you optimized and growing. We're a partner, not a vendor." },
            ].map(({ step, title, desc }) => (
              <div key={step} className="relative text-center">
                <div className="w-16 h-16 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-bold text-xl mx-auto mb-5 font-display">
                  {step}
                </div>
                <h3 className="text-lg font-bold text-white mb-2 font-display">{title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA / Consult Booking */}
      <section id="contact" className="py-28 relative z-10 bg-background">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-4xl md:text-5xl font-bold font-display text-white mb-4">Ready to transform your transport?</h2>
          <p className="text-muted-foreground text-lg mb-12 max-w-2xl mx-auto">
            Choose the conversation that fits where you are. All meetings with <span className="text-white font-medium">Rich Alvarez</span> of <a href="https://alvarezassociatesfl.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Alvarez & Associates</a>.
          </p>

          <div className="grid md:grid-cols-3 gap-6">
            <a href={CAL_DISCOVERY} target="_blank" rel="noopener noreferrer"
              className="group glass-panel p-8 rounded-3xl text-left hover:border-primary/50 transition-all duration-300 hover:-translate-y-1 block">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center mb-5">
                <Phone className="w-6 h-6" />
              </div>
              <div className="text-xs font-semibold text-emerald-400 uppercase tracking-widest mb-2">Free · 30 min</div>
              <h3 className="text-xl font-bold text-white font-display mb-2">Discovery Call</h3>
              <p className="text-muted-foreground text-sm leading-relaxed mb-5">Tell us about your org. We'll show you how RydeWorks fits and answer every question you have.</p>
              <div className="flex items-center text-primary text-sm font-semibold group-hover:gap-2 transition-all">
                Book now <ChevronRight className="ml-1 w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </div>
            </a>

            <a href={CAL_STRATEGY} target="_blank" rel="noopener noreferrer"
              className="group glass-panel p-8 rounded-3xl text-left hover:border-primary/50 transition-all duration-300 hover:-translate-y-1 block border-primary/20">
              <div className="w-12 h-12 rounded-2xl bg-primary/15 text-primary flex items-center justify-center mb-5">
                <Calendar className="w-6 h-6" />
              </div>
              <div className="text-xs font-semibold text-primary uppercase tracking-widest mb-2">Paid · 60 min</div>
              <h3 className="text-xl font-bold text-white font-display mb-2">Strategy Consultation</h3>
              <p className="text-muted-foreground text-sm leading-relaxed mb-5">Deep dive into your workflow, fleet, and rider base. Walk away with a custom implementation roadmap.</p>
              <div className="flex items-center text-primary text-sm font-semibold">
                Book now <ChevronRight className="ml-1 w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </div>
            </a>

            <a href={CAL_WORKING} target="_blank" rel="noopener noreferrer"
              className="group glass-panel p-8 rounded-3xl text-left hover:border-primary/50 transition-all duration-300 hover:-translate-y-1 block">
              <div className="w-12 h-12 rounded-2xl bg-blue-500/15 text-blue-400 flex items-center justify-center mb-5">
                <Briefcase className="w-6 h-6" />
              </div>
              <div className="text-xs font-semibold text-blue-400 uppercase tracking-widest mb-2">Working · 90 min</div>
              <h3 className="text-xl font-bold text-white font-display mb-2">Full Working Session</h3>
              <p className="text-muted-foreground text-sm leading-relaxed mb-5">Hands-on setup, team training, and live launch of your RydeWorks instance. We build it together.</p>
              <div className="flex items-center text-primary text-sm font-semibold">
                Book now <ChevronRight className="ml-1 w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </div>
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 bg-background py-12 relative z-10">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <img src={`${import.meta.env.BASE_URL}images/logo-mark.png`} alt="RydeWorks" className="w-6 h-6 object-contain opacity-70" />
            <span className="text-sm text-muted-foreground">© 2026 <a href="https://alvarezassociatesfl.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Alvarez & Associates</a> · RydeWorks is a DBA of Alvarez & Associates</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-muted-foreground">
            <Link href="/login" className="hover:text-white transition-colors">Dispatcher Login</Link>
            <Link href="/rider" className="hover:text-white transition-colors">Rider Portal</Link>
            <a href="mailto:rich@alvarezassociatesfl.com" className="hover:text-white transition-colors">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
