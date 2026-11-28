"use client";

import { ArrowRight, Menu, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { trackPlausibleEvent } from "../../lib/plausible";
import { bmdFonts } from "./fonts";
import headerStyles from "./header.module.css";
import t from "./tokens.module.css";

export interface HeaderCopy {
  locale: "de" | "en";
  homeHref: string;
  homeLabel: string;
  navLabel: string;
  mobileNavLabel: string;
  menuId: string;
  more: string;
  open: string;
  close: string;
  signup: string;
  languageLabel: string;
  otherLabel: string;
}

export function SiteHeader({ navItems, secondaryItems, loginUrl, signupUrl, copy }: {
  navItems: readonly { label: string; href: string }[];
  secondaryItems: readonly { label: string; href: string }[];
  loginUrl: string;
  signupUrl: string;
  copy: HeaderCopy;
}) {
  const [open, setOpen] = useState(false);
  const german = copy.locale === "de";
  const current = <span aria-current="page">{german ? "DE" : "EN"}</span>;
  const language = (onClick?: () => void) => {
    const other = (
      <Link href={german ? "/en" : "/"} hrefLang={german ? "en" : "de"} onClick={onClick} aria-label={copy.otherLabel}>
        {german ? "EN" : "DE"}
      </Link>
    );
    return (
      <div className={headerStyles.lang} aria-label={copy.languageLabel}>
        {german ? current : other}
        {german ? other : current}
      </div>
    );
  };

  return (
    <header className={`${t.ground} ${bmdFonts} ${headerStyles.header}`}>
      <div className={headerStyles.bar}>
        <Link href={copy.homeHref} className="flex min-w-0 shrink-0 items-center gap-3" aria-label={copy.homeLabel}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <span className="block h-8 w-[144px]">
            <img src="/logo.svg" alt="BloomMD" className="bloommd-logo-light h-8 w-auto" />
            <img src="/logo-dark.svg" alt="" aria-hidden="true" className="bloommd-logo-dark h-8 w-auto" />
          </span>
          <span className={headerStyles.claim}>Markdown Maps</span>
        </Link>
        <nav className={headerStyles.nav} aria-label={copy.navLabel}>
          {navItems.map((item) => (
            <a key={item.href} href={item.href} className={headerStyles.link}>
              {item.label}
            </a>
          ))}
        </nav>
        <div className={headerStyles.tools}>
          {language()}
          <a href={loginUrl} onClick={() => trackPlausibleEvent("login_click")} className={headerStyles.link}>
            Login
          </a>
          <a href={signupUrl} className={t.primary}>
            {copy.signup}
            <ArrowRight size={16} aria-hidden="true" />
          </a>
        </div>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className={headerStyles.toggle}
          aria-expanded={open}
          aria-controls={copy.menuId}
          aria-label={open ? copy.close : copy.open}
        >
          {open ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
        </button>
      </div>
      {open && (
        <div id={copy.menuId} className={headerStyles.menu}>
          <nav aria-label={copy.mobileNavLabel}>
            <div className={headerStyles.menuMain}>
              {navItems.map((item) => (
                <a key={item.href} href={item.href} onClick={() => setOpen(false)}>
                  {item.label}
                </a>
              ))}
            </div>
            <div className={headerStyles.menuGroup}>
              <p className={headerStyles.menuHead}>{copy.more}</p>
              <div className={headerStyles.menuTwo}>
                {secondaryItems.map((item) => (
                  <a key={item.href} href={item.href} onClick={() => setOpen(false)} className={headerStyles.link}>
                    {item.label}
                  </a>
                ))}
              </div>
            </div>
            <div className={headerStyles.menuGroup}>
              {language(() => setOpen(false))}
              <a href={loginUrl} onClick={() => trackPlausibleEvent("login_click")} className={headerStyles.link}>
                Login
              </a>
              <a href={signupUrl} className={t.primary}>
                {copy.signup}
                <ArrowRight size={16} aria-hidden="true" />
              </a>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
