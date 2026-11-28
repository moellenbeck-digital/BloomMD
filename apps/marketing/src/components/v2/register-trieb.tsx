import { ArrowRight } from "lucide-react";
import { bmdFonts } from "./fonts";
import t from "./tokens.module.css";
import styles from "./register-trieb.module.css";

/* Registration replaced the waitlist; the #beta anchor stays so old links and CTAs keep working. */
export function RegisterTrieb({ kicker, title, text, action, href, onSignup }: {
  kicker?: string;
  title: string;
  text: string;
  action: string;
  href: string;
  onSignup: () => void;
}) {
  return (
    <section id="beta" className={`${t.ground} ${bmdFonts} ${styles.section}`} aria-labelledby="beta-title">
      <div className={t.wrap}>
        <div className={styles.body}>
          {kicker && <p className={t.kicker}>{kicker}</p>}
          <h2 id="beta-title" className={`${t.title} ${styles.title}`}>{title}</h2>
          <p className={`${t.lede} ${styles.text}`}>{text}</p>
          <a href={href} data-testid="signup-cta" onClick={onSignup} className={`${t.primary} ${styles.action}`}>
            {action}
            <ArrowRight size={18} aria-hidden="true" />
          </a>
        </div>
      </div>
    </section>
  );
}
