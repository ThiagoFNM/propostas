import { eq } from "drizzle-orm";
import { db } from "../db.js";
import { linhasMoveis } from "../schema.js";
import type { InferSelectModel } from "drizzle-orm";

type LinhaMovel = InferSelectModel<typeof linhasMoveis>;

export class LinhasMoveisRepository {
    async getLinhasMoveisByEmpresaId(id: number): Promise<LinhaMovel[]> {
        return await db.select().from(linhasMoveis).where(eq(linhasMoveis.empresaId, id));
    }

}