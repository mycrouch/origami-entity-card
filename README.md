# Kirigami Card

One sheet of paper, folded and cut into countless shapes — that's the idea. A
clean, GUI-driven Lovelace card that groups a device's entities, or any
hand-picked list, into whatever shape your dashboard needs: a labelled row
list, a compact chip grid, theme-native or on a custom gradient.

Part of the **kirigami** family of flexible, general-purpose Home Assistant cards.

<table>
  <tr>
    <td width="33%" valign="top"><img src="images/rows.png" alt="Row list"></td>
    <td width="33%" valign="top"><img src="images/grid.png" alt="Chip grid"></td>
    <td width="33%" valign="top"><img src="images/gradients.png" alt="Gradient cards"></td>
  </tr>
</table>

## Features

- **Two entity sources.** Pick a **device** and its entities are auto-loaded
  into an editable list — then remove any you don't want, reorder, rename, or
  set a custom icon per entity. Or start from **Entity** and hand-pick from
  anywhere. (Device mode is rename-safe — it follows `device_id`.)
- **Two layouts.** A labelled **row list** (icon · name · value) or a compact
  **chip grid** (icon + value) with a 1–5 **column chooser** (or responsive
  auto-fit).
- **Three background styles.** `default` (theme-native), `theme` (apply any
  installed theme to just this card), or `manual` (a custom gradient).
- **State-aware icons** via Home Assistant's own `<ha-state-icon>` (door
  open/closed, battery level), with per-entity icon overrides.
- **Tidy values.** `device_class`-aware text (Open/Closed, Detected/Clear,
  Normal/Low); numbers rounded to 2 decimals; names ellipsise instead of
  wrapping when narrow. Tap any item for the native more-info dialog.
- **Full GUI editor** — Style and Content sections, no YAML required.

## Installation

### HACS (custom repository)

1. HACS → three-dot menu → **Custom repositories**.
2. Add `https://github.com/mycrouch/kirigami-card`, category **Dashboard**.
3. Install **Kirigami Card**, then hard-refresh the browser.

### Manual

Copy `kirigami-card.js` to `/config/www/` and add a dashboard resource:

```yaml
url: /local/kirigami-card.js
type: module
```

## Configuration

Add the card from the picker ("Kirigami Card") and use the visual editor — every
option is exposed there. YAML is fully supported too:

```yaml
# Device mode — auto-pull a device's entities as a chip grid
type: custom:kirigami-card
title: Kitchen
icon: mdi:countertop
source: device
device: 1a2b3c...          # device_id (the editor picks this for you)
layout: grid
columns: 3
style: default

# Manual mode — hand-picked entities as a row list on a custom gradient
type: custom:kirigami-card
title: Front Door
source: entities
entities:
  - binary_sensor.front_door_contact
  - sensor.front_door_battery
  - entity: binary_sensor.front_door_debug
    name: Debug
    icon: mdi:bug
layout: rows
style: manual
background_start: "#1565c0"
background_end: "#0d2b45"
```

### Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `title` | string | – | Header title. Omit and set `show_header: false` for a bare card. |
| `icon` | string | – | Optional header icon (any `mdi:` name). |
| `source` | `device` \| `entities` | `device` | Where the entities come from. |
| `device` | string | – | Device ID (device mode). Editor pre-fills the entity list from it. |
| `entities` | list | `[]` | Entity IDs, or `{entity, name, icon, hide}` objects for overrides. |
| `layout` | `rows` \| `grid` | `rows` | Row list or chip grid. |
| `columns` | number | auto | Fixed column count 1–5 for grid (blank = responsive auto-fit). |
| `style` | `default` \| `theme` \| `manual` | `default` | Background style. |
| `theme` | string | – | Installed theme name (theme mode). |
| `background_start` | hex | `#1565c0` | Gradient start (manual mode). |
| `background_end` | hex | `#0d2b45` | Gradient end (manual mode). |
| `dark_text` | boolean | `false` | Use dark text for light gradients. |
| `show_header` | boolean | `true` | Show/hide the header row. |

> Previously published as **entity-group-card**; the old `custom:entity-group-card`
> type still works as an alias, so existing dashboards keep rendering.

## The mycrouch card collection

These Home Assistant Lovelace cards share a common design language — a clean
**default** look that inherits your active theme, plus a per-card **theme**
picker — so they sit together neatly on one dashboard. Pair any of them with
**gradient-themes** for 40 ready-made gradient and pastel backgrounds.

| Card | What it is |
| --- | --- |
| **Kirigami Card** (this card) | Group any device's entities as a row list or chip grid |
| [pro-v-weather-card](https://github.com/mycrouch/pro-v-weather-card) | Weather-station console — clock, moon, forecast, UV, solar, wind |
| [weather-station-card](https://github.com/mycrouch/weather-station-card) | LCD-console weather station with backlight themes |
| [airtouch-card](https://github.com/mycrouch/airtouch-card) | AirTouch 4/5 AC + zone control |
| [sensibo-thermostat-card](https://github.com/mycrouch/sensibo-thermostat-card) | Sensibo thermostat with mode-coloured backgrounds |
| [ecovacs-vacuum-card](https://github.com/mycrouch/ecovacs-vacuum-card) | Ecovacs/Deebot vacuum with area cleaning |
| [gradient-themes](https://github.com/mycrouch/gradient-themes) | 40 gradient + pastel dashboard themes |

## License

MIT © Jason Crouch. Icons rendered via Home Assistant's built-in Material Design
Icons (© Pictogrammers, Apache 2.0); no icon assets are bundled.
