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
| `fluent.js` | Microsoft Fluent UI System Icons, curated servers, clients, devices, apps, cloud, data, security, incident-response and code symbols (201) | <https://github.com/microsoft/fluentui-system-icons> | @fluentui/svg-icons 1.1.345 | MIT licence, see below. |
| `k8s.js` | Kubernetes icons (39, labelled) | <https://github.com/kubernetes/community/tree/main/icons> | `main`, 9 November 2026 | Apache-2.0 or CC-BY-4.0, at your choice. The Kubernetes logo is a trademark of The Linux Foundation. |
| `osa.js` | Open Security Architecture icons (77: infrastructure, network, endpoints, storage, devices, people, sites, concepts, industrial control, DevSecOps; navigation arrows left out) | <https://www.opensecurityarchitecture.org/foundations/icons/> | 2.6 (2026-02-06), osa-icons.zip and _manifest.json | CC BY-SA 4.0. This pack (cleaned and minified) is shared under the same licence. |
| `tabler.js` | Tabler Icons, outline (1,435: Devices, Computers, Database, Development and Version control whole; System, Document, Communication, Buildings, E-commerce and Charts by name; every cloud icon; no `-off` variants) | <https://github.com/tabler/tabler-icons> | @tabler/icons 3.52.0 | MIT licence, see below. |
| `carbon.js` | IBM Carbon icons, 32 px (797: Systems and Technology whole; User, AI, App catalogue and Data by name; a few named security icons; no filled/alt/outline variants) | <https://github.com/carbon-design-system/carbon/tree/main/packages/icons> | @carbon/icons 11.92.0 | Apache-2.0, see below. |
| `redhat.js` | Red Hat icons (254: standard and UI icons picked by name; standard wins on a duplicate name; no `-fill` variants) | <https://github.com/RedHat-UX/red-hat-icons> | @rhds/icons 2.3.1 | © Red Hat, Inc., CC BY 4.0. The embedded attribution comments are removed by cleaning, so attribution is given here and in the app's About & License. |
| `logos.js` | SVG Logos by Gil Barbara, curated SaaS, collaboration, identity, security, monitoring, cloud, data, DevOps, AI and web logos (277, colour; the `-icon` version where there is one) | <https://github.com/gilbarbara/logos> | `main`, 18 November 2026 | CC0-1.0. Logos are trademarks of their owners: use them only to refer to the product. |
| `fabrands.js` | Font Awesome Free brand icons (609) | <https://github.com/FortAwesome/Font-Awesome> | @fortawesome/fontawesome-free 7.3.1 | Icons CC BY 4.0, by Fonticons, Inc. (<https://fontawesome.com/license/free>). The embedded attribution comments are removed by cleaning, so attribution is given here and in the app's About & License. Logos are trademarks of their owners. |

Oracle Cloud icons were evaluated but not included: the official draw.io library stores nearly all of them as
draw.io shape definitions rather than SVG files.

## Rebuilding a pack

1. Download the official archive from the source above into an empty folder outside the repo and extract it.
2. Run `node scripts/build-stencils.mjs <aws|azure|entra|gcp|k8s|devicon|brands|fluent|osa|tabler|carbon|redhat|logos|fabrands> <extracted-folder>`. For Google Cloud,
   put the legacy archive's folders under `Legacy/` next to the core and category folders. For Devicon, the folder
   holds `devicon.json` and the fetched SVGs. Simple Icons, Fluent, Tabler, Carbon, Red Hat and Font Awesome use the extracted npm `package/` folder; SVG Logos the extracted repository (with `logos.json`); OSA a folder holding `_manifest.json` and the extracted `osa-icons/`.
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

### Tabler Icons (`tabler.js`)

```
MIT License

Copyright (c) 2020-2026 Paweł Kuna

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

### IBM Carbon icons (`carbon.js`)

Copyright IBM Corp. Licensed under the Apache License, Version 2.0 (<https://www.apache.org/licenses/LICENSE-2.0>).
The icons were cleaned (scripts, event handlers and outside links removed) and minified; no other changes.

### Red Hat icons (`redhat.js`)

© Red Hat, Inc. Licensed under the Creative Commons Attribution 4.0 International licence
(<https://creativecommons.org/licenses/by/4.0/>). Changes: cleaned and minified.

### Open Security Architecture icons (`osa.js`)

Icons by Open Security Architecture (<https://www.opensecurityarchitecture.org>), licensed under the Creative Commons
Attribution-ShareAlike 4.0 International licence (<https://creativecommons.org/licenses/by-sa/4.0/>). Changes: cleaned
and minified. This pack is shared under the same licence.

### Font Awesome Free brand icons (`fabrands.js`)

Font Awesome Free by Fonticons, Inc. (<https://fontawesome.com>). Icons licensed under the Creative Commons
Attribution 4.0 International licence (<https://fontawesome.com/license/free>). Changes: cleaned and minified (which
removes the attribution comment in each file; this notice and the app's About & License carry it instead).

### SVG Logos (`logos.js`)

By Gil Barbara and contributors, released under CC0-1.0 (<https://creativecommons.org/publicdomain/zero/1.0/>).
