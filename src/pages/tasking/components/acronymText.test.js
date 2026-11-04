// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import ko from 'knockout';
import { acronymDictionary, registerAcronymTextBinding } from './acronymText.js';

const find = (word) => acronymDictionary.find((a) => new RegExp('^(' + a.regex + ')$', 'i').test(word));

describe('acronymDictionary', () => {
  it('has only compilable regexes and non-empty meanings', () => {
    for (const { regex, meaning } of acronymDictionary) {
      expect(() => new RegExp('\\b(' + regex + ')\\b', 'gi')).not.toThrow();
      expect(meaning.length).toBeGreaterThan(0);
    }
  });

  it('has no duplicate patterns', () => {
    const patterns = acronymDictionary.map((a) => a.regex);
    expect(new Set(patterns).size).toBe(patterns.length);
  });

  it('never contains a double quote in a meaning (it is written into an HTML attribute)', () => {
    for (const { meaning } of acronymDictionary) expect(meaning).not.toContain('"');
  });

  it.each([
    ['CFW', 'Concern for Welfare'],
    ['C4W', 'Concern for Welfare'],
    ['nnta', 'No Need to Attend'],
    ['NN2A', 'No Need to Attend'],
    ['3PAX', 'Passenger'],
    ['VEHS', 'Vehicle(s)'],
    ['POBS', 'Person(s) On Board'],
    ['p2p', 'Pole to Pole (Powerlines)'],
  ])('%s -> %s', (word, meaning) => {
    expect(find(word)?.meaning).toBe(meaning);
  });

  it('ambiguous abbreviations match exactly one entry each', () => {
    for (const word of ['ETA', 'ETC', 'MP', 'POL', 'POIS', 'TMC', 'NSWTMC']) {
      const hits = acronymDictionary.filter((a) => new RegExp('^(' + a.regex + ')$', 'i').test(word));
      expect(hits, word).toHaveLength(1);
    }
  });
});

describe('acronymText binding', () => {
  beforeEach(() => {
    ko.options.deferUpdates = false;
    registerAcronymTextBinding();
  });

  const bind = (text) => {
    const el = document.createElement('p');
    el.setAttribute('data-bind', 'acronymText: t');
    document.body.appendChild(el);
    ko.applyBindings({ t: ko.observable(text) }, el);
    return el;
  };

  it('is registered, and registering twice is harmless', () => {
    expect(ko.bindingHandlers.acronymText).toBeTruthy();
    const handler = ko.bindingHandlers.acronymText;
    registerAcronymTextBinding();
    expect(ko.bindingHandlers.acronymText).toBe(handler);
  });

  it('wraps known acronyms in <abbr> with the meaning', () => {
    const el = bind('Team ETA 10 mins');
    const abbr = el.querySelector('abbr');
    expect(abbr.textContent.startsWith('ETA')).toBe(true);
    expect(abbr.getAttribute('data-meaning')).toBe('Estimated Time of Arrival');
  });

  it('preserves the original casing of the matched text', () => {
    const el = bind('see eta soon');
    expect(el.querySelector('abbr').firstChild.textContent).toBe('eta');
  });

  it('leaves text with no acronyms untouched', () => {
    const el = bind('Tree down across road');
    expect(el.querySelector('abbr')).toBeNull();
    expect(el.textContent).toBe('Tree down across road');
  });

  it('only matches whole words', () => {
    const el = bind('ETAS LOCATION');
    expect(el.querySelector('abbr')).toBeNull();
  });

  it('re-renders when the observable changes', () => {
    const t = ko.observable('nothing here');
    const el = document.createElement('p');
    el.setAttribute('data-bind', 'acronymText: t');
    ko.applyBindings({ t }, el);
    expect(el.querySelector('abbr')).toBeNull();
    t('NFA required');
    expect(el.querySelector('abbr').getAttribute('data-meaning')).toBe('No Further Action');
    t('plain');
    expect(el.querySelector('abbr')).toBeNull();
  });

  it('adds a hover tooltip element inside each abbr', () => {
    const el = bind('MP last seen');
    const abbr = el.querySelector('abbr');
    const tip = abbr.querySelector('div');
    expect(tip.textContent).toBe('Missing Person(s)');
    expect(tip.style.opacity).toBe('0');
    abbr.dispatchEvent(new Event('mouseenter'));
    expect(tip.style.opacity).toBe('1');
    abbr.dispatchEvent(new Event('mouseleave'));
    expect(tip.style.opacity).toBe('0');
  });

  it('does not let HTML in the source text through as markup', () => {
    const el = bind('<img src=x onerror=alert(1)> ETA');
    expect(el.querySelector('img')).toBeNull();
  });
});
