import { eq } from "drizzle-orm";
import { db } from "../db/index";
import { linhasMoveis } from "../db/schema";
import type { InferSelectModel } from "drizzle-orm";

type LinhaMovel = InferSelectModel<typeof linhasMoveis>;

export class LinhasMoveisRepository {
    async getLinhasMoveisByEmpresaId(id: number): Promise<LinhaMovel[]> {
        return await db.select().from(linhasMoveis).where(eq(linhasMoveis.empresaId, id));
    }

    async updateClusterBatch(updates: { nrLinha: string; cluster: string }[]): Promise<void> {
        await Promise.all(
            updates.map(async (update) => {
                await db.update(linhasMoveis).set({ cluster: update.cluster }).where(eq(linhasMoveis.nrLinha, update.nrLinha));
            })
        );
    }

}