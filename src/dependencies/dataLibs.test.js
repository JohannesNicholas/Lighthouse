// @vitest-environment jsdom
/**
 * Contract tests for the data / charting / export libraries.
 * See timeAndText.test.js for the idea.
 */
import { describe, it, expect, vi } from 'vitest';
import * as d3 from 'd3';
import crossfilter from 'crossfilter2';
import cloud from 'd3-cloud';
import { d3compat } from 'dc/src/index.js';
import * as dc from 'dc/src/index.js';
import * as tj from '@tmcw/togeojson';
import { DOMParser } from '@xmldom/xmldom';
import ExcelJS from 'exceljs';
import * as signalR from '@microsoft/signalr';
import { installedVersion } from './helpers.js';

describe('d3 (the subset Lighthouse imports)', () => {
  it('exports every function the source imports by name', () => {
    for (const name of ['timeHour', 'timeHours', 'timeDay', 'timeDays', 'quantileSorted', 'mean', 'scaleTime', 'scaleLinear', 'scaleSqrt', 'schemeTableau10', 'pointer', 'groups', 'select', 'extent']) {
      expect(d3[name], name).toBeDefined();
    }
  });

  it('is major version 7 (dc.js compat layer depends on it)', () => {
    expect(installedVersion('d3').split('.')[0]).toBe('7');
  });

  it('floors to the hour/day and enumerates ranges', () => {
    const t = new Date(2026, 9, 27, 10, 25, 30);
    expect(d3.timeHour(t)).toEqual(new Date(2026, 9, 27, 10, 0, 0));
    expect(d3.timeDay(t)).toEqual(new Date(2026, 9, 27, 0, 0, 0));
    const hours = d3.timeHours(new Date(2026, 9, 27, 0), new Date(2026, 9, 27, 3));
    expect(hours).toHaveLength(3);
    const days = d3.timeDays(new Date(2026, 9, 27), new Date(2026, 9, 30));
    expect(days).toHaveLength(3);
  });

  it('computes quantiles and means', () => {
    expect(d3.quantileSorted([1, 2, 3, 4, 5], 0.5)).toBe(3);
    expect(d3.quantileSorted([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(d3.quantileSorted([], 0.5)).toBeUndefined();
    expect(d3.mean([2, 4, 6])).toBe(4);
    expect(d3.mean([])).toBeUndefined();
  });

  it('scales values', () => {
    expect(d3.scaleLinear().domain([0, 10]).range([0, 100])(5)).toBe(50);
    expect(d3.scaleSqrt().domain([0, 100]).range([0, 10])(25)).toBe(5);
    const t = d3.scaleTime().domain([new Date(2026, 0, 1), new Date(2026, 0, 3)]).range([0, 2]);
    expect(t(new Date(2026, 0, 2))).toBe(1);
    expect(d3.extent([3, 1, 2])).toEqual([1, 3]);
    expect(d3.schemeTableau10).toHaveLength(10);
  });

  it('groups into [key, values] pairs (used by the dc compat nester)', () => {
    expect(d3.groups([1, 2, 3, 4], (n) => n % 2)).toEqual([[1, [1, 3]], [0, [2, 4]]]);
  });

  it('selects, appends and joins in the DOM', () => {
    const host = document.createElement('div');
    d3.select(host).append('svg').selectAll('text').data(['a', 'b']).join('text').text((d) => d);
    expect(host.querySelectorAll('text')).toHaveLength(2);
    expect(host.textContent).toBe('ab');
  });
});

describe('crossfilter2', () => {
  const facts = [
    { id: 1, type: 'Flood', tags: ['a', 'b'], n: 5 },
    { id: 2, type: 'Storm', tags: ['b'], n: 3 },
    { id: 3, type: 'Flood', tags: [], n: 9 },
  ];

  it('groups and counts by dimension', () => {
    const ndx = crossfilter(facts);
    const byType = ndx.dimension((f) => f.type);
    const counts = Object.fromEntries(byType.group().all().map((g) => [g.key, g.value]));
    expect(counts).toEqual({ Flood: 2, Storm: 1 });
    expect(ndx.size()).toBe(3);
  });

  it('filters other dimensions\' groups but not its own', () => {
    const ndx = crossfilter(facts);
    const byType = ndx.dimension((f) => f.type);
    const byN = ndx.dimension((f) => f.n);
    const typeGroup = byType.group();
    byN.filterRange([4, 10]);
    expect(Object.fromEntries(typeGroup.all().map((g) => [g.key, g.value]))).toEqual({ Flood: 2, Storm: 0 });
    byN.filterAll();
    expect(typeGroup.all().find((g) => g.key === 'Storm').value).toBe(1);
  });

  it('counts a fact under each tag for array dimensions (the "multi" flag)', () => {
    const ndx = crossfilter(facts);
    const byTag = ndx.dimension((f) => f.tags, true);
    const counts = Object.fromEntries(byTag.group().all().map((g) => [g.key, g.value]));
    expect(counts).toEqual({ a: 1, b: 2 });
  });

  it('supports sum reductions and top()', () => {
    const ndx = crossfilter(facts);
    const byType = ndx.dimension((f) => f.type);
    const sums = Object.fromEntries(byType.group().reduceSum((f) => f.n).all().map((g) => [g.key, g.value]));
    expect(sums).toEqual({ Flood: 14, Storm: 3 });
    expect(ndx.dimension((f) => f.n).top(1)[0].id).toBe(3);
  });

  it('notifies listeners and supports adding data afterwards', () => {
    const ndx = crossfilter(facts);
    const cb = vi.fn();
    ndx.onChange(cb);
    ndx.add([{ id: 4, type: 'Storm', tags: [], n: 1 }]);
    expect(cb).toHaveBeenCalled();
    expect(ndx.size()).toBe(4);
  });
});

describe('dc (ES source import used by the stats page)', () => {
  it('exports the d3compat hook object we patch', () => {
    expect(d3compat).toBeTruthy();
    expect(typeof d3compat).toBe('object');
  });

  it('exports the chart factories the stats page uses', () => {
    for (const name of ['pieChart', 'rowChart', 'barChart', 'lineChart', 'renderAll', 'redrawAll', 'filterAll']) {
      expect(typeof dc[name], name).toBe('function');
    }
  });

  it('accepts the d3 v6+ compat layer that dcD3Compat.js installs', async () => {
    await import('../pages/stats/charts/dcD3Compat.js');
    expect(typeof d3compat.eventHandler).toBe('function');
    expect(typeof d3compat.nester).toBe('function');
    expect(d3compat.pointer).toBe(d3.pointer);
    const out = d3compat.nester({ key: (d) => d.k, entries: [{ k: 'a', v: 1 }, { k: 'a', v: 2 }, { k: 'b', v: 3 }] });
    expect(out).toEqual([
      { key: 'a', values: [{ k: 'a', v: 1 }, { k: 'a', v: 2 }] },
      { key: 'b', values: [{ k: 'b', v: 3 }] },
    ]);
  });
});

describe('d3-cloud', () => {
  it('exposes the chainable layout API used by wordCloud.js', () => {
    const layout = cloud();
    for (const m of ['size', 'words', 'padding', 'random', 'rotate', 'font', 'fontSize', 'on', 'start', 'stop', 'spiral', 'text', 'fontWeight', 'canvas', 'timeInterval']) {
      expect(typeof layout[m], m).toBe('function');
    }
    expect(layout.size([100, 50])).toBe(layout);
    expect(layout.size()).toEqual([100, 50]);
  });
});

describe('@tmcw/togeojson + @xmldom/xmldom (Essential Energy outage KML)', () => {
  const kml = `<?xml version="1.0" encoding="UTF-8"?>
    <kml xmlns="http://www.opengis.net/kml/2.2"><Document>
      <Placemark><name>Outage A</name><description>Planned</description>
        <Point><coordinates>151.2,-33.8,0</coordinates></Point></Placemark>
      <Placemark><name>Outage B</name>
        <Polygon><outerBoundaryIs><LinearRing><coordinates>150,-33 151,-33 151,-34 150,-33</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>
    </Document></kml>`;

  it('parses KML to a GeoJSON FeatureCollection', () => {
    const doc = new DOMParser().parseFromString(kml, 'text/xml');
    const gj = tj.kml(doc);
    expect(gj.type).toBe('FeatureCollection');
    expect(gj.features).toHaveLength(2);
    expect(gj.features[0].properties.name).toBe('Outage A');
    expect(gj.features[0].geometry).toEqual({ type: 'Point', coordinates: [151.2, -33.8, 0] });
    expect(gj.features[1].geometry.type).toBe('Polygon');
  });

  it('lets callers decorate features (background.js adds .owner)', () => {
    const gj = tj.kml(new DOMParser().parseFromString(kml, 'text/xml'));
    gj.features.forEach((f) => { f.owner = 'EssentialEnergy'; });
    expect(gj.features.every((f) => f.owner === 'EssentialEnergy')).toBe(true);
  });

  it('yields an empty collection for a KML with no placemarks', () => {
    const doc = new DOMParser().parseFromString('<kml xmlns="http://www.opengis.net/kml/2.2"><Document/></kml>', 'text/xml');
    expect(tj.kml(doc).features).toEqual([]);
  });

  it('exposes DOMParser.parseFromString that returns a queryable document', () => {
    const doc = new DOMParser().parseFromString('<a><b id="x">hi</b></a>', 'text/xml');
    expect(doc.getElementsByTagName('b')[0].textContent).toBe('hi');
  });
});

describe('exceljs', () => {
  it('writes a workbook to a buffer and reads it back', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Responses');
    ws.addRow(['Name', 'Zone', 'Count']);
    ws.addRow(['Sam', 'North', 3]);
    ws.getRow(1).font = { bold: true };
    ws.columns.forEach((c) => { c.width = 12; });

    const buffer = await wb.xlsx.writeBuffer();
    expect(buffer.byteLength).toBeGreaterThan(1000);
    // xlsx is a zip: "PK" magic bytes
    expect(Array.from(new Uint8Array(buffer).slice(0, 2))).toEqual([0x50, 0x4b]);

    const back = new ExcelJS.Workbook();
    await back.xlsx.load(buffer);
    const rs = back.getWorksheet('Responses');
    expect(rs.getRow(2).values.slice(1)).toEqual(['Sam', 'North', 3]);
    expect(rs.getRow(1).font.bold).toBe(true);
  });

  it('supports several worksheets and rejects duplicate sheet names', () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet('A');
    wb.addWorksheet('B');
    expect(wb.worksheets.map((w) => w.name)).toEqual(['A', 'B']);
    expect(() => wb.addWorksheet('A')).toThrow();
  });
});

describe('@microsoft/signalr', () => {
  it('builds a hub connection with the options connection.js passes', () => {
    class Policy {
      nextRetryDelayInMilliseconds() { return 1000; }
    }
    const conn = new signalR.HubConnectionBuilder()
      .withUrl('https://example.test/negotiate', { accessTokenFactory: () => 'tok' })
      .withAutomaticReconnect(new Policy())
      .configureLogging(signalR.LogLevel.Error)
      .build();
    expect(conn.state).toBe(signalR.HubConnectionState.Disconnected);
    for (const m of ['on', 'off', 'start', 'stop', 'onreconnecting', 'onreconnected', 'onclose']) {
      expect(typeof conn[m], m).toBe('function');
    }
    expect(() => conn.on('jobUpdated', () => {})).not.toThrow();
  });

  it('has the log levels in the expected order', () => {
    expect(signalR.LogLevel.Error).toBeGreaterThan(signalR.LogLevel.Information);
    expect(signalR.LogLevel.Information).toBeGreaterThan(signalR.LogLevel.Trace);
  });
});
