"use client";

import { motion } from "framer-motion";

const stats = [
  {
    value: "500+",
    label: "Brands on Waitlist",
    description: "DTC brands ready to transform their ads",
  },
  {
    value: "2M+",
    label: "Creatives Generated",
    description: "Ad variations created by our AI engine",
  },
  {
    value: "45%",
    label: "Avg. CPA Reduction",
    description: "Average cost-per-acquisition improvement",
  },
  {
    value: "3.4×",
    label: "Avg. ROAS Lift",
    description: "Average return on ad spend increase",
  },
];

export default function Stats() {
  return (
    <section className="relative py-24 overflow-hidden">
      {/* Gradient divider */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-brand-purple/5 to-transparent" />

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="glass-card rounded-3xl p-8 sm:p-12 border-gradient"
        >
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12">
            {stats.map((stat, index) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="text-center"
              >
                <div className="text-4xl sm:text-5xl font-bold gradient-text mb-2">
                  {stat.value}
                </div>
                <div className="text-base font-semibold text-white mb-1">
                  {stat.label}
                </div>
                <div className="text-sm text-zinc-500">{stat.description}</div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
