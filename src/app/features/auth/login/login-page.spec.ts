import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { AuthApiError } from '@supabase/supabase-js';
import {
  createSupabaseMock,
  provideSupabaseMock,
  type SupabaseMock,
} from '../../../../testing/supabase.mock';
import { LoginPage } from './login-page';

describe('LoginPage', () => {
  let fixture: ComponentFixture<LoginPage>;
  let supabase: SupabaseMock;
  let element: HTMLElement;

  beforeEach(async () => {
    supabase = createSupabaseMock();
    await TestBed.configureTestingModule({
      imports: [LoginPage],
      providers: [provideRouter([]), provideSupabaseMock(supabase)],
    }).compileComponents();

    fixture = TestBed.createComponent(LoginPage);
    element = fixture.nativeElement;
    await fixture.whenStable();
  });

  function fill(email: string, password: string): void {
    const [emailInput, passwordInput] = Array.from(element.querySelectorAll('input'));
    emailInput.value = email;
    emailInput.dispatchEvent(new Event('input'));
    passwordInput.value = password;
    passwordInput.dispatchEvent(new Event('input'));
  }

  async function submit(): Promise<void> {
    element.querySelector('form')?.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
  }

  it('does not call Supabase when the form is invalid', async () => {
    fill('not-an-email', '');
    await submit();

    expect(supabase.auth.signInWithPassword).not.toHaveBeenCalled();
    expect(element.textContent).toContain('Informe um e-mail válido.');
    expect(element.textContent).toContain('Informe sua senha.');
  });

  it('signs in and navigates home', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    fill('alice@test.local', 'Secret123');
    await submit();

    expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'alice@test.local',
      password: 'Secret123',
    });
    expect(navigate).toHaveBeenCalledWith('/');
  });

  it('shows the mapped error message', async () => {
    supabase.auth.signInWithPassword.mockResolvedValueOnce({
      data: {},
      error: new AuthApiError('Invalid login credentials', 400, 'invalid_credentials'),
    });
    fill('alice@test.local', 'wrong');
    await submit();

    expect(element.querySelector('[role="alert"]')?.textContent).toContain(
      'E-mail ou senha incorretos.',
    );
  });
});
