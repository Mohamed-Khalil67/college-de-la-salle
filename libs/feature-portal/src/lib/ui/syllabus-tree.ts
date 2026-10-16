import { Component, forwardRef, input } from '@angular/core';
import type { CurriculumNode } from '@exam/data-access-curriculum';

/** A syllabus outline: units with their summary, objectives and (recursively) sub-topics. */
@Component({
  selector: 'portal-syllabus-tree',
  // Recursive: sub-topics render with this same component.
  imports: [forwardRef(() => SyllabusTree)],
  template: `
    <ol [class]="depth() === 0 ? 'tree root' : 'tree'">
      @for (node of nodes(); track node.id) {
        <li>
          <span class="node-title">{{ node.title }}</span>
          <p class="summary">{{ node.summary }}</p>
          @if (node.objectives.length) {
            <ul class="objectives" [attr.aria-label]="'أهداف ' + node.title">
              @for (objective of node.objectives; track $index) {
                <li>{{ objective }}</li>
              }
            </ul>
          }
          @if (node.children.length) {
            <portal-syllabus-tree [nodes]="node.children" [depth]="depth() + 1" />
          }
        </li>
      }
    </ol>
  `,
  styles: `
    .tree { margin: 0; padding-inline-start: 1.25rem; display: grid; gap: 0.75rem; }
    .tree.root { padding-inline-start: 0; list-style: none; counter-reset: unit; }
    .tree.root > li { counter-increment: unit; padding-block: 0.75rem; padding-inline: 1rem; border-inline-start: 4px solid var(--accent); background: var(--surface); border-radius: var(--radius); }
    .node-title { font-family: var(--font-display); font-weight: 700; font-size: 1.15rem; color: var(--accent-strong); }
    .summary { margin-block: 0.15rem 0.35rem; }
    .objectives { margin: 0; padding-inline-start: 1.25rem; color: var(--muted); font-size: 0.95rem; }
  `,
})
export class SyllabusTree {
  readonly nodes = input.required<readonly CurriculumNode[]>();
  readonly depth = input(0);
}
