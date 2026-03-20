import { db } from "../db/index";
import { fatura as faturaTable } from "../db/schema";
import { and, eq, ilike, type InferSelectModel } from "drizzle-orm";

type Fatura = InferSelectModel<typeof faturaTable>;

export class FaturaRepository {

    async insert(data: Fatura): Promise<void> {
        await db.insert(faturaTable).values({
            cnpjBasico: data.cnpjBasico,
            cnpjOrdem: data.cnpjOrdem,
            cnpjDv: data.cnpjDv,
            descProduto: data.descProduto,
            quantidade: data.quantidade,
            valor: data.valor,
        })
    }

    async getFaturaCnpj(cnpj: string): Promise<Fatura[]> {
        const cnpjLimpo = cnpj.replace(/\D/g, "");
        const filters = [
            eq(faturaTable.cnpjBasico, cnpjLimpo.slice(0, 8)),
            eq(faturaTable.cnpjOrdem, cnpjLimpo.slice(8, 12)),
            eq(faturaTable.cnpjDv, cnpjLimpo.slice(12, 14)),
        ]

        return await db.select().from(faturaTable).where(and(...filters));
    }

}