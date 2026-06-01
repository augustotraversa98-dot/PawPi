import { auth } from "@/auth";
import sql from "@/app/api/utils/sql";

export async function GET(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const petId = searchParams.get("petId");

    if (!petId) {
      return Response.json({ error: "petId is required" }, { status: 400 });
    }

    const userProfile = await sql`
      SELECT id FROM user_profiles WHERE auth_user_id = ${session.user.id}
    `;

    if (!userProfile || userProfile.length === 0) {
      return Response.json(
        { error: "User profile not found" },
        { status: 404 },
      );
    }

    const ownerUserId = userProfile[0].id;

    const documents = await sql`
      SELECT * FROM vet_documents 
      WHERE pet_id = ${petId} AND owner_user_id = ${ownerUserId}
      ORDER BY document_date DESC NULLS LAST, created_at DESC
    `;

    return Response.json({ documents });
  } catch (error) {
    console.error("[Vet Record Documents] Error:", error);
    return Response.json(
      { error: "Failed to fetch documents" },
      { status: 500 },
    );
  }
}

export async function POST(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { petId, name, documentType, fileUrl, documentDate, notes } = body;

    if (!petId || !name || !documentType || !fileUrl) {
      return Response.json(
        { error: "petId, name, documentType, and fileUrl are required" },
        { status: 400 },
      );
    }

    const userProfile = await sql`
      SELECT id FROM user_profiles WHERE auth_user_id = ${session.user.id}
    `;

    if (!userProfile || userProfile.length === 0) {
      return Response.json(
        { error: "User profile not found" },
        { status: 404 },
      );
    }

    const ownerUserId = userProfile[0].id;

    const result = await sql`
      INSERT INTO vet_documents (
        pet_id, owner_user_id, name, document_type, file_url, document_date, notes
      ) VALUES (
        ${petId}, ${ownerUserId}, ${name}, ${documentType}, ${fileUrl}, 
        ${documentDate || null}, ${notes || null}
      )
      RETURNING *
    `;

    return Response.json({ document: result[0] });
  } catch (error) {
    console.error("[Vet Record Documents] Error:", error);
    return Response.json(
      { error: "Failed to create document" },
      { status: 500 },
    );
  }
}

export async function DELETE(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return Response.json({ error: "id is required" }, { status: 400 });
    }

    const userProfile = await sql`
      SELECT id FROM user_profiles WHERE auth_user_id = ${session.user.id}
    `;

    if (!userProfile || userProfile.length === 0) {
      return Response.json(
        { error: "User profile not found" },
        { status: 404 },
      );
    }

    const ownerUserId = userProfile[0].id;

    await sql`
      DELETE FROM vet_documents 
      WHERE id = ${id} AND owner_user_id = ${ownerUserId}
    `;

    return Response.json({ success: true });
  } catch (error) {
    console.error("[Vet Record Documents] Error:", error);
    return Response.json(
      { error: "Failed to delete document" },
      { status: 500 },
    );
  }
}
