import { Directive, computed, input } from '@angular/core';

export type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'on-dark' | 'danger';

/**
 * Styles a native <button> or <a> as a button, so keyboard behaviour and semantics stay native.
 * `<button cdlsButton variant="secondary" size="sm">`. Icon-only buttons need a visually hidden label.
 */
@Directive({
  selector: 'button[cdlsButton], a[cdlsButton]',
  host: { '[class]': 'classes()' },
})
export class Button {
  readonly variant = input<ButtonVariant>('primary');
  readonly size = input<'md' | 'sm'>('md');
  readonly block = input(false);
  readonly iconOnly = input(false);

  protected readonly classes = computed(() =>
    [
      'btn',
      `btn--${this.variant()}`,
      this.size() === 'sm' ? 'btn--sm' : '',
      this.block() ? 'btn--block' : '',
      this.iconOnly() ? 'btn--icon' : '',
    ]
      .filter(Boolean)
      .join(' '),
  );
}
