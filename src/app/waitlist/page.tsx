"use client";

import { useState, FormEvent } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import {
  Zap,
  ArrowLeft,
  Check,
  Sparkles,
  ArrowRight,
  Store,
  BarChart3,
  Globe,
} from "lucide-react";

const benefits = [
  {
    icon: Sparkles,
    title: "Early Access",
    description: "Be among the first to use Larven before public launch.",
  },
  {
    icon: Store,
    title: "Free Onboarding",
    description: "Dedicated setup assistance from our team.",
  },
  {
    icon: BarChart3,
    title: "Founding Member Pricing",
    description: "Lock in special pricing that lasts forever.",
  },
  {
    icon: Globe,
    title: "Shape the Product",
    description: "Direct input on features and roadmap priorities.",
  },
];

export default function WaitlistPage() {
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [revenue, setRevenue] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 animated-gradient" />
      <div className="absolute inset-0 grid-bg" />
      <div className="absolute inset-0 radial-overlay" />

      {/* Navigation */}
      <nav className="relative z-20 border-b border-white/5 bg-[#050505]/80 backdrop-blur-xl">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-brand-purple to-brand-blue">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight">
              lar<span className="gradient-text">ven</span>
            </span>
          </Link>
          <Link
            href="/"
            className="flex items-center gap-2 text-sm text-zinc-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </Link>
        </div>
      </nav>

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          {/* Left side - Info */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-brand-purple/30 bg-brand-purple/5 mb-8">
              <span className="w-2 h-2 rounded-full bg-emerald-400 pulse-dot" />
              <span className="text-sm text-zinc-300 font-medium">
                Accepting applications
              </span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-6">
              Join the
              <br />
              <span className="gradient-text-warm">Waitlist</span>
            </h1>

            <p className="text-lg text-zinc-400 mb-12 leading-relaxed max-w-lg">
              Get early access to the AI CMO that&apos;s transforming how ecommerce
              brands create and manage their advertising.
            </p>

            <div className="space-y-6">
              {benefits.map((benefit, index) => (
                <motion.div
                  key={benefit.title}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.4, delay: 0.2 + index * 0.1 }}
                  className="flex items-start gap-4"
                >
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-purple/20 to-brand-blue/20 border border-white/5 flex items-center justify-center flex-shrink-0">
                    <benefit.icon className="w-5 h-5 text-brand-purple" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-white">
                      {benefit.title}
                    </h3>
                    <p className="text-sm text-zinc-500">{benefit.description}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Right side - Form */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <div className="glass-card rounded-2xl p-8 sm:p-10 border-gradient">
              {!submitted ? (
                <>
                  <h2 className="text-2xl font-bold text-white mb-2">
                    Apply for Early Access
                  </h2>
                  <p className="text-sm text-zinc-400 mb-8">
                    We&apos;re rolling out access to select brands. Fill in your details
                    and we&apos;ll be in touch.
                  </p>

                  <form onSubmit={handleSubmit} className="space-y-5">
                    <div>
                      <label className="block text-sm font-medium text-zinc-300 mb-2">
                        Work Email
                      </label>
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@brand.com"
                        className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-zinc-600 focus:outline-none focus:border-brand-purple/50 focus:ring-1 focus:ring-brand-purple/50 transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-zinc-300 mb-2">
                        Company / Brand Name
                      </label>
                      <input
                        type="text"
                        required
                        value={company}
                        onChange={(e) => setCompany(e.target.value)}
                        placeholder="Your Brand"
                        className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-zinc-600 focus:outline-none focus:border-brand-purple/50 focus:ring-1 focus:ring-brand-purple/50 transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-zinc-300 mb-2">
                        Monthly Ad Spend
                      </label>
                      <select
                        value={revenue}
                        onChange={(e) => setRevenue(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:border-brand-purple/50 focus:ring-1 focus:ring-brand-purple/50 transition-all appearance-none"
                      >
                        <option value="" className="bg-[#111]">
                          Select range
                        </option>
                        <option value="<5k" className="bg-[#111]">
                          Less than $5,000
                        </option>
                        <option value="5k-25k" className="bg-[#111]">
                          $5,000 - $25,000
                        </option>
                        <option value="25k-100k" className="bg-[#111]">
                          $25,000 - $100,000
                        </option>
                        <option value="100k-500k" className="bg-[#111]">
                          $100,000 - $500,000
                        </option>
                        <option value="500k+" className="bg-[#111]">
                          $500,000+
                        </option>
                      </select>
                    </div>

                    <button
                      type="submit"
                      className="relative group w-full flex items-center justify-center gap-2 px-6 py-4 rounded-xl bg-gradient-to-r from-brand-purple to-brand-blue text-white font-semibold hover:opacity-90 transition-all mt-2"
                    >
                      <span className="absolute inset-0 rounded-xl bg-gradient-to-r from-brand-purple to-brand-blue blur-lg opacity-30 group-hover:opacity-50 transition-opacity" />
                      <span className="relative flex items-center gap-2">
                        Request Access
                        <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                      </span>
                    </button>
                  </form>

                  <p className="mt-4 text-xs text-zinc-600 text-center">
                    By joining, you agree to our Terms of Service and Privacy
                    Policy.
                  </p>
                </>
              ) : (
                <div className="text-center py-12">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 flex items-center justify-center mx-auto mb-6">
                    <Check className="w-8 h-8 text-white" />
                  </div>
                  <h2 className="text-2xl font-bold text-white mb-3">
                    You&apos;re on the list!
                  </h2>
                  <p className="text-zinc-400 max-w-sm mx-auto">
                    Thanks for your interest. We&apos;ll review your application and
                    get back to you within 48 hours.
                  </p>
                  <Link
                    href="/"
                    className="inline-flex items-center gap-2 mt-8 text-sm text-brand-purple hover:text-brand-blue transition-colors"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Back to Home
                  </Link>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
