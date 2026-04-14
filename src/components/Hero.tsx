"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { ArrowRight, Play, Sparkles } from "lucide-react";

export default function Hero() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-16">
      {/* Background effects */}
      <div className="absolute inset-0 animated-gradient" />
      <div className="absolute inset-0 grid-bg" />
      <div className="absolute inset-0 radial-overlay" />

      {/* Floating orbs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-brand-purple/10 rounded-full blur-[120px] float" />
      <div
        className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-brand-blue/10 rounded-full blur-[120px] float"
        style={{ animationDelay: "-3s" }}
      />

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
        {/* Badge */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-brand-purple/30 bg-brand-purple/5 mb-8"
        >
          <span className="w-2 h-2 rounded-full bg-brand-purple pulse-dot" />
          <span className="text-sm text-brand-purple font-medium">
            Now in Early Access
          </span>
        </motion.div>

        {/* Headline */}
        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="text-5xl sm:text-6xl lg:text-8xl font-bold tracking-tight leading-[0.95] mb-6"
        >
          Your New
          <br />
          <span className="gradient-text">AI-Powered</span>
          <br />
          CMO
        </motion.h1>

        {/* Subheadline */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
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
          transition={{ duration: 0.6, delay: 0.3 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-4"
        >
          <Link
            href="/waitlist"
            className="relative group inline-flex items-center gap-2 px-8 py-4 text-base font-semibold rounded-full bg-gradient-to-r from-brand-purple to-brand-blue text-white hover:opacity-90 transition-all"
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
            className="inline-flex items-center gap-2 px-8 py-4 text-base font-medium rounded-full border border-white/10 text-zinc-300 hover:text-white hover:border-white/20 transition-all"
          >
            <Play className="w-4 h-4" />
            See How It Works
          </a>
        </motion.div>

        {/* Social proof bar */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.6 }}
          className="mt-20 flex flex-col sm:flex-row items-center justify-center gap-8 text-zinc-500 text-sm"
        >
          <div className="flex items-center gap-2">
            <div className="flex -space-x-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-purple/60 to-brand-blue/60 border-2 border-[#050505] flex items-center justify-center text-xs text-white/70"
                >
                  {String.fromCharCode(64 + i)}
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
          initial={{ opacity: 0, y: 60 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.5 }}
          className="mt-16 relative mx-auto max-w-5xl"
        >
          <div className="absolute -inset-4 bg-gradient-to-r from-brand-purple/20 via-brand-blue/20 to-brand-cyan/20 rounded-2xl blur-2xl" />
          <div className="relative rounded-xl border border-white/10 bg-surface overflow-hidden shadow-2xl">
            {/* Browser chrome */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5 bg-surface-light">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-500/60" />
                <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
                <div className="w-3 h-3 rounded-full bg-green-500/60" />
              </div>
              <div className="flex-1 flex justify-center">
                <div className="px-4 py-1 rounded-md bg-white/5 text-xs text-zinc-500">
                  app.larven.ai/dashboard
                </div>
              </div>
            </div>
            {/* Dashboard mockup */}
            <div className="p-6 sm:p-8 space-y-6">
              {/* Top stats row */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: "Active Campaigns", value: "24", change: "+3 today" },
                  { label: "ROAS", value: "3.8x", change: "+0.4x" },
                  { label: "Creatives Generated", value: "1,847", change: "+127 this week" },
                  { label: "Ad Spend", value: "$42.5K", change: "On target" },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className="p-4 rounded-lg bg-white/[0.03] border border-white/5"
                  >
                    <div className="text-xs text-zinc-500 mb-1">{stat.label}</div>
                    <div className="text-2xl font-bold text-white">{stat.value}</div>
                    <div className="text-xs text-emerald-400 mt-1">{stat.change}</div>
                  </div>
                ))}
              </div>
              {/* Chart area */}
              <div className="rounded-lg bg-white/[0.02] border border-white/5 p-6 h-48 flex items-end gap-1">
                {Array.from({ length: 30 }).map((_, i) => {
                  const h = 20 + Math.sin(i * 0.5) * 30 + Math.random() * 40;
                  return (
                    <div
                      key={i}
                      className="flex-1 rounded-t bg-gradient-to-t from-brand-purple/60 to-brand-blue/60"
                      style={{ height: `${h}%` }}
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
