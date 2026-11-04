import { describe, it, expect, vi } from 'vitest';
import { KNOWN_EVENTS } from './knownEvents.js';
import { Subject } from './subject.js';
import { getSubject } from './subjects.js';

describe('KNOWN_EVENTS', () => {
  it('has no duplicates', () => {
    expect(new Set(KNOWN_EVENTS).size).toBe(KNOWN_EVENTS.length);
  });

  it('only contains plain identifier names', () => {
    for (const name of KNOWN_EVENTS) expect(name).toMatch(/^[A-Za-z][A-Za-z0-9]*$/);
  });

  it('has no names that differ only by case (SignalR matches case-insensitively)', () => {
    const lower = KNOWN_EVENTS.map((n) => n.toLowerCase());
    expect(new Set(lower).size).toBe(lower.length);
  });

  it('covers the job, team, tasking and ops log events the page relies on', () => {
    for (const name of ['jobCreated', 'jobUpdated', 'teamCreated', 'teamUpdated', 'taskingUpdated', 'opsLogUpdated']) {
      expect(KNOWN_EVENTS).toContain(name);
    }
  });
});

describe('Subject', () => {
  it('delivers values to every subscriber', () => {
    const s = new Subject();
    const a = vi.fn();
    const b = vi.fn();
    s.subscribe(a);
    s.subscribe(b);
    s.next({ id: 1 });
    expect(a).toHaveBeenCalledWith({ id: 1 });
    expect(b).toHaveBeenCalledWith({ id: 1 });
  });

  it('unsubscribes via the returned function', () => {
    const s = new Subject();
    const cb = vi.fn();
    const off = s.subscribe(cb);
    expect(off()).toBe(true);
    s.next(1);
    expect(cb).not.toHaveBeenCalled();
    expect(off()).toBe(false);
  });

  it('ignores a callback subscribed twice (Set semantics)', () => {
    const s = new Subject();
    const cb = vi.fn();
    s.subscribe(cb);
    s.subscribe(cb);
    s.next(1);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('does nothing when there are no subscribers', () => {
    expect(() => new Subject().next('x')).not.toThrow();
  });

  it('lets a subscriber unsubscribe itself while being notified', () => {
    const s = new Subject();
    const seen = [];
    const off = s.subscribe((v) => {
      seen.push(v);
      off();
    });
    s.next(1);
    s.next(2);
    expect(seen).toEqual([1]);
  });
});

describe('getSubject', () => {
  it('returns the same Subject for the same event name', () => {
    expect(getSubject('signalrBasics.same')).toBe(getSubject('signalrBasics.same'));
  });

  it('is case-sensitive', () => {
    expect(getSubject('signalrBasics.Case')).not.toBe(getSubject('signalrBasics.case'));
  });

  it('keeps events independent of each other', () => {
    const cb = vi.fn();
    getSubject('signalrBasics.one').subscribe(cb);
    getSubject('signalrBasics.two').next('x');
    expect(cb).not.toHaveBeenCalled();
    getSubject('signalrBasics.one').next('y');
    expect(cb).toHaveBeenCalledWith('y');
  });
});
