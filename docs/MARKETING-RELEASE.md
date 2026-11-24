# Marketing veröffentlichen

Die Veröffentlichungsquelle ist `moellenbeck-digital/BloomMD`. Der manuell gestartete
Workflow `.github/workflows/marketing-release.yml` baut ausschließlich das Marketing-Image
mit dem vorhandenen Docker-Target. `BloomMD-archiv` ist dafür nicht mehr erforderlich.

## Voraussetzungen und Build

- Owner-Freigabe für die Veröffentlichung, dokumentiert im Release-Ticket.
- Die Marketing-Paketversion ist gegenüber dem zuletzt ausgelieferten Stand erhöht.
- Der genaue Quell-Commit liegt auf `main`; dessen Main-CI ist vollständig erfolgreich.
- Das bestehende private GHCR-Paket `bloommd-marketing` erlaubt dem aktuellen
  Repository `BloomMD` unter **Manage Actions access** Schreibzugriff. Die Sichtbarkeit
  des Pakets muss dafür nicht geändert werden. Keine neuen langlebigen Tokens nötig.

```sh
gh workflow run marketing-release.yml --repo moellenbeck-digital/BloomMD \
  -f source_sha=<vollständiger-main-sha> -f ci_run_id=<erfolgreicher-main-ci-lauf>
```

Die Action prüft SHA, Branch, Event, Workflow und CI-Ergebnis vor dem Checkout. Sie läuft
nur über `workflow_dispatch` von `main` im kanonischen Repository. Build-Metadaten kommen
vom Quell-Commit; die bestehende First-Party-Plausible-Konfiguration bleibt erhalten.
Die Zusammenfassung enthält Version, Quell-SHA, CI-Nachweis und den unveränderlichen
Image-Pin `ghcr.io/moellenbeck-digital/bloommd-marketing:sha-<sha>@sha256:<digest>`.

## Produktiver GitOps-Rollout

Die aktuelle Produktionsquelle liegt auf Forgejo:
`https://git.ops.moellenbeck-digital.io/moellenbeck-digital/bloommd-cluster`.
Das frühere `platform/deployments/projekte/bloommd` ist nicht mehr das produktive Ziel.

1. Im Cluster-Repo ausschließlich das Image des Deployments `bloommd-marketing` in
   `argocd/apps/bloommd-prod/workloads.yaml` auf den geprüften Pin setzen. Vorherigen Pin
   als Rollback-Nachweis im Release-Ticket festhalten. App, Sync, CMS und Testsystem
   erhalten dadurch keinen neuen Stand.
2. Änderung prüfen und über den bestehenden GitOps-Prozess nach `main` integrieren.
   Die Argo-CD-App `bloommd-prod` rollt automatisch aus; kein direkter Deployment-Patch.
3. Über den vorhandenen Wave-Zugang ArgoCD auf `Synced/Healthy`, beide Marketing-Replikas
   und deren tatsächlich verwendeten Digest prüfen. Zugangsdaten kommen aus 1Password,
   bleiben außerhalb von Git und werden weder protokolliert noch in Tickets kopiert.
4. `https://bloommd.io/api/version`, die sichtbare Footer-Version, DE/EN-Inhalte,
   Bilder, Links und mobile Darstellung live prüfen. Bestehende Health-/Blackbox-Prüfungen
   bleiben bestehen. Nachweise im gemeinsamen Release-Ticket sammeln.

Rollback: den vorherigen Marketing-Pin per geprüftem Git-Revert wiederherstellen und
ArgoCD, Replikas sowie öffentliche Version erneut prüfen. Keine Datenbankmigration ist
für einen reinen Marketing-Inhaltsrollout erforderlich.

Dieser Weg wurde für die Veröffentlichung von Desktop-0.6.0-News, Blog und Hilfe
in [#440](https://github.com/moellenbeck-digital/BloomMD/issues/440) vorbereitet;
die Pipeline-Migration wird in [#442](https://github.com/moellenbeck-digital/BloomMD/issues/442) nachgewiesen.
