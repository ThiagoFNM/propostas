import { EmpresaRepository } from "./infra/repository/useEmpresaRepository";
import { LinhasMoveisRepository } from "./infra/repository/useLinhasMoveisRepository";
import { PlanoMovelRepository } from "./infra/repository/usePlanosMovelRepository";
import { FuncoesCalculoProposta } from "./application/useProposta";
import { PropostaMovelRepository } from "./infra/repository/usePropostaMovel";
import { Fatura } from "./application/useFatura";

const empresaRepository = new EmpresaRepository();
const linhasMoveisRepository = new LinhasMoveisRepository();
const planoMovelRepository = new PlanoMovelRepository();
const propostaMovelRepository = new PropostaMovelRepository();
const faturaService = new Fatura();

export async function CalculoProposta() {
    const empresas = await empresaRepository.findAllWithTpProduto("MOVEL");
    for (const empresa of empresas) {
        console.log("Iniciando cálculo da proposta...");

        const cnpj = `${empresa.cnpjBasico}${empresa.cnpjOrdem}${empresa.cnpjDv}`;

        const linhasMoveis = await linhasMoveisRepository.getLinhasMoveisByEmpresaId(empresa.id);
        const planosMovelMap = await planoMovelRepository.getAll();

        const clusterConta = FuncoesCalculoProposta.calcularClusterConta(linhasMoveis);

        let simulacao = linhasMoveis.map(linha => {
            const valorAtual = Number(linha.valor);

            // Passamos o valorAtual para checar o Floor Price
            const clusterLinha = FuncoesCalculoProposta.obterClusterDaLinha(linha, planosMovelMap, valorAtual);

            // Salva cluster da linha no banco
            linhasMoveisRepository.updateCluster(linha.nrLinha, clusterLinha.toString());

            // Calculamos e arredondamos o limite para bater exato os centavos
            const limiteLinha = clusterLinha < 0
                ? Math.round(valorAtual * (1 + clusterLinha) * 100) / 100
                : valorAtual;

            // Passamos o limiteLinha para checar a Regra Anti-Downgrade
            const planosValidos = FuncoesCalculoProposta.obterPlanosValidos(linha, planosMovelMap, clusterConta, clusterLinha, limiteLinha);

            const existeNoPortfolio = planosMovelMap.some(
                p => p.nome.trim().toUpperCase() === linha.plano.trim().toUpperCase()
            );

            return {
                linha,
                valorAtual,
                limiteLinha,
                clusterLinha,
                planosValidos,
                existeNoPortfolio,
                planoParaAtual: { nome: linha.plano, valor: linha.valor },
                planoFinal: null as any
            };
        });

        const fatAtualLinhas = simulacao.reduce((acc, s) => acc + s.valorAtual, 0);
        const limiteInferior = simulacao.reduce((acc, s) => acc + s.limiteLinha, 0);

        const gapAlvo = fatAtualLinhas - limiteInferior;
        const percentualMaximoConta = fatAtualLinhas > 0 ? (gapAlvo / fatAtualLinhas) * 100 : 0;

        const linhasOpcoes = FuncoesCalculoProposta.gerarOpcoesPorLinha(simulacao);

        const melhorCombinacao = FuncoesCalculoProposta.encontrarMelhorCombinacao(linhasOpcoes, gapAlvo);

        if (melhorCombinacao) {
            for (const escolha of melhorCombinacao) {
                const simItem = simulacao.find(s => s === escolha.item);
                if (simItem) {
                    simItem.planoFinal = escolha.plano;
                }
            }
        }

        const fatSimulada = simulacao.reduce(
            (acc, s) => acc + Number(s.planoFinal?.valor || s.valorAtual),
            0
        );

        console.log("\n=== RESULTADO DO REVERSOR (SOLVER + CLUSTER DINÂMICO) ===");

        for (const item of simulacao) {
            const atual = item.valorAtual;
            const novo = Number(item.planoFinal?.valor || atual);

            console.log(`\nLinha: ${item.linha.nrLinha} [Cluster: ${item.clusterLinha}]`);
            console.log(`Atual: ${item.linha.plano} (R$ ${atual.toFixed(2)}) ${!item.existeNoPortfolio ? '❌ (Obsoleto)' : ''}`);
            console.log(`Novo:  ${item.planoFinal?.nome || item.linha.plano} (R$ ${novo.toFixed(2)})`);
        }

        console.log("\n=======================");
        console.log(`Fat Atual: R$ ${fatAtualLinhas.toFixed(2)}`);
        console.log(`Meta Exata Sistêmica (Fat Limite): R$ ${limiteInferior.toFixed(2)} (-${percentualMaximoConta.toFixed(2)}%)`);
        console.log(`Gap Alvo a reduzir: R$ ${gapAlvo.toFixed(2)}`);
        console.log(`Fat Simulada Final pelo Solver: R$ ${fatSimulada.toFixed(2)}`);

        const precisao = Math.abs(limiteInferior - fatSimulada);
        console.log(`Precisão do Solver: Erro de R$ ${precisao.toFixed(2)}`);

        const travel = await faturaService.getTravel(cnpj);
        const valorFaturaBruta = await faturaService.getValorFatura(cnpj);

        if (await FuncoesCalculoProposta.existeProposta(empresa.id)) {
            console.log("Empresa já tem proposta");
            return;
        }

        propostaMovelRepository.insert({
            empresa_id: Number(empresa.id),
            cluster: clusterConta.toString(),
            fatura_atual_movel: fatAtualLinhas.toFixed(2).toString(),
            fatura_limite_movel: limiteInferior.toFixed(2).toString(),
            gap_alvo: gapAlvo.toFixed(2).toString(),
            percentual_limite: percentualMaximoConta.toFixed(2).toString(),
            fatura_bruta_movel: valorFaturaBruta.toFixed(2).toString(),
            sva: false,
            travel: travel,
        })
    }
}

CalculoProposta();