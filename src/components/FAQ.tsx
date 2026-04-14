"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Minus } from "lucide-react";

const faqs = [
  {
    question: "How does Larven generate ad creatives?",
    answer:
      "Larven uses advanced AI models trained on millions of high-performing ads. It analyzes your brand guidelines, product catalog, existing creatives, and competitor ads to generate on-brand variations that are optimized for performance. The AI creates static images, video cuts, and ad copy — all tailored to each platform's specifications.",
  },
  {
    question: "Which platforms do you integrate with?",
    answer:
      "Larven currently integrates with Meta (Facebook & Instagram) and TikTok for ad campaign management. For store connections, we support Shopify, WooCommerce, and BigCommerce. We also integrate with analytics tools like Google Analytics and Klaviyo for deeper performance insights.",
  },
  {
    question: "How long does it take to set up?",
    answer:
      "Most brands are fully set up within 15-30 minutes. You connect your store, import your brand guidelines and product catalog, and link your ad accounts. Our AI starts generating creatives immediately, and your first campaigns can be live within 24 hours.",
  },
  {
    question: "Will the AI match my brand voice and style?",
    answer:
      "Absolutely. During onboarding, you provide your brand guidelines, color palette, tone of voice, and example creatives. Larven's AI learns your brand identity and ensures every generated creative is consistent with your brand. You can also set guardrails and approval workflows.",
  },
  {
    question: "Can I review creatives before they go live?",
    answer:
      "Yes. You have full control over the approval process. You can set up automatic publishing for trusted creative types, or require manual approval for everything. Most brands start with manual approval and gradually move to auto-publish as they gain confidence in the AI's output.",
  },
  {
    question: "What kind of results can I expect?",
    answer:
      "Results vary by brand, but our early access users typically see a 30-50% reduction in CPA, 2-4× improvement in ROAS, and a 10× increase in creative testing volume. The key driver is the ability to test hundreds of creative variations simultaneously, which is impossible to do manually.",
  },
  {
    question: "Is there a minimum ad spend requirement?",
    answer:
      "We recommend a minimum of $5,000/month in ad spend to get meaningful results from the platform. However, our AI can work with any budget — the more data it has, the faster it optimizes.",
  },
  {
    question: "Can I cancel anytime?",
    answer:
      "Yes. All plans are month-to-month with no long-term contracts. You can upgrade, downgrade, or cancel at any time. If you cancel, you retain access to all your generated creatives and campaign data.",
  },
];

function FAQItem({
  question,
  answer,
  isOpen,
  onToggle,
}: {
  question: string;
  answer: string;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="border-b border-white/5 last:border-b-0">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-4 py-6 text-left group focus-ring rounded-lg"
      >
        <span
          className={`text-base sm:text-lg font-medium transition-colors duration-200 ${
            isOpen ? "text-white" : "text-zinc-300 group-hover:text-white"
          }`}
        >
          {question}
        </span>
        <span
          className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 ${
            isOpen
              ? "bg-brand-purple/20 text-brand-purple rotate-0"
              : "bg-white/5 text-zinc-500 group-hover:bg-white/10"
          }`}
        >
          {isOpen ? (
            <Minus className="w-4 h-4" />
          ) : (
            <Plus className="w-4 h-4" />
          )}
        </span>
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <p className="pb-6 text-zinc-400 leading-relaxed max-w-3xl">
              {answer}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section id="faq" className="relative py-32 overflow-hidden">
      <div className="absolute inset-0 grid-bg" />
      <div className="absolute bottom-0 left-1/4 w-[600px] h-[400px] bg-brand-blue/5 rounded-full blur-[120px]" />

      <div className="relative z-10 mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <span className="inline-block text-sm font-medium text-brand-blue mb-4 tracking-wider uppercase">
            FAQ
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight mb-6">
            Frequently asked{" "}
            <span className="gradient-text">questions</span>
          </h2>
          <p className="text-lg text-zinc-400">
            Everything you need to know about Larven.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="glass-card rounded-2xl px-6 sm:px-8"
        >
          {faqs.map((faq, index) => (
            <FAQItem
              key={index}
              question={faq.question}
              answer={faq.answer}
              isOpen={openIndex === index}
              onToggle={() =>
                setOpenIndex(openIndex === index ? null : index)
              }
            />
          ))}
        </motion.div>
      </div>
    </section>
  );
}
