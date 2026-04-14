"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { ArrowRight, Play, Sparkles } from "lucide-react";

/* ── rotating word carousel ── */
const rotatingWords = ["CMO", "Marketer", "Strategist", "Creative Director"];

function RotatingWord() {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setIndex((i) => (i + 1) % rotatingWords.length), 2800);
    return () => clearInterval(id);
  }, []);

  return (
    <span className="inline-block relative h-[1.1em] overflow-hidden align-bottom">
      <AnimatePresence mode="wait">
        <motion.span
          key={rotatingWords[index]}
          initial={{ y: "100%", opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: "-100%", opacity: 0 }}
          transition={{ duration: 0.45, ease: [0.4, 0, 0.2, 1] }}
          className="inline-block gradient-text-animated"
        >
          {rotatingWords[index]}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/* ── floating particles ── */
function Particles() {
  const dots = useMemo(
    () =>
      Array.from({ length: 40 }).map((_, i) => ({
        id: i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: 1 + Math.random() * 2,
        duration: 10 + Math.random() * 20,
        delay: Math.random() * 10,
      })),
    []
  );

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {dots.map((d) => (
        <motion.div
          key={d.id}
          className="absolute rounded-full bg-brand-purple/30"
          style={{ left: `${d.x}%`, top: `${d.y}%`, width: d.size, height: d.size }}
          animate={{ y: [0, -60, 0], opacity: [0, 0.8, 0] }}
          transition={{ duration: d.duration, repeat: Infinity, delay: d.delay, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}

/* ── main ── */
export default function Hero() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-16">
      {/* Background layers */}
      <div className="absolute inset-0 animated-gradient" />
      <div className="absolute inset-0 grid-bg" />
      <div className="absolute inset-0 radial-overlay" />
      <div className="absolute inset-0 noise-bg" />
      <Particles />

      {/* Floating orbs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-brand-purple/10 rounded-full blur-[120px] float" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-brand-blue/10 rounded-full blur-[120px] float" style={{ animationDelay: "-3s" }} />
      <div className="absolute top-1/2 left-1/2 w-64 h-64 bg-brand-pink/5 rounded-full blur-[100px] float-subtle" />

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
        {/* Badge */}
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-brand-purple/30 bg-brand-purple/5 mb-8 shimmer"
        >
          <span className="w-2 h-2 rounded-full bg-emerald-400 pulse-dot" />
          <span className="text-sm text-zinc-300 font-medium">
            Now in Early Access
          </span>
        </motion.div>

        {/* Headline */}
        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.1, ease: [0.4, 0, 0.2, 1] }}
          className="text-5xl sm:text-6xl lg:text-8xl font-bold tracking-tight leading-[0.95] mb-6"
        >
          Your New
          <br />
          AI-Powered
          <br />
          <RotatingWord />
        </motion.h1>

        {/* Subheadline */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.25 }}
          className="max-w-2xl mx-auto text-lg sm:text-xl text-zinc-400 mb-10 leading-relaxed"
        >
          The AI that thinks like a performance marketer. Automatically create
          campaigns, generate creatives at scale, and optimize ad spend based on
          real business signals — across{" "}
          <span className="text-white font-medium">Meta</span> &{" "}
          <span className="text-white font-medium">TikTok</span>.
        </motion.p>

        {/* CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.35 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-4"
        >
          <Link
            href="/waitlist"
            className="relative group inline-flex items-center gap-2 px-8 py-4 text-base font-semibold rounded-full bg-gradient-to-r from-brand-purple to-brand-blue text-white hover:opacity-90 transition-all btn-press focus-ring"
          >
            <span className="absolute inset-0 rounded-full bg-gradient-to-r from-brand-purple to-brand-blue blur-xl opacity-40 group-hover:opacity-60 transition-opacity" />
            <span className="relative flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              Join the Waitlist
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </span>
          </Link>
          <a
            href="#how-it-works"
            className="inline-flex items-center gap-2 px-8 py-4 text-base font-medium rounded-full border border-white/10 text-zinc-300 hover:text-white hover:border-white/20 hover:bg-white/[0.03] transition-all btn-press focus-ring"
          >
            <Play className="w-4 h-4" />
            See How It Works
          </a>
        </motion.div>

        {/* Social proof bar */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.7 }}
          className="mt-20 flex flex-col sm:flex-row items-center justify-center gap-8 text-zinc-500 text-sm"
        >
          <div className="flex items-center gap-3">
            <div className="flex -space-x-2">
              {["#8b5cf6", "#3b82f6", "#06b6d4", "#ec4899", "#10b981"].map((c, i) => (
                <div
                  key={i}
                  className="w-8 h-8 rounded-full border-2 border-[#050505] flex items-center justify-center text-[10px] font-bold text-white/80"
                  style={{ background: `linear-gradient(135deg, ${c}cc, ${c}66)` }}
                >
                  {String.fromCharCode(65 + i)}
                </div>
              ))}
            </div>
            <span>500+ brands on the waitlist</span>
          </div>
          <div className="hidden sm:block w-px h-4 bg-white/10" />
          <span>Trusted by 7 & 8-figure DTC brands</span>
        </motion.div>

        {/* Dashboard preview */}
        <motion.div
          initial={{ opacity: 0, y: 80, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 1, delay: 0.5, ease: [0.4, 0, 0.2, 1] }}
          className="mt-16 relative mx-auto max-w-5xl"
        >
          <div className="absolute -inset-4 bg-gradient-to-r from-brand-purple/20 via-brand-blue/20 to-brand-cyan/20 rounded-2xl blur-2xl animate-pulse" style={{ animationDuration: "4s" }} />
          <div className="relative rounded-xl border border-white/10 bg-surface overflow-hidden shadow-2xl border-rotate">
            {/* Browser chrome */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5 bg-surface-light">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-500/60" />
                <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
                <div className="w-3 h-3 rounded-full bg-green-500/60" />
              </div>
              <div className="flex-1 flex justify-center">
                <div className="px-4 py-1 rounded-md bg-white/5 text-xs text-zinc-500 flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full border border-emerald-400/50 flex items-center justify-center">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  </span>
                  app.larven.ai/dashboard
                </div>
              </div>
            </div>
            {/* Dashboard mockup */}
            <div className="p-6 sm:p-8 space-y-6">
              {/* Top stats row */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: "Active Campaigns", value: "24", change: "+3 today", up: true },
                  { label: "ROAS", value: "3.8x", change: "+0.4x", up: true },
                  { label: "Creatives Generated", value: "1,847", change: "+127 this week", up: true },
                  { label: "Ad Spend", value: "$42.5K", change: "On target", up: true },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className="p-4 rounded-lg bg-white/[0.03] border border-white/5 hover:border-white/10 transition-colors"
                  >
                    <div className="text-xs text-zinc-500 mb-1">{stat.label}</div>
                    <div className="text-2xl font-bold text-white">{stat.value}</div>
                    <div className="text-xs text-emerald-400 mt-1 flex items-center gap-1">
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                        <path d="M5 2L8 6H2L5 2Z" fill="currentColor" />
                      </svg>
                      {stat.change}
                    </div>
                  </div>
                ))}
              </div>
              {/* Chart area */}
              <div className="rounded-lg bg-white/[0.02] border border-white/5 p-6 h-48 flex items-end gap-[3px]">
                {Array.from({ length: 40 }).map((_, i) => {
                  const h = 25 + Math.sin(i * 0.4) * 25 + (i / 40) * 35 + Math.sin(i * 1.2) * 10;
                  return (
                    <motion.div
                      key={i}
                      className="flex-1 rounded-t"
                      initial={{ scaleY: 0 }}
                      animate={{ scaleY: 1 }}
                      transition={{ delay: 0.8 + i * 0.03, duration: 0.4, ease: "easeOut" }}
                      style={{ transformOrigin: "bottom", height: `${Math.min(h, 95)}%`, background: `linear-gradient(to top, rgba(139,92,246,0.7), rgba(59,130,246,0.4))` }}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
