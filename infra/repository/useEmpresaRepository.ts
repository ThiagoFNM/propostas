import { and, eq, gte, ilike, isNotNull, isNull, lt } from "drizzle-orm";
import { db } from "../db/index";
import { empresas } from "../db/schema";
import type { InferSelectModel } from "drizzle-orm";

type Empresa = InferSelectModel<typeof empresas>;

export class EmpresaRepository {


    async findAllWithTpProduto(tpProduto: string): Promise<Empresa[]> {
        const mesAtual = new Date().getMonth() + 1;
        const anoAtual = new Date().getFullYear();

        const firstDayOfMonth = new Date(anoAtual, mesAtual - 1, 1);
        const firstDayOfNextMonth = new Date(anoAtual, mesAtual, 1);

        const filters = [
            ilike(empresas.tpProduto, `%${tpProduto}%`),
            gte(empresas.atualizadoEm, firstDayOfMonth),
            lt(empresas.atualizadoEm, firstDayOfNextMonth),
        ];

        return await db.select().from(empresas).where(and(...filters));
    }

    async findAllWithFatMovel(): Promise<Empresa[]> {
        return await db.select().from(empresas).where(and(isNotNull(empresas.valFatLinhasMoveis), isNull(empresas.valSva)));
    }

    async getByCnpj(cnpj: string): Promise<Empresa | undefined> {
        const cnpjBasico = cnpj.slice(0, 8);
        const cnpjOrdem = cnpj.slice(8, 12);
        const cnpjDv = cnpj.slice(12, 14);

        const empresa = await db.select().from(empresas).where(and(eq(empresas.cnpjBasico, cnpjBasico), eq(empresas.cnpjOrdem, cnpjOrdem), eq(empresas.cnpjDv, cnpjDv))).limit(1);
        return empresa[0];
    }

    async update(empresa: Empresa): Promise<void> {
        await db.update(empresas).set({
            valFatLinhasMoveis: empresa.valFatLinhasMoveis,
            valFatMovelBruto: empresa.valFatMovelBruto,
            valSva: empresa.valSva,
        }).where(and(eq(empresas.cnpjBasico, empresa.cnpjBasico), eq(empresas.cnpjOrdem, empresa.cnpjOrdem), eq(empresas.cnpjDv, empresa.cnpjDv)));
    }

    
}