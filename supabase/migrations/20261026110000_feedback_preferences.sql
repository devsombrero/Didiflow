-- Interface feedback preferences: animations and sound effects.

alter table public.user_preferences
  add column animations_enabled boolean not null default true,
  add column sounds_enabled boolean not null default true,
  add column sound_volume smallint not null default 60
    check (sound_volume between 0 and 100);

grant update (animations_enabled, sounds_enabled, sound_volume)
  on public.user_preferences to authenticated;
