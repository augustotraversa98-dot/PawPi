// Sharing the vet record by section (migration 0147), proven on the real tables acting AS pawpi_app.
//   • a grant by section is not recognised by any rule that predates sections;
//   • each section opens its own data and nothing else; expiry and revocation apply on the next read;
//   • grants by scope behave as before; only the pet's owner creates or changes a grant by section;
//   • supabase/verify_0147.sql reads PASS on every row, can fail, and the migration can be applied twice.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';
import postgres from 'postgres';
import type { Sql } from 'postgres';
import {
  MIGRATIONS_DIR,
  makeTestSql,
  resetDb,
  seedCapability,
  seedOwnerWithPet,
  seedProviderWithStaff,
  seedStaff,
  seedUser,
} from './db';

const A = { authUserId: 1, profileId: 1, username: 'ownera', petId: 1, petName: 'Rex' };
const B = { authUserId: 2, profileId: 2, username: 'ownerb', petId: 2, petName: 'Bella' };
const STAFF = { authUserId: 3, profileId: 3, username: 'vetstaff' };
const STAFF2 = { authUserId: 4, profileId: 4, username: 'vetstaff2' };
const FAMILY = { authUserId: 5, profileId: 5, username: 'family' };
const FORMER = { authUserId: 6, profileId: 6, username: 'formerstaff' };
const P1 = 1;
const P2 = 2;

const SECTIONS = [
  'profile', 'emergency_contact', 'insurance', 'vet_notes', 'vaccines', 'files', 'photos', 'lab_results',
] as const;
type Section = (typeof SECTIONS)[number];

const SECTION_TABLE: Partial<Record<Section, string>> = {
  vet_notes: 'vet_notes',
  vaccines: 'pet_vaccinations',
  files: 'vet_documents',
  photos: 'health_photo_checks',
  lab_results: 'pet_lab_results',
};

const PROFILE_COLUMNS: Record<'profile' | 'emergency_contact' | 'insurance', string[]> = {
  profile: [
    'microchip_id', 'spayed_neutered_status', 'spayed_neutered_date', 'primary_vet_name', 'primary_clinic_name',
    'vet_phone', 'vet_email', 'medical_notes',
  ],
  emergency_contact: ['emergency_contact_name', 'emergency_contact_phone'],
  insurance: ['insurance_provider', 'insurance_policy_number'],
};

const SCOPES = [
  'medical_read', 'medical_write', 'vaccinations_write', 'appointments', 'health_logs_read', 'health_logs_write',
  'messaging', 'record_sections',
];

const VERIFY_ROWS = 24;
const readMigration = (name: string) => readFileSync(join(MIGRATIONS_DIR, name), 'utf8');
const migration0147 = readMigration('0147_vet_sharing_sections.sql');
const verify0147 = readFileSync(join(MIGRATIONS_DIR, '..', 'verify_0147.sql'), 'utf8');

let raw: Sql;
let app: Sql;

function asApp<T>(userId: number | null, fn: (tx: Sql) => Promise<T>): Promise<T> {
  return app.begin(async (tx) => {
    await tx`select set_config('app.current_user_id', ${userId === null ? '' : String(userId)}, true)`;
    return fn(tx as unknown as Sql);
  }) as Promise<T>;
}

/** The owner shares sections, through the real insert policy. */
async function share(sections: readonly string[], expiresAt: Date | null = null): Promise<number> {
  const [row] = await asApp(A.profileId, (tx) => tx<{ id: number }[]>`
    insert into care_access_grants
      (pet_id, owner_user_id, provider_id, scopes, sections, status, requested_by, granted_at, expires_at)
    values (${A.petId}, ${A.profileId}, ${P1}, ${['record_sections']}, ${sections as string[]}, 'active', 'owner', now(), ${expiresAt})
    returning id
  `);
  return row.id;
}

async function shareByScope(scopes: string[]): Promise<void> {
  await asApp(A.profileId, (tx) => tx`
    insert into care_access_grants (pet_id, owner_user_id, provider_id, scopes, status, requested_by, granted_at)
    values (${A.petId}, ${A.profileId}, ${P1}, ${scopes}, 'active', 'owner', now())
  `);
}

async function requestAccess(): Promise<number> {
  const [row] = await asApp(STAFF.profileId, (tx) => tx<{ id: number }[]>`
    insert into care_access_grants (pet_id, owner_user_id, provider_id, scopes, status, requested_by)
    values (${A.petId}, ${A.profileId}, ${P1}, ${['medical_read', 'medical_write']}, 'pending', 'provider')
    returning id
  `);
  return row.id;
}

/** Row counts of every public table, as the given user. */
async function visibleCounts(userId: number): Promise<Record<string, number>> {
  const tables = await raw<{ tablename: string }[]>`
    select tablename from pg_tables where schemaname = 'public' order by tablename`;
  return asApp(userId, async (tx) => {
    const out: Record<string, number> = {};
    for (const { tablename } of tables) {
      const [{ n }] = await tx.unsafe<{ n: number }[]>(`select count(*)::int as n from "${tablename}"`);
      out[tablename] = n;
    }
    return out;
  });
}

const sharedCounts = (userId = STAFF.profileId, petId = A.petId) =>
  asApp(userId, async (tx) => {
    const out: Record<string, number> = {};
    for (const table of [...Object.values(SECTION_TABLE), 'pet_medical_profiles']) {
      const [{ n }] = await tx.unsafe<{ n: number }[]>(`select count(*)::int as n from ${table} where pet_id = ${petId}`);
      out[table] = n;
    }
    return out;
  });

const NOTHING = {
  vet_notes: 0, pet_vaccinations: 0, vet_documents: 0, health_photo_checks: 0, pet_lab_results: 0, pet_medical_profiles: 0,
};

const profileRows = (userId: number | null = STAFF.profileId, providerId = P1, petId = A.petId) =>
  asApp(userId, (tx) => tx`select * from app_shared_medical_profile(${petId}, ${providerId})`);

const hasSection = async (section: string, userId = STAFF.profileId, petId = A.petId) => {
  const [row] = await asApp(userId, (tx) => tx`select app_provider_has_section(${petId}, ${section}) as ok`);
  return row.ok as boolean;
};

beforeAll(() => {
  raw = makeTestSql();
  const url = new URL(inject('TEST_DATABASE_URL'));
  app = postgres({
    host: url.hostname,
    port: Number(url.port),
    database: url.pathname.replace(/^\//, ''),
    username: 'pawpi_app',
    password: 'pawpi_app',
    max: 1,
    onnotice: () => {},
  });
});

afterAll(async () => {
  await app.end();
  await raw.end();
});

afterEach(async () => {
  await resetDb(raw);
});

beforeEach(async () => {
  await seedOwnerWithPet(raw, A);
  await seedOwnerWithPet(raw, B);
  for (const user of [STAFF, STAFF2, FAMILY, FORMER]) await seedUser(raw, user);
  await seedProviderWithStaff(raw, {
    providerId: P1, ownerUserProfileId: STAFF.profileId, staffUserProfileId: STAFF.profileId,
    staffRole: 'owner', slug: 'vet-clinic-1', providerStatus: 'published',
  });
  await seedProviderWithStaff(raw, {
    providerId: P2, ownerUserProfileId: STAFF2.profileId, staffUserProfileId: STAFF2.profileId,
    staffRole: 'owner', slug: 'vet-clinic-2', providerStatus: 'published',
  });
  await seedStaff(raw, { providerId: P1, userProfileId: FORMER.profileId, status: 'removed' });
  await seedCapability(raw, { providerId: P1, capability: 'vet' });
  await raw`
    insert into pet_caregivers (pet_id, owner_user_id, grantee_user_id, role, status)
    values (${A.petId}, ${A.profileId}, ${FAMILY.profileId}, 'family', 'active')`;

  for (const [petId, ownerId] of [[A.petId, A.profileId], [B.petId, B.profileId]]) {
    await raw`
      insert into pet_medical_profiles
        (pet_id, owner_user_id, microchip_id, spayed_neutered_status, spayed_neutered_date, primary_vet_name,
         primary_clinic_name, vet_phone, vet_email, medical_notes, emergency_contact_name, emergency_contact_phone,
         insurance_provider, insurance_policy_number)
      values (${petId}, ${ownerId}, 'chip', 'yes', '2024-05-01', 'Vet', 'Clinic', '111', 'vet@example.com', 'notes',
              'Contact', '222', 'Insurer', 'POL-1')`;
    await raw`insert into vet_documents (pet_id, owner_user_id, name, document_type, file_url)
              values (${petId}, ${ownerId}, 'doc', 'pdf', ${`pets/${petId}/doc.pdf`})`;
    await raw`insert into health_photo_checks (pet_id, owner_user_id, body_area, image_url)
              values (${petId}, ${ownerId}, 'ears', ${`pets/${petId}/ear.jpg`})`;
    await raw`insert into pet_lab_results (pet_id, owner_user_id, test_name, test_date)
              values (${petId}, ${ownerId}, 'blood', '2026-01-01')`;
    await raw`insert into pet_vaccinations (pet_id, owner_user_id, name) values (${petId}, ${ownerId}, 'rabies')`;
    await raw`insert into pet_vaccinations (pet_id, owner_user_id, name, deleted_at)
              values (${petId}, ${ownerId}, 'removed', now())`;
    await raw`insert into pet_allergies (pet_id, owner_user_id, allergen) values (${petId}, ${ownerId}, 'pollen')`;
    await raw`insert into pet_conditions (pet_id, owner_user_id, condition) values (${petId}, ${ownerId}, 'itch')`;
    await raw`insert into pet_surgeries (pet_id, owner_user_id, procedure, surgery_date)
              values (${petId}, ${ownerId}, 'dental', '2025-01-01')`;
    await raw`insert into health_poo_logs (pet_id, owner_user_id) values (${petId}, ${ownerId})`;
    await raw`insert into health_pee_logs (pet_id, owner_user_id) values (${petId}, ${ownerId})`;
  }
});

const addVetNotes = async () => {
  for (const [petId, ownerId] of [[A.petId, A.profileId], [B.petId, B.profileId]]) {
    await raw`insert into vet_notes (pet_id, owner_user_id, note_date, note) values (${petId}, ${ownerId}, '2026-01-01', 'note')`;
  }
};

describe('a grant by section is not recognised by rules that predate sections', () => {
  it('answers no to every older grant helper, with every section shared', async () => {
    await share(SECTIONS);
    await asApp(STAFF.profileId, async (tx) => {
      const [anyGrant] = await tx`select app_provider_has_grant(${A.petId}) as ok`;
      expect(anyGrant.ok).toBe(false);
      for (const scope of SCOPES) {
        const [row] = await tx`select app_provider_has_grant(${A.petId}, ${scope}) as ok`;
        expect([scope, row.ok]).toEqual([scope, false]);
      }
      const [vet] = await tx`select app_pet_has_vet_relationship(${A.petId}) as ok`;
      expect(vet.ok).toBe(false);
      const [rx] = await tx`select app_provider_can_rx(${P1}, ${A.petId}) as ok`;
      expect(rx.ok).toBe(false);
    });
  });

  it('changes what staff can see only in the five shared tables and the grant itself, across the whole schema', async () => {
    await addVetNotes();
    const before = await visibleCounts(STAFF.profileId);
    await share(SECTIONS);
    const after = await visibleCounts(STAFF.profileId);
    const changed = Object.keys(after).filter((t) => after[t] !== before[t]).sort();
    expect(changed).toEqual(['care_access_grants', ...Object.values(SECTION_TABLE)].sort());
  });

  it('gives provider staff no write of any kind', async () => {
    await addVetNotes();
    await share(SECTIONS);
    const inserts = [
      `insert into vet_notes (pet_id, owner_user_id, note_date, note) values (1, 1, '2026-02-01', 'x')`,
      `insert into pet_vaccinations (pet_id, owner_user_id, name) values (1, 1, 'x')`,
      `insert into vet_documents (pet_id, owner_user_id, name, document_type, file_url) values (1, 1, 'x', 'pdf', 'x')`,
      `insert into health_photo_checks (pet_id, owner_user_id, body_area, image_url) values (1, 1, 'ears', 'x')`,
      `insert into pet_lab_results (pet_id, owner_user_id, test_name, test_date) values (1, 1, 'x', '2026-02-01')`,
    ];
    for (const statement of inserts) {
      await expect(asApp(STAFF.profileId, (tx) => tx.unsafe(statement))).rejects.toThrow(/row-level security/i);
    }
    await asApp(STAFF.profileId, async (tx) => {
      for (const table of [...Object.values(SECTION_TABLE), 'pet_medical_profiles']) {
        const updated = await tx.unsafe(`update ${table} set updated_at = now() where pet_id = 1 returning id`);
        const deleted = await tx.unsafe(`delete from ${table} where pet_id = 1 returning id`);
        expect([table, updated.length, deleted.length]).toEqual([table, 0, 0]);
      }
    });
  });
});

describe('each section opens its own data and nothing else', () => {
  beforeEach(addVetNotes);

  it.each(SECTIONS)('%s', async (section) => {
    await share([section]);
    const table = SECTION_TABLE[section];
    expect(await sharedCounts()).toEqual(table ? { ...NOTHING, [table]: 1 } : NOTHING);
    expect(await sharedCounts(STAFF.profileId, B.petId)).toEqual(NOTHING);

    const rows = await profileRows();
    if (!(section in PROFILE_COLUMNS)) {
      expect(rows).toHaveLength(0);
      return;
    }
    expect(rows).toHaveLength(1);
    const filled = Object.entries(rows[0]).filter(([, v]) => v !== null).map(([k]) => k).sort();
    expect(filled).toEqual(['id', 'pet_id', ...PROFILE_COLUMNS[section as keyof typeof PROFILE_COLUMNS]].sort());
  });

  it('returns every profile column when the three profile sections are shared, and skips a deleted profile', async () => {
    await share(['profile', 'emergency_contact', 'insurance']);
    const [row] = await profileRows();
    expect(Object.values(row).every((v) => v !== null)).toBe(true);
    expect(Object.keys(row)).toHaveLength(14);
    await raw`update pet_medical_profiles set deleted_at = now() where pet_id = ${A.petId}`;
    expect(await profileRows()).toHaveLength(0);
  });

  it('opens nothing for another provider, former staff, family acting as a provider, or no identity', async () => {
    await share(SECTIONS);
    expect(await sharedCounts(STAFF2.profileId)).toEqual(NOTHING);
    expect(await sharedCounts(FORMER.profileId)).toEqual(NOTHING);
    expect(await profileRows(STAFF2.profileId, P1)).toHaveLength(0);
    expect(await profileRows(STAFF2.profileId, P2)).toHaveLength(0);
    expect(await profileRows(STAFF.profileId, P2)).toHaveLength(0);
    expect(await profileRows(FORMER.profileId)).toHaveLength(0);
    expect(await profileRows(FAMILY.profileId)).toHaveLength(0);
    expect(await profileRows(A.profileId)).toHaveLength(0);
    expect(await profileRows(null)).toHaveLength(0);
    expect(await profileRows(STAFF.profileId, P1, B.petId)).toHaveLength(0);
  });

  it('answers per provider when one person works for two', async () => {
    await seedStaff(raw, { providerId: P2, userProfileId: STAFF.profileId });
    await share(['insurance']);
    expect(await profileRows(STAFF.profileId, P1)).toHaveLength(1);
    expect(await profileRows(STAFF.profileId, P2)).toHaveLength(0);
  });

  it('ignores a grant that was not given by the pet’s current owner', async () => {
    await raw`
      insert into care_access_grants (pet_id, owner_user_id, provider_id, scopes, sections, status, requested_by)
      values (${A.petId}, ${B.profileId}, ${P1}, ${['record_sections']}, ${[...SECTIONS]}, 'active', 'owner')`;
    expect(await sharedCounts()).toEqual(NOTHING);
    expect(await profileRows()).toHaveLength(0);
  });
});

describe('expiry and revocation apply on the next read', () => {
  beforeEach(addVetNotes);

  const expectClosed = async () => {
    expect(await sharedCounts()).toEqual(NOTHING);
    expect(await profileRows()).toHaveLength(0);
    for (const section of SECTIONS) expect(await hasSection(section)).toBe(false);
  };

  it('is open before the date and closed after it', async () => {
    const id = await share(SECTIONS, new Date(Date.now() + 3_600_000));
    expect(await hasSection('files')).toBe(true);
    expect(await profileRows()).toHaveLength(1);
    await raw`update care_access_grants set expires_at = now() - interval '1 second' where id = ${id}`;
    await expectClosed();
  });

  it('closes when the owner revokes', async () => {
    const id = await share(SECTIONS);
    const revoked = await asApp(A.profileId, (tx) => tx`
      update care_access_grants set status = 'revoked', revoked_at = now() where id = ${id} returning id`);
    expect(revoked).toHaveLength(1);
    await expectClosed();
  });

  it('replaces an open grant in one transaction: the old sections close, the new ones open', async () => {
    const id = await share(['files']);
    await asApp(A.profileId, async (tx) => {
      await tx`update care_access_grants set status = 'revoked', revoked_at = now() where id = ${id}`;
      await tx`
        insert into care_access_grants (pet_id, owner_user_id, provider_id, scopes, sections, status, requested_by, granted_at)
        values (${A.petId}, ${A.profileId}, ${P1}, ${['record_sections']}, ${['photos']}, 'active', 'owner', now())`;
    });
    expect(await sharedCounts()).toEqual({ ...NOTHING, health_photo_checks: 1 });
  });
});

describe('grants by scope behave as before', () => {
  beforeEach(addVetNotes);

  it('medical_read opens the profile, vet notes and vaccinations, and none of the other shared tables', async () => {
    await shareByScope(['medical_read']);
    expect(await sharedCounts()).toEqual({ ...NOTHING, pet_medical_profiles: 1, vet_notes: 1, pet_vaccinations: 2 });
    expect(await profileRows()).toHaveLength(0);
    for (const section of SECTIONS) expect(await hasSection(section)).toBe(false);
    await asApp(STAFF.profileId, async (tx) => {
      const [grant] = await tx`select app_provider_has_grant(${A.petId}) as ok`;
      const [read] = await tx`select app_provider_has_grant(${A.petId}, 'medical_read') as ok`;
      expect([grant.ok, read.ok]).toEqual([true, true]);
    });
  });

  it('still counts as a vet relationship, while a grant by section does not', async () => {
    await raw`delete from vet_notes`;
    const related = async () => {
      const [row] = await asApp(A.profileId, (tx) => tx`select app_pet_has_vet_relationship(${A.petId}) as ok`);
      return row.ok;
    };
    const id = await share(['vaccines']);
    expect(await related()).toBe(false);
    await raw`delete from care_access_grants where id = ${id}`;
    await shareByScope(['medical_read']);
    expect(await related()).toBe(true);
  });

  it('lets the owner approve a request with the old update', async () => {
    const id = await requestAccess();
    const rows = await asApp(A.profileId, (tx) => tx`
      update care_access_grants set status = 'active', granted_at = now(), expires_at = null
      where id = ${id} returning status, scopes, sections`);
    expect(rows[0]).toMatchObject({ status: 'active', scopes: ['medical_read', 'medical_write'], sections: null });
  });
});

describe('only the owner creates or changes a grant by section', () => {
  beforeEach(addVetNotes);

  const insertAs = (userId: number, row: Record<string, unknown>) => {
    const full = {
      pet_id: A.petId, owner_user_id: A.profileId, provider_id: P1, scopes: ['record_sections'], sections: ['files'],
      status: 'active', requested_by: 'owner', ...row,
    };
    return asApp(userId, (tx) => tx`insert into care_access_grants ${tx(full as any)}`);
  };

  it('refuses provider staff and family members', async () => {
    const attempts: [number, Record<string, unknown>][] = [
      [STAFF.profileId, {}],
      [STAFF.profileId, { requested_by: 'provider' }],
      [STAFF.profileId, { requested_by: 'provider', status: 'pending' }],
      [STAFF.profileId, { owner_user_id: STAFF.profileId }],
      [STAFF.profileId, { requested_by: 'provider', sections: null, scopes: ['medical_read'] }],
      [FAMILY.profileId, {}],
      [FAMILY.profileId, { owner_user_id: FAMILY.profileId }],
    ];
    for (const [userId, row] of attempts) {
      await expect(insertAs(userId, row)).rejects.toThrow(/row-level security|care_access_grants_sections_check/i);
    }
    await expect(
      insertAs(STAFF.profileId, { requested_by: 'provider', status: 'pending', sections: null }),
    ).rejects.toThrow(/care_access_grants_sections_check|row-level security/i);
  });

  it('does not let staff change a grant, whatever its state', async () => {
    const pending = await requestAccess();
    const staffUpdate = (id: number) => asApp(STAFF.profileId, (tx) => tx`
      update care_access_grants
      set scopes = ${['record_sections']}, sections = ${[...SECTIONS]}, status = 'active'
      where id = ${id} returning id`);
    expect(await staffUpdate(pending)).toHaveLength(0);
    await raw`delete from care_access_grants`;
    const shared = await share(['files']);
    expect(await staffUpdate(shared)).toHaveLength(0);
    expect(await sharedCounts()).toEqual({ ...NOTHING, vet_documents: 1 });
  });

  it('lets a grant become active only through the pet’s current owner', async () => {
    const [{ id }] = await raw<{ id: number }[]>`
      insert into care_access_grants (pet_id, owner_user_id, provider_id, scopes, status, requested_by)
      values (${A.petId}, ${B.profileId}, ${P1}, ${['medical_read']}, 'pending', 'provider')
      returning id`;
    for (const sections of [null, [...SECTIONS]]) {
      await expect(
        asApp(B.profileId, (tx) => tx`
          update care_access_grants
          set status = 'active', sections = ${sections}, scopes = ${sections ? ['record_sections'] : ['medical_read']}
          where id = ${id}`),
      ).rejects.toThrow(/row-level security/i);
    }
    expect(await sharedCounts()).toEqual(NOTHING);
  });

  it('does not let the owner move an open grant to a pet they do not own', async () => {
    const id = await share(['files']);
    await expect(
      asApp(A.profileId, (tx) => tx`update care_access_grants set pet_id = ${B.petId} where id = ${id}`),
    ).rejects.toThrow(/row-level security/i);
  });

  it.each([
    ['a second scope', { scopes: ['record_sections', 'medical_read'] }],
    ['another scope', { scopes: ['medical_read'] }],
    ['no sections', { sections: null }],
    ['an empty list', { sections: [] }],
    ['an unknown section', { sections: ['files', 'allergies'] }],
    ['a null entry', { sections: ['files', null] }],
    ['a pending state', { status: 'pending' }],
  ])('rejects a grant by section with %s', async (_label, row) => {
    await expect(insertAs(A.profileId, row)).rejects.toThrow(/care_access_grants_sections_check/);
  });

  it('lets the owner turn a pending request into exactly the chosen sections', async () => {
    const id = await requestAccess();
    const rows = await asApp(A.profileId, (tx) => tx`
      update care_access_grants
      set scopes = ${['record_sections']}, sections = ${['vaccines']}, status = 'active', granted_at = now(),
          expires_at = now() + interval '7 days', updated_at = now()
      where id = ${id} returning requested_by, scopes, sections`);
    expect(rows[0]).toMatchObject({ requested_by: 'provider', scopes: ['record_sections'], sections: ['vaccines'] });
    expect(await sharedCounts()).toEqual({ ...NOTHING, pet_vaccinations: 1 });
  });
});

describe('app_expire_care_grants', () => {
  const expire = async (userId: number | null) => {
    const [row] = await asApp(userId, (tx) => tx`select app_expire_care_grants(${A.petId}, ${P1}) as n`);
    return row.n as number;
  };
  const statuses = async () =>
    (await raw<{ status: string }[]>`select status from care_access_grants order by id`).map((r) => r.status);

  it('leaves open grants alone', async () => {
    await share(['files'], new Date(Date.now() + 3_600_000));
    expect(await expire(A.profileId)).toBe(0);
    await raw`update care_access_grants set expires_at = null`;
    expect(await expire(STAFF.profileId)).toBe(0);
    expect(await statuses()).toEqual(['active']);
  });

  it('closes a past-date grant for the owner or the provider’s staff only, so a new request fits', async () => {
    await share(['files'], new Date(Date.now() - 1000));
    for (const userId of [STAFF2.profileId, FAMILY.profileId, FORMER.profileId, null]) {
      expect(await expire(userId)).toBe(0);
    }
    await expect(requestAccess()).rejects.toThrow(/uq_care_access_grants_active_provider_pet/);
    expect(await expire(STAFF.profileId)).toBe(1);
    expect(await statuses()).toEqual(['expired']);
    await requestAccess();
    expect(await statuses()).toEqual(['expired', 'pending']);
  });

  it('works for the owner before sharing again', async () => {
    await share(['files'], new Date(Date.now() - 1000));
    expect(await expire(A.profileId)).toBe(1);
    await share(['photos']);
    expect(await statuses()).toEqual(['expired', 'active']);
  });
});

describe('notifying the provider team', () => {
  it('lets the owner write the two new types to active staff, and still rejects unknown ones', async () => {
    const send = (type: string) => asApp(A.profileId, (tx) => tx`
      select app_notify(id, ${A.profileId}, ${type}, ${String(A.petId)}, 'text') as id
      from app_provider_active_staff_ids(${[P1]}) as id`);
    for (const type of ['care_access_granted', 'care_access_revoked']) {
      expect(await send(type)).toHaveLength(1);
    }
    await expect(send('care_access_other')).rejects.toThrow(/notifications_type_check/);
    const rows = await raw`select recipient_user_id from notifications`;
    expect(rows.map((r) => r.recipient_user_id)).toEqual([STAFF.profileId, STAFF.profileId]);
  });
});

describe('verify_0147.sql', () => {
  type Row = { ord: number; check_name: string; detail: string; status: string };
  const failing = async (sql: Sql) =>
    (await sql.unsafe<Row[]>(verify0147))
      .filter((r) => r.status !== 'PASS')
      .map((r) => `${r.ord} ${r.check_name} -> ${r.detail}`);

  it('every row reads PASS, also after applying 0147 a second time', async () => {
    await raw.unsafe(migration0147);
    expect((await raw.unsafe(verify0147)).length).toBe(VERIFY_ROWS);
    expect(await failing(raw)).toEqual([]);
  });

  const brokenBy = async (statements: string[]) => {
    const ROLLBACK = new Error('rollback');
    let names: string[] = [];
    await raw
      .begin(async (tx) => {
        for (const statement of statements) await tx.unsafe(statement);
        names = await failing(tx as unknown as Sql);
        throw ROLLBACK;
      })
      .catch((e) => {
        if (e !== ROLLBACK) throw e;
      });
    return names.map((n) => Number(n.split(' ')[0]));
  };

  const definition = async (signature: string) => {
    const [{ def }] = await raw<{ def: string }[]>`select pg_get_functiondef(${signature}::regprocedure) as def`;
    return def;
  };

  const rewritten = async (signature: string, from: string, to: string) => {
    const def = await definition(signature);
    const next = def.replace(from, to);
    expect(next).not.toBe(def);
    return next;
  };

  it('can fail: the older grant policies and constraint', async () => {
    expect(await brokenBy([readMigration('0123_care_access_owner_insert.sql')])).toEqual([3]);
    expect(await brokenBy([
      'drop policy care_access_grants_update on care_access_grants',
      'create policy care_access_grants_update on care_access_grants for update using (owner_user_id = current_app_user_id())',
    ])).toEqual([4]);
    expect(await brokenBy(['create policy x on care_access_grants for delete using (true)'])).toEqual([5]);
    expect(await brokenBy(['alter table care_access_grants drop constraint care_access_grants_sections_check'])).toEqual([2]);
  });

  it('can fail: helpers that count grants by section, drop a check, or are open to PUBLIC', async () => {
    expect(await brokenBy([
      await rewritten('app_provider_has_grant(integer, text)', 'and g.sections is null', ''),
    ])).toEqual([6]);
    expect(await brokenBy([
      await rewritten('app_pet_has_vet_relationship(integer)', 'and g.sections is null', ''),
    ])).toEqual([7]);
    expect(await brokenBy([
      await rewritten('app_provider_has_section(integer, text)', 'and (g.expires_at is null or g.expires_at > now())', ''),
    ])).toEqual([8]);
    expect(await brokenBy([
      await rewritten('app_shared_medical_profile(integer, integer)', 'and app_is_active_staff_of(p_provider_id)', ''),
    ])).toEqual([9]);
    expect(await brokenBy([
      await rewritten(
        'app_shared_medical_profile(integer, integer)',
        "case when 'insurance' = any (g.sections) then mp.insurance_provider end",
        'mp.insurance_provider',
      ),
    ])).toEqual([10]);
    expect(await brokenBy([
      await rewritten('app_expire_care_grants(integer, integer)', 'and g.expires_at <= now()', ''),
    ])).toEqual([20]);
    expect(await brokenBy(['grant execute on function app_expire_care_grants(integer, integer) to public'])).toEqual([20]);
  });

  it('can fail: a missing, wrong or extra section policy, a new reader, and the older type list', async () => {
    expect(await brokenBy(['drop policy vet_documents_provider_section_read on vet_documents'])).toEqual([13, 16]);
    expect(await brokenBy([
      `alter policy health_photo_checks_provider_section_read on health_photo_checks
         using (app_provider_has_section(pet_id, 'files'))`,
    ])).toEqual([14]);
    expect(await brokenBy([
      `create policy x on pet_medical_profiles for select using (app_provider_has_section(pet_id, 'profile'))`,
    ])).toEqual([16]);
    expect(await brokenBy([
      'create policy x on pet_allergies for select using (app_provider_has_grant(pet_id))',
    ])).toEqual([17]);
    expect(await brokenBy([
      `create function app_x() returns bigint language sql set search_path = public, pg_temp
         as 'select count(*) from care_access_grants'`,
    ])).toEqual([18]);
    expect(await brokenBy([
      'alter table notifications drop constraint notifications_type_check',
      "alter table notifications add constraint notifications_type_check check (type = any (array['paw']::text[]))",
    ])).toEqual([24]);
  });
});
