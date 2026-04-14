"use client";

import { motion } from "framer-motion";
import { Star } from "lucide-react";

const testimonials = [
  {
    quote: "Larven replaced our entire creative team's weekly ad production. We now test 10x more variations than before.",
    author: "Sarah Chen",
    role: "Head of Growth, Bloom Skincare",
    avatar: "SC",
  },
  {
    quote: "The AI-generated creatives consistently outperform our hand-crafted ones. Our ROAS went from 1.8x to 4.1x.",
    author: "Marcus Rivera",
    role: "Founder, Peak Athletics",
    avatar: "MR",
  },
  {
    quote: "We scaled from 3 to 11 markets in 2 months. Larven handled all the creative localization automatically.",
    author: "Emma Johansson",
    role: "CMO, Nordic Wellness Co",
    avatar: "EJ",
  },
  {
    quote: "Setup took 15 minutes. First high-performing campaign was live within 24 hours. This is the future.",
    author: "David Kim",
    role: "CEO, UrbanEdge Apparel",
    avatar: "DK",
  },
  {
    quote: "We've been able to cut our agency fees by 70% while getting better results. Game changer for DTC.",
    author: "Lisa Thompson",
    role: "VP Marketing, GreenLeaf Nutrition",
    avatar: "LT",
  },
  {
    quote: "The video cutting feature alone saved us $15K/month in editing costs. The AI knows exactly where to cut.",
    author: "James Park",
    role: "Creative Director, Luxe Beauty",
    avatar: "JP",
  },
];

function TestimonialCard({
  quote,
  author,
  role,
  avatar,
}: (typeof testimonials)[0]) {
  return (
    <div className="flex-shrink-0 w-[380px] glass-card rounded-2xl p-6 mx-3 group hover:translate-y-[-2px]">
      <div className="flex gap-1 mb-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Star
            key={i}
            className="w-4 h-4 text-amber-400 fill-amber-400"
          />
        ))}
      </div>
      <p className="text-sm text-zinc-300 leading-relaxed mb-6">
        &ldquo;{quote}&rdquo;
      </p>
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-brand-purple/60 to-brand-blue/60 flex items-center justify-center text-xs font-bold text-white/80">
          {avatar}
        </div>
        <div>
          <div className="text-sm font-medium text-white">{author}</div>
          <div className="text-xs text-zinc-500">{role}</div>
        </div>
      </div>
    </div>
  );
}

export default function Testimonials() {
  return (
    <section className="relative py-24 overflow-hidden">
      <div className="absolute inset-0 dot-bg" />

      <div className="relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-16 px-4"
        >
          <span className="inline-block text-sm font-medium text-brand-cyan mb-4 tracking-wider uppercase">
            Testimonials
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight">
            Loved by <span className="gradient-text">ecommerce teams</span>
          </h2>
        </motion.div>

        {/* Marquee row 1 */}
        <div className="relative mb-6">
          <div className="absolute left-0 top-0 bottom-0 w-32 bg-gradient-to-r from-[#050505] to-transparent z-10 pointer-events-none" />
          <div className="absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-[#050505] to-transparent z-10 pointer-events-none" />
          <div className="overflow-hidden">
            <div className="flex marquee" style={{ animationDuration: "40s" }}>
              {[...testimonials.slice(0, 3), ...testimonials.slice(0, 3)].map(
                (t, i) => (
                  <TestimonialCard key={`a-${i}`} {...t} />
                )
              )}
            </div>
          </div>
        </div>

        {/* Marquee row 2 - reverse */}
        <div className="relative">
          <div className="absolute left-0 top-0 bottom-0 w-32 bg-gradient-to-r from-[#050505] to-transparent z-10 pointer-events-none" />
          <div className="absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-[#050505] to-transparent z-10 pointer-events-none" />
          <div className="overflow-hidden">
            <div
              className="flex marquee"
              style={{ animationDuration: "45s", animationDirection: "reverse" }}
            >
              {[...testimonials.slice(3), ...testimonials.slice(3)].map(
                (t, i) => (
                  <TestimonialCard key={`b-${i}`} {...t} />
                )
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
