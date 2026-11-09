# Cloud stencil packs

These icon sets are **not** covered by Threat Tiger's MIT licence. They belong to their owners and are included
under the terms below, for use in architecture and threat-model diagrams. They are not modified beyond removing
scripts, event handlers, outside links and metadata, and minifying.

| File | Set | Source | Version | Terms |
|------|-----|--------|---------|-------|
| `aws.js` | AWS Architecture Icons (303 service icons, 48 px) | <https://aws.amazon.com/architecture/icons/> | Icon package 31 July 2026 | "We allow customers and partners to use these toolkits and assets to create architecture diagrams." |
| `azure.js` | Azure architecture icons (643, duplicates removed) | <https://learn.microsoft.com/en-us/azure/architecture/icons/> | Azure_Public_Service_Icons_V25 | "Microsoft permits the use of these icons in architectural diagrams, training materials, or documentation. You can copy, distribute, and display the icons only for the permitted use unless granted explicit permission by Microsoft. Microsoft reserves all other rights." |
| `entra.js` | Microsoft Entra architecture icons (7, colour) | <https://learn.microsoft.com/en-us/entra/architecture/architecture-icons> | October 2023 | Same Microsoft terms as Azure. |
| `gcp.js` | Google Cloud product, category and legacy product icons (252) | <https://cloud.google.com/icons> | core-products-icons.zip, category-icons.zip and google-cloud-legacy-icons.zip, downloaded 9 November 2026 | Official Google Cloud icon library, for architecture diagrams. |
| `devicon.js` | Devicon technology and OS logos (656; the plain version where the main one is over 60 KB) | <https://github.com/devicons/devicon> | `master`, 9 November 2026 (one main SVG per technology) | MIT licence, see below. Logos are trademarks of their owners. |
| `brands.js` | Simple Icons, curated security, hacking, incident response, DevSecOps, identity, OS and code brands (133) | <https://github.com/simple-icons/simple-icons> | 16.37.0 | CC0-1.0 (only icons without a more restrictive licence are included). Logos are trademarks of their owners: use them only to refer to the product, not to suggest endorsement. |
| `fluent.js` | Microsoft Fluent UI System Icons, curated servers, clients, devices, apps, cloud, data, security, incident-response and code symbols (192) | <https://github.com/microsoft/fluentui-system-icons> | @fluentui/svg-icons 1.1.345 | MIT licence, see below. |
| `k8s.js` | Kubernetes icons (39, labelled) | <https://github.com/kubernetes/community/tree/main/icons> | `main`, 9 November 2026 | Apache-2.0 or CC-BY-4.0, at your choice. The Kubernetes logo is a trademark of The Linux Foundation. |

Oracle Cloud icons were evaluated but not included: the official draw.io library stores nearly all of them as
draw.io shape definitions rather than SVG files.

## Rebuilding a pack

1. Download the official archive from the source above into an empty folder outside the repo and extract it.
2. Run `node scripts/build-stencils.mjs <aws|azure|entra|gcp|k8s|devicon|brands|fluent> <extracted-folder>`. For Google Cloud,
   put the legacy archive's folders under `Legacy/` next to the core and category folders. For Devicon, the folder
   holds `devicon.json` and the fetched SVGs. Simple Icons and Fluent use the extracted npm `package/` folder.
3. Update the pin in `vendor/checksums.json` (`npm run sync -- --check` reports the new hash) and this table.

The script cleans every SVG (`cleanSvg`) and maps each icon to a component type and subtypes (`classify`), so
threat suggestions work for placed icons. Placed icons store their own copy of the icon in the model, so a saved
model does not depend on these files.

## Licence notices

### Devicon (`devicon.js`)

```
The MIT License (MIT)

Copyright (c) 2015 konpa

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

### Fluent UI System Icons (`fluent.js`)

```
MIT License

Copyright (c) Microsoft Corporation.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
