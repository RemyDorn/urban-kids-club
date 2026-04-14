"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { Check, Sparkles, Zap } from "lucide-react";

const plans = [
  {
    name: "Starter",
    price: "$499",
    period: "/month",
    description: "For brands getting started with AI-powered advertising.",
    features: [
      "Up to 3 active campaigns",
      "100 creative variants/month",
      "Meta Ads integration",
      "Basic performance reporting",
      "Email support",
      "1 brand/store",
    ],
    cta: "Join Waitlist",
    popular: false,
  },
  {
    name: "Growth",
    price: "$1,299",
    period: "/month",
    description: "For scaling brands that need full creative and campaign automation.",
    features: [
      "Unlimited active campaigns",
      "1,000+ creative variants/month",
      "Meta + TikTok integration",
      "Smart video cutting & tagging",
      "Advanced analytics dashboard",
      "Dynamic ad refresh",
      "Priority support",
      "Up to 3 brands/stores",
    ],
    cta: "Join Waitlist",
    popular: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    description: "For agencies and large brands with complex needs.",
    features: [
      "Everything in Growth",
      "Custom AI model training",
      "White-label reporting",
      "API access",
      "Dedicated account manager",
      "Custom integrations",
      "SLA guarantee",
      "Unlimited brands/stores",
    ],
    cta: "Contact Sales",
    popular: false,
  },
];

export default function Pricing() {
  return (
    <section id="pricing" className="relative py-32 overflow-hidden">
      <div className="absolute inset-0 grid-bg" />
      <div className="absolute top-0 right-1/4 w-[600px] h-[400px] bg-brand-purple/5 rounded-full blur-[120px]" />

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-20"
        >
          <span className="inline-block text-sm font-medium text-brand-cyan mb-4 tracking-wider uppercase">
            Pricing
          </span>
          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-6">
            Simple, transparent
            <br />
            <span className="gradient-text">pricing</span>
          </h2>
          <p className="max-w-2xl mx-auto text-lg text-zinc-400">
            No hidden fees. No long-term contracts. Scale up or down as your
            business grows.
          </p>
        </motion.div>

        {/* Pricing cards */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {plans.map((plan, index) => (
            <motion.div
              key={plan.name}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className={`relative rounded-2xl p-8 transition-all duration-300 hover:translate-y-[-4px] ${
                plan.popular
                  ? "glass-card border-brand-purple/30 glow-purple"
                  : "glass-card"
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                  <span className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-gradient-to-r from-brand-purple to-brand-blue text-xs font-semibold text-white">
                    <Sparkles className="w-3 h-3" />
                    Most Popular
                  </span>
                </div>
              )}

              <div className="mb-6">
                <h3 className="text-xl font-bold text-white mb-2">{plan.name}</h3>
                <p className="text-sm text-zinc-400">{plan.description}</p>
              </div>

              <div className="mb-8">
                <span className="text-5xl font-bold text-white">{plan.price}</span>
                <span className="text-zinc-500">{plan.period}</span>
              </div>

              <ul className="space-y-3 mb-8">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-3">
                    <Check className="w-5 h-5 text-brand-purple flex-shrink-0 mt-0.5" />
                    <span className="text-sm text-zinc-300">{feature}</span>
                  </li>
                ))}
              </ul>

              <Link
                href="/waitlist"
                className={`block w-full text-center px-6 py-3.5 rounded-full text-sm font-semibold transition-all ${
                  plan.popular
                    ? "bg-gradient-to-r from-brand-purple to-brand-blue text-white hover:opacity-90"
                    : "border border-white/10 text-zinc-300 hover:text-white hover:border-white/20"
                }`}
              >
                {plan.cta}
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
