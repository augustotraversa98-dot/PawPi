// The mobile "Share with your vet" sheet tells the owner exactly what a medical_read grant opens, and what it does not
// (apps/mobile/src/components/Health/VetShare/ShareWithVetSheet.jsx, strings under "vetShare"). Consent is only honest
// while the database agrees, so this pins the policy catalog: if a migration widens what a vet can read, this fails and
// the consent copy (and docs/vet-sharing-design.md) must change in the same PR.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Sql } from 'postgres';
import { makeTestSql } from './db';

let raw: Sql;
let policies: { tablename: string; expr: string }[];

beforeAll(async () => {
  raw = makeTestSql();
  policies = await raw<{ tablename: string; expr: string }[]>`
    select tablename, coalesce(qual, '') || ' ' || coalesce(with_check, '') as expr
    from pg_policies
    where schemaname = 'public'
  `;
});

afterAll(async () => {
  await raw.end();
});

const tablesMatching = (pattern: RegExp) =>
  [...new Set(policies.filter((p) => pattern.test(p.expr)).map((p) => p.tablename))].sort();

describe('what an owner-shared medical_read grant can reach', () => {
  it('medical_read opens exactly the medical profile, vet notes and vaccinations', () => {
    expect(tablesMatching(/app_provider_has_grant\([^)]*'medical_read'/)).toEqual([
      'pet_medical_profiles',
      'pet_vaccinations',
      'vet_notes',
    ]);
  });

  it('no policy accepts a grant without naming a scope', () => {
    expect(tablesMatching(/app_provider_has_grant\((?![^)]*'[a-z_]+')/)).toEqual([]);
  });

  it('the records the sheet lists as not shared have no provider policy at all', () => {
    const notShared = [
      'pet_allergies',
      'pet_conditions',
      'pet_surgeries',
      'pet_medications',
      'pet_lab_results',
      'vet_documents',
      'health_medical_care_logs',
      'health_photo_checks',
      'health_food_logs',
      'health_general_checks',
      'health_weight_logs',
      'health_timeline_events',
    ];
    // Every name must be a real, policied table, or the assertion below would pass for the wrong reason.
    const policied = new Set(policies.map((p) => p.tablename));
    expect(notShared.filter((t) => !policied.has(t))).toEqual([]);
    expect(tablesMatching(/app_provider|app_is_active_staff_of/).filter((t) => notShared.includes(t))).toEqual([]);
    // Nor an "any signed-in user" policy, which a vet would pass like anyone else.
    expect(tablesMatching(/current_app_user_id\(\) IS NOT NULL/i).filter((t) => notShared.includes(t))).toEqual([]);
  });
});
