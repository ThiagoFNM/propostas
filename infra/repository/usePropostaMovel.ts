import { db } from "../db/index";
import { propostaMovel } from "../db/schema";
import { eq } from "drizzle-orm";

export class PropostaMovelRepository {
    async insert(data: typeof propostaMovel.$inferInsert) {
        await db.insert(propostaMovel).values(data);
    }

    async findByEmpresaId(empresaId: number) {
        return await db.select().from(propostaMovel).where(eq(propostaMovel.empresa_id, empresaId));
    }

    async findExistingProposal(empresaId: number) {
        return await db.select().from(propostaMovel).where(eq(propostaMovel.empresa_id, empresaId));
    }
}