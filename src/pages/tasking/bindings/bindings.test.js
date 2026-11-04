// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import ko from 'knockout';
import $ from 'jquery';
import { installSortableArrayBindings } from './sortableArray.js';
import { installFlashOnChangeBinding } from './flashOnChange.js';
import { installRowVisibilityBindings } from './rowVisibility.js';
import { noBubbleFromDisabledButtonsBindings } from './noBubble.js';
import { installSlideVisibleBinding } from './slideVisible.js';
import { installStatusFilterBindings } from './statusFilters.js';

const mount = (html, vm) => {
  const host = document.createElement('div');
  host.innerHTML = html;
  document.body.appendChild(host);
  ko.applyBindings(vm, host);
  return host;
};

const fakeDataTransfer = () => {
  const store = {};
  return { effectAllowed: '', dropEffect: '', setData: (k, v) => { store[k] = v; }, getData: (k) => store[k] };
};
const dragEvent = (type, dt) => {
  const e = new Event(type, { bubbles: true, cancelable: true });
  e.dataTransfer = dt;
  return e;
};

beforeEach(() => {
  ko.options.deferUpdates = false;
  document.body.innerHTML = '';
});
afterEach(() => vi.useRealTimers());

describe('trVisible', () => {
  it('shows a row as table-row and hides it with none', () => {
    installRowVisibilityBindings();
    const show = ko.observable(true);
    const host = mount('<table><tbody><tr data-bind="trVisible: show"><td>x</td></tr></tbody></table>', { show });
    const tr = host.querySelector('tr');
    expect(tr.style.display).toBe('table-row');
    show(false);
    expect(tr.style.display).toBe('none');
  });
});

describe('noBubbleFromDisabledButtons', () => {
  it('stops clicks reaching ancestors', () => {
    noBubbleFromDisabledButtonsBindings();
    const parentClick = vi.fn();
    const host = mount('<div id="p"><button data-bind="noBubbleFromDisabledButtons: true">x</button></div>', {});
    host.querySelector('#p').addEventListener('click', parentClick);
    host.querySelector('button').click();
    expect(parentClick).not.toHaveBeenCalled();
  });
});

describe('flashOnChange / flashTextOnChange', () => {
  beforeEach(() => installFlashOnChangeBinding());

  it('does not flash on first render', () => {
    const v = ko.observable(1);
    const host = mount('<span data-bind="flashOnChange: v"></span>', { v });
    expect(host.firstChild.classList.contains('flash-on-change')).toBe(false);
  });

  it('adds the class on change and removes it after 900ms', () => {
    vi.useFakeTimers();
    const v = ko.observable(1);
    const host = mount('<span data-bind="flashOnChange: v"></span>', { v });
    v(2);
    expect(host.firstChild.classList.contains('flash-on-change')).toBe(true);
    vi.advanceTimersByTime(901);
    expect(host.firstChild.classList.contains('flash-on-change')).toBe(false);
  });

  it('the text variant uses its own class', () => {
    const v = ko.observable('a');
    const host = mount('<span data-bind="flashTextOnChange: v"></span>', { v });
    v('b');
    expect(host.firstChild.classList.contains('flash-text-on-change')).toBe(true);
    expect(host.firstChild.classList.contains('flash-on-change')).toBe(false);
  });

  it('cancels its timer when the element is removed', () => {
    vi.useFakeTimers();
    const v = ko.observable(1);
    const host = mount('<span data-bind="flashOnChange: v"></span>', { v });
    v(2);
    ko.removeNode(host.firstChild);
    expect(() => vi.runAllTimers()).not.toThrow();
  });
});

describe('slideVisible', () => {
  beforeEach(() => {
    installSlideVisibleBinding();
    $.fx.off = true;
  });

  it('sets the initial visibility then toggles with the observable', () => {
    const open = ko.observable(false);
    const host = mount('<div data-bind="slideVisible: open">x</div>', { open });
    const el = host.firstChild;
    expect(el.style.display).toBe('none');
    open(true);
    expect(el.style.display).not.toBe('none');
    open(false);
    expect(el.style.display).toBe('none');
  });
});

describe('status filter bindings', () => {
  beforeEach(() => installStatusFilterBindings());

  const makeVm = () => ({
    config: {
      jobStatusFilter: ko.observableArray(['New']),
      teamStatusFilter: ko.observableArray([]),
      sectorFilters: ko.observableArray([{ id: 2, name: 'North' }]),
      save: vi.fn(),
    },
    fetchAllJobsData: vi.fn(),
    fetchAllTeamData: vi.fn(),
  });

  const change = (el, checked) => {
    el.checked = checked;
    el.dispatchEvent(new Event('change'));
  };

  it('registers every filter binding name the templates use', () => {
    for (const name of ['teamStatusFilter', 'jobStatusFilter', 'incidentTypeFilter', 'teamTaskStatusFilter', 'teamTypeFilter', 'teamStatusFilterAndFetch', 'teamTaskStatusFilterAndFetch', 'teamTypeFilterAndFetch', 'jobStatusFilterAndFetch', 'incidentTypeFilterAndFetch', 'sectorFilterAndFetch']) {
      expect(ko.bindingHandlers[name], name).toBeTruthy();
    }
  });

  it('initialises the checkbox from the config list', () => {
    const vm = makeVm();
    const host = mount('<input type="checkbox" id="a" data-bind="jobStatusFilter: \'New\'"><input type="checkbox" id="b" data-bind="jobStatusFilter: \'Active\'">', vm);
    expect(host.querySelector('#a').checked).toBe(true);
    expect(host.querySelector('#b').checked).toBe(false);
  });

  it('adds and removes the status as the box changes, without duplicating', () => {
    const vm = makeVm();
    const host = mount('<input type="checkbox" data-bind="jobStatusFilter: \'Active\'">', vm);
    const box = host.querySelector('input');
    change(box, true);
    change(box, true);
    expect(vm.config.jobStatusFilter()).toEqual(['New', 'Active']);
    change(box, false);
    expect(vm.config.jobStatusFilter()).toEqual(['New']);
  });

  it('updates the checkbox when the config list changes elsewhere', () => {
    const vm = makeVm();
    const host = mount('<input type="checkbox" data-bind="jobStatusFilter: \'Active\'">', vm);
    vm.config.jobStatusFilter.push('Active');
    expect(host.querySelector('input').checked).toBe(true);
  });

  it('the plain bindings do not save or fetch', () => {
    const vm = makeVm();
    const host = mount('<input type="checkbox" data-bind="jobStatusFilter: \'Active\'">', vm);
    change(host.querySelector('input'), true);
    expect(vm.config.save).not.toHaveBeenCalled();
    expect(vm.fetchAllJobsData).not.toHaveBeenCalled();
  });

  it('the AndFetch bindings save the config then refetch the right data', () => {
    const vm = makeVm();
    const host = mount('<input id="j" type="checkbox" data-bind="jobStatusFilterAndFetch: \'Active\'"><input id="t" type="checkbox" data-bind="teamStatusFilterAndFetch: \'Free\'">', vm);
    change(host.querySelector('#j'), true);
    expect(vm.config.save).toHaveBeenCalledTimes(1);
    expect(vm.fetchAllJobsData).toHaveBeenCalledTimes(1);
    expect(vm.fetchAllTeamData).not.toHaveBeenCalled();
    change(host.querySelector('#t'), true);
    expect(vm.fetchAllTeamData).toHaveBeenCalledTimes(1);
  });

  it('does nothing when the config lacks the list', () => {
    const vm = { config: {} };
    expect(() => mount('<input type="checkbox" data-bind="jobStatusFilter: \'Active\'">', vm)).not.toThrow();
  });

  it('sector filter checks by id, stores {id,name}, and removes by id', () => {
    const vm = makeVm();
    const host = mount('<input id="n" type="checkbox" data-bind="sectorFilterAndFetch: { id: 2, name: \'North\' }"><input id="s" type="checkbox" data-bind="sectorFilterAndFetch: { id: 3, name: \'South\' }">', vm);
    expect(host.querySelector('#n').checked).toBe(true);
    expect(host.querySelector('#s').checked).toBe(false);
    change(host.querySelector('#s'), true);
    expect(vm.config.sectorFilters()).toEqual([{ id: 2, name: 'North' }, { id: 3, name: 'South' }]);
    change(host.querySelector('#n'), false);
    expect(vm.config.sectorFilters()).toEqual([{ id: 3, name: 'South' }]);
    expect(vm.config.save).toHaveBeenCalledTimes(2);
    expect(vm.fetchAllJobsData).toHaveBeenCalledTimes(2);
  });
});

describe('sortableRow', () => {
  beforeEach(() => installSortableArrayBindings());

  const html = '<ul data-bind="foreach: items"><li data-bind="sortableRow: { array: $parent.items }, text: $data"></li></ul>';

  it('makes rows draggable and warns when not given an observableArray', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const host = mount(html, { items: ko.observableArray(['a', 'b']) });
    expect(host.querySelector('li').getAttribute('draggable')).toBe('true');
    mount('<p data-bind="sortableRow: { array: [] }"></p>', {});
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('observableArray'));
    warn.mockRestore();
  });

  it('moves a dragged row to the drop position', () => {
    const items = ko.observableArray(['a', 'b', 'c']);
    const host = mount(html, { items });
    const [a, , c] = host.querySelectorAll('li');
    const dt = fakeDataTransfer();
    a.dispatchEvent(dragEvent('dragstart', dt));
    expect(a.classList.contains('is-dragging')).toBe(true);
    expect(dt.getData('text/plain')).toBe('0');
    c.dispatchEvent(dragEvent('dragover', dt));
    expect(c.classList.contains('is-dragover')).toBe(true);
    c.dispatchEvent(dragEvent('drop', dt));
    expect(items()).toEqual(['b', 'c', 'a']);
    expect(c.classList.contains('is-dragover')).toBe(false);
    a.dispatchEvent(dragEvent('dragend', dt));
    expect(a.classList.contains('is-dragging')).toBe(false);
  });

  it('ignores a drop onto itself', () => {
    const items = ko.observableArray(['a', 'b']);
    const host = mount(html, { items });
    const a = host.querySelector('li');
    const dt = fakeDataTransfer();
    a.dispatchEvent(dragEvent('dragstart', dt));
    a.dispatchEvent(dragEvent('drop', dt));
    expect(items()).toEqual(['a', 'b']);
  });

  it('clears the drag-over highlight on dragleave', () => {
    const host = mount(html, { items: ko.observableArray(['a', 'b']) });
    const b = host.querySelectorAll('li')[1];
    b.dispatchEvent(dragEvent('dragover', fakeDataTransfer()));
    b.dispatchEvent(new Event('dragleave'));
    expect(b.classList.contains('is-dragover')).toBe(false);
  });

  it('with a handle, only drags when the pointer went down on the handle', () => {
    const items = ko.observableArray(['a', 'b']);
    const host = mount('<ul data-bind="foreach: items"><li data-bind="sortableRow: { array: $parent.items, handle: \'.grip\' }"><i class="grip">::</i><span class="body">x</span></li></ul>', { items });
    const li = host.querySelector('li');
    expect(li.getAttribute('draggable')).toBe('false');

    const down = (target) => { const e = new Event('pointerdown', { bubbles: true }); target.dispatchEvent(e); };
    down(li.querySelector('.body'));
    expect(li.getAttribute('draggable')).toBe('false');
    const blocked = dragEvent('dragstart', fakeDataTransfer());
    li.dispatchEvent(blocked);
    expect(blocked.defaultPrevented).toBe(true);

    down(li.querySelector('.grip'));
    expect(li.getAttribute('draggable')).toBe('true');
    const dt = fakeDataTransfer();
    const ok = dragEvent('dragstart', dt);
    li.dispatchEvent(ok);
    expect(ok.defaultPrevented).toBe(false);
    expect(dt.getData('text/plain')).toBe('0');
  });
});
