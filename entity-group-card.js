/*
 * entity-group-card — a clean, GUI-driven Lovelace card that groups a device's
 * entities (or a hand-picked list) into a single tidy card.
 *
 * - Two entity sources: pick a device (auto-resolved via the entity registry)
 *   or hand-pick individual entities.
 * - Two layouts: labelled row-list, or compact icon+value chip-grid.
 * - Three background styles: default (theme-native), theme (per-card theme
 *   picker), manual (custom gradient).
 *
 * Single self-contained vanilla file, no build step. Icons use the built-in
 * <ha-state-icon> so they stay state-aware (door open/closed, battery level).
 *
 * Author: Jason Crouch — MIT. MDI icon paths © Pictogrammers (Apache 2.0).
 */

const ENTITY_GROUP_CARD_VERSION = '1.0.0';

console.info(
  `%c ENTITY-GROUP-CARD %c v${ENTITY_GROUP_CARD_VERSION} `,
  'color:#fff;background:#1565c0;font-weight:700;border-radius:3px 0 0 3px;padding:2px 4px;',
  'color:#1565c0;background:#e3f0fb;font-weight:700;border-radius:0 3px 3px 0;padding:2px 4px;'
);

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

// binary_sensor device_class -> [off label, on label]
const BINARY_LABELS = {
  door: ['Closed', 'Open'],
  garage_door: ['Closed', 'Open'],
  window: ['Closed', 'Open'],
  opening: ['Closed', 'Open'],
  lock: ['Locked', 'Unlocked'],
  motion: ['Clear', 'Detected'],
  occupancy: ['Clear', 'Detected'],
  presence: ['Away', 'Home'],
  moving: ['Not moving', 'Moving'],
  vibration: ['Clear', 'Detected'],
  sound: ['Clear', 'Detected'],
  battery: ['Normal', 'Low'],
  battery_charging: ['Not charging', 'Charging'],
  moisture: ['Dry', 'Wet'],
  smoke: ['Clear', 'Detected'],
  gas: ['Clear', 'Detected'],
  carbon_monoxide: ['Clear', 'Detected'],
  problem: ['OK', 'Problem'],
  safety: ['Safe', 'Unsafe'],
  tamper: ['Clear', 'Tampered'],
  connectivity: ['Disconnected', 'Connected'],
  power: ['Off', 'On'],
  plug: ['Unplugged', 'Plugged in'],
  running: ['Not running', 'Running'],
  update: ['Up-to-date', 'Update available'],
  cold: ['Normal', 'Cold'],
  heat: ['Normal', 'Hot'],
  light: ['No light', 'Light detected'],
};

function titleWords(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .split('_')
    .map((w) => (w.length ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');
}

// ---------------------------------------------------------------------------
// The card
// ---------------------------------------------------------------------------

class EntityGroupCard extends HTMLElement {
  setConfig(config) {
    this._config = Object.assign(
      {
        source: 'entities',
        layout: 'rows',
        style: 'default',
        show_header: true,
      },
      config || {}
    );
    this._rendered = false;
    this._lastSig = undefined;
    this._appliedThemeProps = [];
    // Force a rebuild on next hass tick.
    this._builtStyleKey = undefined;
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._config) return;

    // Device mode needs the entity registry to know which entities belong to
    // the chosen device. Fetch once, lazily, then re-render.
    if (this._config.source === 'device' && this._config.device) {
      if (!this._registry && !this._registryLoading) {
        this._loadRegistry();
        return; // render will fire when the registry resolves
      }
    }

    const list = this._resolveEntities();
    const sig = JSON.stringify([
      this._config.style,
      this._config.theme,
      hass.themes && hass.themes.darkMode,
      list.map((e) => {
        const s = hass.states[e.entity];
        return s ? [e.entity, s.state, s.attributes && s.attributes.icon] : [e.entity, 'missing'];
      }),
    ]);
    if (this._rendered && sig === this._lastSig) return;
    this._lastSig = sig;
    this._rendered = true;
    this._render(list);
  }

  getCardSize() {
    const n = this._resolveEntities().length || 1;
    return 1 + Math.ceil(n / (this._config && this._config.layout === 'grid' ? 3 : 1));
  }

  async _loadRegistry() {
    this._registryLoading = true;
    try {
      this._registry = await this._hass.callWS({ type: 'config/entity_registry/list' });
    } catch (err) {
      this._registry = [];
    }
    this._registryLoading = false;
    this._rendered = false; // force render
    this.hass = this._hass;
  }

  // Returns an ordered array of { entity, name?, icon? } items to display.
  _resolveEntities() {
    const cfg = this._config;
    if (!cfg) return [];

    // Per-entity overrides supplied in config (works in either mode).
    const overrides = {};
    (cfg.entities || []).forEach((item) => {
      if (typeof item === 'string') {
        overrides[item] = {};
      } else if (item && item.entity) {
        overrides[item.entity] = item;
      }
    });

    if (cfg.source === 'device') {
      if (!cfg.device || !this._registry) return [];
      const showAdvanced = !!cfg.show_advanced;
      let entries = this._registry
        .filter((e) => e.device_id === cfg.device)
        .filter((e) => !e.hidden_by && !e.disabled_by)
        .filter((e) => showAdvanced || (e.entity_category !== 'config' && e.entity_category !== 'diagnostic'));
      return entries
        .map((e) => {
          const ov = overrides[e.entity_id] || {};
          if (ov.hide) return null;
          return { entity: e.entity_id, name: ov.name, icon: ov.icon };
        })
        .filter(Boolean);
    }

    // Manual entities mode. Accept the GUI's multi-select array of ids, or the
    // richer list-of-objects form.
    return (cfg.entities || [])
      .map((item) => {
        if (typeof item === 'string') return { entity: item };
        if (item && item.entity) {
          if (item.hide) return null;
          return { entity: item.entity, name: item.name, icon: item.icon };
        }
        return null;
      })
      .filter(Boolean);
  }

  _formatState(stateObj) {
    if (!stateObj) return '—';
    const domain = stateObj.entity_id.split('.')[0];
    const attrs = stateObj.attributes || {};
    const state = stateObj.state;

    if (state === 'unavailable') return 'Unavailable';
    if (state === 'unknown') return 'Unknown';

    if (domain === 'binary_sensor') {
      const map = BINARY_LABELS[attrs.device_class];
      if (map) return state === 'on' ? map[1] : map[0];
      return state === 'on' ? 'On' : 'Off';
    }
    if (domain === 'update') {
      return state === 'on' ? 'Update available' : 'Up-to-date';
    }
    const unit = attrs.unit_of_measurement;
    if (unit) return `${state}${unit === '%' ? '' : ' '}${unit}`;

    // Non-numeric text states: tidy up snake_case.
    if (/^[a-z0-9_]+$/.test(state)) return titleWords(state);
    return state;
  }

  _displayName(item, stateObj) {
    if (item.name) return item.name;
    if (stateObj && stateObj.attributes && stateObj.attributes.friendly_name) {
      return stateObj.attributes.friendly_name;
    }
    return item.entity;
  }

  _stylePalette() {
    const s = (this._config && this._config.style) || 'default';
    if (s === 'manual') {
      const from = this._config.background_start || '#1565c0';
      const to = this._config.background_end || '#0d2b45';
      const dark = !!this._config.dark_text;
      return {
        cardBackground: `linear-gradient(145deg, ${from} 0%, ${to} 130%)`,
        text: dark ? '#212121' : '#ffffff',
        secondary: dark ? 'rgba(0,0,0,.6)' : 'rgba(255,255,255,.75)',
        chip: dark ? 'rgba(0,0,0,.06)' : 'rgba(255,255,255,.12)',
        iconColor: dark ? 'rgba(0,0,0,.7)' : 'rgba(255,255,255,.92)',
      };
    }
    // default + theme both lean on theme variables. Theme vars get applied to
    // the host separately in _applyTheme().
    return {
      cardBackground: '',
      text: 'var(--primary-text-color)',
      secondary: 'var(--secondary-text-color)',
      chip: 'var(--secondary-background-color, rgba(127,127,127,.12))',
      iconColor: '',
    };
  }

  _applyTheme() {
    // Clear previously-applied per-card theme vars.
    this._appliedThemeProps.forEach((k) => this.style.removeProperty(k));
    this._appliedThemeProps = [];

    if (!this._config || this._config.style !== 'theme') return;
    const themeName = this._config.theme;
    const themes = this._hass && this._hass.themes;
    if (!themeName || !themes || !themes.themes || !themes.themes[themeName]) return;

    const def = themes.themes[themeName];
    let vars = Object.assign({}, def);
    if (def.modes) {
      const mode = themes.darkMode ? def.modes.dark : def.modes.light;
      vars = Object.assign(vars, mode || {});
    }
    Object.keys(vars).forEach((key) => {
      if (key === 'modes') return;
      const prop = `--${key}`;
      this.style.setProperty(prop, vars[key]);
      this._appliedThemeProps.push(prop);
    });
  }

  _render(list) {
    if (!this._hass || !this._config) return;
    const cfg = this._config;
    const pal = this._stylePalette();
    this._applyTheme();

    const layout = cfg.layout === 'grid' ? 'grid' : 'rows';
    const columns = cfg.columns && Number(cfg.columns) > 0 ? Number(cfg.columns) : null;

    // Header
    const title = cfg.title !== undefined ? cfg.title : '';
    const headerIcon = cfg.icon;
    const headerHtml =
      cfg.show_header === false
        ? ''
        : `<div class="dc-header">
            ${headerIcon ? `<ha-icon class="dc-header-icon" icon="${headerIcon}"></ha-icon>` : ''}
            <div class="dc-title">${title || ''}</div>
          </div>`;

    // Body
    let bodyHtml = '';
    if (!list.length) {
      bodyHtml = `<div class="dc-empty">No entities selected. Open the card editor to choose a device or entities.</div>`;
    } else if (layout === 'grid') {
      bodyHtml = `<div class="dc-grid">${list
        .map((item, i) => {
          const s = this._hass.states[item.entity];
          return `<div class="dc-chip" data-entity="${item.entity}">
              <span class="dc-chip-icon" data-icon="${i}"></span>
              <span class="dc-chip-value">${this._formatState(s)}</span>
            </div>`;
        })
        .join('')}</div>`;
    } else {
      bodyHtml = `<div class="dc-rows">${list
        .map((item, i) => {
          const s = this._hass.states[item.entity];
          return `<div class="dc-row" data-entity="${item.entity}">
              <span class="dc-row-icon" data-icon="${i}"></span>
              <span class="dc-row-name">${this._displayName(item, s)}</span>
              <span class="dc-row-value">${this._formatState(s)}</span>
            </div>`;
        })
        .join('')}</div>`;
    }

    const gridCols = columns
      ? `grid-template-columns: repeat(${columns}, 1fr);`
      : `grid-template-columns: repeat(auto-fit, minmax(84px, 1fr));`;

    this.innerHTML = `
      <ha-card>
        <style>
          ha-card {
            ${pal.cardBackground ? `background: ${pal.cardBackground};` : ''}
            overflow: hidden;
          }
          .dc-wrap { padding: 16px; ${pal.iconColor ? `--dc-icon-color:${pal.iconColor};` : ''} }
          .dc-header { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
          .dc-header-icon { --mdc-icon-size: 24px; color: ${pal.secondary}; }
          .dc-title { font-size: 24px; font-weight: 400; color: ${pal.text}; line-height: 1.1; }
          .dc-empty { color: ${pal.secondary}; font-size: 14px; }

          /* row list */
          .dc-rows { display: flex; flex-direction: column; gap: 14px; }
          .dc-row { display: flex; align-items: center; gap: 12px; cursor: pointer; }
          .dc-row-icon { display: inline-flex; }
          .dc-row-name { color: ${pal.text}; font-size: 15px; flex: 1 1 auto; }
          .dc-row-value { color: ${pal.secondary}; font-size: 15px; text-align: right; white-space: nowrap; }

          /* chip grid */
          .dc-grid { display: grid; ${gridCols} gap: 12px; }
          .dc-chip {
            display: flex; flex-direction: column; align-items: center; gap: 8px;
            padding: 14px 8px; border-radius: 14px; background: ${pal.chip};
            cursor: pointer;
          }
          .dc-chip-value { color: ${pal.text}; font-size: 15px; text-align: center; }

          .dc-row-icon ha-state-icon, .dc-row-icon ha-icon,
          .dc-chip-icon ha-state-icon, .dc-chip-icon ha-icon {
            --mdc-icon-size: 24px;
            ${pal.iconColor ? `color: var(--dc-icon-color);` : ''}
          }
        </style>
        <div class="dc-wrap">
          ${headerHtml}
          ${bodyHtml}
        </div>
      </ha-card>
    `;

    // Populate state-aware icons (can't be set via innerHTML string).
    this.querySelectorAll('[data-icon]').forEach((holder) => {
      const idx = Number(holder.getAttribute('data-icon'));
      const item = list[idx];
      if (!item) return;
      const s = this._hass.states[item.entity];
      let iconEl;
      if (item.icon) {
        iconEl = document.createElement('ha-icon');
        iconEl.setAttribute('icon', item.icon);
      } else {
        iconEl = document.createElement('ha-state-icon');
        iconEl.hass = this._hass;
        iconEl.stateObj = s;
      }
      holder.appendChild(iconEl);
    });

    // Tap opens the more-info dialog, like native entity cards.
    this.querySelectorAll('[data-entity]').forEach((el) => {
      el.addEventListener('click', () => {
        const ev = new Event('hass-more-info', { bubbles: true, composed: true });
        ev.detail = { entityId: el.getAttribute('data-entity') };
        this.dispatchEvent(ev);
      });
    });
  }

  static getConfigElement() {
    return document.createElement('entity-group-card-editor');
  }

  static getStubConfig() {
    return {
      type: 'custom:entity-group-card',
      source: 'entities',
      entities: [],
      layout: 'rows',
      style: 'default',
      show_header: true,
    };
  }
}

customElements.define('entity-group-card', EntityGroupCard);

// ---------------------------------------------------------------------------
// The GUI editor
// ---------------------------------------------------------------------------

class EntityGroupCardEditor extends HTMLElement {
  setConfig(config) {
    // Focus-loss fix: HA echoes emitted config back into setConfig. Skip work
    // when the normalized config is unchanged so text fields keep focus.
    const norm = JSON.stringify(Object.assign({}, config, { type: undefined }));
    this._config = config;
    if (norm === this._lastNorm && this._form) {
      this._form.data = config;
      return;
    }
    this._lastNorm = norm;
    this._build();
  }

  set hass(hass) {
    this._hass = hass;
    if (this._form) this._form.hass = hass;
    if (!this._built) this._build();
  }

  _schema() {
    const cfg = this._config || {};
    const schema = [
      { name: 'title', selector: { text: {} } },
      { name: 'icon', selector: { icon: {} } },
      {
        name: 'source',
        selector: {
          select: {
            mode: 'dropdown',
            options: [
              { value: 'entities', label: 'Pick entities' },
              { value: 'device', label: 'Pick a device' },
            ],
          },
        },
      },
    ];

    if (cfg.source === 'device') {
      schema.push({ name: 'device', selector: { device: {} } });
      schema.push({ name: 'show_advanced', selector: { boolean: {} } });
    } else {
      schema.push({ name: 'entities', selector: { entity: { multiple: true } } });
    }

    schema.push({
      name: 'layout',
      selector: {
        select: {
          mode: 'dropdown',
          options: [
            { value: 'rows', label: 'Row list (icon · name · value)' },
            { value: 'grid', label: 'Chip grid (icon + value)' },
          ],
        },
      },
    });
    if (cfg.layout === 'grid') {
      schema.push({ name: 'columns', selector: { number: { min: 1, max: 8, mode: 'box' } } });
    }

    schema.push({
      name: 'style',
      selector: {
        select: {
          mode: 'dropdown',
          options: [
            { value: 'default', label: 'Default (theme-native)' },
            { value: 'theme', label: 'Theme (per-card)' },
            { value: 'manual', label: 'Manual (custom gradient)' },
          ],
        },
      },
    });

    if (cfg.style === 'theme') {
      const themeNames =
        this._hass && this._hass.themes && this._hass.themes.themes
          ? Object.keys(this._hass.themes.themes).sort()
          : [];
      schema.push({
        name: 'theme',
        selector: { select: { mode: 'dropdown', options: themeNames } },
      });
    } else if (cfg.style === 'manual') {
      schema.push({ name: 'background_start', selector: { text: {} } });
      schema.push({ name: 'background_end', selector: { text: {} } });
      schema.push({ name: 'dark_text', selector: { boolean: {} } });
    }

    schema.push({ name: 'show_header', selector: { boolean: {} } });
    return schema;
  }

  _labels() {
    return {
      title: 'Title (optional)',
      icon: 'Header icon (optional)',
      source: 'Entity source',
      device: 'Device',
      show_advanced: 'Include config/diagnostic entities',
      entities: 'Entities',
      layout: 'Layout',
      columns: 'Columns (grid)',
      style: 'Background style',
      theme: 'Theme',
      background_start: 'Gradient start (hex, e.g. #1565c0)',
      background_end: 'Gradient end (hex, e.g. #0d2b45)',
      dark_text: 'Dark text (for light gradients)',
      show_header: 'Show header',
    };
  }

  _build() {
    this._built = true;
    if (!this._form) {
      this._form = document.createElement('ha-form');
      this._form.computeLabel = (s) => this._labels()[s.name] || s.name;
      this._form.addEventListener('value-changed', (ev) => {
        ev.stopPropagation();
        const next = Object.assign({}, this._config, ev.detail.value);
        this.dispatchEvent(
          new CustomEvent('config-changed', { detail: { config: next }, bubbles: true, composed: true })
        );
      });
      this.appendChild(this._form);
    }
    if (this._hass) this._form.hass = this._hass;
    this._form.schema = this._schema();
    this._form.data = this._config || {};
  }
}

customElements.define('entity-group-card-editor', EntityGroupCardEditor);

// ---------------------------------------------------------------------------
// Register in the card picker
// ---------------------------------------------------------------------------

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'entity-group-card',
  name: 'Entity Group Card',
  preview: true,
  description:
    'Clean, GUI-driven card that groups a device’s entities (or a hand-picked list) as a labelled row-list or compact chip-grid, with default / per-card-theme / custom-gradient backgrounds.',
  documentationURL: 'https://github.com/mycrouch/entity-group-card',
});
