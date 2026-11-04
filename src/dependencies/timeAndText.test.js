/**
 * Contract tests for the time / text helper libraries.
 *
 * These pin the behaviour Lighthouse relies on, so that a package update
 * (e.g. Dependabot) which changes it fails here, with the library named,
 * rather than as a mysterious UI bug in the browser.
 */
import { describe, it, expect } from 'vitest';
import moment from 'moment';
import humanizeDuration from 'humanize-duration';
import { english as englishStopwords } from 'stopwords';
import nunjucks from 'nunjucks';
import chroma from 'chroma-js';
import _ from 'underscore';

describe('moment', () => {
  it('parses and formats ISO strings', () => {
    const m = moment.utc('2026-10-27T10:05:09Z');
    expect(m.isValid()).toBe(true);
    expect(m.format('DD/MM/YYYY HH:mm:ss')).toBe('27/10/2026 10:05:09');
    expect(m.toISOString()).toBe('2026-10-27T10:05:09.000Z');
    expect(m.valueOf()).toBe(Date.UTC(2026, 9, 27, 10, 5, 9));
  });

  it('flags garbage as invalid instead of throwing', () => {
    expect(moment('definitely not a date', moment.ISO_8601).isValid()).toBe(false);
    expect(moment.utc('2026-02-30').isValid()).toBe(false);
  });

  it('adds, subtracts and compares without mutating when cloned', () => {
    const a = moment.utc('2026-01-31T00:00:00Z');
    const b = a.clone().add(1, 'month');
    expect(a.format('YYYY-MM-DD')).toBe('2026-01-31');
    expect(b.format('YYYY-MM-DD')).toBe('2026-02-28'); // clamps to month end
    expect(b.isAfter(a)).toBe(true);
    expect(a.isBefore(b)).toBe(true);
    expect(a.clone().subtract(1, 'day').format('YYYY-MM-DD')).toBe('2026-01-30');
  });

  it('diffs in the requested unit, truncating toward zero', () => {
    const a = moment.utc('2026-10-27T10:00:00Z');
    const b = moment.utc('2026-10-27T12:59:59Z');
    expect(b.diff(a, 'hours')).toBe(2);
    expect(a.diff(b, 'hours')).toBe(-2);
    expect(b.diff(a, 'minutes')).toBe(179);
    expect(b.diff(a)).toBe(179 * 60000 + 59000);
  });

  it('rounds to start/end of a unit', () => {
    const m = moment.utc('2026-10-27T10:25:00Z');
    expect(m.clone().startOf('day').toISOString()).toBe('2026-10-27T00:00:00.000Z');
    expect(m.clone().endOf('day').toISOString()).toBe('2026-10-27T23:59:59.999Z');
    expect(m.clone().startOf('hour').toISOString()).toBe('2026-10-27T10:00:00.000Z');
  });

  it('supports isSame / isBetween', () => {
    const m = moment.utc('2026-10-27T10:25:00Z');
    expect(m.isSame(moment.utc('2026-10-27T23:00:00Z'), 'day')).toBe(true);
    expect(m.isBetween(moment.utc('2026-10-27T10:00:00Z'), moment.utc('2026-10-27T11:00:00Z'))).toBe(true);
  });

  it('describes relative time with fromNow()', () => {
    expect(moment().subtract(3, 'hours').fromNow()).toBe('3 hours ago');
    expect(moment().add(2, 'days').fromNow()).toBe('in 2 days');
  });

  it('builds durations', () => {
    const d = moment.duration(90, 'minutes');
    expect(d.hours()).toBe(1);
    expect(d.minutes()).toBe(30);
    expect(d.asHours()).toBe(1.5);
    expect(moment.duration('01:30:00').asMinutes()).toBe(90);
  });

  it('converts unix seconds and Date objects', () => {
    expect(moment.unix(1_800_000_000).utc().toISOString()).toBe('2027-01-15T08:00:00.000Z');
    expect(moment.utc('2026-10-27T10:00:00Z').toDate()).toBeInstanceOf(Date);
  });

  it('exposes updateLocale (used to customise relative time)', () => {
    expect(typeof moment.updateLocale).toBe('function');
    expect(moment.locale()).toBe('en');
  });
});

describe('humanize-duration', () => {
  // The exact call used by src/pages/stats/data/durations.js
  const fmt = (ms) => humanizeDuration(ms, { round: true, largest: 2, units: ['d', 'h', 'm'] });

  it('formats days, hours and minutes, largest two units', () => {
    expect(fmt(90 * 60000)).toBe('1 hour, 30 minutes');
    expect(fmt((26 * 60 + 5) * 60000)).toBe('1 day, 2 hours');
    expect(fmt(5 * 60000)).toBe('5 minutes');
  });

  it('rounds rather than showing fractions', () => {
    expect(fmt(89 * 1000)).toBe('1 minute');
    expect(fmt(91 * 1000)).toBe('2 minutes');
  });

  it('copes with zero', () => {
    expect(fmt(0)).toBe('0 minutes');
  });
});

describe('stopwords', () => {
  it('exports an english list of lower-case words', () => {
    expect(Array.isArray(englishStopwords)).toBe(true);
    expect(englishStopwords.length).toBeGreaterThan(100);
    for (const w of ['the', 'and', 'of', 'to', 'a']) expect(englishStopwords).toContain(w);
  });

  it('does not swallow meaningful incident words', () => {
    for (const w of ['flood', 'tree', 'storm', 'roof']) expect(englishStopwords).not.toContain(w);
  });
});

describe('nunjucks', () => {
  it('renders variables, globals and filters, with autoescape', () => {
    const env = nunjucks.configure({ autoescape: true });
    env.addGlobal('shout', (s) => String(s).toUpperCase());
    expect(env.renderString('Hello {{ name }}!', { name: 'Sam' })).toBe('Hello Sam!');
    expect(env.renderString('{{ shout(name) }}', { name: 'sam' })).toBe('SAM');
    expect(env.renderString('{{ name | upper }}', { name: 'sam' })).toBe('SAM');
  });

  it('escapes HTML when autoescape is on', () => {
    const env = nunjucks.configure({ autoescape: true });
    expect(env.renderString('{{ x }}', { x: '<script>alert(1)</script>' })).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('supports conditionals and loops used in message templates', () => {
    const env = nunjucks.configure({ autoescape: true });
    expect(env.renderString('{% if a %}yes{% else %}no{% endif %}', { a: 0 })).toBe('no');
    expect(env.renderString('{% for i in xs %}{{ i }},{% endfor %}', { xs: [1, 2, 3] })).toBe('1,2,3,');
  });

  it('renders missing variables as empty text, not "undefined"', () => {
    expect(nunjucks.configure({ autoescape: true }).renderString('[{{ nope }}]', {})).toBe('[]');
  });
});

describe('chroma-js', () => {
  it('builds the green -> red LCH scale used for the job heat colouring', () => {
    const colors = chroma.scale(['green', 'red']).mode('lch').colors(5);
    expect(colors).toHaveLength(5);
    expect(colors[0]).toBe(chroma('green').hex());
    expect(colors[4]).toBe(chroma('red').hex());
    for (const c of colors) expect(c).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('parses and converts colours', () => {
    expect(chroma('#ff0000').rgb()).toEqual([255, 0, 0]);
    expect(chroma('red').hex()).toBe('#ff0000');
    expect(chroma.valid('not-a-colour')).toBe(false);
  });

  it('darkens and brightens', () => {
    expect(chroma('#808080').darken().luminance()).toBeLessThan(chroma('#808080').luminance());
    expect(chroma('#808080').brighten().luminance()).toBeGreaterThan(chroma('#808080').luminance());
  });
});

describe('underscore', () => {
  it('supports the helpers used by the content scripts', () => {
    expect(_.map([1, 2], (x) => x * 2)).toEqual([2, 4]);
    expect(_.find([1, 2, 3], (x) => x > 1)).toBe(2);
    expect(_.filter([1, 2, 3], (x) => x % 2)).toEqual([1, 3]);
    expect(_.some([1, 2], (x) => x > 1)).toBe(true);
    expect(_.extend({ a: 1 }, { b: 2 })).toEqual({ a: 1, b: 2 });
    const seen = [];
    _.each({ a: 1, b: 2 }, (v, k) => seen.push(k + v));
    expect(seen).toEqual(['a1', 'b2']);
  });

  it('escapes HTML special characters', () => {
    expect(_.escape('<a href="x">&\'</a>')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#x27;&lt;/a&gt;');
    expect(_.escape(null)).toBe('');
  });
});
