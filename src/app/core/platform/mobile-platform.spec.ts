import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import {
  customKey,
  isNativeMobile,
  MobileNotifications,
  notificationId,
  reminderKey,
} from './mobile-platform';

describe('mobile platform', () => {
  afterEach(() => localStorage.clear());

  it('is not native outside the Android app', () => {
    expect(isNativeMobile()).toBe(false);
  });

  it('derives stable positive notification ids from keys', () => {
    const id = notificationId(reminderKey('abc'));
    expect(id).toBe(notificationId('reminder:abc'));
    expect(id).toBeGreaterThan(0);
    expect(id).toBeLessThan(2_000_000_000);
    expect(notificationId(customKey('r1', new Date('2026-10-26T12:00:00Z')))).not.toBe(id);
  });

  it('reports OS-delivered items from the ledger only after their time', () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const mobile = TestBed.inject(MobileNotifications);
    const past = new Date(Date.now() - 60_000).toISOString();
    const future = new Date(Date.now() + 3_600_000).toISOString();
    localStorage.setItem(
      'didiflow:native-scheduled',
      JSON.stringify({ 'reminder:a': past, 'reminder:b': future }),
    );
    expect(mobile.available).toBe(false);
    expect(mobile.deliveredByOs('reminder:a')).toBe(true);
    expect(mobile.deliveredByOs('reminder:b')).toBe(false);
    expect(mobile.deliveredByOs('reminder:c')).toBe(false);
  });
});
