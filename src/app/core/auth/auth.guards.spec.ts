import { TestBed } from '@angular/core/testing';
import {
  type ActivatedRouteSnapshot,
  type CanActivateFn,
  provideRouter,
  type RouterStateSnapshot,
  UrlTree,
} from '@angular/router';
import type { Session } from '@supabase/supabase-js';
import {
  createSupabaseMock,
  fakeSession,
  provideSupabaseMock,
} from '../../../testing/supabase.mock';
import { authGuard, guestGuard } from './auth.guards';

function run(guard: CanActivateFn, session: Session | null) {
  TestBed.configureTestingModule({
    providers: [provideRouter([]), provideSupabaseMock(createSupabaseMock(session))],
  });
  return TestBed.runInInjectionContext(() =>
    guard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
  ) as Promise<boolean | UrlTree>;
}

describe('authGuard', () => {
  it('allows authenticated users', async () => {
    expect(await run(authGuard, fakeSession())).toBe(true);
  });

  it('redirects anonymous users to /login', async () => {
    const result = await run(authGuard, null);
    expect(result).toBeInstanceOf(UrlTree);
    expect(String(result)).toBe('/login');
  });
});

describe('guestGuard', () => {
  it('allows anonymous users', async () => {
    expect(await run(guestGuard, null)).toBe(true);
  });

  it('redirects authenticated users home', async () => {
    expect(String(await run(guestGuard, fakeSession()))).toBe('/');
  });
});
