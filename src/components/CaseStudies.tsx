"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { ArrowUpRight, TrendingDown, TrendingUp, Zap } from "lucide-react";

const caseStudies = [
  {
    slug: "gianna-bellucci",
    brand: "Gianna Bellucci",
    category: "Beauty & Skincare",
    description:
      "Reduced CPA by 45% and boosted overall ROAS by 3.2× while testing over 500 new creatives weekly.",
    stats: [
      { label: "CPA Reduction", value: "45%", icon: TrendingDown, color: "text-emerald-400" },
      { label: "ROAS Increase", value: "3.2×", icon: TrendingUp, color: "text-brand-purple" },
      { label: "Weekly Creatives", value: "500+", icon: Zap, color: "text-brand-cyan" },
    ],
    gradient: "from-pink-500/20 to-purple-600/20",
    initial: "GB",
  },
  {
    slug: "forma-active",
    brand: "Forma Active",
    category: "Fitness & Activewear",
    description:
      "Launched 8 product lines in one quarter — every drop with full creative ready on day one.",
    stats: [
      { label: "Product Lines", value: "8", icon: Zap, color: "text-brand-cyan" },
      { label: "Time to Launch", value: "1 Day", icon: TrendingDown, color: "text-emerald-400" },
      { label: "Revenue Growth", value: "2.8×", icon: TrendingUp, color: "text-brand-purple" },
    ],
    gradient: "from-blue-500/20 to-cyan-500/20",
    initial: "FA",
  },
  {
    slug: "nova-supplements",
    brand: "Nova Supplements",
    category: "Health & Wellness",
    description:
      "Scaled from $50K to $200K monthly ad spend while maintaining a 4.2× ROAS across 12 markets.",
    stats: [
      { label: "Ad Spend Scale", value: "4×", icon: TrendingUp, color: "text-brand-purple" },
      { label: "ROAS Maintained", value: "4.2×", icon: Zap, color: "text-brand-cyan" },
      { label: "Markets", value: "12", icon: TrendingUp, color: "text-emerald-400" },
    ],
    gradient: "from-emerald-500/20 to-teal-500/20",
    initial: "NS",
  },
];

export default function CaseStudies() {
  return (
    <section id="case-studies" className="relative py-32 overflow-hidden">
      <div className="absolute inset-0 grid-bg" />
      <div className="absolute top-1/2 left-0 w-[600px] h-[600px] bg-brand-purple/5 rounded-full blur-[120px] -translate-y-1/2" />

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-20"
        >
          <span className="inline-block text-sm font-medium text-brand-pink mb-4 tracking-wider uppercase">
            Case Studies
          </span>
          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-6">
            Real brands,
            <br />
            <span className="gradient-text-warm">real results</span>
          </h2>
          <p className="max-w-2xl mx-auto text-lg text-zinc-400">
            See how ecommerce brands are using Larven to transform their
            advertising and drive measurable growth.
          </p>
        </motion.div>

        {/* Case study cards */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {caseStudies.map((study, index) => (
            <motion.div
              key={study.slug}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
            >
              <Link
                href={`/case-studies/${study.slug}`}
                className="group block glass-card rounded-2xl overflow-hidden hover:translate-y-[-4px] transition-all duration-300"
              >
                {/* Top gradient area */}
                <div
                  className={`relative h-48 bg-gradient-to-br ${study.gradient} flex items-center justify-center`}
                >
                  <div className="w-20 h-20 rounded-2xl bg-white/10 backdrop-blur-sm flex items-center justify-center text-2xl font-bold text-white border border-white/10">
                    {study.initial}
                  </div>
                  <div className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <ArrowUpRight className="w-4 h-4 text-white" />
                  </div>
                </div>

                {/* Content */}
                <div className="p-6">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-xs text-zinc-500 font-medium uppercase tracking-wider">
                      {study.category}
                    </span>
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2">
                    {study.brand}
                  </h3>
                  <p className="text-sm text-zinc-400 leading-relaxed mb-6">
                    {study.description}
                  </p>

                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-3">
                    {study.stats.map((stat) => (
                      <div
                        key={stat.label}
                        className="text-center p-3 rounded-lg bg-white/[0.03]"
                      >
                        <stat.icon
                          className={`w-4 h-4 mx-auto mb-1 ${stat.color}`}
                        />
                        <div className="text-lg font-bold text-white">
                          {stat.value}
                        </div>
                        <div className="text-[10px] text-zinc-500 uppercase tracking-wider">
                          {stat.label}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
