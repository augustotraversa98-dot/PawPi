// RLS — Emergency Card (ticket 2.51), proven on the REAL tables AS pawpi_app.
//
// pet_emergency_cards / pet_emergency_share_links are OWNER-only (ENABLE+FORCE, owner FOR ALL):
// the owner manages their own; everyone else gets ZERO direct access. The PUBLIC read is NOT an
// RLS hole — it flows ONLY through the SECURITY DEFINER functions, which whitelist columns and
// enforce active / scope / expiry / revoke:
//   • app_emergency_card_by_tag(tag) → BASIC fields for an ACTIVE card; medical ONLY when the
//     owner toggled show_medical_on_tag.
//   • app_emergency_card_by_link(token) → the scoped card (full|basic) for a non-revoked,
//     non-expired link; ZERO otherwise.
//   • app_emergency_relay_contact(tag, msg) → best-effort owner notify for relay-mode tags.
//
// Same harness shape as the sibling suites: a second porsager client AS pawpi_app (NOBYPASSRLS),
// app.current_user_id set per tx, allowed-vs-ZERO asserted. The harness owner is superuser, so
// FORCE RLS constrains only pawpi_app; the DEFINER functions run as the (superuser) owner.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { inject } from 'vitest';
import postgres from 'postgres';
import type { Sql } from 'postgres';
import { makeTestSql, resetDb, seedOwnerWithPet, seedMedicalProfile, seedAllergy, seedLostReport } from './db';

const A = { authUserId: 1, profileId: 1, username: 'ownera', petId: 1, petName: 'Rex' };
const B = { authUserId: 2, profileId: 2, username: 'ownerb', petId: 2, petName: 'Bella' };

let raw: Sql;
let app: Sql;

function asApp<T>(userId: number | null, fn: (tx: Sql) => Promise<T>): Promise<T> {
  return app.begin(async (tx) => {
    await tx`select set_config('app.current_user_id', ${userId === null ? '' : String(userId)}, true)`;
    return fn(tx);
  });
}

beforeAll(async () => {
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

// Owner A has a pet with a medical profile (microchip), one allergy, and an emergency card
// (relay contact, medical OFF) + a full vet link. Owner B is an unrelated owner.
beforeEach(async () => {
  await seedOwnerWithPet(raw, A);
  await seedOwnerWithPet(raw, B);
  await seedMedicalProfile(raw, { profileRowId: 1, petId: A.petId, ownerUserId: A.profileId });
  await seedAllergy(raw, { allergyId: 1, petId: A.petId, ownerUserId: A.profileId, allergen: 'Penicillin' });
  await raw`
    insert into pet_emergency_cards
      (id, pet_id, owner_user_id, tag_token, show_medical_on_tag, contact_mode, blood_type, active)
    values (1, ${A.petId}, ${A.profileId}, 'TAG1', false, 'relay', 'DEA 1.1+', true)
  `;
  await raw`
    insert into pet_emergency_share_links (id, pet_id, owner_user_id, token, scope)
    values (1, ${A.petId}, ${A.profileId}, 'LINK1', 'full')
  `;
});

describe('owner-only RLS on the card + link tables', () => {
  it('owner reads/manages own; a non-owner reads ZERO directly', async () => {
    await asApp(A.profileId, async (tx) => {
      expect(await tx`select id from pet_emergency_cards`).toHaveLength(1);
      expect(await tx`select id from pet_emergency_share_links`).toHaveLength(1);
    });
    await asApp(B.profileId, async (tx) => {
      expect(await tx`select id from pet_emergency_cards`).toHaveLength(0);
      expect(await tx`select id from pet_emergency_share_links`).toHaveLength(0);
    });
    await asApp(null, async (tx) => {
      expect(await tx`select id from pet_emergency_cards`).toHaveLength(0);
    });
  });

  it('a non-owner cannot create a link on another pet (WITH CHECK reject)', async () => {
    await expect(
      asApp(B.profileId, (tx) => tx`
        insert into pet_emergency_share_links (pet_id, owner_user_id, token, scope)
        values (${A.petId}, ${A.profileId}, 'forged', 'full')
      `),
    ).rejects.toThrow(/row-level security/i);
  });

  it('a non-owner revokes ZERO of another owner\'s links; the owner can', async () => {
    await asApp(B.profileId, async (tx) => {
      expect(await tx`update pet_emergency_share_links set revoked_at = now() returning id`).toHaveLength(0);
    });
    await asApp(A.profileId, async (tx) => {
      expect(await tx`update pet_emergency_share_links set revoked_at = now() returning id`).toHaveLength(1);
    });
  });
});

describe('app_emergency_card_by_tag — basic by default, medical only when toggled', () => {
  it('returns BASIC fields and NO medical when show_medical_on_tag is false', async () => {
    await asApp(null, async (tx) => {
      const [{ card }] = await tx`select app_emergency_card_by_tag('TAG1') as card`;
      expect(card).not.toBeNull();
      expect(card.pet.name).toBe('Rex');
      expect(card.pet.has_home).toBe(true);
      expect(card.microchip_id).toMatch(/^chip-/);
      expect(card.medical).toBeNull(); // medical hidden on the tag by default
      // relay mode never leaks raw contact.
      expect(card.contact.mode).toBe('relay');
      expect(card.contact.value).toBeNull();
      expect(card.non_diagnostic).toBe(true);
    });
  });

  it('exposes medical (incl. allergies) once the owner enables show_medical_on_tag', async () => {
    await raw`update pet_emergency_cards set show_medical_on_tag = true where id = 1`;
    await asApp(null, async (tx) => {
      const [{ card }] = await tx`select app_emergency_card_by_tag('TAG1') as card`;
      expect(card.medical).not.toBeNull();
      expect(card.medical.blood_type).toBe('DEA 1.1+');
      expect(card.medical.allergies.map((a: any) => a.allergen)).toContain('Penicillin');
    });
  });

  it('returns NULL for an inactive card', async () => {
    await raw`update pet_emergency_cards set active = false where id = 1`;
    await asApp(null, async (tx) => {
      const [{ card }] = await tx`select app_emergency_card_by_tag('TAG1') as card`;
      expect(card).toBeNull();
    });
  });

  it('reflects an active lost_report as a LOST banner', async () => {
    await seedLostReport(raw, { id: 1, petId: A.petId, ownerUserId: A.profileId, status: 'active' });
    await asApp(null, async (tx) => {
      const [{ card }] = await tx`select app_emergency_card_by_tag('TAG1') as card`;
      expect(card.lost).not.toBeNull();
      expect(card.lost.active).toBe(true);
    });
  });
});

describe('app_emergency_card_by_link — full for valid, zero for revoked/expired', () => {
  it('returns the FULL card (medical present) for a valid full-scope link', async () => {
    await asApp(null, async (tx) => {
      const [{ card }] = await tx`select app_emergency_card_by_link('LINK1') as card`;
      expect(card).not.toBeNull();
      expect(card.medical).not.toBeNull();
      expect(card.medical.allergies.map((a: any) => a.allergen)).toContain('Penicillin');
    });
  });

  it('a BASIC-scope link returns no medical', async () => {
    await raw`insert into pet_emergency_share_links (id, pet_id, owner_user_id, token, scope)
              values (2, ${A.petId}, ${A.profileId}, 'LINK_BASIC', 'basic')`;
    await asApp(null, async (tx) => {
      const [{ card }] = await tx`select app_emergency_card_by_link('LINK_BASIC') as card`;
      expect(card).not.toBeNull();
      expect(card.medical).toBeNull();
    });
  });

  it('returns NULL for a revoked link', async () => {
    await raw`update pet_emergency_share_links set revoked_at = now() where id = 1`;
    await asApp(null, async (tx) => {
      const [{ card }] = await tx`select app_emergency_card_by_link('LINK1') as card`;
      expect(card).toBeNull();
    });
  });

  it('returns NULL for an expired link', async () => {
    await raw`update pet_emergency_share_links set expires_at = now() - interval '1 hour' where id = 1`;
    await asApp(null, async (tx) => {
      const [{ card }] = await tx`select app_emergency_card_by_link('LINK1') as card`;
      expect(card).toBeNull();
    });
  });
});

describe('app_emergency_relay_contact — best-effort owner notify for relay tags', () => {
  it('notifies the owner for a relay-mode tag and returns true', async () => {
    await asApp(null, async (tx) => {
      const [{ ok }] = await tx`select app_emergency_relay_contact('TAG1', 'I found your dog!') as ok`;
      expect(ok).toBe(true);
    });
    const notes = await raw`select recipient_user_id, type from notifications where type = 'emergency_contact'`;
    expect(notes).toHaveLength(1);
    expect(notes[0].recipient_user_id).toBe(A.profileId);
  });

  it('returns false when the card is not relay-mode (no notify)', async () => {
    await raw`update pet_emergency_cards set contact_mode = 'phone', contact_value = '+1' where id = 1`;
    await asApp(null, async (tx) => {
      const [{ ok }] = await tx`select app_emergency_relay_contact('TAG1', 'hi') as ok`;
      expect(ok).toBe(false);
    });
    expect(await raw`select id from notifications where type = 'emergency_contact'`).toHaveLength(0);
  });
});
