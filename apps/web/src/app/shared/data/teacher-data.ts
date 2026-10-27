import { inject, resource } from '@angular/core';
import { ApiClient } from '../../core/api/api-client';
import { AuthStore } from '../../core/auth/auth-store';

/** The signed-in teacher's assignments (class × subject). Call in an injection context. */
export function teacherAssignments() {
  const api = inject(ApiClient);
  const auth = inject(AuthStore);
  return resource({
    params: () => auth.user()?.teacherId ?? undefined,
    loader: ({ params }) => api.school.assignments({ teacherId: params }),
  });
}

/** Every class of the school (labels, sections and sizes). Call in an injection context. */
export function schoolClasses() {
  const api = inject(ApiClient);
  return resource({ loader: () => api.school.classes() });
}
