export type AuthLocale = "de" | "en";

export function getAuthLocale(value: string | undefined | null): AuthLocale {
  return value?.toLowerCase() === "en" ? "en" : "de";
}

export function otherAuthLocale(locale: AuthLocale): AuthLocale {
  return locale === "de" ? "en" : "de";
}

export function languageLabel(locale: AuthLocale) {
  return locale === "de" ? "Deutsch" : "English";
}

export function roleLabel(role: "owner" | "editor" | "viewer", locale: AuthLocale) {
  if (role === "owner") return locale === "de" ? "Owner" : "Owner";
  if (role === "viewer") return locale === "de" ? "Viewer – nur lesen" : "Viewer – read only";
  return locale === "de" ? "Editor – lesen und bearbeiten" : "Editor – read and edit";
}

export function formatAuthDate(value: string, locale: AuthLocale) {
  return new Intl.DateTimeFormat(locale === "de" ? "de-DE" : "en-US", { dateStyle: "medium" }).format(new Date(value));
}

/** Form field of the signup consent checkbox; the server rejects a signup without it. */
export const SIGNUP_CONSENT_FIELD = "acceptTerms";
export const SIGNUP_CONSENT_REQUIRED_ERROR = "Bitte stimme der Datenschutzerklärung und den AGB zu.";
export const VERIFICATION_NOT_SENT_ERROR = "Bestätigungs-E-Mail konnte nicht gesendet werden.";

export function localizeAuthError(value: string, locale: AuthLocale) {
  if (locale === "de") return value;
  const messages: Record<string, string> = {
    "Diese E-Mail ist noch nicht für die Beta freigeschaltet.": "This email is not enabled for the beta yet.",
    "Der Einladungscode ist ungültig.": "The beta code is invalid.",
    "Bitte gib eine gültige E-Mail-Adresse ein.": "Enter a valid email address.",
    "Diese E-Mail ist für diese BloomMD-Instanz nicht freigeschaltet.": "This email is not allowed for this BloomMD instance.",
    "E-Mail oder Passwort ist falsch.": "The email or password is incorrect.",
    "Bitte gib dein Passwort ein.": "Enter your password.",
    "Das Passwort muss mindestens 10 Zeichen lang sein.": "The password must be at least 10 characters long.",
    "Bitte bestätige zuerst deine E-Mail-Adresse.": "Please confirm your email address first.",
    "Dieser Einladungsübergang ist ungültig oder abgelaufen.": "This invitation handoff is invalid or expired.",
    "Diese Workspace-Einladung ist nicht mehr aktiv.": "This workspace invitation is no longer active.",
    "Der Bestätigungslink ist ungültig oder abgelaufen.": "This confirmation link is invalid or expired.",
    "Der Reset-Link ist ungültig oder abgelaufen.": "This password reset link is invalid or expired.",
    "Passwort konnte nicht aktualisiert werden.": "The password could not be updated.",
    "Passwort konnte nicht zurückgesetzt werden.": "The password could not be reset.",
    "Passwort-Reset fehlgeschlagen.": "Password reset failed.",
    "Registrierung fehlgeschlagen.": "Sign-up failed.",
    "Login fehlgeschlagen.": "Sign-in failed.",
    [VERIFICATION_NOT_SENT_ERROR]: "The confirmation email could not be sent.",
    [SIGNUP_CONSENT_REQUIRED_ERROR]: "Please accept the privacy policy and the terms.",
    "Zu viele Versuche. Bitte warte kurz und versuche es erneut.": "Too many attempts. Please wait a moment and try again.",
    "Bitte lade die Seite neu und versuche es erneut.": "Reload the page and try again.",
    "E-Mail-Bestätigung oder Passwort ist nicht korrekt.": "Email confirmation or password is incorrect.",
  };
  const invitedEmail = value.match(/^Diese Einladung wurde an (.+) gesendet\.$/);
  if (invitedEmail) return `This invitation was sent to ${invitedEmail[1]}.`;
  return messages[value] ?? value;
}

export const authCopy = {
  de: {
    accountStep: "Account",
    verifyStep: "E-Mail bestätigen",
    startStep: "Starten",
    invitationStep: "Einladung",
    authStep: "Account oder Anmeldung",
    joinStep: "Beitreten",
    language: "Sprache",
    createAccount: "Account erstellen",
    accountSubtitle: "Lege deinen BloomMD-Account an. Danach bestätigst du deine E-Mail-Adresse.",
    consent: { before: "Ich habe die ", privacy: "Datenschutzerklärung", between: " und die ", terms: "AGB", after: " gelesen und stimme ihnen zu." },
    personalWorkspace: "Deine persönliche Arbeitsumgebung.",
    signIn: "Anmelden",
    alreadyRegistered: "Schon registriert?",
    name: "Name",
    email: "E-Mail",
    password: "Passwort",
    passwordHint: "Mindestens 10 Zeichen",
    checkInbox: "Prüfe deinen Posteingang",
    checkInboxText: (email: string) => `Wir haben eine Bestätigungs-E-Mail an ${email} gesendet.`,
    resendVerification: "E-Mail erneut senden",
    changeEmail: "E-Mail-Adresse ändern",
    betaAccess: "Beta-Zugang",
    betaAccessUnavailable: "Dein Cloud-Zugang ist noch nicht freigeschaltet.",
    betaAccessExplanation: "Der Beta-Zugang ist unabhängig von einer Workspace-Mitgliedschaft.",
    betaWaitlist: "Zur Beta-Warteliste",
    checkBetaAccess: "Zugang prüfen",
    betaEmailHint: "Gib die E-Mail-Adresse aus deiner Beta-Einladung ein.",
    betaCodeOptional: "Beta-Code (optional)",
    betaCodeHint: "Nur nötig, wenn du einen Code erhalten hast.",
    invitation: "Einladung zum Workspace",
    invitedBy: (inviter: string, workspace: string) => `${inviter} lädt dich zu „${workspace}“ ein.`,
    invitedEmail: (email: string) => `Eingeladen an: ${email}`,
    expires: (date: string) => `Läuft ab: ${date}`,
    createFromInvitation: "Account erstellen",
    signInAndJoin: "Anmelden und beitreten",
    joinWorkspace: "Workspace beitreten",
    continueAfterSignIn: (workspace: string, role: string) => `Du meldest dich an, um „${workspace}“ als ${role} beizutreten.`,
    invitationNotExpected: "Einladung nicht erwartet? Ignorieren",
    invitationInvalid: "Dieser Einladungslink ist ungültig oder nicht mehr verfügbar.",
    invitationExpired: "Diese Einladung ist abgelaufen.",
    invitationRevoked: "Diese Einladung wurde vom Workspace-Inhaber widerrufen.",
    invitationAccepted: "Du bist bereits Mitglied in diesem Workspace.",
    invitationEmailMismatch: (email: string, accountEmail: string) => `Diese Einladung wurde an ${email} gesendet. Du bist als ${accountEmail} angemeldet.`,
    signOutDifferentEmail: "Abmelden und mit eingeladener Adresse anmelden",
    contactInviter: "Einladenden um eine neue Einladung bitten",
    backToSignIn: "Zur Anmeldung",
    openWorkspace: "Workspace öffnen",
    invitationPending: "Nach der Anmeldung bestätigst du den Beitritt ausdrücklich.",
    signInSubtitle: "Mit deinem BloomMD-Account weiterarbeiten.",
    passwordForgotten: "Passwort vergessen?",
    noAccount: "Noch kein Account?",
    directLoginRecovery: "Bestätigungs-E-Mail erneut senden",
    logout: "Abmelden",
    invitationJoinFailed: "Workspace-Einladung konnte nicht angenommen werden.",
    invitationRole: "Deine Rolle",
    workspace: "Workspace",
    invitedEmailLabel: "Eingeladene E-Mail",
    expiresLabel: "Ablaufdatum",
    invitationStatus: "Einladungsstatus",
    emailMismatchDetail: "Melde dich ab und verwende die eingeladene Adresse.",
    invalidHandoff: "Dieser Einladungsübergang ist ungültig oder abgelaufen.",
  },
  en: {
    accountStep: "Account",
    verifyStep: "Confirm email",
    startStep: "Start",
    invitationStep: "Invitation",
    authStep: "Account or sign in",
    joinStep: "Join",
    language: "Language",
    createAccount: "Create account",
    accountSubtitle: "Create your BloomMD account. Then confirm your email address.",
    consent: { before: "I have read the ", privacy: "privacy policy", between: " and the ", terms: "terms", after: " and agree to them." },
    personalWorkspace: "Your personal workspace.",
    signIn: "Sign in",
    alreadyRegistered: "Already registered?",
    name: "Name",
    email: "Email",
    password: "Password",
    passwordHint: "At least 10 characters",
    checkInbox: "Check your inbox",
    checkInboxText: (email: string) => `We sent a confirmation email to ${email}.`,
    resendVerification: "Resend confirmation email",
    changeEmail: "Change email address",
    betaAccess: "Beta access",
    betaAccessUnavailable: "Your cloud access is not enabled yet.",
    betaAccessExplanation: "Beta access is separate from workspace membership.",
    betaWaitlist: "Join the beta waitlist",
    checkBetaAccess: "Check access",
    betaEmailHint: "Enter the email address from your beta invitation.",
    betaCodeOptional: "Beta code (optional)",
    betaCodeHint: "Only needed if you received a code.",
    invitation: "Workspace invitation",
    invitedBy: (inviter: string, workspace: string) => `${inviter} invited you to “${workspace}”.`,
    invitedEmail: (email: string) => `Invited email: ${email}`,
    expires: (date: string) => `Expires: ${date}`,
    createFromInvitation: "Create account",
    signInAndJoin: "Sign in and join",
    joinWorkspace: "Join workspace",
    continueAfterSignIn: (workspace: string, role: string) => `You are signing in to join “${workspace}” as ${role}.`,
    invitationNotExpected: "Not expecting this invitation? Ignore it",
    invitationInvalid: "This invitation link is invalid or no longer available.",
    invitationExpired: "This invitation has expired.",
    invitationRevoked: "This invitation was revoked by the workspace owner.",
    invitationAccepted: "You are already a member of this workspace.",
    invitationEmailMismatch: (email: string, accountEmail: string) => `This invitation was sent to ${email}. You are signed in as ${accountEmail}.`,
    signOutDifferentEmail: "Sign out and use the invited email",
    contactInviter: "Ask the inviter for a new invitation",
    backToSignIn: "Back to sign in",
    openWorkspace: "Open workspace",
    invitationPending: "After signing in, you explicitly confirm whether you want to join.",
    signInSubtitle: "Continue with your BloomMD account.",
    passwordForgotten: "Forgot password?",
    noAccount: "No account yet?",
    directLoginRecovery: "Resend confirmation email",
    logout: "Sign out",
    invitationJoinFailed: "The workspace invitation could not be accepted.",
    invitationRole: "Your role",
    workspace: "Workspace",
    invitedEmailLabel: "Invited email",
    expiresLabel: "Expiration",
    invitationStatus: "Invitation status",
    emailMismatchDetail: "Sign out and use the invited email address.",
    invalidHandoff: "This invitation handoff is invalid or expired.",
  },
} as const;

export type AuthCopy = (typeof authCopy)[AuthLocale];
