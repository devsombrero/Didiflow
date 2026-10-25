import { Component, computed, inject } from '@angular/core';
import { ProfileService } from '../../core/profile/profile.service';

@Component({
  selector: 'app-home-page',
  template: `
    <h1>{{ greeting() }}</h1>
    <section class="card">
      <h2>Nenhuma demanda ainda</h2>
      <p class="muted">
        O cadastro de demandas e o dashboard chegam nas próximas etapas. Enquanto isso, ajuste seu
        perfil e suas preferências em Configurações.
      </p>
    </section>
  `,
})
export class HomePage {
  private readonly profile = inject(ProfileService).profile;

  protected readonly greeting = computed(() => {
    const name = this.profile()?.display_name;
    return name ? `Olá, ${name}` : 'Olá';
  });
}
