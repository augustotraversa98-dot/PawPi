// The pending-alarm count: a number only, throttled, and accepted by the allow-list.
const mockGetAll = jest.fn();
jest.mock('expo-notifications', () => ({ getAllScheduledNotificationsAsync: (...a) => mockGetAll(...a) }));
jest.mock('./track', () => ({ track: jest.fn() }));

import { track } from './track';
import {
  reportPendingAlarms,
  scheduleAlarmCountReport,
  resetAlarmCountMemory,
  ALARM_COUNT_MIN_GAP_MS,
  ALARM_COUNT_DELAY_MS,
} from './alarmCount';
import { sanitizeEvent } from './validate';

const pending = (n) =>
  Array.from({ length: n }, (_, i) => ({
    identifier: `reminder_${i}`,
    content: { title: 'Mango breakfast', data: { petId: 7 } },
  }));

beforeEach(() => {
  resetAlarmCountMemory();
  track.mockClear();
  mockGetAll.mockReset();
  mockGetAll.mockResolvedValue(pending(47));
});

it('sends the count and nothing else (no ids, titles or pets)', async () => {
  await expect(reportPendingAlarms(1000)).resolves.toBe(47);
  expect(track.mock.calls).toEqual([['reminder_alarms', { count: '47' }]]);
});

it('is at most once an hour', async () => {
  await reportPendingAlarms(1000);
  await expect(reportPendingAlarms(1000 + ALARM_COUNT_MIN_GAP_MS - 1)).resolves.toBeNull();
  await reportPendingAlarms(1000 + ALARM_COUNT_MIN_GAP_MS);
  expect(track).toHaveBeenCalledTimes(2);
});

it('reports zero too', async () => {
  mockGetAll.mockResolvedValue([]);
  await reportPendingAlarms(1000);
  expect(track).toHaveBeenCalledWith('reminder_alarms', { count: '0' });
});

it('never throws and sends nothing when the OS list cannot be read', async () => {
  mockGetAll.mockRejectedValue(new Error('no'));
  await expect(reportPendingAlarms(1000)).resolves.toBeNull();
  mockGetAll.mockResolvedValue(undefined);
  await expect(reportPendingAlarms(2000)).resolves.toBeNull();
  expect(track).not.toHaveBeenCalled();
});

it('waits before counting, and can be cancelled', async () => {
  jest.useFakeTimers();
  const cancel = scheduleAlarmCountReport();
  cancel();
  jest.advanceTimersByTime(ALARM_COUNT_DELAY_MS * 2);
  expect(mockGetAll).not.toHaveBeenCalled();
  scheduleAlarmCountReport();
  jest.advanceTimersByTime(ALARM_COUNT_DELAY_MS);
  expect(mockGetAll).toHaveBeenCalledTimes(1);
  jest.useRealTimers();
});

it('the event passes the on-device allow-list, and anything but a short number does not', () => {
  expect(sanitizeEvent('reminder_alarms', { count: '64' })).toBeTruthy();
  expect(sanitizeEvent('reminder_alarms', { count: 'reminder_1' })).toBeFalsy();
  expect(sanitizeEvent('reminder_alarms', { count: '12', petId: '7' })).toBeFalsy();
});
