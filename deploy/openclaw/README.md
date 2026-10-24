# BloomMD Workspace Agent in Docker und Kubernetes

Dieses Verzeichnis baut ein kleines, versioniertes Image auf Basis des offiziellen
OpenClaw-Images. Es fügt nur das BloomMD-Plugin und dessen Skill hinzu; Modellzugang,
OpenClaw-Gateway und Workspace bleiben beim Betreiber.

## Docker Compose

```bash
cp deploy/openclaw/.env.example deploy/openclaw/.env
# Ersetze den Platzhalter in deploy/openclaw/.env durch einen neuen, lokalen Gateway-Token:
openssl rand -base64 32
docker compose -f deploy/openclaw/docker-compose.yml build
docker compose -f deploy/openclaw/docker-compose.yml up -d

# Die einmalige Datei liegt außerhalb des Repositories und wird nach dem Pairing entfernt.
pbpaste > /tmp/bloommd-pairing-code
docker compose -f deploy/openclaw/docker-compose.yml cp \
  /tmp/bloommd-pairing-code bloommd-openclaw-agent:/tmp/bloommd-pairing-code
docker compose -f deploy/openclaw/docker-compose.yml exec bloommd-openclaw-agent \
  node /app/openclaw.mjs bloommd pair \
  --server https://bloommd.app \
  --bloommd-profile research \
  --pairing-code-file /tmp/bloommd-pairing-code
docker compose -f deploy/openclaw/docker-compose.yml exec bloommd-openclaw-agent \
  /bin/sh -c 'rm -f /tmp/bloommd-pairing-code'
```

Die Pairing-Datei wird nur für diesen einen Befehl in den Container eingebracht und danach
gelöscht; auch die lokale Datei unter `/tmp` sollte danach entfernt werden. Anschließend wird
das Plugin in der OpenClaw-Konfiguration mit
`profile: "research"` und `enabled: true` aktiviert. State- und Agent-Credential-Volumes sind
sensibel: Sie müssen privat bleiben und verschlüsselt gesichert werden.

Die Installation stellt die Unterbefehle bereit, startet aber noch keinen Modellturn. Erst diese
explizite Runner-Konfiguration aktiviert das Abholen eigener Aufträge:

```bash
docker compose -f deploy/openclaw/docker-compose.yml exec bloommd-openclaw-agent \
  node /app/openclaw.mjs config set \
  plugins.entries.bloommd-workspace-agent.config \
  '{"enabled":true,"profile":"research","openClawAgentId":"main","pollIntervalSeconds":60}' --strict-json
docker compose -f deploy/openclaw/docker-compose.yml restart bloommd-openclaw-agent
```

## Kubernetes

`kubernetes.yaml` enthält Namespace, nicht-default ServiceAccount, PersistentVolumeClaim,
Deployment mit Ressourcen-/Security-Context sowie eine restriktive NetworkPolicy. Vor dem Apply:

1. Den Image-Tag auf ein veröffentlichtes Plugin-Image setzen und für den produktiven Betrieb
   den nach dem Release angezeigten Image-Digest pinnen.
2. Eine verschlüsselte StorageClass für `bloommd-openclaw-state` auswählen.
3. Den verpflichtenden, zufälligen Gateway-Token als Kubernetes Secret anlegen und Modellzugang
   in der optionalen Secret-Ressource `openclaw-model-credentials` hinterlegen.
4. Einmalig in den Pod pairen oder einen kurzlebigen, nicht versionierten Pairing-Job verwenden.
5. Erst dann die Plugin-Konfiguration für das passende Profil aktivieren.

Die agenteneigene BloomMD-Zugangsdaten liegen absichtlich im beschreibbaren, verschlüsselten
OpenClaw-State: Das Pairing erzeugt sie dynamisch; ein als Volume projiziertes Kubernetes Secret
ist schreibgeschützt und kann diesen Austausch nicht korrekt fortschreiben. Der Zugang wird in
BloomMD widerrufen und kann zusätzlich über `openclaw bloommd forget` lokal entfernt werden.

```bash
kubectl create secret generic openclaw-gateway -n bloommd-agents \
  --from-literal=token="$(openssl rand -base64 32)"
kubectl apply -f deploy/openclaw/kubernetes.yaml
kubectl rollout status deployment/bloommd-openclaw-agent -n bloommd-agents
kubectl logs deployment/bloommd-openclaw-agent -n bloommd-agents
```

Das Deployment hat keinen Ingress und nimmt keine eingehenden Netzwerkverbindungen an. Es darf
DNS und HTTPS für BloomMD sowie den vom Betreiber konfigurierten Modellprovider aufbauen.

Für interaktives, einmaliges Pairing kann der Code wie bei Compose temporär in den laufenden Pod
kopiert werden. Der Code ist nach erfolgreichem Pairing ungültig und wird anschließend sowohl
im Pod als auch auf dem ausführenden Rechner gelöscht:

```bash
POD=$(kubectl get pod -n bloommd-agents -l app.kubernetes.io/name=bloommd-openclaw-agent \
  -o jsonpath='{.items[0].metadata.name}')
kubectl cp /tmp/bloommd-pairing-code "bloommd-agents/${POD}:/tmp/bloommd-pairing-code"
kubectl exec -n bloommd-agents "${POD}" -- node /app/openclaw.mjs bloommd pair \
  --server https://bloommd.app --bloommd-profile research --pairing-code-file /tmp/bloommd-pairing-code
kubectl exec -n bloommd-agents "${POD}" -- /bin/sh -c 'rm -f /tmp/bloommd-pairing-code'
kubectl exec -n bloommd-agents "${POD}" -- node /app/openclaw.mjs config set \
  plugins.entries.bloommd-workspace-agent.config \
  '{"enabled":true,"profile":"research","openClawAgentId":"main","pollIntervalSeconds":60}' --strict-json
kubectl rollout restart deployment/bloommd-openclaw-agent -n bloommd-agents
```
