import { FaturaRepository } from "../infra/repository/useFaturaRepository";

export class Fatura {
    faturaRepository = new FaturaRepository();

    async getTravel (cnpj: string): Promise<boolean> {
        const fatura = await this.faturaRepository.getFaturaCnpj(cnpj);

        const isTravel = fatura.some(f => f.descProduto.includes("TRAVEL"));
        return isTravel;
    }

    async getValorFatura(cnpj: string): Promise<number> {
        const fatura = await this.faturaRepository.getFaturaCnpj(cnpj);
        return fatura.reduce((acc, f) => acc + Number(f.valor), 0);
    }

    
}