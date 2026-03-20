import { db } from "../db/index";
import { planosMoveis } from "../db/schema";
import { ilike, type InferSelectModel } from "drizzle-orm";

type PlanoMovel = InferSelectModel<typeof planosMoveis>;

export class PlanoMovelRepository {
    async getByNome(nome: string): Promise<PlanoMovel | undefined> {
        const plano = await db.select().from(planosMoveis).where(ilike(planosMoveis.nome, `%${nome}%`)).limit(1);
        return plano[0];
    }

    async getAll(): Promise<PlanoMovel[]> {
        return await db.select().from(planosMoveis);
    }
}