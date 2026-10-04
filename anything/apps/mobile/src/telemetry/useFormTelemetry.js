// useFormTelemetry(form, options): form_step view / complete / abandon / error for one form or wizard.
//
//   const ft = useFormTelemetry("add_dog", { active: visible });
//   ...      ft.step("photo")      // next wizard step -> view
//   ...      ft.complete()         // saved: no abandon later
//   ...      ft.error()            // a submit failed (the form stays open)
//
// `form` must be a registry FORMS key; steps are short keys ^[a-z][a-z0-9_]{0,39}$ (never field contents).
// "view" is emitted when the form becomes active (default: on mount), "abandon" when it stops being active
// (unmount / closed) without complete(). Everything is additive and never throws; React only (no native import).

import { useEffect, useMemo, useRef } from 'react';
import { trackForm } from './track';

export function useFormTelemetry(form, { active = true, step = 'main' } = {}) {
  const ref = useRef({ form, step, completed: false });
  ref.current.form = form;

  useEffect(() => {
    if (!active) return undefined;
    const s = ref.current;
    s.completed = false;
    s.step = step;
    trackForm(s.form, s.step, 'view');
    return () => {
      if (!s.completed) trackForm(s.form, s.step, 'abandon');
    };
    // `step` is only the INITIAL step; later steps go through api.step().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, form]);

  return useMemo(
    () => ({
      step(next) {
        ref.current.step = next;
        trackForm(ref.current.form, next, 'view');
      },
      complete(at) {
        ref.current.completed = true;
        trackForm(ref.current.form, at ?? ref.current.step, 'complete');
      },
      error(at) {
        trackForm(ref.current.form, at ?? ref.current.step, 'error');
      },
    }),
    [],
  );
}
