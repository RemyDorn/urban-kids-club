"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Zap,
  ArrowLeft,
  TrendingDown,
  TrendingUp,
  BarChart3,
  Target,
  Layers,
  Clock,
  ArrowRight,
} from "lucide-react";

const caseStudyData: Record<
  string,
  {
    brand: string;
    category: string;
    initial: string;
    gradient: string;
    headline: string;
    subheadline: string;
    challenge: string;
    solution: string;
    results: string;
    stats: { label: string; value: string; description: string }[];
    timeline: { period: string; event: string }[];
    quote: { text: string; author: string; role: string };
  }
> = {
  "gianna-bellucci": {
    brand: "Gianna Bellucci",
    category: "Beauty & Skincare",
    initial: "GB",
    gradient: "from-pink-500/20 to-purple-600/20",
    headline: "45% CPA Reduction with AI-Generated Creatives",
    subheadline:
      "How Gianna Bellucci transformed their Meta advertising with Larven's AI creative engine.",
    challenge:
      "Gianna Bellucci was spending 40+ hours per week on creative production, struggling to test enough ad variations to find winners. Their team of 2 couldn't keep up with the creative demands of scaling across Meta and TikTok, leading to ad fatigue and rising CPAs.",
    solution:
      "With Larven, Gianna Bellucci automated their entire creative workflow. The AI analyzed their brand guidelines, top-performing ads, and competitor creatives to generate hundreds of on-brand variations weekly. Campaigns were automatically launched and optimized based on real-time performance data.",
    results:
      "Within 8 weeks, Gianna Bellucci saw a 45% reduction in CPA, 3.2× improvement in ROAS, and was testing over 500 new creatives per week — all without adding headcount to their marketing team.",
    stats: [
      { label: "CPA Reduction", value: "45%", description: "Cost per acquisition decreased significantly" },
      { label: "ROAS Increase", value: "3.2×", description: "Return on ad spend improvement" },
      { label: "Weekly Creatives", value: "500+", description: "New ad variations tested per week" },
      { label: "Time Saved", value: "35hrs", description: "Weekly hours saved on creative production" },
    ],
    timeline: [
      { period: "Week 1", event: "Store connected, brand guidelines imported, AI trained" },
      { period: "Week 2-3", event: "First batch of 200+ creatives generated and launched" },
      { period: "Week 4-6", event: "AI optimization kicks in, CPA begins dropping" },
      { period: "Week 8", event: "45% CPA reduction achieved, 3.2× ROAS milestone" },
    ],
    quote: {
      text: "Larven didn't just save us time — it fundamentally changed how we think about creative testing. We went from guessing to systematic, data-driven creative iteration.",
      author: "Maria Bellucci",
      role: "Founder & CEO, Gianna Bellucci",
    },
  },
  "forma-active": {
    brand: "Forma Active",
    category: "Fitness & Activewear",
    initial: "FA",
    gradient: "from-blue-500/20 to-cyan-500/20",
    headline: "8 Product Lines Launched in One Quarter",
    subheadline:
      "Every drop with full creative on day one — powered by Larven's AI engine.",
    challenge:
      "Forma Active had an ambitious plan to launch 8 new product lines in a single quarter, but their creative team couldn't keep up. Each launch required dozens of ad variations across multiple formats and platforms, and delays in creative production were pushing back launch dates.",
    solution:
      "Larven's AI was trained on Forma Active's brand identity and product catalog. For each new product line, the AI automatically generated complete creative packages — including static ads, video cuts, and copy variations — before each launch date.",
    results:
      "All 8 product lines launched on schedule with full creative packages ready on day one. Revenue grew 2.8× compared to the previous quarter, and the team was able to test 3× more creative variations than ever before.",
    stats: [
      { label: "Product Lines", value: "8", description: "Launched in a single quarter" },
      { label: "Launch Time", value: "1 Day", description: "From product to full creative" },
      { label: "Revenue Growth", value: "2.8×", description: "Quarter-over-quarter growth" },
      { label: "Creative Output", value: "3×", description: "More variations than before" },
    ],
    timeline: [
      { period: "Week 1", event: "Brand identity and product catalog imported" },
      { period: "Week 2-4", event: "First 3 product lines launched with AI creatives" },
      { period: "Week 5-8", event: "Next 3 lines launched, AI optimizes based on learnings" },
      { period: "Week 9-12", event: "Final 2 lines launched, 2.8× revenue achieved" },
    ],
    quote: {
      text: "We used to stress about whether creatives would be ready for each drop. With Larven, we have more creatives than we know what to do with — and they perform better than anything we made manually.",
      author: "James Chen",
      role: "Head of Marketing, Forma Active",
    },
  },
  "nova-supplements": {
    brand: "Nova Supplements",
    category: "Health & Wellness",
    initial: "NS",
    gradient: "from-emerald-500/20 to-teal-500/20",
    headline: "Scaled to $200K Monthly Spend Across 12 Markets",
    subheadline:
      "Maintaining 4.2× ROAS while expanding internationally with AI-powered localization.",
    challenge:
      "Nova Supplements wanted to expand from 3 to 12 international markets, but creating localized ad creatives for each market was prohibitively expensive. Their existing workflow couldn't handle the complexity of different languages, cultural nuances, and regulatory requirements across markets.",
    solution:
      "Larven's AI generated market-specific creative variations that accounted for local language, cultural preferences, and compliance requirements. The platform automatically adapted winning creative concepts for each new market while maintaining brand consistency.",
    results:
      "Nova Supplements successfully expanded to 12 markets, scaling monthly ad spend from $50K to $200K while maintaining a strong 4.2× ROAS. The AI's localization capabilities eliminated the need for separate creative teams per market.",
    stats: [
      { label: "Ad Spend Scaled", value: "4×", description: "From $50K to $200K monthly" },
      { label: "ROAS Maintained", value: "4.2×", description: "Consistent across all markets" },
      { label: "Markets", value: "12", description: "International markets served" },
      { label: "Cost Savings", value: "60%", description: "On creative production costs" },
    ],
    timeline: [
      { period: "Month 1", event: "AI trained on existing 3-market creative strategy" },
      { period: "Month 2", event: "Expanded to 6 markets with localized creatives" },
      { period: "Month 3", event: "Reached 10 markets, ad spend at $150K" },
      { period: "Month 4", event: "12 markets live, $200K spend, 4.2× ROAS achieved" },
    ],
    quote: {
      text: "Going international used to mean hiring agencies in every market. Larven gave us the ability to launch localized campaigns in any market within days, not months.",
      author: "Sarah Kim",
      role: "VP of Growth, Nova Supplements",
    },
  },
};

export default function CaseStudyPage() {
  const params = useParams();
  const slug = params.slug as string;
  const study = caseStudyData[slug];

  if (!study) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#050505]">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white mb-4">
            Case Study Not Found
          </h1>
          <Link
            href="/case-studies"
            className="text-brand-purple hover:text-brand-blue transition-colors"
          >
            View All Case Studies
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative overflow-hidden bg-[#050505]">
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
            href="/case-studies"
            className="flex items-center gap-2 text-sm text-zinc-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            All Case Studies
          </Link>
        </div>
      </nav>

      <div className="relative z-10">
        {/* Hero */}
        <div className={`relative bg-gradient-to-br ${study.gradient} py-24`}>
          <div className="absolute inset-0 bg-[#050505]/60" />
          <div className="relative z-10 mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <span className="inline-block text-xs font-medium text-zinc-400 uppercase tracking-wider mb-4">
                {study.category}
              </span>
              <div className="w-20 h-20 rounded-2xl bg-white/10 backdrop-blur-sm flex items-center justify-center text-2xl font-bold text-white border border-white/10 mx-auto mb-8">
                {study.initial}
              </div>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white mb-4">
                {study.headline}
              </h1>
              <p className="text-lg text-zinc-300 max-w-2xl mx-auto">
                {study.subheadline}
              </p>
            </motion.div>
          </div>
        </div>

        {/* Stats bar */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 -mt-8"
        >
          <div className="glass-card rounded-2xl p-6 sm:p-8 grid grid-cols-2 lg:grid-cols-4 gap-6">
            {study.stats.map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="text-3xl sm:text-4xl font-bold gradient-text mb-1">
                  {stat.value}
                </div>
                <div className="text-sm font-semibold text-white">
                  {stat.label}
                </div>
                <div className="text-xs text-zinc-500 mt-0.5">
                  {stat.description}
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Content */}
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-20 space-y-16">
          {/* Challenge */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                <Target className="w-5 h-5 text-red-400" />
              </div>
              <h2 className="text-2xl font-bold text-white">The Challenge</h2>
            </div>
            <p className="text-zinc-400 leading-relaxed text-lg">
              {study.challenge}
            </p>
          </motion.div>

          {/* Solution */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-brand-purple/10 border border-brand-purple/20 flex items-center justify-center">
                <Layers className="w-5 h-5 text-brand-purple" />
              </div>
              <h2 className="text-2xl font-bold text-white">The Solution</h2>
            </div>
            <p className="text-zinc-400 leading-relaxed text-lg">
              {study.solution}
            </p>
          </motion.div>

          {/* Timeline */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-brand-blue/10 border border-brand-blue/20 flex items-center justify-center">
                <Clock className="w-5 h-5 text-brand-blue" />
              </div>
              <h2 className="text-2xl font-bold text-white">Timeline</h2>
            </div>
            <div className="space-y-4">
              {study.timeline.map((item, index) => (
                <div
                  key={item.period}
                  className="flex items-start gap-4 glass-card rounded-xl p-4"
                >
                  <span className="text-sm font-mono text-brand-cyan whitespace-nowrap w-20 flex-shrink-0">
                    {item.period}
                  </span>
                  <span className="text-zinc-300">{item.event}</span>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Results */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                <BarChart3 className="w-5 h-5 text-emerald-400" />
              </div>
              <h2 className="text-2xl font-bold text-white">The Results</h2>
            </div>
            <p className="text-zinc-400 leading-relaxed text-lg">
              {study.results}
            </p>
          </motion.div>

          {/* Quote */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <blockquote className="glass-card rounded-2xl p-8 sm:p-10 border-gradient">
              <p className="text-xl sm:text-2xl text-white font-medium leading-relaxed italic mb-6">
                &ldquo;{study.quote.text}&rdquo;
              </p>
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-brand-purple to-brand-blue flex items-center justify-center text-sm font-bold text-white">
                  {study.quote.author
                    .split(" ")
                    .map((n) => n[0])
                    .join("")}
                </div>
                <div>
                  <div className="font-semibold text-white">
                    {study.quote.author}
                  </div>
                  <div className="text-sm text-zinc-500">
                    {study.quote.role}
                  </div>
                </div>
              </div>
            </blockquote>
          </motion.div>

          {/* CTA */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-center pt-8"
          >
            <h3 className="text-2xl font-bold text-white mb-4">
              Ready for similar results?
            </h3>
            <p className="text-zinc-400 mb-8">
              Join the waitlist and let AI transform your advertising.
            </p>
            <Link
              href="/waitlist"
              className="relative group inline-flex items-center gap-2 px-8 py-4 text-base font-semibold rounded-full bg-gradient-to-r from-brand-purple to-brand-blue text-white hover:opacity-90 transition-all"
            >
              <span className="absolute inset-0 rounded-full bg-gradient-to-r from-brand-purple to-brand-blue blur-xl opacity-30 group-hover:opacity-50 transition-opacity" />
              <span className="relative flex items-center gap-2">
                Join the Waitlist
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </span>
            </Link>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
