"use client";

import Link from "next/link";
import { Zap } from "lucide-react";

const footerLinks = {
  Product: [
    { label: "Features", href: "#features" },
    { label: "How It Works", href: "#how-it-works" },
    { label: "Pricing", href: "#pricing" },
    { label: "Case Studies", href: "#case-studies" },
  ],
  Company: [
    { label: "About", href: "#" },
    { label: "Blog", href: "#" },
    { label: "Careers", href: "#" },
    { label: "Contact", href: "#" },
  ],
  Legal: [
    { label: "Privacy Policy", href: "#" },
    { label: "Terms of Service", href: "#" },
    { label: "Cookie Policy", href: "#" },
  ],
  Connect: [
    { label: "Twitter / X", href: "#" },
    { label: "LinkedIn", href: "#" },
    { label: "Instagram", href: "#" },
  ],
};

export default function Footer() {
  return (
    <footer className="relative border-t border-white/5 bg-[#050505]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Main footer */}
        <div className="py-16 grid grid-cols-2 md:grid-cols-6 gap-8">
          {/* Brand */}
          <div className="col-span-2">
            <Link href="/" className="flex items-center gap-2 mb-4">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-brand-purple to-brand-blue">
                <Zap className="w-4 h-4 text-white" />
              </div>
              <span className="text-xl font-bold tracking-tight">
                lar<span className="gradient-text">ven</span>
              </span>
            </Link>
            <p className="text-sm text-zinc-500 max-w-xs leading-relaxed">
              The AI that thinks like a performance marketer. Built for
              ecommerce brands that want to scale smarter.
            </p>
          </div>

          {/* Link columns */}
          {Object.entries(footerLinks).map(([title, links]) => (
            <div key={title}>
              <h4 className="text-sm font-semibold text-white mb-4">{title}</h4>
              <ul className="space-y-3">
                {links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="border-t border-white/5 py-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-zinc-600">
            &copy; {new Date().getFullYear()} Larven AI. All rights reserved.
          </p>
          <div className="flex items-center gap-1 text-xs text-zinc-600">
            <span>Built with</span>
            <span className="text-brand-purple">AI</span>
            <span>for brands that move fast</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
