import Link from "next/link";
import { bmdFonts } from "./fonts";
import t from "./tokens.module.css";
import styles from "./footer-trieb.module.css";

export interface FooterColumn {
  title: string;
  links: readonly { label: string; href: string }[];
  note?: string;
}

const provider = "https://moellenbeck-digital.io/";

/* The footer is the root layer: a soil line, a root collar, the link columns hanging below. */
export function FooterTrieb({ claim, providedBy, beta, navLabel, columns, copyright, domains }: {
  claim: string;
  providedBy: readonly [string, string];
  beta: string;
  navLabel: string;
  columns: readonly FooterColumn[];
  copyright: string;
  domains: React.ReactNode;
}) {
  const providerLink = <a href={provider} className={styles.provider}>moellenbeck-digital.io</a>;

  return (
    <footer className={`${t.ground} ${t.deep} ${bmdFonts} ${styles.footer}`}>
      <div className={`${t.wrap} ${styles.inner}`}>
        <div className={styles.layout}>
          <div className={styles.brand}>
            <span className={styles.logo}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.svg" alt="BloomMD" className="bloommd-logo-light" loading="lazy" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo-dark.svg" alt="BloomMD" className="bloommd-logo-dark" loading="lazy" />
            </span>
            <p className={styles.claim}>{claim}</p>
            <p>{providedBy[0]}{providerLink}{providedBy[1]}</p>
            <p className={styles.beta}>{beta}</p>
          </div>
          <nav className={styles.columns} aria-label={navLabel}>
            {columns.map((column) => (
              <div key={column.title}>
                <h2 className={styles.heading}>{column.title}</h2>
                <ul>
                  {column.links.map((item) => (
                    <li key={item.href}>
                      {item.href.startsWith("http") || item.href.startsWith("#") ? (
                        <a href={item.href} className={styles.link}>{item.label}</a>
                      ) : (
                        <Link href={item.href} className={styles.link}>{item.label}</Link>
                      )}
                    </li>
                  ))}
                </ul>
                {column.note && <p className={styles.note}>{column.note}</p>}
              </div>
            ))}
          </nav>
        </div>
        <div className={styles.base}>
          <p>{copyright}{providerLink}.</p>
          <p>{domains}</p>
        </div>
      </div>
    </footer>
  );
}
