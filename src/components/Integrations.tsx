"use client";

import { motion } from "framer-motion";

const integrations = [
  { name: "Meta", icon: "M", color: "#1877F2" },
  { name: "TikTok", icon: "T", color: "#00F2EA" },
  { name: "Shopify", icon: "S", color: "#96BF48" },
  { name: "WooCommerce", icon: "W", color: "#96588A" },
  { name: "Google Ads", icon: "G", color: "#4285F4" },
  { name: "Klaviyo", icon: "K", color: "#2BD98C" },
  { name: "Stripe", icon: "S", color: "#635BFF" },
  { name: "BigCommerce", icon: "B", color: "#34313F" },
];

export default function Integrations() {
  return (
    <section className="relative py-20 overflow-hidden border-t border-b border-white/5">
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-brand-purple/3 to-transparent" />

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <p className="text-sm text-zinc-500 uppercase tracking-wider font-medium">
            Seamless integrations with your stack
          </p>
        </motion.div>

        {/* Logo row - animated */}
        <div className="relative">
          {/* Fade edges */}
          <div className="absolute left-0 top-0 bottom-0 w-20 bg-gradient-to-r from-[#050505] to-transparent z-10 pointer-events-none" />
          <div className="absolute right-0 top-0 bottom-0 w-20 bg-gradient-to-l from-[#050505] to-transparent z-10 pointer-events-none" />

          <div className="overflow-hidden">
            <div className="flex gap-8 marquee">
              {[...integrations, ...integrations].map((int, i) => (
                <div
                  key={`${int.name}-${i}`}
                  className="flex items-center gap-3 px-6 py-4 rounded-xl bg-white/[0.03] border border-white/5 whitespace-nowrap hover:border-white/10 hover:bg-white/[0.05] transition-all flex-shrink-0 group"
                >
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold text-white group-hover:scale-110 transition-transform"
                    style={{ background: `${int.color}33`, border: `1px solid ${int.color}44` }}
                  >
                    {int.icon}
                  </div>
                  <span className="text-sm font-medium text-zinc-400 group-hover:text-zinc-200 transition-colors">
                    {int.name}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
