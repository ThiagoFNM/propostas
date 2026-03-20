import { timestamp } from "drizzle-orm/pg-core";
import { boolean, decimal, integer, pgSchema, varchar } from "drizzle-orm/pg-core";


const SchemaCarteira = pgSchema('carteira')

export const empresas = SchemaCarteira.table("empresas", {
    id: integer('id').primaryKey(),
    cnpjBasico: varchar('cnpj_basico', { length: 8 }).notNull(),
    cnpjOrdem: varchar('cnpj_ordem', { length: 6 }).notNull(),
    cnpjDv: varchar('cnpj_dv', { length: 2 }).notNull(),
    valFatLinhasMoveis: decimal('val_fat_linhas_moveis', { precision: 10, scale: 2 }),
    valFatMovelBruto: decimal('val_fat_movel_bruto', { precision: 10, scale: 2 }),
    valSva: decimal('val_sva', { precision: 10, scale: 2 }),
    tpProduto: varchar('tp_produto', { length: 50 }).notNull(),
    atualizadoEm: timestamp('atualizado_em').notNull()
});

export const fatura = SchemaCarteira.table("fatura", {
    cnpjBasico: varchar('cnpj_basico', { length: 8 }).notNull(),
    cnpjOrdem: varchar('cnpj_ordem', { length: 6 }).notNull(),
    cnpjDv: varchar('cnpj_dv', { length: 2 }).notNull(),
    descProduto: varchar('desc_produtos', { length: 255 }).notNull(),
    quantidade: integer('quantidade').notNull(),
    valor: decimal('valor', { precision: 10, scale: 2 }).notNull(),
});

export const linhasMoveis = SchemaCarteira.table("linhas_moveis", {
    empresaId: integer('empresa_id').notNull(),
    plano: varchar('plano', { length: 100 }).notNull(),
    nrLinha: varchar('nr_linha', { length: 11 }).notNull(),
    valor: decimal('fat_medio_3_meses', { precision: 10, scale: 2 }).notNull(),
    m: integer('m_recomendacao').notNull(),
    fidelizacao: boolean('fidelizado').notNull(),
    cluster: decimal('cluster', { precision: 10, scale: 2 }).notNull(),

});

export const planosMoveis = SchemaCarteira.table("planos_movel", {
    id: integer('id').primaryKey(),
    nome: varchar('desc_plano', { length: 100 }).notNull(),
    valor: decimal('valor', { precision: 10, scale: 2 }).notNull(),
});

export const propostaMovel = SchemaCarteira.table("proposta_movel", {
    empresa_id: integer('empresa_id').notNull(),
    fatura_atual_movel: decimal('fatura_atual_movel', { precision: 10, scale: 2 }).notNull(),
    fatura_limite_movel: decimal('fatura_limite_movel', { precision: 10, scale: 2 }).notNull(),
    percentual_limite: decimal('percentual_limite', { precision: 10, scale: 2 }).notNull(),
    gap_alvo: decimal('gap_alvo', { precision: 10, scale: 2 }).notNull(),
    cluster: decimal('cluster', { precision: 10, scale: 2 }).notNull(),
    sva: boolean('sva').notNull(),
    fatura_bruta_movel: decimal('fatura_bruta_movel', { precision: 10, scale: 2 }).notNull(),
    travel: boolean('travel').notNull(),
});
