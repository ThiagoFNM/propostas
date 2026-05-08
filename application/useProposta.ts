import { PropostaMovelRepository } from "../infra/repository/usePropostaMovel";

export class FuncoesCalculoProposta {
    static propostaMovelRepository = new PropostaMovelRepository();

    static gbCache = new Map<string, number>();

    static extrairGB(nomePlano: string): number {
        const cached = FuncoesCalculoProposta.gbCache.get(nomePlano);
        if (cached !== undefined) return cached;

        // O regex agora aceita números com ponto ou vírgula antes do GB
        const match = nomePlano.match(/(\d+(?:[\.,]\d+)?)\s*GB/i);
        let gb = 0;
        if (match) {
            // Troca vírgula por ponto para o Number() não falhar
            gb = Number(match[1]?.replace(',', '.'));
        }
        FuncoesCalculoProposta.gbCache.set(nomePlano, gb);
        return gb;
    }

    static extrairVelocidade(nomePlano: string): number {
        const match = nomePlano.match(/(\d+)Mega/i);
        return match ? Number(match[1]) : 0;
    }

    static dddCache = new Map<string, number>();

    static extrairDDD(numero: string): number {
        const cached = FuncoesCalculoProposta.dddCache.get(numero);
        if (cached !== undefined) return cached;

        if (!numero || typeof numero !== "string") return 0;
        const numeroLimpo = numero.replace(/\D/g, "");
        const match = numeroLimpo.match(/^(\d{2})/);
        const ddd = match ? Number(match[1]) : 0;

        FuncoesCalculoProposta.dddCache.set(numero, ddd);
        return ddd;
    }

    static calcularMediaM(linhas: any[]) {
        const totalM = linhas.reduce((acc, l) => acc + (Number(l.m) || 0), 0);
        const mediaM = linhas.length > 0 ? totalM / linhas.length : 0;
        return mediaM;
    }

    static calcularClusterConta(linhas: any[]) {
        const mediaM = FuncoesCalculoProposta.calcularMediaM(linhas);

        if (mediaM < 20 ) return 0;
        if (mediaM < 35) return -0.05;
        return -0.15;
    }

    static obterClusterDaLinha(linha: any, planosMovelMap: any[], valorAtual: number): number {
        if (typeof linha.excecao !== 'undefined' && linha.excecao !== null) {
            return Number(linha.excecao);
        }


        const m = Number(linha.m) || 0;
        const gbAtual = FuncoesCalculoProposta.extrairGB(linha.plano);
        const ddd = FuncoesCalculoProposta.extrairDDD(linha.nrLinha);

        console.log("linha.nrLinha", linha.nrLinha)
        console.log("ddd", ddd)
        console.log("m", m)
        console.log("gbAtual", gbAtual)
        console.log("valorAtual", valorAtual)

        if (ddd > 19 && m > 17 ) {
            return 0
        }

        // Regra DDD (Fora de SP ganha 5% automático)
        if (ddd !== 11 && ddd !== 0) {
            if (valorAtual < 54.00) return 0;
            if (gbAtual > 12 && valorAtual > 54.00 && m >= 30) return -0.15;
            if (gbAtual > 10 && valorAtual > 54.00 && m < 17) return 0;
            return -0.05;
        }

        // Regra de retenção agressiva para chips muito antigos
        if (m >= 30 && valorAtual >= 54.00) return -0.15;
        if (m >= 30 && valorAtual < 54.00) return 0; // Proteção para planos já muito baratos

        // 🔥 REGRA ATUALIZADA COM BASE NO LOG DA OPERADORA
        // A operadora dá 5% (-0.05) para QUALQUER chip com M >= 18, ignorando a franquia de GB.
        if (m >= 18 && m < 30) {
            // Se quiser manter a regra antiga de -0.15 para M>=22 e gb>10, pode manter aqui dentro:
            if (m >= 22 && gbAtual > 10) {
                const existePlanoIgual = planosMovelMap.some(p => FuncoesCalculoProposta.extrairGB(p.nome) === gbAtual);
                if (existePlanoIgual) return -0.15;
            }

            // Padrão do log: todos com M=18 ganharam 5%
            return -0.05;
        }

        // Linhas novas (ex: M=12, M=14 vistos no seu log) não ganham redução
        if (m < 17) {
            return 0;
        }

        return 0; // Fallback
    }

    static classificarLinha(linha: any) {
        const gb = FuncoesCalculoProposta.extrairGB(linha.plano);
        if (gb <= 5) return "baixo";
        if (gb <= 15) return "medio";
        return "alto";
    }
    // 🔥 NOVO: Validando a Regra Anti-Downgrade
    static obterPlanosValidos(linha: any, planos: any[], clusterConta: number, clusterLinha: number, limiteLinha: number) {
        const tipo = FuncoesCalculoProposta.classificarLinha(linha);
        const gbAtual = FuncoesCalculoProposta.extrairGB(linha.plano);

        // O Sistema não deixa o novo plano custar menos do que a linha já vale (com 1 centavo de margem de segurança)
        const planosPermitidos = planos.filter(p => Number(p.valor) >= limiteLinha - 0.01);

        if (clusterConta === 0 && clusterLinha === 0) {
            const plano = planosPermitidos
                .filter(p => FuncoesCalculoProposta.extrairGB(p.nome) > gbAtual)
                .sort((a, b) => FuncoesCalculoProposta.extrairGB(a.nome) - FuncoesCalculoProposta.extrairGB(b.nome))[0] || null;
            return plano ? [plano] : [];
        }

        if (tipo === "baixo") return planosPermitidos.filter(p => FuncoesCalculoProposta.extrairGB(p.nome) > gbAtual);
        if (tipo === "medio") return planosPermitidos.filter(p => FuncoesCalculoProposta.extrairGB(p.nome) >= gbAtual);
        if (tipo === "alto") return planosPermitidos.filter(p => FuncoesCalculoProposta.extrairGB(p.nome) <= gbAtual);

        return [];
    }

    static gerarOpcoesPorLinha(simulacao: any[]) {
        return simulacao.map(s => {
            let opcoes: any[] = [];

            if (s.existeNoPortfolio) {
                opcoes.push({ plano: s.planoParaAtual, impacto: 0 });
            }

            const opcoesDesconto = s.planosValidos.map((plano: any) => {
                const impacto = Number(s.valorAtual) - Number(plano.valor);
                return { plano, impacto };
            });

            let planosUnicos = [...opcoes, ...opcoesDesconto].reduce((acc, current) => {
                const x = acc.find((item: any) => item.plano.nome === current.plano.nome);
                if (!x) return acc.concat([current]);
                return acc;
            }, []);

            if (planosUnicos.length === 0) {
                planosUnicos.push({ plano: s.planoParaAtual, impacto: 0 });
            }

            return {
                item: s,
                opcoes: planosUnicos.sort((a: any, b: any) => b.impacto - a.impacto)
            };
        });
    }

    static encontrarMelhorCombinacao(linhas: any[], targetGap: number): any[] | null {
        let melhorEscolha: any[] | null = null;
        let melhorDiferenca = Infinity;

        let iteracoes = 0;
        const MAX_ITERACOES = 50000;

        function backtrack(index: number, somaAtual: number, escolhas: any[]) {
            iteracoes++;
            if (iteracoes > MAX_ITERACOES) return false;

            const diferenca = Math.abs(targetGap - somaAtual);

            if (diferenca < melhorDiferenca) {
                melhorDiferenca = diferenca;
                melhorEscolha = [...escolhas];
            }

            if (diferenca < 0.01) return true;
            if (index >= linhas.length) return false;

            const linha = linhas[index];

            for (const opcao of linha.opcoes) {
                escolhas.push({ item: linha.item, plano: opcao.plano });
                if (backtrack(
                    index + 1,
                    somaAtual + opcao.impacto,
                    escolhas
                )) {
                    return true;
                }
                escolhas.pop();
            }

            return false;
        }

        backtrack(0, 0, []);
        return melhorEscolha;
    }

    static async existeProposta(empresaId: number) {
        const result = await this.propostaMovelRepository.findExistingProposal(empresaId);
        return result.length > 0;
    }



}