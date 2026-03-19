import { db } from "../db.js";
import { fatura as faturaTable } from "../schema.js";
import type { InferSelectModel } from "drizzle-orm";

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
}