import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { CareAccessError } from "@/app/api/utils/careAccess";
import { addForProvider, providerMayAdd } from "@/app/api/utils/sharedWrites";
import { discardVetFile, documentData, readVetFile, storeVetFile } from "@/app/api/utils/vetFile";
import { MAX_UPLOAD_BYTES } from "@/app/api/utils/uploadValidation";
import { withRateLimit } from "@/app/api/utils/rateLimit";
import { withRequestContext } from "@/app/api/utils/requestContext";

// POST /api/providers/[id]/pets/[petId]/documents (multipart: file, name, category?, document_date?, notes?)
// → 201 { document }: a business uploads a PDF or photo to the owner's Vet Record. Only under a grant by section whose
// edit_sections include 'files' (utils/sharedWrites.js, migration 0160). The permission is checked before the file is
// stored and again when the row is written; the file is stored outside any database transaction.
//   403 · 400 'file_required' | 'file_type' | invalid fields · 413 'file_too_large' · 429 · 502

const denied = () =>
  Response.json({ error: "No active care-access grant for the required scope" }, { status: 403 });

const check = withRequestContext(
  withRateLimit("upload_create", async (request, { params }) => {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    if ((await resolveUserId(session.user.id)) === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }
    const allowed = await providerMayAdd({ petId: params.petId, providerId: params.id, section: "files" });
    return allowed ? { allowed: true } : denied();
  }),
);

const save = withRequestContext(async (request, { params, data }) => {
  const session = await auth();
  const staffUserId = await resolveUserId(session.user.id);
  const written = await addForProvider({
    petId: params.petId,
    providerId: params.id,
    staffUserId,
    section: "files",
    data,
    resource: "vet_documents",
  }).catch((error) => {
    if (error instanceof CareAccessError) return { denied: true };
    throw error;
  });
  if (written.denied) return denied();
  if (written.badData) {
    return Response.json({ error: "The document is not valid" }, { status: 400 });
  }
  return Response.json({ document: written.record }, { status: 201 });
});

async function receive(request, context) {
  try {
    const allowed = await check(request, context);
    if (allowed instanceof Response) return allowed;

    const form = await request.formData().catch(() => null);
    if (!form || !String(form.get("name") ?? "").trim()) {
      return Response.json({ error: "name and file are required" }, { status: 400 });
    }
    const file = await readVetFile(form.get("file"), MAX_UPLOAD_BYTES);
    if (file.status) {
      return Response.json({ error: "That file cannot be added", code: file.code }, { status: file.status });
    }
    let key;
    try {
      key = await storeVetFile(Number(context.params.petId), file);
    } catch (error) {
      console.error("[POST provider documents] upload failed:", error?.message);
      return Response.json({ error: "Upload failed" }, { status: 502 });
    }
    const data = documentData(form, key, { date: "document_date" });
    const response = await save(request, { params: context.params, data });
    if (!response.ok) await discardVetFile(key);
    return response;
  } catch (error) {
    console.error("[POST /api/providers/[id]/pets/[petId]/documents] Error:", error?.message);
    return Response.json({ error: "Failed to add the document" }, { status: 500 });
  }
}
export { receive as POST };
