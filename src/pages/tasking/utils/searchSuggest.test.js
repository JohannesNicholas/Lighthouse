// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import ko from 'knockout';
import { createSearchSuggest } from './searchSuggest.js';

const pool = [
  { label: 'Flood', category: 'Type' },
  { label: 'Storm', category: 'Type' },
  { label: 'Fallen Tree', category: 'Type' },
];

function make(initialPool = pool) {
  ko.options.deferUpdates = false;
  const search = ko.observable('');
  const s = createSearchSuggest(ko, { search, pool: () => initialPool, inputId: 'q' });
  return { search, s };
}

const key = (k) => ({ key: k, preventDefault: vi.fn() });

describe('createSearchSuggest', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div class="toolbar-search"><div class="input-group"><input id="q"></div><ul class="search-suggestions"></ul></div>';
    vi.stubGlobal('requestAnimationFrame', (cb) => cb());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('starts closed with no suggestions', () => {
    const { s } = make();
    expect(s.suggestions()).toEqual([]);
    expect(s.showSuggestions()).toBe(false);
    expect(s.activeIndex()).toBe(-1);
  });

  it('suggests matches for what is typed and opens the list', () => {
    const { search, s } = make();
    search('fl');
    expect(s.suggestions().map((x) => x.label)).toContain('Flood');
    expect(s.showSuggestions()).toBe(true);
    expect(s.activeIndex()).toBe(-1);
  });

  it('closes the list when the box is emptied', () => {
    const { search, s } = make();
    search('fl');
    search('');
    expect(s.showSuggestions()).toBe(false);
    expect(s.suggestions()).toEqual([]);
  });

  it('clear() empties the box and the list', () => {
    const { search, s } = make();
    search('fl');
    s.clear();
    expect(search()).toBe('');
    expect(s.suggestions()).toEqual([]);
  });

  it('pick() replaces only the last token and closes the list', () => {
    const { search, s } = make();
    search('urgent fl');
    const flood = s.suggestions().find((x) => x.label === 'Flood');
    s.pick(flood);
    expect(search()).toBe('urgent Flood');
    expect(s.showSuggestions()).toBe(false);
    expect(document.activeElement).toBe(document.getElementById('q'));
  });

  it('does not reopen the list after a pick', () => {
    const { search, s } = make();
    search('fl');
    s.pick(s.suggestions().find((x) => x.label === 'Flood'));
    expect(s.showSuggestions()).toBe(false);
  });

  it('pick() on the "Search" row keeps the text and just closes the list', () => {
    const { search, s } = make();
    search('fl');
    const exact = s.suggestions().find((x) => x.isExact);
    expect(exact).toBeTruthy();
    s.pick(exact);
    expect(search()).toBe('fl');
    expect(s.showSuggestions()).toBe(false);
  });

  describe('keyDown', () => {
    it('lets keys through when the list is closed', () => {
      const { s } = make();
      expect(s.keyDown(null, key('ArrowDown'))).toBe(true);
    });

    it('moves the highlight down and up, clamped at both ends', () => {
      const { search, s } = make();
      search('f');
      const n = s.suggestions().length;
      for (let i = 0; i < n + 3; i++) s.keyDown(null, key('ArrowDown'));
      expect(s.activeIndex()).toBe(n - 1);
      for (let i = 0; i < n + 3; i++) s.keyDown(null, key('ArrowUp'));
      expect(s.activeIndex()).toBe(-1);
    });

    it('prevents default and swallows handled arrow keys', () => {
      const { search, s } = make();
      search('f');
      const e = key('ArrowDown');
      expect(s.keyDown(null, e)).toBe(false);
      expect(e.preventDefault).toHaveBeenCalled();
    });

    it('Enter picks the highlighted suggestion', () => {
      const { search, s } = make();
      search('fl');
      s.keyDown(null, key('ArrowDown'));
      const label = s.suggestions()[0].label;
      expect(s.keyDown(null, key('Enter'))).toBe(false);
      if (!s.suggestions()[0].isExact) expect(search()).toBe(label);
      expect(s.showSuggestions()).toBe(false);
    });

    it('Enter with nothing highlighted is left to the form', () => {
      const { search, s } = make();
      search('fl');
      expect(s.keyDown(null, key('Enter'))).toBe(true);
    });

    it('Escape closes the list', () => {
      const { search, s } = make();
      search('fl');
      expect(s.keyDown(null, key('Escape'))).toBe(false);
      expect(s.showSuggestions()).toBe(false);
    });

    it('ignores other keys', () => {
      const { search, s } = make();
      search('fl');
      expect(s.keyDown(null, key('a'))).toBe(true);
    });
  });

  it('focus() reopens a list that still has suggestions', () => {
    const { search, s } = make();
    search('fl');
    s.showSuggestions(false);
    s.focus();
    expect(s.showSuggestions()).toBe(true);
  });

  it('focus() does nothing with no suggestions', () => {
    const { s } = make();
    s.focus();
    expect(s.showSuggestions()).toBe(false);
  });

  it('blur() closes the list after a short delay so clicks register', () => {
    vi.useFakeTimers();
    const { search, s } = make();
    search('fl');
    s.blur();
    expect(s.showSuggestions()).toBe(true);
    vi.advanceTimersByTime(250);
    expect(s.showSuggestions()).toBe(false);
  });

  it('positions the dropdown under the input group when shown', () => {
    const { search } = make();
    const group = document.querySelector('.input-group');
    group.getBoundingClientRect = () => ({ bottom: 40, left: 12, width: 200 });
    search('fl');
    const list = document.querySelector('.search-suggestions');
    expect(list.style.top).toBe('40px');
    expect(list.style.left).toBe('12px');
    expect(list.style.width).toBe('200px');
  });
});
