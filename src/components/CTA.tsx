"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";

export default function CTA() {
  return (
    <section className="relative py-32 overflow-hidden">
      <div className="absolute inset-0 animated-gradient" />
      <div className="absolute inset-0 grid-bg" />

      {/* Large glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-brand-purple/10 rounded-full blur-[150px]" />

      <div className="relative z-10 mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-brand-purple/30 bg-brand-purple/5 mb-8">
            <Sparkles className="w-4 h-4 text-brand-purple" />
            <span className="text-sm text-brand-purple font-medium">
              Limited Early Access
            </span>
          </div>

          <h2 className="text-4xl sm:text-5xl lg:text-7xl font-bold tracking-tight mb-6">
            Ready to let AI
            <br />
            <span className="gradient-text-warm">run your ads?</span>
          </h2>

          <p className="max-w-xl mx-auto text-lg text-zinc-400 mb-10">
            Join 500+ ecommerce brands already on the waitlist. Be among the
            first to experience the future of performance marketing.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/waitlist"
              className="relative group inline-flex items-center gap-2 px-10 py-5 text-lg font-semibold rounded-full bg-gradient-to-r from-brand-purple to-brand-blue text-white hover:opacity-90 transition-all"
            >
              <span className="absolute inset-0 rounded-full bg-gradient-to-r from-brand-purple to-brand-blue blur-xl opacity-40 group-hover:opacity-60 transition-opacity" />
              <span className="relative flex items-center gap-2">
                Join the Waitlist
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </span>
            </Link>
          </div>

          <p className="mt-6 text-sm text-zinc-500">
            No credit card required. Free early access for qualifying brands.
          </p>
        </motion.div>
      </div>
    </section>
  );
}
