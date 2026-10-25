import { Component, effect, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { DesktopBridge } from '../../core/platform/desktop-bridge';
import { ProfileService } from '../../core/profile/profile.service';
import type { ThemePreference } from '../../core/theme/theme.service';
import { ToastService } from '../../shared/toast/toast.service';

export const DATE_FORMATS = [
  { value: 'dd/MM/yyyy', label: '31/12/2026' },
  { value: 'MM/dd/yyyy', label: '12/31/2026' },
  { value: 'yyyy-MM-dd', label: '2026-12-31' },
] as const;

export const THEMES: readonly { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'Seguir o sistema' },
  { value: 'light', label: 'Claro' },
  { value: 'dark', label: 'Escuro' },
];

@Component({
  selector: 'app-settings-page',
  imports: [ReactiveFormsModule],
  templateUrl: './settings-page.html',
})
export class SettingsPage {
  private readonly profileService = inject(ProfileService);
  private readonly toast = inject(ToastService);
  private readonly bridge = inject(DesktopBridge);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly dateFormats = DATE_FORMATS;
  protected readonly themes = THEMES;
  protected readonly timezones = signal<readonly string[]>(Intl.supportedValuesOf('timeZone'));
  protected readonly loaded = signal(false);
  protected readonly savingProfile = signal(false);
  protected readonly savingPreferences = signal(false);

  protected readonly profileForm = this.fb.group({
    display_name: ['', [Validators.required, Validators.maxLength(80)]],
  });

  protected readonly preferencesForm = this.fb.group({
    theme: this.fb.control<ThemePreference>('system'),
    timezone: ['', Validators.required],
    date_format: ['dd/MM/yyyy', Validators.required],
    notifications_enabled: [true],
    notify_due_soon: [true],
    notify_overdue: [true],
    due_soon_days: [2, [Validators.required, Validators.min(0), Validators.max(30)]],
  });

  constructor() {
    // Fill the forms once the profile is available (loaded by the shell).
    effect(() => {
      const profile = this.profileService.profile();
      const preferences = this.profileService.preferences();
      if (!profile || !preferences || this.loaded()) return;

      this.profileForm.reset({ display_name: profile.display_name });
      if (!this.timezones().includes(preferences.timezone)) {
        this.timezones.update((zones) => [preferences.timezone, ...zones]);
      }
      this.preferencesForm.reset(preferences);
      this.loaded.set(true);
    });
  }

  protected async testNotification(): Promise<void> {
    const shown = await this.bridge.notify({
      title: 'DidiFlow',
      body: 'As notificações estão funcionando.',
    });
    if (!shown) {
      this.toast.error('Notificações nativas não estão disponíveis neste ambiente.');
    }
  }

  async saveProfile(): Promise<void> {
    if (this.profileForm.invalid) {
      this.profileForm.markAllAsTouched();
      return;
    }

    this.savingProfile.set(true);
    try {
      const { display_name } = this.profileForm.getRawValue();
      await this.profileService.updateProfile({ display_name: display_name.trim() });
      this.profileForm.markAsPristine();
      this.toast.success('Perfil atualizado.');
    } catch {
      this.toast.error('Não foi possível salvar o perfil.');
    } finally {
      this.savingProfile.set(false);
    }
  }

  async savePreferences(): Promise<void> {
    if (this.preferencesForm.invalid) {
      this.preferencesForm.markAllAsTouched();
      return;
    }

    this.savingPreferences.set(true);
    try {
      await this.profileService.updatePreferences(this.preferencesForm.getRawValue());
      this.preferencesForm.markAsPristine();
      this.toast.success('Preferências salvas.');
    } catch {
      this.toast.error('Não foi possível salvar as preferências.');
    } finally {
      this.savingPreferences.set(false);
    }
  }
}
