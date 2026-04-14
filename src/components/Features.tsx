"use client";

import { motion } from "framer-motion";
import {
  Megaphone,
  Scissors,
  BarChart3,
  RefreshCcw,
  Palette,
  ShieldCheck,
} from "lucide-react";

const features = [
  {
    icon: Megaphone,
    title: "Automated Campaign Creation",
    description:
      "Automatically creates campaigns in Meta and TikTok Ads Manager, so you can focus on strategy instead of clicking buttons.",
    gradient: "from-purple-500 to-violet-600",
  },
  {
    icon: Scissors,
    title: "Smart Video Cutting",
    description:
      "Cuts long videos into modular clips — hooks, testimonials, B-roll — and auto-tags them by creator, product, and scene.",
    gradient: "from-blue-500 to-cyan-500",
  },
  {
    icon: BarChart3,
    title: "Performance-Driven Spend",
    description:
      "Connects to your store and focuses ad spend on products that actually move. Stops pushing products you can't fulfill.",
    gradient: "from-emerald-500 to-teal-500",
  },
  {
    icon: RefreshCcw,
    title: "Dynamic Ad Optimization",
    description:
      "Detects when ads stop performing and automatically generates fresh variants. Suggests new hooks, angles, and formats.",
    gradient: "from-orange-500 to-amber-500",
  },
  {
    icon: Palette,
    title: "Creative Generation at Scale",
    description:
      "Feed your product catalog and brand guidelines to generate hundreds of localized, format-specific ad variations instantly.",
    gradient: "from-pink-500 to-rose-500",
  },
  {
    icon: ShieldCheck,
    title: "Brand-Safe AI",
    description:
      "Every ad is crafted with context from your brand guidelines and performance history. Consistent voice, on-brand every time.",
    gradient: "from-indigo-500 to-purple-600",
  },
];

const containerVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const cardVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5 },
  },
};

export default function Features() {
  return (
    <section id="features" className="relative py-32 overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 grid-bg" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-brand-purple/5 rounded-full blur-[120px]" />

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-20"
        >
          <span className="inline-block text-sm font-medium text-brand-purple mb-4 tracking-wider uppercase">
            Features
          </span>
          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-6">
            Everything you need to
            <br />
            <span className="gradient-text">scale your ads</span>
          </h2>
          <p className="max-w-2xl mx-auto text-lg text-zinc-400">
            Larven handles the entire ad lifecycle — from creative production to
            campaign launch to optimization — so you can focus on growing your
            brand.
          </p>
        </motion.div>

        {/* Feature grid */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
        >
          {features.map((feature) => (
            <motion.div
              key={feature.title}
              variants={cardVariants}
              className="group relative glass-card rounded-2xl p-8 transition-all duration-300 hover:translate-y-[-4px]"
            >
              {/* Icon */}
              <div
                className={`inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br ${feature.gradient} mb-6`}
              >
                <feature.icon className="w-6 h-6 text-white" />
              </div>

              <h3 className="text-xl font-semibold text-white mb-3">
                {feature.title}
              </h3>
              <p className="text-zinc-400 leading-relaxed">
                {feature.description}
              </p>

              {/* Hover glow */}
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-brand-purple/5 to-brand-blue/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
