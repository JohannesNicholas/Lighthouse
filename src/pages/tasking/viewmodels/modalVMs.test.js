import { describe, it, expect, vi, beforeEach } from 'vitest';
import ko from 'knockout';

vi.mock('../components/windowAlert.js', () => ({ showAlert: vi.fn() }));

import { showAlert } from '../components/windowAlert.js';
import { CallOffModalVM } from './CallOffModalVM.js';
import { OpsLogResolveModalVM } from './OpsLogResolveModalVM.js';
import { JobStatusConfirmModalVM } from './JobStatusConfirmModalVM.js';

beforeEach(() => {
  ko.options.deferUpdates = false;
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('CallOffModalVM', () => {
  const tasking = (over = {}) => ({
    team: ko.observable({ callsign: () => 'ALPHA 1' }),
    job: ko.observable({ identifier: () => 'J-100' }),
    canCalloff: () => true,
    statusOptions: () => [{ key: 'Other' }, { key: 'CallOff' }],
    onStatusDropdownToggleClick: vi.fn(),
    onStatusOptionClick: vi.fn(),
    callOffReason: vi.fn(),
    updateTaskingStatus: vi.fn(),
    ...over,
  });

  it('has empty labels with no tasking', () => {
    const vm = new CallOffModalVM();
    expect(vm.teamLabel()).toBe('');
    expect(vm.jobLabel()).toBe('');
    expect(vm.canSubmit()).toBe(false);
  });

  it('labels the team and job from the tasking', () => {
    const vm = new CallOffModalVM();
    vm.open(tasking());
    expect(vm.teamLabel()).toBe('ALPHA 1');
    expect(vm.jobLabel()).toBe('J-100');
  });

  it('needs a non-blank reason and a tasking that can be called off', () => {
    const vm = new CallOffModalVM();
    vm.open(tasking());
    expect(vm.canSubmit()).toBe(false);
    vm.reason('   ');
    expect(vm.canSubmit()).toBe(false);
    vm.reason('Job complete');
    expect(vm.canSubmit()).toBe(true);
    vm.open(tasking({ canCalloff: () => false }));
    vm.reason('Job complete');
    expect(vm.canSubmit()).toBe(false);
  });

  it('open() resets the reason', () => {
    const vm = new CallOffModalVM();
    vm.reason('old');
    vm.open(tasking());
    expect(vm.reason()).toBe('');
  });

  it('submit() drives the tasking status update with the trimmed reason and hides the modal', () => {
    const vm = new CallOffModalVM();
    const ts = tasking();
    vm.modalInstance = { hide: vi.fn() };
    vm.open(ts);
    vm.reason('  stood down  ');
    vm.submit();
    expect(ts.onStatusDropdownToggleClick).toHaveBeenCalled();
    expect(ts.onStatusOptionClick).toHaveBeenCalledWith({ key: 'CallOff' });
    expect(ts.callOffReason).toHaveBeenCalledWith('stood down');
    expect(ts.updateTaskingStatus).toHaveBeenCalled();
    expect(vm.modalInstance.hide).toHaveBeenCalled();
  });

  it('submit() does nothing while it cannot submit', () => {
    const vm = new CallOffModalVM();
    const ts = tasking();
    vm.open(ts);
    vm.submit();
    expect(ts.updateTaskingStatus).not.toHaveBeenCalled();
  });
});

describe('OpsLogResolveModalVM', () => {
  const entry = (over = {}) => ({
    id: () => 7,
    subject: () => 'Road closed',
    tagsCsv: () => 'a,b',
    actionRequired: vi.fn(),
    ...over,
  });

  it('describes the entry by subject, then tags, then id', () => {
    const vm = new OpsLogResolveModalVM({});
    expect(vm.entrySubject()).toBe('');
    vm.open(entry());
    expect(vm.entrySubject()).toBe('Road closed');
    vm.open(entry({ subject: () => '' }));
    expect(vm.entrySubject()).toBe('a,b');
    vm.open(entry({ subject: () => '', tagsCsv: () => '' }));
    expect(vm.entrySubject()).toBe('Entry #7');
  });

  it('needs non-blank text to submit', () => {
    const vm = new OpsLogResolveModalVM({});
    expect(vm.canSubmit()).toBe(false);
    vm.text(' x ');
    expect(vm.canSubmit()).toBe(true);
  });

  it('resolves the entry, clears actionRequired, hides, alerts and refreshes the job', async () => {
    const root = { resolveOpsLogEntry: vi.fn().mockResolvedValue() };
    const vm = new OpsLogResolveModalVM(root);
    const e = entry();
    const job = { refreshData: vi.fn() };
    vm.modalInstance = { hide: vi.fn() };
    vm.open(e, job);
    vm.text('  done ');
    await vm.submit();
    expect(root.resolveOpsLogEntry).toHaveBeenCalledWith(7, { Text: 'done' });
    expect(e.actionRequired).toHaveBeenCalledWith(false);
    expect(vm.modalInstance.hide).toHaveBeenCalled();
    expect(showAlert).toHaveBeenCalledWith('Ops log entry resolved', 'success', 3000);
    expect(job.refreshData).toHaveBeenCalledWith({ force: true });
    expect(vm.isSubmitting()).toBe(false);
  });

  it('shows an error alert and unlocks when the request fails', async () => {
    const root = { resolveOpsLogEntry: vi.fn().mockRejectedValue(new Error('boom')) };
    const vm = new OpsLogResolveModalVM(root);
    const e = entry();
    vm.open(e, null);
    vm.text('x');
    await vm.submit();
    expect(showAlert).toHaveBeenCalledWith('Failed to resolve ops log entry', 'danger', 5000);
    expect(e.actionRequired).not.toHaveBeenCalled();
    expect(vm.isSubmitting()).toBe(false);
  });

  it('ignores a second submit while the first is in flight', async () => {
    let release;
    const root = { resolveOpsLogEntry: vi.fn(() => new Promise((r) => { release = r; })) };
    const vm = new OpsLogResolveModalVM(root);
    vm.open(entry(), null);
    vm.text('x');
    const first = vm.submit();
    await vm.submit();
    release();
    await first;
    expect(root.resolveOpsLogEntry).toHaveBeenCalledTimes(1);
  });

  it('does nothing without an entry or text', async () => {
    const root = { resolveOpsLogEntry: vi.fn() };
    const vm = new OpsLogResolveModalVM(root);
    vm.text('x');
    await vm.submit();
    vm.open(entry());
    await vm.submit();
    expect(root.resolveOpsLogEntry).not.toHaveBeenCalled();
  });
});

describe('JobStatusConfirmModalVM', () => {
  const job = (over = {}) => ({
    id: () => 42,
    identifier: () => 'J-42 long',
    identifierTrimmed: () => 'J-42',
    refreshData: vi.fn(),
    ...over,
  });

  it('labels the job: trimmed identifier, identifier, then #id', () => {
    const vm = new JobStatusConfirmModalVM({});
    expect(vm.jobLabel()).toBe('');
    vm.open(job(), 'Complete');
    expect(vm.jobLabel()).toBe('J-42');
    vm.open(job({ identifierTrimmed: undefined }), 'Complete');
    expect(vm.jobLabel()).toBe('J-42 long');
    vm.open(job({ identifierTrimmed: undefined, identifier: undefined }), 'Complete');
    expect(vm.jobLabel()).toBe('#42');
  });

  it.each([
    ['Complete', true, 'Completion notes:', 'Enter completion notes (required)'],
    ['Reject', true, 'Rejection reason:', 'Enter rejection reason (required)'],
    ['Cancel', true, 'Cancellation reason:', 'Enter cancellation reason (required)'],
    ['Acknowledge', false, 'Notes:', 'Optional notes'],
    ['', false, 'Notes:', 'Optional notes'],
  ])('status %j: requires text=%s, label %j', (status, requires, label, placeholder) => {
    const vm = new JobStatusConfirmModalVM({});
    vm.open(job(), status);
    expect(vm.requiresExtraText()).toBe(requires);
    expect(vm.extraTextLabel()).toBe(label);
    expect(vm.extraTextPlaceholder()).toBe(placeholder);
  });

  it('only allows submit once required text is entered', () => {
    const vm = new JobStatusConfirmModalVM({});
    vm.open(job(), 'Reject');
    expect(vm.canSubmit()).toBe(false);
    vm.extraText('  ');
    expect(vm.canSubmit()).toBe(false);
    vm.extraText('no capacity');
    expect(vm.canSubmit()).toBe(true);
    vm.open(job(), 'Acknowledge');
    expect(vm.canSubmit()).toBe(true);
  });

  it('sets the status with trimmed text, hides, refreshes and alerts', async () => {
    const root = { setJobStatus: vi.fn().mockResolvedValue() };
    const vm = new JobStatusConfirmModalVM(root);
    const j = job();
    vm.modalInstance = { hide: vi.fn() };
    vm.open(j, 'Complete');
    vm.extraText(' all done ');
    await vm.submit();
    expect(root.setJobStatus).toHaveBeenCalledWith(42, 'Complete', 'all done');
    expect(vm.modalInstance.hide).toHaveBeenCalled();
    expect(j.refreshData).toHaveBeenCalled();
    expect(showAlert).toHaveBeenCalledWith('Incident J-42 status set to Complete', 'success', 3000);
    expect(vm.isSubmitting()).toBe(false);
  });

  it('alerts and unlocks on failure', async () => {
    const root = { setJobStatus: vi.fn().mockRejectedValue(new Error('x')) };
    const vm = new JobStatusConfirmModalVM(root);
    const j = job();
    vm.open(j, 'Acknowledge');
    await vm.submit();
    expect(showAlert).toHaveBeenCalledWith('Failed to update incident status to Acknowledge', 'danger', 5000);
    expect(j.refreshData).not.toHaveBeenCalled();
    expect(vm.isSubmitting()).toBe(false);
  });

  it('does nothing without a job or status', async () => {
    const root = { setJobStatus: vi.fn() };
    const vm = new JobStatusConfirmModalVM(root);
    await vm.submit();
    vm.open(job(), '');
    await vm.submit();
    expect(root.setJobStatus).not.toHaveBeenCalled();
  });
});
