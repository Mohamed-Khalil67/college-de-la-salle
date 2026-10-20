import { Component, computed, input } from '@angular/core';

/** Initials in a circle. Decorative: the person's name is always written next to it. */
@Component({
  selector: 'cdls-avatar',
  template: `<span class="avatar" [class.avatar--gold]="gold()" aria-hidden="true">{{ initials() }}</span>`,
})
export class Avatar {
  readonly name = input.required<string>();
  readonly gold = input(false);
  protected readonly initials = computed(() =>
    this.name()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join(''),
  );
}
