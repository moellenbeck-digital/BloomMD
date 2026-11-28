import { AvailabilityOverview } from "../availability-overview";
import type { MarketingLocale } from "@/lib/locale";
import { bmdFonts } from "./fonts";
import t from "./tokens.module.css";
import styles from "./availability-trieb.module.css";

/* Same content as AvailabilityOverview; only the skin changes: three branches, thinner the less is available. */
export function AvailabilityTrieb({ locale }: { locale: MarketingLocale }) {
  return (
    <AvailabilityOverview
      locale={locale}
      skin={{
        section: `${t.ground} ${bmdFonts} ${styles.section}`,
        wrap: t.wrap!,
        kicker: t.kicker!,
        title: `${t.title} ${styles.title}`,
        intro: `${t.lede} ${styles.intro}`,
        grid: styles.grid!,
        now: `${styles.way} ${styles.now}`,
        trial: `${styles.way} ${styles.trial}`,
        later: `${styles.way} ${styles.later}`,
        heading: styles.heading!,
        list: styles.list!,
        text: styles.text!,
        link: styles.link!,
        action: styles.action!,
      }}
    />
  );
}
