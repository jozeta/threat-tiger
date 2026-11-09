# Cloud stencil packs

These icon sets are **not** covered by Threat Tiger's MIT licence. They belong to their owners and are included
under the terms below, for use in architecture and threat-model diagrams. They are not modified beyond removing
scripts, event handlers, outside links and metadata, and minifying.

| File | Set | Source | Version | Terms |
|------|-----|--------|---------|-------|
| `aws.js` | AWS Architecture Icons (305 service icons, 48 px) | <https://aws.amazon.com/architecture/icons/> | Icon package 31 July 2026 | "We allow customers and partners to use these toolkits and assets to create architecture diagrams." |
| `azure.js` | Azure architecture icons (720) | <https://learn.microsoft.com/en-us/azure/architecture/icons/> | Azure_Public_Service_Icons_V25 | "Microsoft permits the use of these icons in architectural diagrams, training materials, or documentation. You can copy, distribute, and display the icons only for the permitted use unless granted explicit permission by Microsoft. Microsoft reserves all other rights." |
| `entra.js` | Microsoft Entra architecture icons (7, colour) | <https://learn.microsoft.com/en-us/entra/architecture/architecture-icons> | October 2023 | Same Microsoft terms as Azure. |
| `gcp.js` | Google Cloud product and category icons (45) | <https://cloud.google.com/icons> | core-products-icons.zip and category-icons.zip, downloaded 9 November 2026 | Official Google Cloud icon library, for architecture diagrams. |
| `k8s.js` | Kubernetes icons (39, labelled) | <https://github.com/kubernetes/community/tree/main/icons> | `main`, 9 November 2026 | Apache-2.0 or CC-BY-4.0, at your choice. The Kubernetes logo is a trademark of The Linux Foundation. |

Oracle Cloud icons were evaluated but not included: the official draw.io library stores nearly all of them as
draw.io shape definitions rather than SVG files.

## Rebuilding a pack

1. Download the official archive from the source above into an empty folder outside the repo and extract it.
2. Run `node scripts/build-stencils.mjs <aws|azure|entra|gcp|k8s> <extracted-folder>`.
3. Update the pin in `vendor/checksums.json` (`npm run sync -- --check` reports the new hash) and this table.

The script cleans every SVG (`cleanSvg`) and maps each icon to a component type and subtypes (`classify`), so
threat suggestions work for placed icons. Placed icons store their own copy of the icon in the model, so a saved
model does not depend on these files.
