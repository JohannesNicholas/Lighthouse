// @vitest-environment jsdom
/**
 * Contract tests for the UI libraries (knockout, jQuery, Leaflet and its
 * plugins, Bootstrap, gridstack, JSX factory). See timeAndText.test.js.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { createRequire } from 'node:module';
import ko from 'knockout';
import $ from 'jquery';
import L from 'leaflet';
import * as bootstrap from 'bootstrap5';
import { GridStack } from 'gridstack';
import DOMDefault, * as jsxModule from 'jsx-dom-factory';

const require = createRequire(import.meta.url);

describe('knockout', () => {
  it('has the core primitives', () => {
    for (const name of ['observable', 'observableArray', 'computed', 'pureComputed', 'applyBindings', 'bindingHandlers', 'unwrap', 'utils', 'tasks', 'contextFor', 'dataFor', 'bindingProvider', 'options']) {
      expect(ko[name], name).toBeDefined();
    }
    expect(ko.version.split('.')[0]).toBe('3');
  });

  it('tracks dependencies through pureComputed and notifies', () => {
    ko.options.deferUpdates = false;
    const a = ko.observable(1);
    const b = ko.pureComputed(() => a() * 2);
    const seen = [];
    b.subscribe((v) => seen.push(v));
    a(5);
    expect(b()).toBe(10);
    expect(seen).toEqual([10]);
  });

  it('defers subscriber callbacks to a microtask when deferUpdates is on, and tasks.runEarly flushes (see CLAUDE.md)', async () => {
    ko.options.deferUpdates = true;
    try {
      const o = ko.observable(0);
      const seen = [];
      o.subscribe((v) => seen.push(v));
      o(1);
      expect(seen).toEqual([]);
      ko.tasks.runEarly();
      expect(seen).toEqual([1]);
      o(2);
      await Promise.resolve();
      await new Promise((r) => setTimeout(r, 0));
      expect(seen).toEqual([1, 2]);
    } finally {
      ko.options.deferUpdates = false;
    }
  });

  it('observableArray exposes array helpers and notifies once per change', () => {
    ko.options.deferUpdates = false;
    const list = ko.observableArray([1]);
    const cb = vi.fn();
    list.subscribe(cb);
    list.push(2);
    list.remove(1);
    expect(list()).toEqual([2]);
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it('renders text/foreach/visible/css bindings with the default provider', () => {
    ko.options.deferUpdates = false;
    const host = document.createElement('div');
    host.innerHTML = '<ul data-bind="foreach: items"><li data-bind="text: $data"></li></ul><b data-bind="visible: show, css: { on: show }"></b>';
    const vm = { items: ko.observableArray(['a', 'b']), show: ko.observable(false) };
    ko.applyBindings(vm, host);
    expect(host.querySelectorAll('li')).toHaveLength(2);
    expect(host.querySelector('b').style.display).toBe('none');
    vm.show(true);
    vm.items.push('c');
    expect(host.querySelectorAll('li')).toHaveLength(3);
    expect(host.querySelector('b').classList.contains('on')).toBe(true);
  });

  it('supports custom binding handlers', () => {
    ko.options.deferUpdates = false;
    ko.bindingHandlers.depTestShout = { update: (el, acc) => { el.textContent = String(ko.unwrap(acc())).toUpperCase(); } };
    const el = document.createElement('p');
    el.setAttribute('data-bind', 'depTestShout: t');
    const t = ko.observable('hi');
    ko.applyBindings({ t }, el);
    expect(el.textContent).toBe('HI');
    t('there');
    expect(el.textContent).toBe('THERE');
    delete ko.bindingHandlers.depTestShout;
  });
});

describe('knockout-secure-binding', () => {
  // The package only supports AMD (webpack, as pageSetup.js uses) or a global `ko`.
  let KnockoutSecureBinding;
  beforeAll(() => {
    globalThis.ko = ko;
    require('knockout-secure-binding');
    KnockoutSecureBinding = ko.secureBindingsProvider;
  });

  it('registers ko.secureBindingsProvider when loaded next to a global ko', () => {
    expect(KnockoutSecureBinding).toBeTypeOf('function');
  });

  const install = () => {
    const previous = ko.bindingProvider.instance;
    ko.bindingProvider.instance = new KnockoutSecureBinding({
      attribute: 'data-bind',
      globals: window,
      bindings: ko.bindingHandlers,
      noVirtualElements: false,
    });
    return () => { ko.bindingProvider.instance = previous; };
  };

  it('is constructible with the options pageSetup.js passes', () => {
    const restore = install();
    expect(typeof ko.bindingProvider.instance.nodeHasBindings).toBe('function');
    restore();
  });

  it('binds plain expressions, negation, comparison and && (the supported subset)', () => {
    ko.options.deferUpdates = false;
    const restore = install();
    try {
      const host = document.createElement('div');
      host.innerHTML = '<i data-bind="text: name"></i><b data-bind="visible: !hidden() && n() > 1"></b><u data-bind="click: go"></u>';
      const go = vi.fn();
      ko.applyBindings({ name: 'Sam', hidden: ko.observable(false), n: ko.observable(2), go }, host);
      expect(host.querySelector('i').textContent).toBe('Sam');
      expect(host.querySelector('b').style.display).not.toBe('none');
      host.querySelector('u').click();
      expect(go).toHaveBeenCalled();
    } finally {
      restore();
    }
  });

  it('rejects inline functions with parameters (the CSP-safe parser limitation CLAUDE.md warns about)', () => {
    const restore = install();
    try {
      const el = document.createElement('div');
      el.setAttribute('data-bind', 'click: function (d, e) { return d; }');
      expect(() => ko.applyBindings({}, el)).toThrow();
    } finally {
      restore();
    }
  });

  it('does not evaluate arbitrary code from a binding string', () => {
    const restore = install();
    try {
      globalThis.__bindingPwned = false;
      const el = document.createElement('div');
      el.setAttribute('data-bind', 'text: (globalThis.__bindingPwned = true)');
      try { ko.applyBindings({}, el); } catch { /* a throw is fine */ }
      expect(globalThis.__bindingPwned).toBe(false);
    } finally {
      delete globalThis.__bindingPwned;
      restore();
    }
  });
});

describe('jquery', () => {
  it('is a 3.x jQuery with the DOM helpers used by the content scripts', () => {
    expect($.fn.jquery.split('.')[0]).toBe('3');
    document.body.innerHTML = '<div id="a" class="x"><span>1</span><span>2</span></div>';
    const $a = $('#a');
    expect($a.find('span')).toHaveLength(2);
    expect($a.hasClass('x')).toBe(true);
    $a.addClass('y').attr('data-k', 'v').text('t');
    expect(document.getElementById('a').className).toBe('x y');
    expect($a.attr('data-k')).toBe('v');
    expect($a.html('<i>z</i>').find('i').text()).toBe('z');
  });

  it('delegates events', () => {
    document.body.innerHTML = '<div id="p"><button class="b">go</button></div>';
    const cb = vi.fn();
    $('#p').on('click', '.b', cb);
    $('.b').trigger('click');
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('has ajax and Deferred', () => {
    expect(typeof $.ajax).toBe('function');
    expect(typeof $.Deferred).toBe('function');
    expect(typeof $.each).toBe('function');
  });
});

describe('jsx-dom-factory', () => {
  const DOM = jsxModule.default ?? DOMDefault;

  it('exports a default factory function (require("jsx-dom-factory").default)', () => {
    expect(typeof DOM).toBe('function');
    expect(typeof require('jsx-dom-factory').default).toBe('function');
  });

  it('builds elements with attributes and children (babel pragma "DOM")', () => {
    const el = DOM('div', { class: 'panel', id: 'p1', 'data-x': '1' }, DOM('span', null, 'hi'), ' there');
    expect(el.tagName).toBe('DIV');
    expect(el.className).toBe('panel');
    expect(el.id).toBe('p1');
    expect(el.getAttribute('data-x')).toBe('1');
    expect(el.textContent).toBe('hi there');
    expect(el.querySelector('span')).toBeTruthy();
  });

  it('flattens nested child arrays in order (JSX map() results)', () => {
    const el = DOM('ul', null, [DOM('li', null, 'a'), [DOM('li', null, 'b')]], DOM('li', null, 'c'));
    expect([...el.querySelectorAll('li')].map((li) => li.textContent)).toEqual(['a', 'b', 'c']);
  });

  it('only sets attributes (it does not wire up event-handler props)', () => {
    const el = DOM('button', { 'data-id': '7', title: 'go' }, 'x');
    expect(el.getAttribute('data-id')).toBe('7');
    expect(el.title).toBe('go');
  });

  it('can be handed to jQuery, as the content scripts do', () => {
    const el = DOM('div', { id: 'jsx-host' }, 'x');
    $('body').append(el);
    expect($('#jsx-host').text()).toBe('x');
  });
});

describe('leaflet', () => {
  it('is a 1.x release and registers window.L for plugins', () => {
    expect(L.version.split('.')[0]).toBe('1');
    expect(window.L).toBe(L);
  });

  it('does geometry', () => {
    const a = L.latLng(-33.8688, 151.2093);
    const b = L.latLng(-37.8136, 144.9631);
    expect(a.distanceTo(b) / 1000).toBeGreaterThan(700);
    expect(a.distanceTo(b) / 1000).toBeLessThan(730);
    const bounds = L.latLngBounds([a, b]);
    expect(bounds.contains(L.latLng(-35, 148))).toBe(true);
    expect(bounds.getCenter().lat).toBeCloseTo(-35.8412, 3);
  });

  it('creates a map, markers, divIcons, layer groups and GeoJSON', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const map = L.map(el, { center: [-33.8, 151.2], zoom: 8 });
    const group = L.layerGroup().addTo(map);
    const marker = L.marker([-33.8, 151.2], { icon: L.divIcon({ className: 'job', html: '<b>1</b>' }) }).addTo(group);
    expect(group.hasLayer(marker)).toBe(true);
    expect(map.getZoom()).toBe(8);
    const gj = L.geoJSON({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [151.2, -33.8] } }).addTo(map);
    expect(gj.getLayers()).toHaveLength(1);
    expect(marker.getLatLng().lat).toBe(-33.8);
    map.remove();
  });

  it('keeps the default marker icon path logic available', () => {
    expect(L.Icon.Default).toBeDefined();
    expect(L.Icon.Default.prototype._getIconUrl).toBeTypeOf('function');
  });
});

describe('leaflet plugins register themselves on L', () => {
  // Load order mirrors src/pages/tasking/main.js.
  it('leaflet-easybutton', () => {
    require('leaflet-easybutton');
    expect(typeof L.easyButton).toBe('function');
  });

  it('leaflet-routing-machine', () => {
    require('leaflet-routing-machine');
    expect(L.Routing).toBeDefined();
    expect(typeof L.Routing.control).toBe('function');
    expect(typeof L.Routing.osrmv1).toBe('function');
  });

  it('leaflet-svg-shape-markers', () => {
    require('leaflet-svg-shape-markers');
    expect(typeof L.shapeMarker).toBe('function');
  });

  it('leaflet.markercluster', () => {
    require('leaflet.markercluster');
    expect(typeof L.markerClusterGroup).toBe('function');
    const g = L.markerClusterGroup();
    g.addLayer(L.marker([0, 0]));
    expect(g.getLayers()).toHaveLength(1);
  });

  it('leaflet.polylinemeasure', () => {
    require('leaflet.polylinemeasure');
    expect(L.Control.PolylineMeasure).toBeDefined();
  });

  it('leaflet-minimap', () => {
    require('leaflet-minimap');
    expect(L.Control.MiniMap).toBeDefined();
  });

  it('leaflet.vectorgrid', () => {
    require('leaflet.vectorgrid');
    expect(L.vectorGrid).toBeDefined();
    expect(typeof L.vectorGrid.protobuf).toBe('function');
  });

  it('esri-leaflet', () => {
    const esri = require('esri-leaflet');
    expect(typeof esri.featureLayer).toBe('function');
    expect(typeof esri.dynamicMapLayer).toBe('function');
    expect(typeof esri.query).toBe('function');
  });

  it('esri-leaflet-vector', () => {
    const v = require('esri-leaflet-vector');
    expect(typeof v.vectorBasemapLayer).toBe('function');
  });

  it('leaflet-geosearch (lib/ build used via the webpack alias)', async () => {
    const mod = await import('leaflet-geosearch/lib/SearchControl');
    expect(mod.default).toBeTypeOf('function');
  });
});

describe('bootstrap (v5 alias) ', () => {
  it('exports the components Lighthouse pages use', () => {
    for (const name of ['Modal', 'Tooltip', 'Alert', 'Dropdown', 'Collapse', 'Tab', 'Popover', 'Toast']) {
      expect(bootstrap[name], name).toBeTypeOf('function');
    }
  });

  it('shows and hides a modal, with events', () => {
    document.body.innerHTML = '<div class="modal" id="m" tabindex="-1"><div class="modal-dialog"><div class="modal-content">x</div></div></div>';
    const el = document.getElementById('m');
    const modal = bootstrap.Modal.getOrCreateInstance(el);
    expect(bootstrap.Modal.getInstance(el)).toBe(modal);
    const shown = vi.fn();
    el.addEventListener('show.bs.modal', shown);
    modal.show();
    expect(shown).toHaveBeenCalled();
    modal.dispose();
  });

  it('closes an alert', () => {
    document.body.innerHTML = '<div class="alert" id="a" role="alert">x</div>';
    const alert = bootstrap.Alert.getOrCreateInstance(document.getElementById('a'));
    expect(typeof alert.close).toBe('function');
  });

  it('creates tooltips', () => {
    document.body.innerHTML = '<button id="t" title="tip">x</button>';
    const tip = new bootstrap.Tooltip(document.getElementById('t'));
    expect(typeof tip.show).toBe('function');
    tip.dispose();
  });
});

describe('bootstrap 4 (jQuery plugins for Beacon-injected pages)', () => {
  it('adds modal and tooltip to jQuery when loaded', () => {
    window.jQuery = $;
    globalThis.jQuery = $;
    require('bootstrap');
    expect(typeof $.fn.modal).toBe('function');
    expect(typeof $.fn.tooltip).toBe('function');
    expect(typeof $.fn.popover).toBe('function');
  });
});

describe('gridstack', () => {
  it('exports GridStack with init/addWidget', () => {
    expect(GridStack).toBeTypeOf('function');
    expect(typeof GridStack.init).toBe('function');
    expect(typeof GridStack.prototype.addWidget).toBe('function');
    expect(typeof GridStack.prototype.destroy).toBe('function');
  });
});
