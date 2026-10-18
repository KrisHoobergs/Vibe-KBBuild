import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import type { Selectable } from "kysely";
import { getDb } from "@/lib/db";
import { toIso } from "@/lib/db/dialect";
import type { InvitationsTable } from "@/lib/db/schema";
import type { Invitation } from "@/types";

const KOLOMMEN = ["id", "email", "invited_by", "token", "accepted_at", "expires_at", "created_at"] as const;
const GELDIGHEID_MS = 7 * 24 * 60 * 60 * 1000;

function naarInvitation(rij: Selectable<InvitationsTable>): Invitation {
  return {
    id: rij.id,
    email: rij.email,
    invited_by: rij.invited_by,
    token: rij.token,
    accepted_at: toIso(rij.accepted_at),
    expires_at: toIso(rij.expires_at),
    created_at: toIso(rij.created_at),
  };
}

/** Een nog niet gebruikte, niet verlopen uitnodiging. */
export async function getValidInvitation(token: string): Promise<Invitation | null> {
  const rij = await getDb()
    .selectFrom("invitations")
    .select(KOLOMMEN)
    .where("token", "=", token)
    .where("accepted_at", "is", null)
    .where("expires_at", ">", new Date())
    .executeTakeFirst();
  return rij ? naarInvitation(rij) : null;
}

export async function hasActiveInvitationFor(email: string): Promise<boolean> {
  const rij = await getDb()
    .selectFrom("invitations")
    .select("id")
    .where("email", "=", email)
    .where("accepted_at", "is", null)
    .where("expires_at", ">", new Date())
    .executeTakeFirst();
  return !!rij;
}

export async function insertInvitation(email: string, invitedBy: string): Promise<Invitation> {
  const nu = new Date();
  const rij = {
    id: randomUUID(),
    email,
    invited_by: invitedBy,
    token: randomBytes(32).toString("hex"),
    accepted_at: null,
    expires_at: new Date(nu.getTime() + GELDIGHEID_MS),
    created_at: nu,
  };
  await getDb().insertInto("invitations").values(rij).execute();
  return naarInvitation(rij);
}

export async function listInvitations(): Promise<Invitation[]> {
  const rijen = await getDb()
    .selectFrom("invitations")
    .select(KOLOMMEN)
    .orderBy("created_at", "desc")
    .orderBy("id")
    .execute();
  return rijen.map(naarInvitation);
}

export async function deleteInvitationById(id: string): Promise<void> {
  await getDb().deleteFrom("invitations").where("id", "=", id).execute();
}

export async function markInvitationAccepted(token: string): Promise<void> {
  await getDb()
    .updateTable("invitations")
    .set({ accepted_at: new Date() })
    .where("token", "=", token)
    .where("accepted_at", "is", null)
    .execute();
}
