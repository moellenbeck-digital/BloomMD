---
title: OpenClaw-Agenten im Workspace
description: Lokale OpenClaw-Agenten installieren, sicher pairen, auf Knoten beauftragen und Vorschläge freigeben.
order: 6
---

# OpenClaw-Agenten im Workspace

Mit BloomMD kann ein lokaler OpenClaw-Agent als sichtbares Workspace-Mitglied mitarbeiten. Er bekommt nur eigene Aufträge, arbeitet ausschließlich mit dem Kontext des ausgewählten Knotens und kann Änderungen nur als Vorschlag zurückgeben. Ein Mensch entscheidet anschließend, ob der Vorschlag übernommen wird.

## Was du brauchst

- Einen BloomMD-Workspace mit Owner- oder Editor-Rolle.
- Einen lokal laufenden [OpenClaw](https://openclaw.ai/)-Client mit einem eingerichteten Modellzugang.
- Die von OpenClaw unterstützte Node.js-Laufzeit: mindestens `24.16` oder `26.1` (`node --version`).
- Zugriff auf den Rechner, auf dem OpenClaw läuft. BloomMD verbindet sich nicht eingehend zu diesem Rechner.

Der Agent läuft lokal oder in deiner eigenen Infrastruktur. BloomMD speichert keinen Modellschlüssel und schickt keinen gesamten Workspace an OpenClaw.

## 1. Plugin installieren

Das BloomMD-Plugin enthält die Pairing-Befehle, den sicheren lokalen Token-Speicher und den Skill für nodebezogene Aufgaben. Es ist kein zusätzlich laufender BloomMD-Dienst nötig.

```bash
curl -fL https://bloommd.io/openclaw-plugin/latest.tgz \
  -o ~/Downloads/bloommd-openclaw-plugin.tgz
openclaw plugins install ~/Downloads/bloommd-openclaw-plugin.tgz \
  --force
```

`latest.tgz` wird innerhalb einer Minute auf eine neue Veröffentlichung aktualisiert. Für reproduzierbare Installationen oder Rollbacks nutze stattdessen die unveränderliche URL `https://bloommd.io/openclaw-plugin/<version>.tgz`, etwa `…/0.4.4.tgz`. Anschließend muss OpenClaw das Plugin erkennen:

```bash
openclaw bloommd --help
```

> **Entwicklung aus einem Checkout:** `openclaw plugins install --link ./plugins/openclaw --force` bindet das lokale Plugin ein. Das ist für Entwicklung gedacht, nicht für den normalen Beta-Installationsweg.

## 2. Agenten einladen und pairen

1. Öffne in BloomMD einen Workspace und wähle **Agenten verwalten**.
2. Füge einen Agenten mit einem eindeutigen Namen hinzu, etwa `Recherche` oder `OpenClaw – Architektur`.
3. Kopiere den einmaligen Pairing-Code. Er ist 15 Minuten gültig und nach dem Einlösen verbraucht.
4. Übergib ihn nur an den lokalen OpenClaw auf dem vorgesehenen Rechner. Lege ihn dabei in einer
   privaten Datei ab – dadurch erscheint er weder in der Shell-Historie noch im Prozesslisting:

```bash
umask 077
mkdir -p ~/.config/bloommd
# Code einfügen und danach mit Ctrl-D abschließen.
cat > ~/.config/bloommd/pairing-code

openclaw bloommd pair \
  --server https://bloommd.app \
  --bloommd-profile research \
  --pairing-code-file ~/.config/bloommd/pairing-code
rm -f ~/.config/bloommd/pairing-code
```

Der Befehl legt das Agent-Token im lokalen Secret Store von OpenClaw ab. In Markdown-Dateien, Git oder der BloomMD-Oberfläche erscheint es nicht.

Prüfe die Verbindung danach:

```bash
openclaw bloommd status --bloommd-profile research
```

## 3. Einen Knoten beauftragen

Wähle in der Map den Knoten aus, den der Agent bearbeiten soll. Neben **Kind hinzufügen** und **Bearbeiten** erscheint bei einem Workspace mit Agenten das Roboter-Symbol.

![Ein ausgewählter Knoten zeigt das Roboter-Symbol; die rechte Seitenleiste enthält den Agenten-Tab.](/docs/openclaw-agent-node-sidebar.svg)

![Echte BloomMD-Seitenleiste im reproduzierbaren E2E-Test: Kontext, Agentenwahl und Auftrag.](/docs/openclaw-agent-composer.png)

1. Klicke auf das Roboter-Symbol oder öffne den Tab **Agent** in der rechten Seitenleiste.
2. Wähle den gewünschten Agenten.
3. Formuliere einen konkreten Auftrag, zum Beispiel: „Erweitere diesen Knoten um drei prüfbare Fragen und recherchiere dafür belastbare Quellen.“
4. Sende den Auftrag.

Der Auftrag erscheint sofort als **wartet auf Agent**. Der lokale Plugin-Runner wird über eine ausgehende Echtzeitverbindung geweckt und holt nur eigene Aufträge ab. Erst dann wird ein Modellturn ausgeführt; ohne offene Aufgabe entstehen keine Modellkosten. Falls ein Netzwerk SSE blockiert, sichert ein seltener interner Fallback-Poll die Zustellung ab.

## 4. Vorschlag prüfen und übernehmen

Wenn der Agent fertig ist, zeigt die rechte Seitenleiste den Status **Vorschlag bereit**. Nutze **Vorschlag ansehen**:

![Echte BloomMD-Vorschau im reproduzierbaren E2E-Test: Ausgangsknoten und neue Kindknoten.](/docs/openclaw-agent-proposal.png)

- In der **Baumansicht** siehst du die neue oder geänderte Struktur direkt als Baum.
- In der **Markdown-Ansicht** siehst du den konkreten Markdown-Vorschlag.
- Der Agent kann darunter explizit typisierte **Aufgaben** oder **Entscheidungen** vorschlagen. Beide erscheinen als neue Kindknoten und entstehen erst nach deiner Freigabe.
- Der Status ist farblich unterscheidbar: wartend, in Arbeit, bereit, übernommen, abgelehnt oder fehlgeschlagen.

Übernehme den Vorschlag erst nach deiner Prüfung. Die Übernahme läuft über BloomMD Sync; andere geöffnete Clients erhalten die Änderung wie eine normale Workspace-Änderung. Frühere Einträge bleiben als eingeklappte Historie nachvollziehbar, ohne die aktuelle Entscheidung zu überlagern.

## Rechte, Grenzen und Widerruf

Ein Agent ist kein menschlicher Editor:

- Er sieht nur eigene Aufträge und bei einem Knotenauftrag nur Titel, Pfad und Inhalt dieses Knotens.
- Er kann keine Datei direkt schreiben. Auch neue Kindknoten sind zunächst Vorschläge.
- Jeder Auftrag, jedes Ergebnis und jede Entscheidung wird im Workspace-Audit festgehalten.
- Mehrere Agenten können parallel arbeiten; ihre Tokens und Aufgaben sind voneinander getrennt.

Um einen Agenten abzuschalten, wähle in **Agenten verwalten** den Eintrag und dann **Zugang widerrufen**. Der nächste Poll mit diesem Token wird abgelehnt. Lokal kann der Eintrag zusätzlich entfernt werden:

```bash
openclaw bloommd forget --bloommd-profile research
```

## Betrieb mit Docker oder Kubernetes

Für einen dauerhaft betriebenen Agenten kannst du das Plugin als Container ausführen. Du brauchst **keinen Zugriff auf das BloomMD-Repository**: Dockerfile, Compose-Datei und Kubernetes-Manifest werden direkt von `bloommd.io` geladen. Der Container benötigt ausschließlich ausgehenden HTTPS-Zugriff zu BloomMD und einen persistenten Secret Store für sein Token.

### Docker Compose

Lade die öffentliche Konfiguration in einen neuen, privaten Ordner und pinne das Plugin für einen reproduzierbaren Betrieb auf eine veröffentlichte Version:

```bash
mkdir bloommd-openclaw && cd bloommd-openclaw
curl -fsSLO https://bloommd.io/openclaw-plugin/Dockerfile
curl -fsSLO https://bloommd.io/openclaw-plugin/entrypoint.sh
curl -fsSLO https://bloommd.io/openclaw-plugin/docker-compose.yml

cat > .env <<EOF
OPENCLAW_GATEWAY_TOKEN=$(openssl rand -base64 32)
BLOOMMD_PLUGIN_VERSION=0.4.4
BLOOMMD_PLUGIN_URL=https://bloommd.io/openclaw-plugin/0.4.4.tgz
EOF

docker compose up --build -d
```

Erzeuge anschließend in BloomMD einen einmaligen Pairing-Code, speichere ihn nur lokal mit restriktiven Rechten und paare den Container:

```bash
umask 077
pbpaste > ./bloommd-pairing-code
docker compose cp ./bloommd-pairing-code bloommd-openclaw-agent:/tmp/bloommd-pairing-code
docker compose exec bloommd-openclaw-agent node /app/openclaw.mjs bloommd pair \
  --server https://bloommd.app \
  --bloommd-profile research \
  --pairing-code-file /tmp/bloommd-pairing-code
docker compose exec bloommd-openclaw-agent rm -f /tmp/bloommd-pairing-code
rm ./bloommd-pairing-code
```

### Kubernetes

Baue das gleiche öffentliche Dockerfile in deiner eigenen Registry; so bleibt die Registry- und Zugriffsentscheidung bei dir. Lade danach das öffentliche Manifest, ersetze den Image-Platzhalter und lege die Secrets in Kubernetes an:

```bash
mkdir bloommd-openclaw && cd bloommd-openclaw
curl -fsSLO https://bloommd.io/openclaw-plugin/Dockerfile
curl -fsSLO https://bloommd.io/openclaw-plugin/entrypoint.sh
curl -fsSLO https://bloommd.io/openclaw-plugin/kubernetes.yaml

docker build \
  --build-arg BLOOMMD_PLUGIN_URL=https://bloommd.io/openclaw-plugin/0.4.4.tgz \
  -t registry.example.com/bloommd-openclaw-agent:0.4.4 .
docker push registry.example.com/bloommd-openclaw-agent:0.4.4

sed -i.bak 's#REPLACE_WITH_YOUR_REGISTRY/bloommd-openclaw-agent:0.4.4#registry.example.com/bloommd-openclaw-agent:0.4.4#' kubernetes.yaml
kubectl create namespace bloommd-agents --dry-run=client -o yaml | kubectl apply -f -
kubectl create secret generic openclaw-gateway -n bloommd-agents \
  --from-literal=token="$(openssl rand -base64 32)" \
  --dry-run=client -o yaml | kubectl apply -f -
kubectl apply -f kubernetes.yaml
```

Für das Pairing kopierst du die einmalige Datei in den gestarteten Pod und löschst sie anschließend sofort wieder:

```bash
umask 077
pbpaste > ./bloommd-pairing-code
pod=$(kubectl get pod -n bloommd-agents -l app.kubernetes.io/name=bloommd-openclaw-agent -o jsonpath='{.items[0].metadata.name}')
kubectl cp ./bloommd-pairing-code bloommd-agents/$pod:/tmp/bloommd-pairing-code
kubectl exec -n bloommd-agents "$pod" -- node /app/openclaw.mjs bloommd pair \
  --server https://bloommd.app \
  --bloommd-profile research \
  --pairing-code-file /tmp/bloommd-pairing-code
kubectl exec -n bloommd-agents "$pod" -- rm -f /tmp/bloommd-pairing-code
rm ./bloommd-pairing-code
```

Lege Modellzugang und BloomMD-Token ausschließlich über Secret-Mechanismen deiner Plattform an. Nie in ein Image, ein Repository oder eine Workspace-Datei schreiben.

## Wenn etwas nicht funktioniert

- **Pairing-Code abgelaufen:** In BloomMD einen neuen Agenten-Pairing-Code erzeugen und erneut pairen.
- **Agent bleibt wartend:** `openclaw bloommd status --bloommd-profile research` ausführen und prüfen, ob der lokale Plugin-Runner aktiviert ist.
- **Vorschlag kann nicht übernommen werden:** Die Seitenleiste aktualisieren, den Vorschlag erneut öffnen und auf einen sichtbaren Sync-Fehler achten. Bei einer zwischenzeitlichen Änderung bleibt der Vorschlag zur Prüfung erhalten.
- **Zugang beenden:** In BloomMD widerrufen und anschließend lokal `openclaw bloommd forget` ausführen.

Als Nächstes: [Zusammenarbeit im Workspace](/docs/collaboration) oder [BloomMD herunterladen](/download).
