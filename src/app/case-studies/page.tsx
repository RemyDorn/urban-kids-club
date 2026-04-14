"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import {
  Zap,
  ArrowLeft,
  ArrowUpRight,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

const caseStudies = [
  {
    slug: "gianna-bellucci",
    brand: "Gianna Bellucci",
    category: "Beauty & Skincare",
    description:
      "How a luxury skincare brand reduced CPA by 45% and boosted ROAS by 3.2× using AI-generated creatives tested at scale.",
    heroStat: "45% CPA Reduction",
    initial: "GB",
    gradient: "from-pink-500/20 to-purple-600/20",
  },
  {
    slug: "forma-active",
    brand: "Forma Active",
    category: "Fitness & Activewear",
    description:
      "Launching 8 product lines in one quarter with full creative ready on day one — powered by Larven's AI creative engine.",
    heroStat: "8 Product Lines in 90 Days",
    initial: "FA",
    gradient: "from-blue-500/20 to-cyan-500/20",
  },
  {
    slug: "nova-supplements",
    brand: "Nova Supplements",
    category: "Health & Wellness",
    description:
      "Scaling from $50K to $200K monthly ad spend while maintaining 4.2× ROAS across 12 international markets.",
    heroStat: "4× Ad Spend Scale",
    initial: "NS",
    gradient: "from-emerald-500/20 to-teal-500/20",
  },
];

export default function CaseStudiesPage() {
  return (
    <div className="min-h-screen relative overflow-hidden">
      <div className="absolute inset-0 animated-gradient" />
      <div className="absolute inset-0 grid-bg" />

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
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-20"
        >
          <span className="inline-block text-sm font-medium text-brand-pink mb-4 tracking-wider uppercase">
            Case Studies
          </span>
          <h1 className="text-4xl sm:text-5xl lg:text-7xl font-bold tracking-tight mb-6">
            Real brands,
            <br />
            <span className="gradient-text-warm">real results</span>
          </h1>
          <p className="max-w-2xl mx-auto text-lg text-zinc-400">
            See how ecommerce brands are using Larven to transform their
            advertising and drive measurable growth.
          </p>
        </motion.div>

        {/* Case study list */}
        <div className="space-y-8 max-w-4xl mx-auto">
          {caseStudies.map((study, index) => (
            <motion.div
              key={study.slug}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
            >
              <Link
                href={`/case-studies/${study.slug}`}
                className="group flex flex-col md:flex-row glass-card rounded-2xl overflow-hidden hover:translate-y-[-2px] transition-all duration-300"
              >
                {/* Left gradient area */}
                <div
                  className={`md:w-64 h-48 md:h-auto bg-gradient-to-br ${study.gradient} flex items-center justify-center flex-shrink-0`}
                >
                  <div className="w-20 h-20 rounded-2xl bg-white/10 backdrop-blur-sm flex items-center justify-center text-2xl font-bold text-white border border-white/10">
                    {study.initial}
                  </div>
                </div>

                {/* Content */}
                <div className="flex-1 p-8 flex flex-col justify-center">
                  <span className="text-xs text-zinc-500 font-medium uppercase tracking-wider mb-2">
                    {study.category}
                  </span>
                  <h2 className="text-2xl font-bold text-white mb-3">
                    {study.brand}
                  </h2>
                  <p className="text-zinc-400 mb-4 leading-relaxed">
                    {study.description}
                  </p>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold gradient-text">
                      {study.heroStat}
                    </span>
                    <span className="flex items-center gap-1 text-sm text-zinc-500 group-hover:text-brand-purple transition-colors">
                      Read Case Study
                      <ArrowUpRight className="w-4 h-4" />
                    </span>
                  </div>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
