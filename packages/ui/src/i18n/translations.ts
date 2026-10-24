export type Locale = "de" | "en";

export interface Translations {
  // App
  retryLayout: string;
  layoutInProgress: string;
  layoutFailed: string;
  loading: string;
  // File operations
  newMindmap: string;
  save: string;
  saved: string;
  saveFailed: string;
  reload: string;
  importMd: string;
  exportMd: string;
  shareReadOnlyLink: string;
  documentActions: string;
  fileActions: string;
  newFolder: string;
  openFileBrowser: string;
  changeFolder: string;
  share: string;
  // Mindmaps
  mindmaps: string;
  noMindmapsFound: string;
  newMindmapPrompt: string;
  searchMindmaps: string;
  noSearchResults: string;
  commandPalette: string;
  commandPlaceholder: string;
  categoryCommands: string;
  categoryNodes: string;
  // Node editor
  children: string;
  level: string;
  nodeType: string;
  nodeKindTopic: string;
  nodeKindTopicHint: string;
  nodeKindWorkspace: string;
  nodeKindWorkspaceHint: string;
  nodeKindFolder: string;
  nodeKindFolderHint: string;
  nodeKindPortal: string;
  nodeKindPortalHint: string;
  nodeKindWeb: string;
  nodeKindWebHint: string;
  nodeKindFile: string;
  nodeKindFileHint: string;
  nodeKindPdf: string;
  nodeKindPdfHint: string;
  nodeKindSource: string;
  nodeKindSourceHint: string;
  nodeKindTask: string;
  nodeKindTaskHint: string;
  nodeKindDecision: string;
  nodeKindDecisionHint: string;
  readOnlyMessage: string;
  workspaceOverviewReadOnly: string;
  openSourceFile: string;
  deleteNodeBranch: string;
  workspaceSource: string;
  folderPath: string;
  files: string;
  folder: string;
  ownerRole: string;
  editorRole: string;
  viewerRole: string;
  sections: string;
  workspaceDescription: string;
  folderDescription: string;
  pdfPath: string;
  filePath: string;
  noFileSelected: string;
  chooseFile: string;
  open: string;
  fileResourceDescription: string;
  pdfResourceDescription: string;
  loadingPreview: string;
  noInlinePreview: string;
  target: string;
  noMapSelected: string;
  loadPreview: string;
  loadWebsitePreview: string;
  savedPreview: string;
  openUrl: string;
  targetMap: string;
  selectMap: string;
  optional: string;
  citation: string;
  citationPlaceholder: string;
  status: string;
  openStatus: string;
  inProgressStatus: string;
  doneStatus: string;
  decisionStatus: string;
  proposedStatus: string;
  acceptedStatus: string;
  rejectedStatus: string;
  linksAndReferences: string;
  resources: string;
  preview: string;
  copyLink: string;
  openLink: string;
  targetNode: string;
  ambiguousReference: string;
  targetNotFound: string;
  backlinkFrom: string;
  workspaceReference: string;
  content: string;
  fileContentDescription: string;
  derivedContentDescription: string;
  resourceContentDescription: string;
  editorLoading: string;
  editorWidth: string;
  // Shared actions and states
  cancel: string;
  close: string;
  recent: string;
  favorite: string;
  removeFavorite: string;
  rootDirectory: string;
  name: string;
  createdAs: string;
  createEntryInvalidChars: string;
  createEntryControlChars: string;
  createEntryPathEscape: string;
  createEntryRelativePath: string;
  createEntryFolderPlaceholder: string;
  createEntryFilePlaceholder: string;
  createEntryFolderDescription: string;
  createEntryFileDescription: string;
  createEntryBusy: string;
  create: string;
  conflictAriaLabel: string;
  conflictTitle: string;
  conflictDescription: string;
  conflictStoredColor: string;
  conflictMineColor: string;
  conflictStats: string;
  conflictUnchangedLines: string;
  conflictLoadStored: string;
  conflictSaveCopy: string;
  conflictKeepMine: string;
  syncOffline: string;
  syncConnecting: string;
  syncReconnecting: string;
  syncConnected: string;
  syncFailed: string;
  syncFailureFileNotFound: string;
  syncFailureRoomCapacity: string;
  syncFailureAccessRevoked: string;
  syncFailureUnauthorized: string;
  syncFailureTicketRefresh: string;
  syncFailureExhausted: string;
  syncTitle: string;
  user: string;
  users: string;
  graphPerspective: string;
  individualLayers: string;
  presetStructure: string;
  presetStructureHint: string;
  presetReferences: string;
  presetReferencesHint: string;
  presetKnowledge: string;
  presetKnowledgeHint: string;
  layerFolders: string;
  layerFoldersHint: string;
  layerReferences: string;
  layerReferencesHint: string;
  layerBacklinks: string;
  layerBacklinksHint: string;
  layerBacklinksUnavailable: string;
  layerBrokenLinks: string;
  layerBrokenLinksHint: string;
  workspaceMapEmpty: string;
  canvasModes: string;
  mindMap: string;
  outline: string;
  presentation: string;
  edgeMode: string;
  structure: string;
  links: string;
  backlinks: string;
  allRelations: string;
  undo: string;
  redo: string;
  focusBranch: string;
  exitFocus: string;
  copyBranches: string;
  pasteBranches: string;
  saveLocalView: string;
  loadSavedView: string;
  views: string;
  renameSavedView: string;
  deleteSavedView: string;
  viewNamePrompt: string;
  deleteSavedViewConfirm: string;
  dropBefore: string;
  dropAfter: string;
  dropInside: string;
  dismissMessage: string;
  previousNode: string;
  nextNode: string;
  openWebsite: string;
  website: string;
  link: string;
  linksPlural: string;
  toggleTask: string;
  dueDate: string;
  handwriting: string;
  newDrawing: string;
  editDrawing: string;
  drawingUnavailable: string;
  handwritingSaveFailed: string;
  drawingSavedAsCopy: string;
  drawingNewerFormat: string;
  responsible: string;
  decidedBy: string;
  overdueSince: string;
  addChild: string;
  addSibling: string;
  editNodeContent: string;
  openResource: string;
  newNodeTitle: string;
  nodeUrlMissing: string;
  nodeUrlProtocol: string;
  nodeUrlInvalid: string;
  missingFileResource: string;
  missingMapResource: string;
  researchTemplate: string;
  projectTemplate: string;
  template: string;
  resourceSingular: string;
  resourcesPlural: string;
  researchPlan: string;
  researchIntro: string;
  sources: string;
  addSources: string;
  claims: string;
  breakFindings: string;
  nextSteps: string;
  reviewSources: string;
  summarizeFindings: string;
  projectPlan: string;
  projectIntro: string;
  milestones: string;
  defineMvp: string;
  validateWorkflow: string;
  risks: string;
  trackRisks: string;
  tasks: string;
  firstTask: string;
  updateInstallFailed: string;
  noUrl: string;
  urlOpenFailed: string;
  previewUnavailable: string;
  mapsUnavailable: string;
  mapUnavailable: string;
  previewServiceError: string;
  localPreviewUnavailable: string;
  unsupportedResource: string;
  resourceSelectionFailed: string;
  filesLoadFailed: string;
  workspaceEntriesSkipped: string;
  workspacesLoadFailed: string;
  workspaceAccessLoading: string;
  workspaceReadOnly: string;
  derivedWorkspaceSave: string;
  documentConflict: string;
  syncRoomActive: string;
  syncRoomSaveFailed: string;
  fileSaveFailed: string;
  renameConflict: string;
  renameFailed: string;
  deleteFailed: string;
  derivedWorkspaceExport: string;
  connectionFailed: string;
  connectionProfileStorageUnavailable: string;
  workspaceSwitchFailed: string;
  feedbackIssueCreated: string;
  feedbackSendFailed: string;
  role: string;
  disconnect: string;
  connectServer: string;
  localWorkspace: string;
  connectionProfileAdd: string;
  connectionProfileManage: string;
  connectionProfileName: string;
  connectionProfileNamePlaceholder: string;
  connectionProfileTokenStored: string;
  connectionProfileSave: string;
  connectionProfileSaveAndConnect: string;
  connectionProfileEdit: string;
  connectionProfileDelete: string;
  connectionProfileDeleteConfirm: string;
  connectionProfileSaveFailed: string;
  connectionProfileDeleteFailed: string;
  connectionSwitchFailed: string;
  connectionProfileEmpty: string;
  workspace: string;
  backToWorkspace: string;
  forwardToFile: string;
  workspacesLoading: string;
  noMarkdownFiles: string;
  emptyWorkspace: string;
  createMarkdown: string;
  reconnectFailedMessage: string;
  reconnect: string;
  feedbackTitle: string;
  feedbackDescription: string;
  feedbackType: string;
  feedbackContactOptional: string;
  feedbackAccountUsed: string;
  feedbackEmailPlaceholder: string;
  feedbackDescriptionLabel: string;
  feedbackDescriptionPlaceholder: string;
  feedbackScreenshotsOptional: string;
  feedbackVideoOptional: string;
  feedbackLocalNote: string;
  feedbackSending: string;
  feedbackSend: string;
  feedbackMinLength: string;
  feedbackMaxScreenshots: string;
  feedbackScreenshotSize: string;
  feedbackVideoSize: string;
  resourcePreviewFailed: string;
  serverUrl: string;
  accessToken: string;
  connecting: string;
  connect: string;
  feedbackBug: string;
  feedbackUx: string;
  feedbackIdea: string;
  feedbackQuestion: string;
  healthTitle: string;
  healthFileSingular: string;
  healthFilesPlural: string;
  healthErrorSingular: string;
  healthErrorsPlural: string;
  healthWarningSingular: string;
  healthWarningsPlural: string;
  healthInfo: string;
  healthClose: string;
  healthRoundtrip: string;
  healthOrphans: string;
  healthNothingFound: string;
  healthLine: string;
  healthCliNote: string;
  // Help modal
  helpTitle: string;
  helpVersion: string;
  aboutTitle: string;
  aboutClose: string;
  aboutTagline: string;
  aboutBetaBadge: string;
  aboutVersionLoading: string;
  aboutLocalFirst: string;
  aboutWebLocalFirst: string;
  aboutPositioning: string;
  aboutTechnologies: string;
  aboutTechnologiesDescription: string;
  aboutWebTechnologiesDescription: string;
  aboutLegal: string;
  aboutImprint: string;
  aboutPrivacy: string;
  aboutLicenses: string;
  aboutDocumentation: string;
  aboutSupport: string;
  aboutBetaStatus: string;
  aboutBetaStatusDescription: string;
  aboutBetaMac: string;
  aboutBetaWeb: string;
  aboutBetaMobile: string;
  aboutBetaCollaboration: string;
  aboutBetaObsidian: string;
  aboutBuildDetails: string;
  aboutBuildTag: string;
  aboutBuildSha: string;
  aboutBuildTime: string;
  aboutBuildChannel: string;
  aboutBuildPackage: string;
  aboutBuildDeployment: string;
  aboutUpdateNote: string;
  aboutWebUpdateNote: string;
  aboutUpdates: string;
  aboutUpdateChecking: string;
  aboutUpdateAvailable: string;
  aboutUpdateReady: string;
  aboutUpdateNone: string;
  aboutUpdateError: string;
  aboutCheckForUpdates: string;
  aboutDownloadUpdate: string;
  aboutInstallUpdate: string;
  aboutUpdateProgress: string;
  categoryFile: string;
  categoryEdit: string;
  categoryNav: string;
  categoryHelp: string;
  helpAndSettings: string;
  gettingStarted: string;
  documentation: string;
  feedback: string;
  account: string;
  shortcutNew: string;
  shortcutUndo: string;
  shortcutRedo: string;
  shortcutSave: string;
  shortcutReload: string;
  shortcutFileBrowser: string;
  shortcutCommandPalette: string;
  shortcutImport: string;
  shortcutExport: string;
  shortcutRename: string;
  shortcutAddChild: string;
  shortcutAddSibling: string;
  shortcutEditContent: string;
  shortcutDelete: string;
  shortcutBackToWorkspace: string;
  shortcutForwardToFile: string;
  shortcutBackToCanvas: string;
  shortcutSelectNode: string;
  shortcutSelectChild: string;
  shortcutSelectParent: string;
  shortcutSelectNextSibling: string;
  shortcutSelectPreviousSibling: string;
  shortcutZoom: string;
  shortcutPan: string;
  shortcutShowHelp: string;
  shortcutDoubleClick: string;
  shortcutClick: string;
  shortcutScrollPinch: string;
  shortcutDragBackground: string;
  // Context menu
  rename: string;
  renameMindmapTitle: string;
  renameMindmapDescription: string;
  renameMindmapCurrentFile: string;
  renameMindmapTitleLabel: string;
  renameMindmapNewFile: string;
  renameMindmapBusy: string;
  deleteMindmap: string;
  confirmDelete: string;
  confirmDeleteMessage: string;
  // Theme
  theme: string;
  lightMode: string;
  darkMode: string;
  // Language
  language: string;
}

export const translations: Record<Locale, Translations> = {
  de: {
    retryLayout: "Erneut versuchen",
    layoutInProgress: "Mindmap wird angeordnet …",
    layoutFailed: "Die Mindmap konnte nicht angeordnet werden. Bitte erneut versuchen.",
    loading: "Laden...",
    newMindmap: "Neue Mindmap",
    save: "Speichern",
    saved: "Gespeichert",
    saveFailed: "Speichern fehlgeschlagen",
    reload: "Neu laden (von Festplatte)",
    importMd: "Markdown importieren",
    exportMd: "Markdown exportieren",
    shareReadOnlyLink: "Lese-Links für Kolleg:innen",
    documentActions: "Dokumentaktionen",
    fileActions: "Dateiaktionen",
    newFolder: "Neuen Ordner anlegen",
    openFileBrowser: "Datei-Browser",
    changeFolder: "Ordner wechseln...",
    share: "Teilen",
    mindmaps: "Mindmaps",
    noMindmapsFound: "Keine Mindmaps gefunden.",
    newMindmapPrompt: "Name der neuen Mindmap:",
    searchMindmaps: "Mindmaps suchen...",
    noSearchResults: "Keine Treffer gefunden.",
    commandPalette: "Command Palette",
    commandPlaceholder: "Mindmap, Node oder Aktion suchen...",
    categoryCommands: "Aktionen",
    categoryNodes: "Nodes",
    children: "Kinder",
    level: "Level",
    nodeType: "Typ",
    nodeKindTopic: "Thema / Notiz",
    nodeKindTopicHint: "Ein Markdown-Abschnitt mit bearbeitbaren Notizen.",
    nodeKindWorkspace: "Workspace",
    nodeKindWorkspaceHint: "Abgeleitete Ansicht eines geöffneten Ordners oder Cloud-Workspaces.",
    nodeKindFolder: "Ordner",
    nodeKindFolderHint: "Ein Container aus der Workspace-Struktur. Inhalte werden über Dateien bearbeitet.",
    nodeKindPortal: "Map-Verweis",
    nodeKindPortalHint: "Springt zu einer anderen BloomMD-Map oder zu einem konkreten Node.",
    nodeKindWeb: "Webseite",
    nodeKindWebHint: "Externe Web-Ressource mit URL und optionaler Vorschau.",
    nodeKindFile: "Datei",
    nodeKindFileHint: "Eine Datei aus dem geöffneten Workspace. Bilder werden direkt als Vorschau angezeigt.",
    nodeKindPdf: "PDF-Dokument",
    nodeKindPdfHint: "Lokale oder externe PDF-Datei als Ressource.",
    nodeKindSource: "Quelle / Zitat",
    nodeKindSourceHint: "Referenz mit URL, Vorschau und Zitierhinweis.",
    nodeKindTask: "Aufgabe",
    nodeKindTaskHint: "Ein Action Item mit Status und bearbeitbaren Notizen.",
    nodeKindDecision: "Entscheidung",
    nodeKindDecisionHint: "Ein Entscheidungsprotokoll mit Status und Begründung.",
    workspaceOverviewReadOnly: "Die Workspace-Übersicht ist nur lesbar. Öffne die Quelldatei zum Bearbeiten.",
    openSourceFile: "Quelldatei öffnen",
    readOnlyMessage: "Dieser Workspace ist schreibgeschützt. Du kannst Änderungen ansehen, aber nicht speichern.",
    deleteNodeBranch: "Node und Unterstruktur löschen",
    workspaceSource: "Workspace-Quelle",
    folderPath: "Ordnerpfad",
    files: "Dateien",
    folder: "Ordner",
    ownerRole: "Owner",
    editorRole: "Editor",
    viewerRole: "Viewer",
    sections: "Abschnitte",
    workspaceDescription: "Diese Ansicht wird aus den Markdown-Dateien im Workspace erzeugt und nicht als eigene Markdown-Datei gespeichert.",
    folderDescription: "Dieser Ordner ist Teil der Workspace-Struktur. Bearbeite Inhalte in den enthaltenen Markdown-Dateien.",
    pdfPath: "PDF-Pfad",
    filePath: "Dateipfad",
    noFileSelected: "Keine Datei ausgewählt",
    chooseFile: "Datei wählen",
    open: "Öffnen",
    fileResourceDescription: "Dieser Node verweist auf eine Datei im Workspace. Bilder werden hier als Vorschau angezeigt; andere Dateien kannst du öffnen.",
    pdfResourceDescription: "Dieser Node verweist auf ein PDF. Die PDF-Vorschau zeigt die Datei, Notizen dazu gehören in einen Themen-, Quellen- oder Notiz-Node.",
    loadingPreview: "Vorschau laden...",
    noInlinePreview: "Für diesen Dateityp gibt es keine Inline-Vorschau. Nutze Öffnen, um die Datei extern anzuzeigen.",
    target: "Ziel",
    noMapSelected: "Keine Map ausgewählt",
    loadPreview: "Vorschau laden...",
    loadWebsitePreview: "Website-Vorschau laden",
    savedPreview: "Gespeicherte Vorschau",
    openUrl: "URL öffnen",
    targetMap: "Ziel-Map",
    selectMap: "Map auswählen",
    optional: "Optional",
    citation: "Zitat",
    citationPlaceholder: "Autor, Titel, Jahr",
    status: "Status",
    openStatus: "Offen",
    inProgressStatus: "In Bearbeitung",
    doneStatus: "Erledigt",
    decisionStatus: "Entscheidungsstatus",
    proposedStatus: "Vorgeschlagen",
    acceptedStatus: "Akzeptiert",
    rejectedStatus: "Abgelehnt",
    linksAndReferences: "Links und Verweise",
    resources: "Ressourcen",
    preview: "Vorschau",
    copyLink: "Link kopieren",
    openLink: "Link öffnen",
    targetNode: "Ziel-Node-ID",
    ambiguousReference: "Mehrdeutiger Verweis",
    targetNotFound: "Ziel nicht gefunden",
    backlinkFrom: "Backlink von %title%",
    workspaceReference: "Workspace-Referenz",
    content: "Inhalt",
    fileContentDescription: "Dieser Node steht für eine Datei. Bearbeitbare Inhalte liegen in den daraus abgeleiteten Abschnitts-Nodes.",
    derivedContentDescription: "Diese Ansicht ist aus dem Workspace abgeleitet. Inhalte werden in den einzelnen Markdown-Dateien bearbeitet.",
    resourceContentDescription: "Diese Ressource hat keinen eigenen Markdown-Inhalt im Panel.",
    editorLoading: "Editor wird geladen",
    editorWidth: "Editorbreite ändern",
    cancel: "Abbrechen",
    close: "Schließen",
    recent: "Zuletzt verwendet",
    favorite: "Favorit",
    removeFavorite: "Favorit entfernen",
    rootDirectory: "(Wurzelverzeichnis)",
    name: "Name",
    createdAs: "Wird angelegt als",
    createEntryInvalidChars: "Diese Zeichen sind in Datei- und Ordnernamen nicht erlaubt: \\ : * ? \" < > |",
    createEntryControlChars: "Der Name enthält Steuerzeichen.",
    createEntryPathEscape: "Der Pfad darf das Verzeichnis nicht verlassen.",
    createEntryRelativePath: "Der Pfad muss relativ zum Workspace sein.",
    createEntryFolderPlaceholder: "Kapitel oder Buch/Teil-1",
    createEntryFilePlaceholder: "Notiz",
    createEntryFolderDescription: "Ein echtes Verzeichnis — es bleibt sichtbar, wenn du den Ordner in Obsidian öffnest oder nach git committest.",
    createEntryFileDescription: "Eine gewöhnliche Markdown-Datei. Ein Schrägstrich im Namen legt Unterordner an.",
    createEntryBusy: "Wird angelegt…",
    create: "Anlegen",
    conflictAriaLabel: "Speicherkonflikt",
    conflictTitle: "Diese Datei wurde zwischenzeitlich geändert",
    conflictDescription: "%filename% wurde gespeichert, während du daran gearbeitet hast. Unten steht, was sich unterscheidet.",
    conflictStoredColor: "rot ist die gespeicherte Fassung",
    conflictMineColor: "grün ist deine",
    conflictStats: "%added% Zeilen deinerseits · %removed% Zeilen gespeichert · %unchanged% unverändert",
    conflictUnchangedLines: "… %count% unveränderte Zeilen",
    conflictLoadStored: "Gespeicherte Fassung laden",
    conflictSaveCopy: "Als Kopie speichern",
    conflictKeepMine: "Meine Fassung behalten",
    syncOffline: "Offline",
    syncConnecting: "Verbinde...",
    syncReconnecting: "Verbinde erneut...",
    syncConnected: "Synchronisiert",
    syncFailed: "Verbindung fehlgeschlagen",
  syncFailureFileNotFound: "Workspace-Datei nicht gefunden",
  syncFailureRoomCapacity: "Workspace ist voll",
  syncFailureAccessRevoked: "Zugriff auf diesen Workspace wurde entzogen",
  syncFailureUnauthorized: "Zugriff nicht autorisiert",
    syncFailureTicketRefresh: "Sync-Ticket konnte nicht erneuert werden",
    syncFailureExhausted: "Verbindung konnte nicht wiederhergestellt werden",
    syncTitle: "Sync: %status% (%count% %users%)",
    user: "Nutzer",
    users: "Nutzer",
    graphPerspective: "Kartenperspektive",
    individualLayers: "Einzelne Layer",
    presetStructure: "Struktur",
    presetStructureHint: "Ordner, Dateien und ihre Gliederung — die bewusst gewählte Ordnung",
    presetReferences: "Referenzen",
    presetReferencesHint: "Nur die Verweise zwischen Dateien, ohne Ordnergerüst",
    presetKnowledge: "Wissen",
    presetKnowledgeHint: "Struktur und Verweise zusammen",
    layerFolders: "Ordner",
    layerFoldersHint: "Ordner und ihre Dateien",
    layerReferences: "Verweise",
    layerReferencesHint: "Aufgelöste Links zwischen Dateien",
    layerBacklinks: "Backlinks",
    layerBacklinksHint: "Was auf die Auswahl verweist",
    layerBacklinksUnavailable: "Erst eine Datei auswählen",
    layerBrokenLinks: "Defekt",
    layerBrokenLinksHint: "Links ohne eindeutiges Ziel",
    workspaceMapEmpty: "Dieser Workspace enthält noch keine Markdown-Dateien.",
    canvasModes: "Canvas-Modi",
    mindMap: "Mindmap",
    outline: "Gliederung",
    presentation: "Präsentation",
    edgeMode: "Kantenmodus",
    structure: "Struktur",
    links: "Links",
    backlinks: "Backlinks",
    allRelations: "Alle Beziehungen",
    undo: "Rückgängig",
    redo: "Wiederholen",
    focusBranch: "Zweig fokussieren",
    exitFocus: "Fokus verlassen",
    copyBranches: "Ausgewählte Zweige kopieren",
    pasteBranches: "Zweige einfügen",
    saveLocalView: "Lokale Ansicht speichern",
    loadSavedView: "Gespeicherte Ansicht laden",
    views: "Ansichten",
    renameSavedView: "Gespeicherte Ansicht umbenennen",
    deleteSavedView: "Gespeicherte Ansicht löschen",
    viewNamePrompt: "Name der Ansicht",
    deleteSavedViewConfirm: "Gespeicherte Ansicht „%name%“ löschen?",
    dropBefore: "Davor ablegen",
    dropAfter: "Danach ablegen",
    dropInside: "Als Unterknoten ablegen",
    dismissMessage: "Meldung schließen",
    previousNode: "Vorheriger Node",
    nextNode: "Nächster Node",
    openWebsite: "Website öffnen",
    website: "Website",
    link: "Link",
    linksPlural: "Links",
    toggleTask: "Aufgabe umschalten",
    dueDate: "Fällig am",
    handwriting: "Handschrift",
    newDrawing: "Neue Zeichnung",
    editDrawing: "Zeichnung bearbeiten",
    drawingUnavailable: "Zeichnung nicht verfügbar",
    handwritingSaveFailed: "Die Zeichnung konnte nicht gespeichert werden.",
    drawingSavedAsCopy: "Die Zeichnung wurde auf einem anderen Gerät geändert. Deine Version ist als eigene Zeichnung gesichert:",
    drawingNewerFormat: "Mit einer neueren BloomMD-Version erstellt – nur ansehen",
    responsible: "Verantwortlich",
    decidedBy: "Entschieden von",
    overdueSince: "Überfällig seit",
    addChild: "Kind-Node erstellen",
    addSibling: "Sibling-Node erstellen",
    editNodeContent: "Node-Inhalt bearbeiten",
    openResource: "Ressource öffnen",
    newNodeTitle: "Neuer Node",
    nodeUrlMissing: "Für diesen Node ist keine URL hinterlegt.",
    nodeUrlProtocol: "Die URL muss mit http:// oder https:// beginnen.",
    nodeUrlInvalid: "Die URL ist ungültig.",
    missingFileResource: "Für diesen Node ist keine Datei ausgewählt.",
    missingMapResource: "Für diesen Map-Verweis ist keine Ziel-Map ausgewählt.",
    researchTemplate: "Neue Recherchevorlage",
    projectTemplate: "Neue Projektvorlage",
    template: "Vorlage",
    resourceSingular: "Ressource",
    resourcesPlural: "Ressourcen",
    researchPlan: "Rechercheplan",
    researchIntro: "Zentrale Frage und Arbeitsnotizen.",
    sources: "Quellen",
    addSources: "URLs, Papers und Referenzen hier ergänzen.",
    claims: "Aussagen",
    breakFindings: "Ergebnisse in überprüfbare Aussagen aufteilen.",
    nextSteps: "Nächste Schritte",
    reviewSources: "Quellen prüfen",
    summarizeFindings: "Ergebnisse zusammenfassen",
    projectPlan: "Projektplan",
    projectIntro: "Projektziel und Umfang.",
    milestones: "Meilensteine",
    defineMvp: "MVP definieren",
    validateWorkflow: "Workflow validieren",
    risks: "Risiken",
    trackRisks: "Offene Risiken und Entscheidungen verfolgen.",
    tasks: "Aufgaben",
    firstTask: "Erste Aufgabe",
    updateInstallFailed: "Update konnte nicht installiert werden.",
    noUrl: "Keine URL hinterlegt.",
    urlOpenFailed: "URL konnte nicht geöffnet werden.",
    previewUnavailable: "Vorschau ist in dieser Umgebung nicht verfügbar.",
    mapsUnavailable: "Maps sind nicht verfügbar.",
    mapUnavailable: "Map ist nicht verfügbar.",
    previewServiceError: "Vorschau-Service meldet HTTP",
    localPreviewUnavailable: "Für diese lokale Datei ist aktuell keine Vorschau verfügbar.",
    unsupportedResource: "Dieser Ressourcentyp wird nicht unterstützt.",
    resourceSelectionFailed: "Ressource konnte nicht ausgewählt werden.",
    filesLoadFailed: "Dateien konnten nicht geladen werden.",
    workspaceEntriesSkipped: "Einige Dateien oder Ordner konnten nicht geladen werden. Die übrigen Dateien bleiben verfügbar:",
    workspacesLoadFailed: "Workspaces konnten nicht geladen werden.",
    workspaceAccessLoading: "Workspace-Berechtigung wird noch geladen.",
    workspaceReadOnly: "Dieser Workspace ist schreibgeschützt (Viewer).",
    derivedWorkspaceSave: "Workspace-Ansichten sind abgeleitet. Öffne einen Datei-Node, um die Markdown-Datei zu bearbeiten und zu speichern.",
    documentConflict: "Das Dokument wurde in der Cloud geändert. Lade es vor dem Speichern neu.",
    syncRoomActive: "Dieses Dokument ist aktuell in einer Sync-Sitzung geöffnet. Änderungen werden über die Verbindung gespeichert.",
    syncRoomSaveFailed: "Synchronisation nicht verfügbar. Lokale Änderung bleibt erhalten; später erneut speichern.",
    fileSaveFailed: "Datei konnte nicht gespeichert werden.",
    renameConflict: "Der gewünschte Dateiname ist bereits vergeben.",
    renameFailed: "Mindmap konnte nicht umbenannt werden.",
    deleteFailed: "Mindmap konnte nicht gelöscht werden.",
    derivedWorkspaceExport: "Workspace-Ansichten werden nicht als einzelne Markdown-Datei exportiert. Öffne einen Datei-Node für den Datei-Export.",
    connectionFailed: "Verbindung fehlgeschlagen",
    connectionProfileStorageUnavailable: "Der Linux-Schlüsselbund ist nicht verfügbar oder gesperrt. Bitte starte oder entsperre einen Secret-Service-Anbieter und versuche es erneut.",
    workspaceSwitchFailed: "Workspace konnte nicht gewechselt werden.",
    feedbackIssueCreated: "Danke, dein Feedback ist als Issue #%number% angekommen.",
    feedbackSendFailed: "Feedback konnte nicht gesendet werden.",
    role: "Rolle",
    disconnect: "Trennen",
    connectServer: "Mit Server verbinden",
    localWorkspace: "Lokal",
    connectionProfileAdd: "Server hinzufügen",
    connectionProfileManage: "Server verwalten",
    connectionProfileName: "Profilname",
    connectionProfileNamePlaceholder: "z. B. Team-Server",
    connectionProfileTokenStored: "Zugriffstoken ist sicher gespeichert",
    connectionProfileSave: "Nur speichern",
    connectionProfileSaveAndConnect: "Speichern und verbinden",
    connectionProfileEdit: "Serverprofil bearbeiten",
    connectionProfileDelete: "Löschen",
    connectionProfileDeleteConfirm: "Serverprofil wirklich löschen? Der gespeicherte Zugriffstoken wird ebenfalls entfernt.",
    connectionProfileSaveFailed: "Serverprofil konnte nicht gespeichert werden.",
    connectionProfileDeleteFailed: "Serverprofil konnte nicht gelöscht werden.",
    connectionSwitchFailed: "Verbindung konnte nicht gewechselt werden.",
    connectionProfileEmpty: "Noch kein Serverprofil gespeichert.",
    workspace: "Workspace",
    backToWorkspace: "Zur Workspace-Übersicht",
    forwardToFile: "Zur zuletzt geöffneten Datei",
    workspacesLoading: "Workspaces laden…",
    noMarkdownFiles: "Keine Markdown-Dateien",
    emptyWorkspace: "Dieser Workspace ist leer.",
    createMarkdown: "Markdown anlegen",
    reconnectFailedMessage: "war beim Start nicht erreichbar. BloomMD arbeitet lokal weiter — deine Server-Einstellung ist gespeichert.",
    reconnect: "Erneut verbinden",
    feedbackTitle: "Beta-Feedback",
    feedbackDescription: "Version, macOS und ausgewählter Node-Typ werden mitgesendet. Markdown-Inhalte, Tokens und lokale absolute Pfade werden nicht automatisch übertragen.",
    feedbackType: "Typ",
    feedbackContactOptional: "Kontakt optional",
    feedbackAccountUsed: "Account wird verwendet",
    feedbackEmailPlaceholder: "deine@adresse.de",
    feedbackDescriptionLabel: "Beschreibung",
    feedbackDescriptionPlaceholder: "Was ist passiert, was hast du erwartet, und welche Aktion war beteiligt?",
    feedbackScreenshotsOptional: "Screenshots optional",
    feedbackVideoOptional: "Video optional",
    feedbackLocalNote: "Lokales Feedback wird anonym an BloomMD gesendet. Eine Kontaktadresse ist freiwillig.",
    feedbackSending: "Senden...",
    feedbackSend: "Feedback senden",
    feedbackMinLength: "Bitte beschreibe dein Feedback mit mindestens 10 Zeichen.",
    feedbackMaxScreenshots: "Bitte wähle maximal drei Screenshots.",
    feedbackScreenshotSize: "Screenshots dürfen maximal 10 MB groß sein.",
    feedbackVideoSize: "Das Video darf maximal 50 MB groß sein.",
    resourcePreviewFailed: "Ressourcen-Vorschau konnte nicht geladen werden.",
    serverUrl: "Server-URL",
    accessToken: "Persönliches Zugriffstoken",
    connecting: "Verbinde...",
    connect: "Verbinden",
    feedbackBug: "Bug",
    feedbackUx: "UX",
    feedbackIdea: "Idee",
    feedbackQuestion: "Frage",
    healthTitle: "Workspace-Prüfung",
    healthFileSingular: "Datei",
    healthFilesPlural: "Dateien",
    healthErrorSingular: "Fehler",
    healthErrorsPlural: "Fehler",
    healthWarningSingular: "Warnung",
    healthWarningsPlural: "Warnungen",
    healthInfo: "Hinweis",
    healthClose: "Prüfung schließen",
    healthRoundtrip: "Speicher-Sicherheit prüfen",
    healthOrphans: "Seiten ohne Verbindung",
    healthNothingFound: "Nichts gefunden.",
    healthLine: "Zeile",
    healthCliNote: "Dieselben Prüfungen laufen in der Kommandozeile:",
    helpTitle: "Tastaturkürzel",
    helpVersion: "BloomMD v0.4.0",
    aboutTitle: "Über BloomMD",
    aboutClose: "Über-Dialog schließen",
    aboutTagline: "Markdown bleibt die Quelle. BloomMD macht Struktur sichtbar.",
    aboutBetaBadge: "M1 · Closed Beta",
    aboutVersionLoading: "Build-Version wird geladen...",
    aboutLocalFirst: "Local-first · Markdown-first · macOS-first",
    aboutWebLocalFirst: "Local-first · Markdown-first · Web-App",
    aboutPositioning: "Öffne eine Markdown-Datei und erkenne ihre Struktur als Map – ohne Lock-in und ohne Formatwechsel.",
    aboutTechnologies: "Eingesetzte Technologien",
    aboutTechnologiesDescription: "Die wichtigsten Bausteine der nativen Desktop-Anwendung.",
    aboutWebTechnologiesDescription: "Die wichtigsten Bausteine der gehosteten Web-Anwendung.",
    aboutLegal: "Rechtliches und Hilfe",
    aboutImprint: "Impressum",
    aboutPrivacy: "Datenschutz",
    aboutLicenses: "Lizenzen",
    aboutDocumentation: "Dokumentation",
    aboutSupport: "Hilfe und Feedback",
    aboutBetaStatus: "M1-Beta-Status",
    aboutBetaStatusDescription: "Der aktuelle Fokus der geschlossenen Beta – und was bewusst noch folgt.",
    aboutBetaMac: "macOS ist die primäre M1-Beta-Plattform.",
    aboutBetaWeb: "Die Web-App ist Teil der geschlossenen M1-Beta und erfordert eine Einladung.",
    aboutBetaMobile: "Mobile (iOS/Android) ist außerhalb des M1-Beta-Supports.",
    aboutBetaCollaboration: "Cloud-Sync und Zusammenarbeit werden als geschlossene Beta schrittweise erweitert.",
    aboutBetaObsidian: "Obsidian-Integration und weitere Distribution folgen nach M1.",
    aboutBuildDetails: "Technische Build-Details",
    aboutBuildTag: "Git-Tag",
    aboutBuildSha: "Git-SHA",
    aboutBuildTime: "Build-Zeitpunkt",
    aboutBuildChannel: "Kanal",
    aboutBuildPackage: "Package",
    aboutBuildDeployment: "Deployment",
    aboutUpdateNote: "Updates werden über die zentrale Update-Oberfläche bereitgestellt.",
    aboutWebUpdateNote: "Die Web-App wird über den zentralen BloomMD-Deployment-Prozess aktualisiert.",
    aboutUpdates: "Updates",
    aboutUpdateChecking: "Suche nach einer neuen stabilen Version...",
    aboutUpdateAvailable: "Eine neue Version ist verfügbar.",
    aboutUpdateReady: "Das Update ist bereit und kann installiert werden.",
    aboutUpdateNone: "BloomMD ist auf dem aktuellen Stand.",
    aboutUpdateError: "Die Update-Prüfung ist fehlgeschlagen.",
    aboutCheckForUpdates: "Nach Updates suchen",
    aboutDownloadUpdate: "Update herunterladen",
    aboutInstallUpdate: "Jetzt neu starten und installieren",
    aboutUpdateProgress: "Download-Fortschritt",
    categoryFile: "Datei",
    categoryEdit: "Bearbeiten",
    categoryNav: "Navigation",
    categoryHelp: "Hilfe",
    helpAndSettings: "Hilfe und Einstellungen",
    gettingStarted: "Erste Schritte",
    documentation: "Dokumentation",
    feedback: "Feedback senden",
    account: "Account und Abrechnung",
    shortcutNew: "Neue Mindmap",
    shortcutUndo: "Rückgängig",
    shortcutRedo: "Wiederherstellen",
    shortcutSave: "Speichern",
    shortcutReload: "Neu laden (von Festplatte)",
    shortcutFileBrowser: "Datei-Browser",
    shortcutCommandPalette: "Befehlssuche (außerhalb des Editors)",
    shortcutImport: "Markdown importieren (außerhalb des Editors)",
    shortcutExport: "Markdown exportieren",
    shortcutRename: "Knotentitel umbenennen (in geöffneter Datei)",
    shortcutAddChild: "Kind-Node erstellen",
    shortcutAddSibling: "Sibling-Node erstellen",
    shortcutEditContent: "Panel öffnen/schließen",
    shortcutDelete: "Node löschen",
    shortcutBackToWorkspace: "Zur Workspace-Übersicht",
    shortcutForwardToFile: "Zur zuletzt geöffneten Datei",
    shortcutBackToCanvas: "Am Knoten: Panel schließen / Auswahl aufheben",
    shortcutSelectNode: "Node auswählen",
    shortcutSelectChild: "Erstes Kind auswählen",
    shortcutSelectParent: "Parent auswählen",
    shortcutSelectNextSibling: "Nächsten Sibling auswählen",
    shortcutSelectPreviousSibling: "Vorherigen Sibling auswählen",
    shortcutZoom: "Zoom",
    shortcutPan: "Canvas verschieben",
    shortcutShowHelp: "Diese Hilfe anzeigen",
    shortcutDoubleClick: "Doppelklick / R",
    shortcutClick: "Klick",
    shortcutScrollPinch: "Scroll / Pinch",
    shortcutDragBackground: "Drag (Hintergrund)",
    rename: "Umbenennen",
    renameMindmapTitle: "Mindmap umbenennen",
    renameMindmapDescription: "Titel und Dateiname werden gemeinsam geändert. Der Dateiname wird aus dem Titel erzeugt; der vorhandene Ordner bleibt erhalten.",
    renameMindmapCurrentFile: "Aktuelle Datei",
    renameMindmapTitleLabel: "Mindmap-Titel",
    renameMindmapNewFile: "Datei wird",
    renameMindmapBusy: "Benenne um…",
    deleteMindmap: "Löschen",
    confirmDelete: "Mindmap löschen?",
    confirmDeleteMessage: "\u201E%title%\u201C wird unwiderruflich gel\u00F6scht.",
    theme: "Design",
    lightMode: "Hell",
    darkMode: "Dunkel",
    language: "Sprache",
  },
  en: {
    retryLayout: "Try again",
    layoutInProgress: "Arranging mind map …",
    layoutFailed: "The mind map could not be arranged. Please try again.",
    loading: "Loading...",
    newMindmap: "New Mindmap",
    save: "Save",
    saved: "Saved",
    saveFailed: "Save failed",
    reload: "Reload from disk",
    importMd: "Import Markdown",
    exportMd: "Export Markdown",
    shareReadOnlyLink: "Read-only links for colleagues",
    documentActions: "Document actions",
    fileActions: "File actions",
    newFolder: "Create new folder",
    openFileBrowser: "File Browser",
    changeFolder: "Change folder...",
    share: "Share",
    mindmaps: "Mindmaps",
    noMindmapsFound: "No mindmaps found.",
    newMindmapPrompt: "Name of new mindmap:",
    searchMindmaps: "Search mindmaps...",
    noSearchResults: "No results found.",
    commandPalette: "Command Palette",
    commandPlaceholder: "Search mindmap, node, or action...",
    categoryCommands: "Actions",
    categoryNodes: "Nodes",
    children: "children",
    level: "Level",
    nodeType: "Type",
    nodeKindTopic: "Topic / note",
    nodeKindTopicHint: "A Markdown section with editable notes.",
    nodeKindWorkspace: "Workspace",
    nodeKindWorkspaceHint: "Derived view of an open folder or cloud workspace.",
    nodeKindFolder: "Folder",
    nodeKindFolderHint: "A container from the workspace structure. Edit its content through files.",
    nodeKindPortal: "Map link",
    nodeKindPortalHint: "Jumps to another BloomMD map or a specific node.",
    nodeKindWeb: "Website",
    nodeKindWebHint: "External web resource with a URL and optional preview.",
    nodeKindFile: "File",
    nodeKindFileHint: "A file from the open workspace. Images are shown as an inline preview.",
    nodeKindPdf: "PDF document",
    nodeKindPdfHint: "A local or external PDF resource.",
    nodeKindSource: "Source / citation",
    nodeKindSourceHint: "A reference with URL, preview, and citation note.",
    nodeKindTask: "Task",
    nodeKindTaskHint: "An action item with status and editable notes.",
    nodeKindDecision: "Decision",
    nodeKindDecisionHint: "A decision record with status and rationale.",
    workspaceOverviewReadOnly: "The workspace overview is read-only. Open the source file to edit it.",
    openSourceFile: "Open source file",
    readOnlyMessage: "This workspace is read-only. You can view changes, but cannot save them.",
    deleteNodeBranch: "Delete node and branch",
    workspaceSource: "Workspace source",
    folderPath: "Folder path",
    files: "Files",
    folder: "Folder",
    ownerRole: "Owner",
    editorRole: "Editor",
    viewerRole: "Viewer",
    sections: "Sections",
    workspaceDescription: "This view is generated from the Markdown files in the workspace and is not saved as a separate Markdown file.",
    folderDescription: "This folder is part of the workspace structure. Edit content in its Markdown files.",
    pdfPath: "PDF path",
    filePath: "File path",
    noFileSelected: "No file selected",
    chooseFile: "Choose file",
    open: "Open",
    fileResourceDescription: "This node points to a file in the workspace. Images are previewed here; other files can be opened.",
    pdfResourceDescription: "This node points to a PDF. The preview shows the file; add notes to a topic, source, or note node.",
    loadingPreview: "Loading preview...",
    noInlinePreview: "There is no inline preview for this file type. Use Open to view it externally.",
    target: "Target",
    noMapSelected: "No map selected",
    loadPreview: "Loading preview...",
    loadWebsitePreview: "Load website preview",
    savedPreview: "Saved preview",
    openUrl: "Open URL",
    targetMap: "Target map",
    selectMap: "Select map",
    optional: "Optional",
    citation: "Citation",
    citationPlaceholder: "Author, title, year",
    status: "Status",
    openStatus: "Open",
    inProgressStatus: "In progress",
    doneStatus: "Done",
    decisionStatus: "Decision status",
    proposedStatus: "Proposed",
    acceptedStatus: "Accepted",
    rejectedStatus: "Rejected",
    linksAndReferences: "Links and references",
    resources: "Resources",
    preview: "Preview",
    copyLink: "Copy link",
    openLink: "Open link",
    targetNode: "Target node ID",
    ambiguousReference: "Ambiguous reference",
    targetNotFound: "Target not found",
    backlinkFrom: "Backlink from %title%",
    workspaceReference: "Workspace reference",
    content: "Content",
    fileContentDescription: "This node represents a file. Editable content lives in the derived section nodes.",
    derivedContentDescription: "This view is derived from the workspace. Edit content in the individual Markdown files.",
    resourceContentDescription: "This resource has no own Markdown content in the panel.",
    editorLoading: "Loading editor",
    editorWidth: "Resize editor",
    cancel: "Cancel",
    close: "Close",
    recent: "Recent",
    favorite: "Favorite",
    removeFavorite: "Remove favorite",
    rootDirectory: "(workspace root)",
    name: "Name",
    createdAs: "Will be created as",
    createEntryInvalidChars: "These characters are not allowed in file and folder names: \\ : * ? \" < > |",
    createEntryControlChars: "The name contains control characters.",
    createEntryPathEscape: "The path must stay inside the workspace.",
    createEntryRelativePath: "The path must be relative to the workspace.",
    createEntryFolderPlaceholder: "Chapter or book/part-1",
    createEntryFilePlaceholder: "Note",
    createEntryFolderDescription: "A real directory — it remains visible when you open the folder in Obsidian or commit it to git.",
    createEntryFileDescription: "A regular Markdown file. A slash in the name creates nested folders.",
    createEntryBusy: "Creating…",
    create: "Create",
    conflictAriaLabel: "Save conflict",
    conflictTitle: "This file changed while you were working",
    conflictDescription: "%filename% was saved while you were working on it. The differences are shown below.",
    conflictStoredColor: "red is the stored version",
    conflictMineColor: "green is yours",
    conflictStats: "%added% lines yours · %removed% lines stored · %unchanged% unchanged",
    conflictUnchangedLines: "… %count% unchanged lines",
    conflictLoadStored: "Load stored version",
    conflictSaveCopy: "Save as copy",
    conflictKeepMine: "Keep my version",
    syncOffline: "Offline",
    syncConnecting: "Connecting...",
    syncReconnecting: "Reconnecting...",
    syncConnected: "Synced",
    syncFailed: "Connection failed",
  syncFailureFileNotFound: "Workspace file not found",
  syncFailureRoomCapacity: "Workspace is full",
  syncFailureAccessRevoked: "Access to this workspace was revoked",
  syncFailureUnauthorized: "Access not authorized",
    syncFailureTicketRefresh: "Could not renew sync ticket",
    syncFailureExhausted: "Could not restore the connection",
    syncTitle: "Sync: %status% (%count% %users%)",
    user: "user",
    users: "users",
    graphPerspective: "Map perspective",
    individualLayers: "Individual layers",
    presetStructure: "Structure",
    presetStructureHint: "Folders, files, and their outline — the deliberate order",
    presetReferences: "References",
    presetReferencesHint: "Only references between files, without the folder structure",
    presetKnowledge: "Knowledge",
    presetKnowledgeHint: "Structure and references together",
    layerFolders: "Folders",
    layerFoldersHint: "Folders and their files",
    layerReferences: "References",
    layerReferencesHint: "Resolved links between files",
    layerBacklinks: "Backlinks",
    layerBacklinksHint: "What points to the selection",
    layerBacklinksUnavailable: "Select a file first",
    layerBrokenLinks: "Broken",
    layerBrokenLinksHint: "Links without a unique target",
    workspaceMapEmpty: "This workspace does not contain any Markdown files yet.",
    canvasModes: "Canvas modes",
    mindMap: "Mind map",
    outline: "Outline",
    presentation: "Presentation",
    edgeMode: "Edge mode",
    structure: "Structure",
    links: "Links",
    backlinks: "Backlinks",
    allRelations: "All relations",
    undo: "Undo",
    redo: "Redo",
    focusBranch: "Focus branch",
    exitFocus: "Exit focus",
    copyBranches: "Copy selected branches",
    pasteBranches: "Paste branches",
    saveLocalView: "Save local view",
    loadSavedView: "Load saved view",
    views: "Views",
    renameSavedView: "Rename saved view",
    deleteSavedView: "Delete saved view",
    viewNamePrompt: "View name",
    deleteSavedViewConfirm: "Delete saved view \"%name%\"?",
    dropBefore: "Drop before",
    dropAfter: "Drop after",
    dropInside: "Drop inside",
    dismissMessage: "Dismiss message",
    previousNode: "Previous node",
    nextNode: "Next node",
    openWebsite: "Open website",
    website: "Website",
    link: "link",
    linksPlural: "links",
    toggleTask: "Toggle task",
    dueDate: "Due",
    handwriting: "Handwriting",
    newDrawing: "New drawing",
    editDrawing: "Edit drawing",
    drawingUnavailable: "Drawing not available",
    handwritingSaveFailed: "The drawing could not be saved.",
    drawingSavedAsCopy: "The drawing was changed on another device. Your version is kept as a drawing of its own:",
    drawingNewerFormat: "Made with a newer BloomMD version – view only",
    responsible: "Responsible",
    decidedBy: "Decided by",
    overdueSince: "Overdue since",
    addChild: "Add child node",
    addSibling: "Add sibling node",
    editNodeContent: "Edit node content",
    openResource: "Open resource",
    newNodeTitle: "New node",
    nodeUrlMissing: "This node has no URL.",
    nodeUrlProtocol: "The URL must start with http:// or https://.",
    nodeUrlInvalid: "The URL is invalid.",
    missingFileResource: "This node has no file selected.",
    missingMapResource: "This map link has no target map selected.",
    researchTemplate: "New research template",
    projectTemplate: "New project template",
    template: "Template",
    resourceSingular: "resource",
    resourcesPlural: "resources",
    researchPlan: "Research Plan",
    researchIntro: "Central question and working notes.",
    sources: "Sources",
    addSources: "Add URLs, papers and references here.",
    claims: "Claims",
    breakFindings: "Break findings into testable claims.",
    nextSteps: "Next steps",
    reviewSources: "Review sources",
    summarizeFindings: "Summarize findings",
    projectPlan: "Project Plan",
    projectIntro: "Project goal and scope.",
    milestones: "Milestones",
    defineMvp: "Define MVP",
    validateWorkflow: "Validate workflow",
    risks: "Risks",
    trackRisks: "Track open risks and decisions.",
    tasks: "Tasks",
    firstTask: "First task",
    updateInstallFailed: "The update could not be installed.",
    noUrl: "No URL is configured.",
    urlOpenFailed: "The URL could not be opened.",
    previewUnavailable: "Preview unavailable in this environment.",
    mapsUnavailable: "Maps are unavailable.",
    mapUnavailable: "Map is unavailable.",
    previewServiceError: "Preview service returned HTTP",
    localPreviewUnavailable: "No preview is currently available for this local file.",
    unsupportedResource: "This resource type is not supported.",
    resourceSelectionFailed: "Resource selection failed.",
    filesLoadFailed: "Files could not be loaded.",
    workspaceEntriesSkipped: "Some files or folders could not be loaded. The remaining files are still available:",
    workspacesLoadFailed: "Workspaces could not be loaded.",
    workspaceAccessLoading: "Workspace permissions are still loading.",
    workspaceReadOnly: "This workspace is read-only (viewer).",
    derivedWorkspaceSave: "Workspace views are derived. Open a file node to edit and save the Markdown file.",
    documentConflict: "The document changed in the cloud. Reload before saving.",
    syncRoomActive: "This document is currently open in a sync session. Changes are saved through the connection.",
    syncRoomSaveFailed: "Sync unavailable. Local change is kept; retry after reconnect.",
    fileSaveFailed: "The file could not be saved.",
    renameConflict: "The requested filename is already in use.",
    renameFailed: "The mindmap could not be renamed.",
    deleteFailed: "The mindmap could not be deleted.",
    derivedWorkspaceExport: "Workspace views are not exported as a single Markdown file. Open a file node to export the file.",
    connectionFailed: "Connection failed",
    connectionProfileStorageUnavailable: "The Linux keyring is unavailable or locked. Start or unlock a Secret Service provider and try again.",
    workspaceSwitchFailed: "The workspace could not be changed.",
    feedbackIssueCreated: "Thanks, your feedback was received as issue #%number%.",
    feedbackSendFailed: "Feedback could not be sent.",
    role: "Role",
    disconnect: "Disconnect",
    connectServer: "Connect to server",
    localWorkspace: "Local",
    connectionProfileAdd: "Add server",
    connectionProfileManage: "Manage servers",
    connectionProfileName: "Profile name",
    connectionProfileNamePlaceholder: "e.g. Team server",
    connectionProfileTokenStored: "Access token is stored securely",
    connectionProfileSave: "Save only",
    connectionProfileSaveAndConnect: "Save and connect",
    connectionProfileEdit: "Edit server profile",
    connectionProfileDelete: "Delete",
    connectionProfileDeleteConfirm: "Delete this server profile? The stored access token will also be removed.",
    connectionProfileSaveFailed: "Server profile could not be saved.",
    connectionProfileDeleteFailed: "Server profile could not be deleted.",
    connectionSwitchFailed: "The connection could not be switched.",
    connectionProfileEmpty: "No server profile saved yet.",
    workspace: "Workspace",
    backToWorkspace: "Back to workspace overview",
    forwardToFile: "Forward to the previously opened file",
    workspacesLoading: "Loading workspaces…",
    noMarkdownFiles: "No Markdown files",
    emptyWorkspace: "This workspace is empty.",
    createMarkdown: "Create Markdown",
    reconnectFailedMessage: "was not reachable at startup. BloomMD continues locally — your server setting is saved.",
    reconnect: "Reconnect",
    feedbackTitle: "Beta feedback",
    feedbackDescription: "The version, macOS, and selected node type are sent. Markdown content, tokens, and local absolute paths are not transmitted automatically.",
    feedbackType: "Type",
    feedbackContactOptional: "Contact (optional)",
    feedbackAccountUsed: "Account is used",
    feedbackEmailPlaceholder: "you@example.com",
    feedbackDescriptionLabel: "Description",
    feedbackDescriptionPlaceholder: "What happened, what did you expect, and which action was involved?",
    feedbackScreenshotsOptional: "Screenshots (optional)",
    feedbackVideoOptional: "Video (optional)",
    feedbackLocalNote: "Local feedback is sent anonymously to BloomMD. A contact address is optional.",
    feedbackSending: "Sending...",
    feedbackSend: "Send feedback",
    feedbackMinLength: "Please describe your feedback in at least 10 characters.",
    feedbackMaxScreenshots: "Please choose no more than three screenshots.",
    feedbackScreenshotSize: "Screenshots must be no larger than 10 MB.",
    feedbackVideoSize: "The video must be no larger than 50 MB.",
    resourcePreviewFailed: "The resource preview could not be loaded.",
    serverUrl: "Server URL",
    accessToken: "Personal access token",
    connecting: "Connecting...",
    connect: "Connect",
    feedbackBug: "Bug",
    feedbackUx: "UX",
    feedbackIdea: "Idea",
    feedbackQuestion: "Question",
    healthTitle: "Workspace health",
    healthFileSingular: "file",
    healthFilesPlural: "files",
    healthErrorSingular: "error",
    healthErrorsPlural: "errors",
    healthWarningSingular: "warning",
    healthWarningsPlural: "warnings",
    healthInfo: "Information",
    healthClose: "Close workspace health",
    healthRoundtrip: "Check save safety",
    healthOrphans: "Unlinked pages",
    healthNothingFound: "Nothing found.",
    healthLine: "Line",
    healthCliNote: "The same checks run in the command line:",
    helpTitle: "Keyboard Shortcuts",
    helpVersion: "BloomMD v0.4.0",
    aboutTitle: "About BloomMD",
    aboutClose: "Close About dialog",
    aboutTagline: "Markdown remains the source. BloomMD makes structure visible.",
    aboutBetaBadge: "M1 · Closed Beta",
    aboutVersionLoading: "Loading build version...",
    aboutLocalFirst: "Local-first · Markdown-first · macOS-first",
    aboutWebLocalFirst: "Local-first · Markdown-first · web app",
    aboutPositioning: "Open a Markdown file and see its structure as a map – without lock-in or a format change.",
    aboutTechnologies: "Technologies",
    aboutTechnologiesDescription: "The main building blocks of the native desktop application.",
    aboutWebTechnologiesDescription: "The main building blocks of the hosted web application.",
    aboutLegal: "Legal and help",
    aboutImprint: "Legal notice",
    aboutPrivacy: "Privacy",
    aboutLicenses: "Licenses",
    aboutDocumentation: "Documentation",
    aboutSupport: "Help and feedback",
    aboutBetaStatus: "M1 beta status",
    aboutBetaStatusDescription: "The current focus of the closed beta – and what intentionally follows later.",
    aboutBetaMac: "macOS is the primary M1 beta platform.",
    aboutBetaWeb: "The web app is part of the closed M1 beta and requires an invitation.",
    aboutBetaMobile: "Mobile (iOS/Android) is outside M1 beta support.",
    aboutBetaCollaboration: "Cloud sync and collaboration are being expanded step by step as a closed beta.",
    aboutBetaObsidian: "Obsidian integration and further distribution follow after M1.",
    aboutBuildDetails: "Technical build details",
    aboutBuildTag: "Git tag",
    aboutBuildSha: "Git SHA",
    aboutBuildTime: "Build time",
    aboutBuildChannel: "Channel",
    aboutBuildPackage: "Package",
    aboutBuildDeployment: "Deployment",
    aboutUpdateNote: "Updates are provided through the central update surface.",
    aboutWebUpdateNote: "The web app is updated through the central BloomMD deployment process.",
    aboutUpdates: "Updates",
    aboutUpdateChecking: "Checking for a new stable version...",
    aboutUpdateAvailable: "A new version is available.",
    aboutUpdateReady: "The update is ready to install.",
    aboutUpdateNone: "BloomMD is up to date.",
    aboutUpdateError: "The update check failed.",
    aboutCheckForUpdates: "Check for updates",
    aboutDownloadUpdate: "Download update",
    aboutInstallUpdate: "Restart and install now",
    aboutUpdateProgress: "Download progress",
    categoryFile: "File",
    categoryEdit: "Edit",
    categoryNav: "Navigation",
    categoryHelp: "Help",
    helpAndSettings: "Help and settings",
    gettingStarted: "Getting started",
    documentation: "Documentation",
    feedback: "Send feedback",
    account: "Account and billing",
    shortcutNew: "New mindmap",
    shortcutUndo: "Undo",
    shortcutRedo: "Redo",
    shortcutSave: "Save",
    shortcutReload: "Reload from disk",
    shortcutFileBrowser: "File browser",
    shortcutCommandPalette: "Command palette (outside the editor)",
    shortcutImport: "Import Markdown (outside the editor)",
    shortcutExport: "Export Markdown",
    shortcutRename: "Rename node title (in an open file)",
    shortcutAddChild: "Add child node",
    shortcutAddSibling: "Add sibling node",
    shortcutEditContent: "Open/close panel",
    shortcutDelete: "Delete node",
    shortcutBackToWorkspace: "Back to workspace overview",
    shortcutForwardToFile: "Forward to the previously opened file",
    shortcutBackToCanvas: "On a node: close panel / clear selection",
    shortcutSelectNode: "Select node",
    shortcutSelectChild: "Select first child",
    shortcutSelectParent: "Select parent",
    shortcutSelectNextSibling: "Select next sibling",
    shortcutSelectPreviousSibling: "Select previous sibling",
    shortcutZoom: "Zoom",
    shortcutPan: "Pan canvas",
    shortcutShowHelp: "Show this help",
    shortcutDoubleClick: "Double-click / R",
    shortcutClick: "Click",
    shortcutScrollPinch: "Scroll / pinch",
    shortcutDragBackground: "Drag (background)",
    rename: "Rename",
    renameMindmapTitle: "Rename mindmap",
    renameMindmapDescription: "The title and filename change together. The filename is derived from the title and the existing folder is preserved.",
    renameMindmapCurrentFile: "Current file",
    renameMindmapTitleLabel: "Mindmap title",
    renameMindmapNewFile: "Resulting file",
    renameMindmapBusy: "Renaming…",
    deleteMindmap: "Delete",
    confirmDelete: "Delete mindmap?",
    confirmDeleteMessage: '"%title%" will be permanently deleted.',
    theme: "Theme",
    lightMode: "Light",
    darkMode: "Dark",
    language: "Language",
  },
};
