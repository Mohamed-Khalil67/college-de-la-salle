import { Component, inject, signal } from '@angular/core';
import { form, FormField, FormRoot, required, validate } from '@angular/forms/signals';
import {
  type AuditAction,
  type DirectoryKind,
  type ExaminerDirectoryEntry,
  parseDirectoryTarget,
  type RoleAction,
} from '@exam/contracts';
import { AuthStore } from '@exam/data-access-auth';
import { type DirectoryFilter, RoleAdminStore } from '@exam/data-access-auth/data';
import { ArDatePipe, ArNumberPipe, arabicErrorMessage, formatCount } from '@exam/ui-arabic';

const ACTION_LABELS: Readonly<Record<AuditAction, string>> = {
  GRANT_EXAMINER: 'منح صلاحية المُمتحِن',
  REVOKE_EXAMINER: 'سحب صلاحية المُمتحِن',
  BOOTSTRAP_SUPER_ADMIN: 'تعيين المشرف العام',
};

/**
 * Super-admin console: who may author exams. Everything shown is read live from the examiner
 * directory and the audit log (readable by the super admin only); every change goes through the
 * `manageExaminerRole` Cloud Function, which also writes the audit line and revokes tokens.
 */
@Component({
  selector: 'exam-admin-panel-page',
  imports: [FormField, FormRoot, ArDatePipe, ArNumberPipe],
  providers: [RoleAdminStore],
  templateUrl: './admin-panel.page.html',
  styleUrl: './admin-panel.page.scss',
})
export class AdminPanelPage {
  protected readonly auth = inject(AuthStore);
  protected readonly store = inject(RoleAdminStore);

  protected readonly busy = signal(false);
  /** `entry` (an email or domain) is rendered in its own <bdi> so it never reorders the sentence. */
  protected readonly feedback = signal<{
    readonly ok: boolean;
    readonly text: string;
    readonly entry?: string;
    readonly tail?: string;
  } | null>(null);

  protected readonly model = signal({ email: '' });
  protected readonly grantForm = form(this.model, (p) => {
    required(p.email, { message: 'أدخِل بريدًا إلكترونيًّا أو نطاقًا.' });
    validate(p.email, ({ value }) =>
      !value() || parseDirectoryTarget(value())
        ? null
        : { kind: 'target', message: 'أدخِل بريدًا صحيحًا (name@school.edu) أو نطاقًا يبدأ بـ @ (@school.edu).' },
    );
  });

  protected submitFrom(event: Event, action: RoleAction): void {
    event.preventDefault();
    this.grantForm.email().markAsTouched();
    if (this.grantForm().invalid()) return;
    void this.apply(this.model().email, action, true);
  }

  protected async apply(email: string, action: RoleAction, resetForm = false): Promise<void> {
    this.busy.set(true);
    this.feedback.set(null);
    try {
      const result = await this.store.manage(email, action);
      const verb = action === 'grant' ? 'مُنِحت صلاحية المُمتحِن لـ' : 'سُحِبت صلاحية المُمتحِن من';
      const reach = result.accountsUpdated
        ? `حُدِّث ${formatCount(result.accountsUpdated, 'account')} فورًا.`
        : action === 'grant'
          ? 'ستُطبَّق عند تسجيل الدخول التالي.'
          : 'لا توجد حسابات نشطة متأثّرة الآن.';
      this.feedback.set({ ok: true, text: verb, entry: result.entry, tail: reach });
      if (resetForm) this.model.set({ email: '' });
    } catch (error) {
      this.feedback.set({ ok: false, text: arabicErrorMessage(error) });
    } finally {
      this.busy.set(false);
    }
  }

  protected setFilter(value: string): void {
    const filter: DirectoryFilter = value === 'ACTIVE' || value === 'REVOKED' ? value : 'ALL';
    this.store.statusFilter.set(filter);
  }

  protected kindLabel(kind: DirectoryKind): string {
    return kind === 'DOMAIN' ? 'نطاق كامل' : 'حساب';
  }

  protected roleLabel(entry: ExaminerDirectoryEntry): string {
    return entry.role === 'super_admin' ? 'مشرف عام' : 'مُمتحِن';
  }

  protected actionLabel(action: AuditAction): string {
    return ACTION_LABELS[action];
  }

  protected errorText(error: unknown): string {
    return arabicErrorMessage(error);
  }
}
