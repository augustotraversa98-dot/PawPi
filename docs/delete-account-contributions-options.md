# Delete account: what happens to what you added to someone else's dog (2026-11-25)

**Status: wording and behaviour options for Augusto to review. Nothing here is built and no copy was changed.**
Behaviour below was read from the code on `main` (`api/account/route.js`, migration `0142`). Not legal advice.

## Read first: today's wording is not accurate for a member

Since `0142`, a **member** (someone a dog is shared with) who deletes their account does **not** erase everything:
their posts on that dog and their vet-record entries are **kept and re-labelled "Former member"**. But:

- the in-app confirmation says *"This permanently deletes your account and all your pets, health records, posts and
  other data."* (`en.json` / `es.json` → `deleteAccountBody`);
- the Privacy Policy §9 and §11, Terms §10 and the support page talk only about "the data you own".

Whichever option you pick, the confirmation and the privacy sentence should change **before build 33 goes to App
Review** (Apple 5.1.1(v) looks at account deletion).

## What happens today, exactly

| The person deleting is a **member** | Today (default) | With the hidden `delete_contributions=1` (no button in the app) |
|---|---|---|
| Account, profile, sign-in | deleted | deleted |
| Posts / daily moments on **someone else's** dog | **kept**, author "Former member" | **deleted** |
| Vet-record entries they added to that dog | kept, "Added by Former member" | same (kept, anonymised) |
| Health logs they wrote (meals, walks, weight …) | kept. They are stored under the **owner's** id and, today, carry no author | same |
| Reactions (paws, comments), notifications, push tokens | deleted | deleted |
| Their access to the dog | ends; grant history kept, anonymised; owner is notified | same |
| Their own dogs and everything on them | deleted | deleted |

If the person is an **owner**: the dog and **everything on it** is deleted, including what other members posted or logged.
Members are notified first.

Two facts that limit the options:

1. **Which logs a member wrote cannot be known today.** Migration `0144` (draft PR) starts recording it, only for
   entries written **after** it is applied.
2. **Photo files.** Deleting a post removes the database row. I did not verify that the image file in storage is
   removed too, so do not promise "photos are erased" without checking (see the open storage clean-up work).

## Option A — Always keep, anonymised (no choice)

**Behaviour:** exactly today's default. Nothing new to build except the copy.

**Privacy sentence (replace the account paragraph in §9 and §11)**

- EN: *When you delete your account we delete your account and the data you own. What you added to a dog that someone
  else shared with you (such as posts, health logs and vet-record entries) stays in that dog's history, no longer
  linked to you and shown as "Former member". To remove a particular post, delete it before you delete your account.*
- ES: *Cuando eliminás tu cuenta, borramos tu cuenta y los datos que te pertenecen. Lo que agregaste a un perro que
  otra persona compartió con vos (como publicaciones, registros de salud y entradas de la historia clínica) queda en
  el historial de ese perro, sin vínculo con vos y como "Ex integrante". Si querés quitar una publicación, borrala
  antes de eliminar tu cuenta.*

**Screen copy**

| | EN | ES (voseo) |
|---|---|---|
| Title | Delete account? | ¿Eliminar cuenta? |
| Body | This permanently deletes your account, your dogs and their records. What you added to dogs shared with you stays there as "Former member". This cannot be undone. | Esto elimina para siempre tu cuenta, tus perros y sus registros. Lo que agregaste a perros compartidos con vos queda ahí como "Ex integrante". No se puede deshacer. |
| Button | Delete account | Eliminar cuenta |

For and against: smallest change; the household's care history stays intact. Weakest for someone who wants their
photos gone (they must delete them first; note that **after** access has ended they cannot reach them).

## Option B — Choice: also delete my posts (recommended)

**Behaviour:** a switch, **off** by default, shown only to someone who is or was a member.
On = today's `delete_contributions=1`: their posts and daily moments on others' dogs are deleted. Health logs and
vet-record entries **stay** (they are the dog's medical history and belong to its owner), shown as "Former member".
Cost: app only (the server already supports it). No migration.

**Privacy sentence**

- EN: *When you delete your account we delete your account and the data you own. For dogs that others shared with you,
  you can choose to delete the posts you published about them. Health logs and vet-record entries you added are part
  of that dog's care history: they stay with its owner, no longer linked to you and shown as "Former member".*
- ES: *Cuando eliminás tu cuenta, borramos tu cuenta y los datos que te pertenecen. En los perros que otras personas
  compartieron con vos, podés elegir borrar las publicaciones que hiciste sobre ellos. Los registros de salud y las
  entradas de la historia clínica que agregaste son parte del historial de cuidado de ese perro: quedan con quien lo
  tiene a cargo, sin vínculo con vos y como "Ex integrante".*

**Screen copy**

| | EN | ES (voseo) |
|---|---|---|
| Title | Delete account? | ¿Eliminar cuenta? |
| Body | This permanently deletes your account, your dogs and their records. This cannot be undone. | Esto elimina para siempre tu cuenta, tus perros y sus registros. No se puede deshacer. |
| Switch label | Also delete my posts about dogs shared with me | Borrar también mis publicaciones sobre perros compartidos conmigo |
| Switch hint (off) | They stay, shown as "Former member". Care logs and vet notes always stay with the dog. | Quedan como "Ex integrante". Los registros de cuidado y las notas veterinarias siempre quedan con el perro. |
| Switch hint (on) | Your posts will be deleted. Care logs and vet notes stay with the dog. | Tus publicaciones se borran. Los registros de cuidado y las notas veterinarias quedan con el perro. |
| Button | Delete account | Eliminar cuenta |

## Option C — Choice: delete my posts **and** my care logs

**Behaviour:** like B, and also delete the health logs the member wrote. Needs: `0144` applied, a **new** migration
extending the deletion function, and app work. It can only remove logs written **after** `0144`; older ones stay.
Vet-record entries stay (a vaccination or lab result removed from a dog's file can be a health risk).

**Privacy sentence**

- EN: *When you delete your account we delete your account and the data you own. For dogs that others shared with you,
  you can choose to delete your posts and the care logs recorded under your name. Entries made before we started
  recording who logged them, and vet-record entries, stay with the dog's owner, no longer linked to you.*
- ES: *Cuando eliminás tu cuenta, borramos tu cuenta y los datos que te pertenecen. En los perros que otras personas
  compartieron con vos, podés elegir borrar tus publicaciones y los registros de cuidado anotados a tu nombre. Las
  entradas anteriores a que empezáramos a guardar quién las anotó, y las de la historia clínica, quedan con quien
  tiene al perro a cargo, sin vínculo con vos.*

**Screen copy**

| | EN | ES (voseo) |
|---|---|---|
| Switch label | Also delete my posts and care logs on shared dogs | Borrar también mis publicaciones y registros en perros compartidos |
| Switch hint (on) | Older care logs and vet notes stay with the dog. This cannot be undone. | Los registros más viejos y las notas veterinarias quedan con el perro. No se puede deshacer. |

For and against: closest to "delete everything of mine", but it silently changes the owner's history (a missed-dose
check may reappear), and the "only newer entries" caveat is hard to explain.

## When the **owner** deletes their account (all options)

Behaviour unchanged: the dog and everything on it is deleted, including other members' posts and logs; members get a
notification first. The confirmation should say so **to owners of a shared dog**:

- Privacy, EN: *If you delete your account and you had shared a dog, the dog and everything recorded about it is
  deleted, including what the people you shared it with added. We tell them before it happens.*
- Privacy, ES: *Si eliminás tu cuenta y habías compartido un perro, se borra el perro y todo lo registrado sobre él,
  incluido lo que agregaron las personas con quienes lo compartiste. Les avisamos antes.*
- Screen, EN: *{{name}} is shared with others. Deleting your account also deletes {{name}} for them, with everything
  they added.*
- Screen, ES: *{{name}} está compartido con otras personas. Al eliminar tu cuenta, {{name}} también se borra para
  ellas, con todo lo que agregaron.*

## Places to update once you choose
`deleteAccountBody` (and the second confirmation) in both locale files · Privacy §9 and §11 in
`docs/legal/privacy-policy.md` + `.es.md` and the web page that renders them · Terms §10 (both languages) · support
page "How do I delete my account?" · `docs/app-store-privacy-data-map.md` if it describes retention.

## What I recommend
**Option B**, with the owner sentence. It matches what the server already does, gives the person real control over
their own photos, and keeps the dog's medical history intact.
