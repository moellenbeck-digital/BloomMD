# CMS im Testsystem

Das CMS (`apps/cms`, Image-Ziel `cms`) wird im Testsystem von BloomMD über GitOps im Cluster-Repo bereitgestellt.
Der Ops-Plan (Manifeste, Umsetzung Mo 16.11.2026) liegt im Cluster-Repo unter `docs/cms-testsystem-plan.md`.

- Medien: Das CMS hat noch keinen S3-Adapter (Ticket O11 „CMS-Medien per S3-Adapter“); bis dahin liegen Medien im Test flüchtig.
- Dieser Commit dient als Auslöser für den ersten Build des `cms`-Images (A-104).
