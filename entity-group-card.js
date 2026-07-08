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

const ENTITY_GROUP_CARD_VERSION = '1.3.1';

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
        source: 'device',
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

    // YAML fallback only: an empty list + a device needs the registry to know
    // which entities belong to it. Normally the editor pre-fills `entities`.
    const hasList = (this._config.entities || []).length > 0;
    if (!hasList && this._config.source === 'device' && this._config.device) {
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
  // The `entities` list is the source of truth (device mode just pre-fills it
  // in the editor). As a YAML convenience, an empty list + a device falls back
  // to live registry resolution.
  _resolveEntities() {
    const cfg = this._config;
    if (!cfg) return [];

    const list = cfg.entities || [];
    if (list.length) {
      return list
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

    if (cfg.source === 'device' && cfg.device && this._registry) {
      const showAdvanced = !!cfg.show_advanced;
      return this._registry
        .filter((e) => e.device_id === cfg.device)
        .filter((e) => !e.hidden_by && !e.disabled_by)
        .filter((e) => showAdvanced || (e.entity_category !== 'config' && e.entity_category !== 'diagnostic'))
        .map((e) => ({ entity: e.entity_id }));
    }

    return [];
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
      // A soft neutral overlay — light on light themes, subtle on dark — rather
      // than --secondary-background-color, which is too heavy on many themes.
      chip: 'rgba(127, 127, 127, 0.06)',
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

    // Render into a shadow root so each card's <style> (and its ha-card
    // background) is scoped to this instance. In the light DOM a bare
    // `ha-card { background }` rule leaks to every card on the page — the last
    // one rendered would win, so all cards ended up the same colour.
    if (!this._root) this._root = this.attachShadow({ mode: 'open' });
    this._root.innerHTML = `
      <ha-card>
        <style>
          :host { display: block; }
          ha-card {
            ${pal.cardBackground ? `background: ${pal.cardBackground};` : ''}
            overflow: hidden;
          }
          .dc-wrap { padding: 14px 12px; ${pal.iconColor ? `--dc-icon-color:${pal.iconColor};` : ''} }
          .dc-header { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
          .dc-header-icon { --mdc-icon-size: 24px; color: ${pal.secondary}; }
          .dc-title { font-size: 24px; font-weight: 400; color: ${pal.text}; line-height: 1.1; }
          .dc-empty { color: ${pal.secondary}; font-size: 14px; }

          /* row list */
          .dc-rows { display: flex; flex-direction: column; gap: 14px; }
          .dc-row { display: flex; align-items: center; gap: 12px; cursor: pointer; }
          .dc-row-icon { display: inline-flex; flex: 0 0 auto; }
          /* Name stays on one line and ellipsises instead of wrapping into a
             tall stack when the card is narrow. */
          .dc-row-name { color: ${pal.text}; font-size: 15px; flex: 1 1 auto; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
          .dc-row-value { color: ${pal.secondary}; font-size: 15px; text-align: right; white-space: nowrap; flex: 0 0 auto; }

          /* chip grid */
          .dc-grid { display: grid; ${gridCols} gap: 8px; }
          .dc-chip {
            display: flex; flex-direction: column; align-items: center; gap: 8px;
            padding: 12px 4px; border-radius: 14px; background: ${pal.chip};
            cursor: pointer; min-width: 0;
          }
          .dc-chip-value { color: ${pal.text}; font-size: 14px; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }

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
    this._root.querySelectorAll('[data-icon]').forEach((holder) => {
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
    this._root.querySelectorAll('[data-entity]').forEach((el) => {
      el.addEventListener('click', () => {
        this.dispatchEvent(
          new CustomEvent('hass-more-info', {
            detail: { entityId: el.getAttribute('data-entity') },
            bubbles: true,
            composed: true,
          })
        );
      });
    });
  }

  static getConfigElement() {
    return document.createElement('entity-group-card-editor');
  }

  static getStubConfig() {
    return {
      type: 'custom:entity-group-card',
      source: 'device',
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
    this._config = config || {};
    // Focus-loss fix: HA echoes emitted config back into setConfig. When only
    // field values changed (not the structure), just refresh form data instead
    // of rebuilding the DOM, so inputs keep focus.
    const sig = this._structSig(this._config);
    if (this._built && sig === this._structSig(this._lastConfig || {})) {
      this._lastConfig = this._config;
      this._refreshData();
      return;
    }
    this._lastConfig = this._config;
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (this._styleForm) this._styleForm.hass = hass;
    if (this._sourceForm) this._sourceForm.hass = hass;
    if (this._deviceForm) this._deviceForm.hass = hass;
    if (this._addForm) this._addForm.hass = hass;
    (this._rowForms || []).forEach((f) => (f.hass = hass));
    if (!this._built && this._config) this._render();
  }

  // What forces a full rebuild: the source, the device, and the list of entity
  // ids (add/remove/reorder). Editing a name/icon does NOT change this.
  _structSig(cfg) {
    return JSON.stringify([
      cfg.source || 'device',
      cfg.device || '',
      cfg.layout || 'rows',
      cfg.style || 'default',
      this._ids(cfg),
    ]);
  }

  _ids(cfg) {
    return ((cfg && cfg.entities) || []).map((e) => (typeof e === 'string' ? e : e && e.entity)).filter(Boolean);
  }

  _rows(cfg) {
    return ((cfg && cfg.entities) || [])
      .map((e) => (typeof e === 'string' ? { entity: e } : e))
      .filter((e) => e && e.entity);
  }

  // Emit a cleaned config: entities become plain strings when they carry no
  // override, objects when they do.
  _emit(next) {
    const clean = Object.assign({}, next);
    clean.entities = (next.entities || []).map((e) => {
      const o = typeof e === 'string' ? { entity: e } : e;
      const out = { entity: o.entity };
      if (o.name) out.name = o.name;
      if (o.icon) out.icon = o.icon;
      return out.name || out.icon ? out : o.entity;
    });
    this._config = clean;
    this._lastConfig = clean;
    this.dispatchEvent(
      new CustomEvent('config-changed', { detail: { config: clean }, bubbles: true, composed: true })
    );
  }

  _labels() {
    return {
      title: 'Title (optional)',
      icon: 'Header icon (optional)',
      source: 'Choose a device or pick entities',
      device: 'Device',
      layout: 'Layout',
      columns: 'Columns (1–5, blank = auto-fit)',
      style: 'Background style',
      theme: 'Theme',
      background_start: 'Gradient start (hex, e.g. #1565c0)',
      background_end: 'Gradient end (hex, e.g. #0d2b45)',
      dark_text: 'Dark text (for light gradients)',
      show_header: 'Show header',
      entity: 'Entity',
      name: 'Name',
    };
  }

  // Top section: everything about how the card looks.
  _styleSchema() {
    const cfg = this._config || {};
    const schema = [
      { name: 'title', selector: { text: {} } },
      { name: 'icon', selector: { icon: {} } },
      {
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
      },
    ];
    if (cfg.layout === 'grid') {
      schema.push({ name: 'columns', selector: { number: { min: 1, max: 5, mode: 'box' } } });
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
      schema.push({ name: 'theme', selector: { select: { mode: 'dropdown', options: themeNames } } });
    } else if (cfg.style === 'manual') {
      schema.push({ name: 'background_start', selector: { text: {} } });
      schema.push({ name: 'background_end', selector: { text: {} } });
      schema.push({ name: 'dark_text', selector: { boolean: {} } });
    }
    schema.push({ name: 'show_header', selector: { boolean: {} } });
    return schema;
  }

  // Bottom section: where the entities come from.
  _sourceSchema() {
    return [
      {
        name: 'source',
        selector: {
          select: {
            mode: 'dropdown',
            options: [
              { value: 'device', label: 'Device — choose a device' },
              { value: 'entities', label: 'Entity — pick entities' },
            ],
          },
        },
      },
    ];
  }

  async _loadDeviceEntities(device) {
    if (!this._hass || !device) return;
    try {
      if (!this._reg) this._reg = await this._hass.callWS({ type: 'config/entity_registry/list' });
    } catch (e) {
      this._reg = [];
    }
    // Pre-fill the short name (registry name / original_name) so device cards
    // don't repeat the device prefix on every row (e.g. "Battery low", not
    // "Front Door Battery low"). Falls back to a bare id when there's no name.
    const items = this._reg
      .filter((e) => e.device_id === device && !e.hidden_by && !e.disabled_by)
      .map((e) => {
        const short = e.name || e.original_name;
        return short ? { entity: e.entity_id, name: short } : e.entity_id;
      });
    this._emit(Object.assign({}, this._config, { entities: items }));
    this._render();
  }

  _render() {
    this._built = true;
    const cfg = this._config || {};

    if (!this._container) {
      this._container = document.createElement('div');
      const style = document.createElement('style');
      style.textContent = `
        .egc-ed { display: flex; flex-direction: column; gap: 12px; }
        .egc-sec { border: 1px solid var(--divider-color, #e0e0e0); border-radius: 10px; padding: 12px 14px; display: flex; flex-direction: column; gap: 12px; }
        .egc-sec-title { font-weight: 500; font-size: 13px; text-transform: uppercase; letter-spacing: .04em; color: var(--secondary-text-color); }
        .egc-hint { color: var(--secondary-text-color); font-size: 12px; margin: -6px 0 2px; }
        .egc-row { display: flex; align-items: flex-start; gap: 8px; border: 1px solid var(--divider-color, #e0e0e0); border-radius: 8px; padding: 10px; }
        .egc-row ha-form { flex: 1 1 auto; min-width: 0; display: block; }
        .egc-row-actions { display: flex; flex-direction: column; gap: 2px; flex: 0 0 auto; }
        .egc-icon-btn { border: none; background: none; cursor: pointer; color: var(--secondary-text-color); border-radius: 6px; width: 30px; height: 26px; font-size: 12px; }
        .egc-icon-btn:hover { background: var(--secondary-background-color, #eee); color: var(--primary-text-color); }
        .egc-btn { align-self: flex-start; border: 1px solid var(--primary-color); color: var(--primary-color); background: none; border-radius: 18px; padding: 7px 16px; cursor: pointer; font-family: inherit; font-size: 14px; }
        .egc-btn:hover { background: rgba(127,127,127,0.08); }
      `;
      this._container.appendChild(style);

      this._inner = document.createElement('div');
      this._inner.className = 'egc-ed';
      this._container.appendChild(this._inner);
      this.appendChild(this._container);

      // ---- Style section ----
      const styleSec = document.createElement('div');
      styleSec.className = 'egc-sec';
      const styleTitle = document.createElement('div');
      styleTitle.className = 'egc-sec-title';
      styleTitle.textContent = 'Style';
      styleSec.appendChild(styleTitle);

      this._styleForm = document.createElement('ha-form');
      this._styleForm.computeLabel = (s) => this._labels()[s.name] || s.name;
      this._styleForm.addEventListener('value-changed', (ev) => {
        ev.stopPropagation();
        const prev = this._config || {};
        const next = Object.assign({}, prev, ev.detail.value);
        const structural = next.layout !== prev.layout || next.style !== prev.style;
        this._emit(next);
        if (structural) this._render();
      });
      styleSec.appendChild(this._styleForm);
      this._inner.appendChild(styleSec);

      // ---- Content section ----
      const contentSec = document.createElement('div');
      contentSec.className = 'egc-sec';
      const contentTitle = document.createElement('div');
      contentTitle.className = 'egc-sec-title';
      contentTitle.textContent = 'Content';
      contentSec.appendChild(contentTitle);

      this._sourceForm = document.createElement('ha-form');
      this._sourceForm.computeLabel = (s) => this._labels()[s.name] || s.name;
      this._sourceForm.addEventListener('value-changed', (ev) => {
        ev.stopPropagation();
        const prev = this._config || {};
        const next = Object.assign({}, prev, ev.detail.value);
        const structural = next.source !== prev.source;
        this._emit(next);
        if (structural) this._render();
      });
      contentSec.appendChild(this._sourceForm);

      this._deviceWrap = document.createElement('div');
      contentSec.appendChild(this._deviceWrap);

      this._entHint = document.createElement('div');
      this._entHint.className = 'egc-hint';
      contentSec.appendChild(this._entHint);

      this._rowsWrap = document.createElement('div');
      this._rowsWrap.className = 'egc-ed';
      contentSec.appendChild(this._rowsWrap);

      this._addWrap = document.createElement('div');
      contentSec.appendChild(this._addWrap);

      this._inner.appendChild(contentSec);
    }

    if (this._hass) {
      this._styleForm.hass = this._hass;
      this._sourceForm.hass = this._hass;
    }
    this._styleForm.schema = this._styleSchema();
    this._styleForm.data = cfg;
    this._sourceForm.schema = this._sourceSchema();
    this._sourceForm.data = { source: cfg.source || 'device' };

    this._renderDeviceSection();
    this._renderRows();
    this._renderAdd();
    this._built = true;
    this._lastConfig = cfg;
  }

  _renderDeviceSection() {
    const cfg = this._config || {};
    this._deviceWrap.innerHTML = '';
    this._deviceForm = null;
    if (cfg.source !== 'device') return;

    this._deviceForm = document.createElement('ha-form');
    this._deviceForm.computeLabel = (s) => this._labels()[s.name] || s.name;
    if (this._hass) this._deviceForm.hass = this._hass;
    this._deviceForm.schema = [{ name: 'device', selector: { device: {} } }];
    this._deviceForm.data = { device: cfg.device };
    this._deviceForm.addEventListener('value-changed', (ev) => {
      ev.stopPropagation();
      const dev = ev.detail.value.device;
      const next = Object.assign({}, this._config, { device: dev });
      const empty = (this._config.entities || []).length === 0;
      if (dev && empty) {
        this._config = next;
        this._loadDeviceEntities(dev); // auto-populate on first pick
      } else {
        this._emit(next);
        this._render();
      }
    });
    this._deviceWrap.appendChild(this._deviceForm);

    if (cfg.device) {
      const btn = document.createElement('button');
      btn.className = 'egc-btn';
      btn.style.marginTop = '8px';
      btn.textContent = (cfg.entities || []).length ? 'Reload entities from device (replaces list)' : 'Load entities from device';
      btn.addEventListener('click', () => this._loadDeviceEntities(cfg.device));
      this._deviceWrap.appendChild(btn);
    }
  }

  _rowComputeLabel(s) {
    return { entity: 'Entity', name: 'Name', icon: 'Entity icon (optional)' }[s.name] || s.name;
  }

  _renderRows() {
    const rows = this._rows(this._config);
    this._entHint.textContent =
      (this._config.source === 'device'
        ? 'Entities — auto-filled from the device. Remove any you don’t want, rename, reorder, or set a custom icon.'
        : 'Entities — add entities, then rename, reorder, or set a custom icon per entity.');

    this._rowsWrap.innerHTML = '';
    this._rowForms = [];

    rows.forEach((row, i) => {
      const rowEl = document.createElement('div');
      rowEl.className = 'egc-row';

      const f = document.createElement('ha-form');
      f.computeLabel = (s) => this._rowComputeLabel(s);
      if (this._hass) f.hass = this._hass;
      // Entity on its own line, then Name + Entity icon side by side so the
      // fields line up.
      f.schema = [
        { name: 'entity', selector: { entity: {} } },
        {
          type: 'grid',
          name: '',
          schema: [
            { name: 'name', selector: { text: {} } },
            { name: 'icon', selector: { icon: {} } },
          ],
        },
      ];
      f.data = { entity: row.entity, name: row.name || '', icon: row.icon || '' };
      f.addEventListener('value-changed', (ev) => {
        ev.stopPropagation();
        const v = ev.detail.value;
        const list = this._rows(this._config).slice();
        list[i] = { entity: v.entity, name: v.name || undefined, icon: v.icon || undefined };
        this._emit(Object.assign({}, this._config, { entities: list }));
        // entity id change alters structure -> full rebuild; name/icon won't.
        if (v.entity !== row.entity) this._render();
      });
      this._rowForms.push(f);
      rowEl.appendChild(f);

      const actions = document.createElement('div');
      actions.className = 'egc-row-actions';
      const mk = (label, title, fn) => {
        const b = document.createElement('button');
        b.className = 'egc-icon-btn';
        b.innerHTML = label;
        b.title = title;
        b.addEventListener('click', fn);
        return b;
      };
      actions.appendChild(mk('&#9650;', 'Move up', () => this._move(i, -1)));
      actions.appendChild(mk('&#9660;', 'Move down', () => this._move(i, 1)));
      actions.appendChild(mk('&#10005;', 'Remove', () => this._remove(i)));
      rowEl.appendChild(actions);
      this._rowsWrap.appendChild(rowEl);
    });
  }

  _renderAdd() {
    this._addWrap.innerHTML = '';
    const btn = document.createElement('button');
    btn.className = 'egc-btn';
    btn.textContent = this._showAdd ? '✕ Cancel' : '＋ Add entity';
    btn.addEventListener('click', () => {
      this._showAdd = !this._showAdd;
      this._renderAdd();
    });
    this._addWrap.appendChild(btn);

    if (!this._showAdd) return;

    this._addForm = document.createElement('ha-form');
    this._addForm.computeLabel = () => 'Pick an entity to add';
    if (this._hass) this._addForm.hass = this._hass;
    this._addForm.schema = [{ name: 'entity', selector: { entity: {} } }];
    this._addForm.data = { entity: '' };
    this._addForm.style.display = 'block';
    this._addForm.style.marginTop = '10px';
    this._addForm.addEventListener('value-changed', (ev) => {
      ev.stopPropagation();
      const id = ev.detail.value.entity;
      if (!id) return;
      const list = this._rows(this._config).slice();
      list.push({ entity: id });
      this._showAdd = false;
      this._emit(Object.assign({}, this._config, { entities: list }));
      this._render();
    });
    this._addWrap.appendChild(this._addForm);
  }

  _move(i, dir) {
    const list = this._rows(this._config).slice();
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const t = list[i];
    list[i] = list[j];
    list[j] = t;
    this._emit(Object.assign({}, this._config, { entities: list }));
    this._render();
  }

  _remove(i) {
    const list = this._rows(this._config).slice();
    list.splice(i, 1);
    this._emit(Object.assign({}, this._config, { entities: list }));
    this._render();
  }

  _refreshData() {
    const cfg = this._config || {};
    if (this._styleForm) this._styleForm.data = cfg;
    if (this._sourceForm) this._sourceForm.data = { source: cfg.source || 'device' };
    const rows = this._rows(cfg);
    (this._rowForms || []).forEach((f, i) => {
      const r = rows[i];
      if (r) f.data = { entity: r.entity, name: r.name || '', icon: r.icon || '' };
    });
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
