import { db } from "../db/index";
import { propostaMovel } from "../db/schema";
import { eq } from "drizzle-orm";

export class PropostaMovelRepository {
    async insert(data: typeof propostaMovel.$inferInsert) {

        console.log(data)
        await db.insert(propostaMovel).values(data).onConflictDoUpdate({
            target: propostaMovel.empresa_id,
            set: {
                fatura_atual_movel: data.fatura_atual_movel,
                percentual_limite: data.percentual_limite,
                mMedio: data.mMedio,
                cluster: data.cluster,
                fatura_bruta_movel: data.fatura_bruta_movel,
                fatura_limite_movel: data.fatura_limite_movel,
                gap_alvo: data.gap_alvo,
                travel: data.travel,
            }
        });
    }

    async insertMany(data: typeof propostaMovel.$inferInsert[]) {
        await Promise.all(data.map(item => this.insert(item)));
    }

    async findByEmpresaId(empresaId: number) {
        return await db.select().from(propostaMovel).where(eq(propostaMovel.empresa_id, empresaId));
    }

    async findExistingProposal(empresaId: number) {
        return await db.select().from(propostaMovel).where(eq(propostaMovel.empresa_id, empresaId));
    }
}