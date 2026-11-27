import { auth } from "@/auth";
import { resolveUserId } from "@/app/api/utils/currentUser";
import { CareAccessError } from "@/app/api/utils/careAccess";
import { addForProvider } from "@/app/api/utils/sharedWrites";
import { withRequestContext } from "@/app/api/utils/requestContext";

// POST /api/providers/[id]/pets/[petId]/lab-results { test_name, test_date, results?, ordered_by?, notes? }
// → 201 { labResult }: a business adds a lab result to the owner's record. Only under a grant by section whose
// edit_sections include 'lab_results' (utils/sharedWrites.js, migration 0160). 403 otherwise · 400.
async function POST(request, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const staffUserId = await resolveUserId(session.user.id);
    if (staffUserId === null) {
      return Response.json({ error: "User profile not found" }, { status: 404 });
    }

    const body = (await request.json().catch(() => null)) ?? {};
    const { test_name, test_date, results, ordered_by, notes } = body;
    if (!test_name || !test_date) {
      return Response.json({ error: "test_name and test_date are required" }, { status: 400 });
    }

    const written = await addForProvider({
      petId: params.petId,
      providerId: params.id,
      staffUserId,
      section: "lab_results",
      data: { test_name, test_date, results, ordered_by, notes },
      resource: "pet_lab_results",
    });
    if (written.badData) {
      return Response.json({ error: "The lab result is not valid" }, { status: 400 });
    }
    return Response.json({ labResult: written.record }, { status: 201 });
  } catch (error) {
    if (error instanceof CareAccessError) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    console.error("[POST /api/providers/[id]/pets/[petId]/lab-results] Error:", error?.message);
    return Response.json({ error: "Failed to add the lab result" }, { status: 500 });
  }
}

const wrappedPOST = withRequestContext(POST);
export { wrappedPOST as POST };
