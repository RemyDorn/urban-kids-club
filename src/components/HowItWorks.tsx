"use client";

import { motion } from "framer-motion";
import { Upload, Cpu, Rocket, TrendingUp } from "lucide-react";

const steps = [
  {
    icon: Upload,
    number: "01",
    title: "Connect Your Store",
    description:
      "Link your Shopify, WooCommerce, or custom store. Import your product catalog, brand guidelines, and existing creatives.",
    detail: "2-minute setup",
  },
  {
    icon: Cpu,
    number: "02",
    title: "AI Generates Creatives",
    description:
      "Larven analyzes your brand, competitors, and top-performing ads to generate hundreds of on-brand creative variations.",
    detail: "500+ variants per product",
  },
  {
    icon: Rocket,
    number: "03",
    title: "Campaigns Go Live",
    description:
      "Campaigns are automatically built and launched in Meta and TikTok Ads Manager with optimal targeting and budgets.",
    detail: "Zero manual work",
  },
  {
    icon: TrendingUp,
    number: "04",
    title: "Continuous Optimization",
    description:
      "Larven monitors performance 24/7, refreshes fatigued creatives, reallocates budgets, and scales what works.",
    detail: "Always-on optimization",
  },
];

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="relative py-32 overflow-hidden">
      <div className="absolute inset-0 grid-bg" />
      <div className="absolute bottom-0 right-0 w-[600px] h-[600px] bg-brand-blue/5 rounded-full blur-[120px]" />

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-20"
        >
          <span className="inline-block text-sm font-medium text-brand-blue mb-4 tracking-wider uppercase">
            How It Works
          </span>
          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-6">
            From setup to scale
            <br />
            <span className="gradient-text">in four steps</span>
          </h2>
          <p className="max-w-2xl mx-auto text-lg text-zinc-400">
            No learning curve. No complex configuration. Just connect your store
            and let Larven handle the rest.
          </p>
        </motion.div>

        {/* Steps */}
        <div className="relative max-w-4xl mx-auto">
          {/* Vertical line */}
          <div className="absolute left-8 top-0 bottom-0 w-px bg-gradient-to-b from-brand-purple/50 via-brand-blue/50 to-transparent hidden md:block" />

          <div className="space-y-12">
            {steps.map((step, index) => (
              <motion.div
                key={step.number}
                initial={{ opacity: 0, x: -30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.15 }}
                className="relative flex items-start gap-8 group"
              >
                {/* Step indicator */}
                <div className="relative z-10 flex-shrink-0 hidden md:flex">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-purple to-brand-blue flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                    <step.icon className="w-7 h-7 text-white" />
                  </div>
                </div>

                {/* Content card */}
                <div className="flex-1 glass-card rounded-2xl p-8 group-hover:translate-x-2 transition-transform duration-300">
                  <div className="flex items-center gap-3 mb-4">
                    <span className="text-sm font-mono text-brand-purple">
                      {step.number}
                    </span>
                    <div className="md:hidden w-10 h-10 rounded-lg bg-gradient-to-br from-brand-purple to-brand-blue flex items-center justify-center">
                      <step.icon className="w-5 h-5 text-white" />
                    </div>
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-3">
                    {step.title}
                  </h3>
                  <p className="text-zinc-400 leading-relaxed mb-4">
                    {step.description}
                  </p>
                  <span className="inline-flex items-center gap-2 text-sm text-brand-cyan font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-brand-cyan" />
                    {step.detail}
                  </span>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
