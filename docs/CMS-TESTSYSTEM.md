# CMS im Testsystem

Das CMS (`apps/cms`, Image-Ziel `cms`) wird im Testsystem von BloomMD über GitOps im Cluster-Repo bereitgestellt.
Der Ops-Plan (Manifeste, Umsetzung Mo 16.11.2026) liegt im Cluster-Repo unter `docs/cms-testsystem-plan.md`.

- Medien: Das CMS speichert Medien im privaten S3-Bucket, sobald alle `CMS_S3_*`-Variablen gesetzt sind ([CMS-MEDIEN-S3.md](CMS-MEDIEN-S3.md)). Ohne diese Variablen liegen sie flüchtig im lokalen Ordner und gehen beim Pod-Neustart verloren.
- Dieser Commit dient als Auslöser für den ersten Build des `cms`-Images (A-104).
