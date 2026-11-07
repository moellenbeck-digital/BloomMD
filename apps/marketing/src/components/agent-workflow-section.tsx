import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";

type Locale = "de" | "en";

const content = {
  de: {
    label: "Heute nutzbar · mit lokalem OpenClaw-Agenten",
    title: "Agenten machen Vorschläge. Du entscheidest, was in der Datei steht.",
    intro: "Wähle in einem BloomMD-Web-Workspace einen Knoten und gib einem verbundenen Agenten einen konkreten Auftrag. BloomMD zeigt sein Ergebnis als Vorschlag. Erst deine Freigabe übernimmt die Änderung.",
    steps: [
      { title: "Knoten beauftragen", text: "Der Agent erhält den Kontext des ausgewählten Knotens und deinen Auftrag." },
      { title: "Vorschlag prüfen", text: "Sieh dir die neue Struktur und das vorgeschlagene Markdown an." },
      { title: "Änderung freigeben", text: "Übernimm oder lehne ab. Auftrag, Ergebnis und Entscheidung bleiben nachvollziehbar." },
    ],
    flowAlt: "Ablauf mit lokalem OpenClaw-Agenten: ausgewählten Knoten beauftragen, Vorschlag erhalten und erst nach menschlicher Freigabe übernehmen.",
    previewLabel: "Aus der echten Vorschau",
    previewAlt: "BloomMD-Vorschau mit dem geänderten Ausgangsknoten und zwei vorgeschlagenen neuen Kindknoten.",
    guide: "Agenten-Workflow ansehen",
    examplesLabel: "Beispielaufträge für selbst eingerichtete Agenten",
    examples: [
      { role: "Chief of Staff", task: "Ein Learning mit Quelle und offener Frage ergänzen" },
      { role: "Dev-Team", task: "Architekturfragen unter einem Knoten strukturieren" },
      { role: "Social-Media-Manager", task: "Ideen für einen Beitrag als Vorschlag sammeln" },
    ],
    caveat: "Diese Rollen sind Beispiele für Aufträge, keine vorinstallierten Agenten. Weitergehende Rechte und automatisierte Workflows stehen auf der Roadmap.",
    roadmap: "Zur Roadmap",
  },
  en: {
    label: "Available today · with a local OpenClaw agent",
    title: "Agents propose changes. You decide what goes into the file.",
    intro: "Select a node in a BloomMD web workspace and give a connected agent a specific task. BloomMD shows its result as a proposal. The change is applied only when you approve it.",
    steps: [
      { title: "Assign a node", text: "The agent receives your task and the context of the selected node." },
      { title: "Review the proposal", text: "Inspect the proposed structure and Markdown before anything changes." },
      { title: "Approve the change", text: "Accept or reject it. The task, result and decision remain traceable." },
    ],
    flowAlt: "Local OpenClaw agent workflow: assign a selected node, receive a proposal, and apply it only after human approval.",
    previewLabel: "From the real product preview",
    previewAlt: "BloomMD preview showing the changed source node and two proposed child nodes.",
    guide: "Explore the agent workflow",
    examplesLabel: "Example tasks for agents you configure yourself",
    examples: [
      { role: "Chief of Staff", task: "Add a source and an open question to a learning" },
      { role: "Dev team", task: "Structure architecture questions under a node" },
      { role: "Social media manager", task: "Collect post ideas as a proposal" },
    ],
    caveat: "These are task examples, not preinstalled agent roles. Broader permissions and automated workflows are on the roadmap.",
    roadmap: "View the roadmap",
  },
} as const;

export function AgentWorkflowSection({ locale }: { locale: Locale }) {
  const copy = content[locale];
  const guideHref = locale === "de" ? "/docs/openclaw-agent" : "/docs/openclaw-agent?lang=en";
  const roadmapHref = locale === "de" ? "/roadmap" : "/en/roadmap";
  const flowImage = locale === "de" ? "/docs/openclaw-workspace-agent-flow.svg" : "/docs/openclaw-workspace-agent-flow-en.svg";
  const mobileFlowImage = locale === "de" ? "/docs/openclaw-workspace-agent-flow-mobile.svg" : "/docs/openclaw-workspace-agent-flow-mobile-en.svg";

  return (
    <section id="agenten" aria-labelledby="agent-workflow-title" className="scroll-mt-24 bg-[#FFFDFB] text-[#1A1A1A]">
      <div className="mx-auto max-w-7xl px-5 py-16 lg:py-20">
        <div className="max-w-4xl">
          <p className="text-sm font-semibold text-[#B64A1F]">{copy.label}</p>
          <h2 id="agent-workflow-title" className="mt-4 max-w-3xl text-3xl font-semibold leading-tight sm:text-5xl">{copy.title}</h2>
          <p className="mt-5 max-w-3xl text-base leading-8 text-[#514C46] sm:text-lg">{copy.intro}</p>
        </div>

        <div className="mt-9 grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
          <div>
            <ol className="border-t border-[#E8E4DF]">
              {copy.steps.map((step, index) => (
                <li key={step.title} className="grid grid-cols-[2.5rem_1fr] gap-4 border-b border-[#E8E4DF] py-5">
                  <span className="font-[var(--font-mono)] text-sm font-semibold text-[#B64A1F]">{index + 1}.</span>
                  <div>
                    <h3 className="text-lg font-semibold">{step.title}</h3>
                    <p className="mt-1 text-sm leading-6 text-[#555555]">{step.text}</p>
                  </div>
                </li>
              ))}
            </ol>
            <Link href={guideHref} className="mt-7 inline-flex min-h-11 items-center gap-2 rounded-md bg-[#B94316] px-5 text-sm font-semibold text-white hover:bg-[#963311] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF6B35]/35">
              {copy.guide}<ArrowRight size={17} aria-hidden="true" />
            </Link>
          </div>

          <div className="overflow-hidden rounded-xl bg-[#1A1A1A] p-3 sm:p-5">
            <picture>
              <source media="(max-width: 639px)" srcSet={mobileFlowImage} />
              <Image src={flowImage} alt={copy.flowAlt} width={1600} height={800} className="h-auto w-full rounded-md" />
            </picture>
            <figure className="mt-4 flex items-center gap-4 rounded-md bg-[#FFFDFB] p-3 sm:p-4">
              <Image src="/docs/openclaw-agent-proposal.png" alt={copy.previewAlt} width={256} height={121} className="h-auto w-32 shrink-0 sm:w-48" />
              <figcaption className="text-sm font-medium leading-6 text-[#514C46]">{copy.previewLabel}</figcaption>
            </figure>
          </div>
        </div>

        <div className="mt-12 border-t border-[#E8E4DF] pt-6">
          <p className="text-sm font-semibold text-[#514C46]">{copy.examplesLabel}</p>
          <div className="mt-4 grid gap-x-8 gap-y-5 md:grid-cols-3">
            {copy.examples.map((example) => (
              <div key={example.role}>
                <p className="font-semibold">{example.role}</p>
                <p className="mt-1 text-sm leading-6 text-[#555555]">{example.task}</p>
              </div>
            ))}
          </div>
          <p className="mt-6 max-w-3xl text-sm leading-6 text-[#555555]">{copy.caveat} <Link href={roadmapHref} className="font-semibold text-[#B64A1F] underline underline-offset-4 hover:text-[#963311] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B64A1F]">{copy.roadmap}</Link></p>
        </div>
      </div>
    </section>
  );
}
