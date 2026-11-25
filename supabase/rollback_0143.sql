-- Rollback for 0143 (invite codes). Run only if 0143 must be undone. Grants created by redeeming a code are ordinary
-- pet_caregivers rows and STAY (revoke them from Family & caregivers if needed). Codes and their history are deleted.
drop function if exists app_redeem_pet_invite(text);
drop table if exists pet_invite_codes;
