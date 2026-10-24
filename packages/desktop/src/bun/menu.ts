import { ApplicationMenu } from "electrobun/bun";

export type ApplicationMenuLocale = "de" | "en";

const MENU_COPY: Record<ApplicationMenuLocale, {
  about: string;
  hide: string;
  hideOthers: string;
  showAll: string;
  quit: string;
  edit: string;
  undo: string;
  redo: string;
  cut: string;
  copy: string;
  paste: string;
  pasteAndMatchStyle: string;
  delete: string;
  selectAll: string;
  window: string;
  minimize: string;
  zoom: string;
  fullScreen: string;
  close: string;
}> = {
  de: {
    about: "Über", hide: "ausblenden", hideOthers: "Andere ausblenden", showAll: "Alle einblenden", quit: "beenden",
    edit: "Bearbeiten", undo: "Widerrufen", redo: "Wiederholen", cut: "Ausschneiden", copy: "Kopieren", paste: "Einsetzen",
    pasteAndMatchStyle: "Einsetzen und Stil anpassen", delete: "Löschen", selectAll: "Alles auswählen", window: "Fenster",
    minimize: "Im Dock ablegen", zoom: "Zoomen", fullScreen: "Vollbild", close: "Fenster schließen",
  },
  en: {
    about: "About", hide: "Hide", hideOthers: "Hide Others", showAll: "Show All", quit: "Quit",
    edit: "Edit", undo: "Undo", redo: "Redo", cut: "Cut", copy: "Copy", paste: "Paste",
    pasteAndMatchStyle: "Paste and Match Style", delete: "Delete", selectAll: "Select All", window: "Window",
    minimize: "Minimize", zoom: "Zoom", fullScreen: "Full Screen", close: "Close Window",
  },
};

let applicationName = "BloomMD";
let menuLocale: ApplicationMenuLocale = "de";
let aboutHandler: (() => void) | undefined;
let menuListenerInstalled = false;

export function getApplicationMenu(appName = applicationName, locale: ApplicationMenuLocale = menuLocale): Parameters<typeof ApplicationMenu.setApplicationMenu>[0] {
  const copy = MENU_COPY[locale];
  return [
    {
      label: appName,
      submenu: [
        { action: "open-about", label: `${copy.about} ${appName}` },
        { type: "divider" },
        { role: "hide", label: `${appName} ${copy.hide}` },
        { role: "hideOthers", label: copy.hideOthers },
        { role: "showAll", label: copy.showAll },
        { type: "divider" },
        { role: "quit", label: `${appName} ${copy.quit}`, accelerator: "cmd+q" },
      ],
    },
    {
      label: copy.edit,
      submenu: [
        { role: "undo", label: copy.undo, accelerator: "cmd+z" },
        { role: "redo", label: copy.redo, accelerator: "cmd+shift+z" },
        { type: "divider" },
        { role: "cut", label: copy.cut, accelerator: "cmd+x" },
        { role: "copy", label: copy.copy, accelerator: "cmd+c" },
        { role: "paste", label: copy.paste, accelerator: "cmd+v" },
        { role: "pasteAndMatchStyle", label: copy.pasteAndMatchStyle, accelerator: "cmd+shift+v" },
        { role: "delete", label: copy.delete },
        { role: "selectAll", label: copy.selectAll, accelerator: "cmd+a" },
      ],
    },
    {
      label: copy.window,
      submenu: [
        { role: "minimize", label: copy.minimize, accelerator: "cmd+m" },
        { role: "zoom", label: copy.zoom },
        { role: "toggleFullScreen", label: copy.fullScreen },
        { type: "divider" },
        { role: "close", label: copy.close, accelerator: "cmd+w" },
      ],
    },
  ];
}

/**
 * Installs the standard application menu.
 *
 * Without one, macOS never routes Cmd+C / Cmd+V into the webview: the clipboard shortcuts are
 * delivered through the Edit menu's responder selectors, so an app with no menu simply swallows
 * them. That is why copy and paste did not work in the connect dialog — the fields were fine, the
 * keystrokes never arrived.
 *
 * The edit entries use roles rather than custom actions so the OS wires them to its own selectors
 * and they keep working in every text field, present and future. About is intentionally a custom
 * action because it opens BloomMD's accessible in-app About dialog instead of the native default.
 */
export function installApplicationMenu(appName = "BloomMD", onAbout?: () => void): void {
  applicationName = appName;
  aboutHandler = onAbout;
  if (!menuListenerInstalled) {
    ApplicationMenu.on("application-menu-clicked", (event) => {
      const menuEvent = event as { data?: { action?: string } };
      if (menuEvent.data?.action === "open-about") aboutHandler?.();
    });
    menuListenerInstalled = true;
  }
  ApplicationMenu.setApplicationMenu(getApplicationMenu(applicationName, menuLocale));
}

export function setApplicationMenuLocale(locale: ApplicationMenuLocale): void {
  menuLocale = locale;
  ApplicationMenu.setApplicationMenu(getApplicationMenu(applicationName, menuLocale));
}
