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

const cnpj_manual = "17264035000130";

export async function CalculoProposta() {
    const empresas = cnpj_manual.length === 14 ? [await empresaRepository.getByCnpj(cnpj_manual)] : await empresaRepository.findAllWithTpProduto("MOVEL");
    const planosMovelMap = await planoMovelRepository.getAll();

    for (const empresa of empresas) {
        console.log("Iniciando cálculo da proposta...");

        const cnpj = `${empresa?.cnpjBasico}${empresa?.cnpjOrdem}${empresa?.cnpjDv}`;
        // const cnpj = empresa?.cnpj;

        const linhasMoveis = await linhasMoveisRepository.getLinhasMoveisByEmpresaId(Number(empresa?.id));
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
        // ================================================================
        // 🚀 NOVO MÓDULO: BOLSÃO EXTREMO (PRIORIDADE: LINHAS NOVAS DE ALTO VALOR)
        // ================================================================

        console.log("\n=== SIMULADOR DE BOLSÃO (PRIORIDADE EM NET ADDS) ===");

        // Extrai GB do nome do plano de forma segura
        const extrairGiga = (nomePlano: string): number => {
            const match = nomePlano.match(/(\d+(?:\.\d+)?)\s*GB/i);
            return match ? parseFloat(match[1]) : 0;
        };

        // PASSO 1: Esmagamento Extremo (Piso Absoluto)
        let gbTotalAntes = 0;
        let faturaEsmagada = 0;
        let gbTotalDepois = 0;

        const portfolioGeralCrescente = [...planosMovelMap].sort((a, b) => Number(a.valor) - Number(b.valor));

        // Mapeia a base criando um estado controlável para fazermos Upgrades Simulados depois
        const baseParaSimulacao = simulacao.map(item => {
            const mLinha = Number(item.linha.m);
            
            // Define os planos permitidos para a linha (Bypass no M >= 17)
            const planosParaUpgrade = mLinha >= 17 
                ? [...portfolioGeralCrescente] 
                : [...item.planosValidos].sort((a, b) => Number(a.valor) - Number(b.valor));
            
            const planoBase = planosParaUpgrade.length > 0 ? planosParaUpgrade[0] : { valor: item.valorAtual, nome: item.linha.plano };
            
            const gbAtual = extrairGiga(item.linha.plano);
            const gbEsmagado = extrairGiga(planoBase.nome);
            
            gbTotalAntes += gbAtual;
            faturaEsmagada += Number(planoBase.valor);
            gbTotalDepois += gbEsmagado;

            return {
                original: item, // Referência ao item oficial da simulação
                planos: planosParaUpgrade,
                idxAtual: 0,
                planoSimulado: planoBase,
                custoAtual: Number(planoBase.valor),
                gbAtual: gbEsmagado,
                gbOriginal: gbAtual
            };
        });

        console.log(`Franquia Original: ${gbTotalAntes} GB`);
        console.log(`Piso Absoluto Esmagado: R$ ${faturaEsmagada.toFixed(2)} (${gbTotalDepois} GB)`);

        let gapDisponivel = fatAtualLinhas - faturaEsmagada;
        let deficitGbTotal = gbTotalAntes - gbTotalDepois;

        // Prepara as Linhas Novas (Alto Valor Prioritário: 100GB, 60GB... descendo até 6GB)
        const planosParaLinhasNovas = [...planosMovelMap]
            .filter(p => extrairGiga(p.nome) >= 6)
            .sort((a, b) => Number(b.valor) - Number(a.valor));

        // Função Interna: Testa se um orçamento consegue cobrir a meta de GB usando Upgrades de Base
        const consegueBaterMetaGb = (baseAtual: any[], orcamentoDisp: number, metaGbFaltante: number) => {
            if (metaGbFaltante <= 0) return true;
            
            // Clona a base para não estragar a simulação
            let cloneBase = baseAtual.map(b => ({ ...b }));
            let orcamentoGasto = 0;
            let gbGanho = 0;

            let teveMelhoria = true;
            while(teveMelhoria && gbGanho < metaGbFaltante && orcamentoGasto < orcamentoDisp) {
                teveMelhoria = false;
                let melhorCb = -1;
                let melhorItemIdx = -1;

                // Busca o melhor Upgrade (Mais GB por Menos Reais)
                for (let i = 0; i < cloneBase.length; i++) {
                    const item = cloneBase[i];
                    const proxIdx = item.idxAtual + 1;
                    if (proxIdx < item.planos.length) {
                        const planoCandidato = item.planos[proxIdx];
                        const custoExtra = Number(planoCandidato.valor) - item.custoAtual;
                        const gbExtra = extrairGiga(planoCandidato.nome) - item.gbAtual;

                        if (gbExtra > 0 && (orcamentoGasto + custoExtra) <= orcamentoDisp) {
                            const cb = gbExtra / custoExtra;
                            if (cb > melhorCb) {
                                melhorCb = cb;
                                melhorItemIdx = i;
                            }
                        }
                    }
                }

                if (melhorItemIdx !== -1) {
                    const item = cloneBase[melhorItemIdx];
                    const planoDestino = item.planos[item.idxAtual + 1];
                    orcamentoGasto += (Number(planoDestino.valor) - item.custoAtual);
                    gbGanho += (extrairGiga(planoDestino.nome) - item.gbAtual);
                    item.custoAtual = Number(planoDestino.valor);
                    item.gbAtual = extrairGiga(planoDestino.nome);
                    item.idxAtual++;
                    teveMelhoria = true;
                }
            }
            return gbGanho >= metaGbFaltante;
        };

        // PASSO 2: Comprar as Linhas Novas Gulosamente (mas com garantia de não faltar GB depois)
        const linhasNovasConfirmadas = [];
        let receitaNovaInjetada = 0;
        let gbLinhasNovas = 0;
        
        for (const planoNovo of planosParaLinhasNovas) {
            let tentaComprar = true;
            while(tentaComprar) {
                tentaComprar = false;
                const custoNovo = Number(planoNovo.valor);
                const gbNovo = extrairGiga(planoNovo.nome);

                if (gapDisponivel >= custoNovo) {
                    const gapRestante = gapDisponivel - custoNovo;
                    // A nova linha já abate o déficit instantaneamente!
                    const deficitSimulado = deficitGbTotal - gbNovo; 

                    // Verifica se o troco que sobrar dá pra arrumar a base
                    if (deficitSimulado <= 0 || consegueBaterMetaGb(baseParaSimulacao, gapRestante, deficitSimulado)) {
                        linhasNovasConfirmadas.push(planoNovo);
                        gapDisponivel -= custoNovo;
                        deficitGbTotal -= gbNovo;
                        receitaNovaInjetada += custoNovo;
                        gbLinhasNovas += gbNovo;
                        tentaComprar = true; // Dinheiro deu? Compra outra linha dessa!
                    }
                }
            }
        }

        // PASSO 3: Aplicar Upgrades reais na base com o troco, para cobrir os GBs que ainda faltam
        let teveMelhoriaReal = true;
        while(teveMelhoriaReal && deficitGbTotal > 0 && gapDisponivel > 0) {
            teveMelhoriaReal = false;
            let melhorCb = -1;
            let melhorItemIdx = -1;

            for (let i = 0; i < baseParaSimulacao.length; i++) {
                const item = baseParaSimulacao[i];
                const proxIdx = Number(item?.idxAtual) + 1;
                if (proxIdx < Number(item?.planos.length)) {
                    const planoCandidato = item?.planos[proxIdx];
                    const custoExtra = Number(planoCandidato?.valor) - Number(item?.custoAtual);
                    const gbExtra = extrairGiga(planoCandidato?.nome) - Number(item?.gbAtual);

                    if (gbExtra > 0 && custoExtra <= gapDisponivel) {
                        const cb = gbExtra / custoExtra;
                        if (cb > melhorCb) {
                            melhorCb = cb;
                            melhorItemIdx = i;
                        }
                    }
                }
            }

            // Efetiva o Upgrade
            if (melhorItemIdx !== -1) {
                const item = baseParaSimulacao[melhorItemIdx];
                const planoDestino = item?.planos[Number(item?.idxAtual) + 1];
                
                gapDisponivel -= (Number(planoDestino?.valor) - Number(item?.custoAtual));
                deficitGbTotal -= (extrairGiga(planoDestino?.nome) - Number(item?.gbAtual));
                
                item.custoAtual = Number(planoDestino?.valor);
                item.gbAtual = extrairGiga(planoDestino?.nome);
                item.planoSimulado = planoDestino;
                item.idxAtual = Number(item?.idxAtual) + 1;
                
                teveMelhoriaReal = true;
            }
        }

        // Salvar os planos finais na simulação
        for (const b of baseParaSimulacao) {
            b.original.planoFinal = b.planoSimulado;
        }

        // ================================================================
        // NOVO: LOG DETALHADO DA BASE APÓS BOLSÃO EXTREMO
        // ================================================================
        console.log("\n=== STATUS DAS LINHAS APÓS BOLSÃO EXTREMO ===");
        for (const b of baseParaSimulacao) {
            const linhaNum = b.original.linha.nrLinha;
            const planoAntigo = b.original.linha.plano;
            const valorAntigo = b.original.valorAtual.toFixed(2);
            const gbAntigo = b.gbOriginal;
            
            const planoNovo = b.planoSimulado.nome;
            const valorNovo = b.custoAtual.toFixed(2);
            const gbNovo = b.gbAtual;

            const difValor = (Number(valorNovo) - Number(valorAntigo)).toFixed(2);
            const sinalValor = Number(difValor) > 0 ? '+' : '';

            console.log(`Linha: ${linhaNum} | ${gbAntigo}GB -> ${gbNovo}GB | R$ ${valorAntigo} -> R$ ${valorNovo} (${sinalValor}R$ ${difValor})`);
            console.log(`  De:   ${planoAntigo}`);
            console.log(`  Para: ${planoNovo}\n`);
        }
        console.log("===============================================");

        const qtdLinhasNovas = linhasNovasConfirmadas.length;
        
        console.log(`\nQtd Linhas Novas Adicionadas: ${qtdLinhasNovas}`);
        console.log(`Receita Nova Simulada (Net Adds): R$ ${receitaNovaInjetada.toFixed(2)}`);

        if (qtdLinhasNovas > 0) {
            const resumoLinhas = linhasNovasConfirmadas.reduce((acc, curr) => {
                acc[curr.nome] = (acc[curr.nome] || 0) + 1;
                return acc;
            }, {} as Record<string, number>);
            console.log(`Mix de Planos Encaixados:`, resumoLinhas);
        }

        const gbBaseFinal = baseParaSimulacao.reduce((acc, b) => acc + b.gbAtual, 0);
        const gbFinalTotal = gbBaseFinal + gbLinhasNovas;
        const variacaoGb = gbFinalTotal - gbTotalAntes;
        const sinalGb = variacaoGb >= 0 ? '+' : '';
        
        console.log(`Troco Residual (Ideal para SVAs): R$ ${gapDisponivel.toFixed(2)}`);
        
        console.log(`=======================================`);
        console.log(`📊 RESUMO DA EXPERIÊNCIA DO CLIENTE:`);
        console.log(`Fatura Anterior: R$ ${fatAtualLinhas.toFixed(2)} -> Fatura Nova: R$ ${(fatAtualLinhas - gapDisponivel).toFixed(2)}`);
        console.log(`Franquia Anterior: ${gbTotalAntes} GB -> Nova Franquia: ${gbFinalTotal} GB (${sinalGb}${variacaoGb} GB)`);
        console.log(`=======================================\n`);

        // ================================================================
        // CONTINUAÇÃO: CÓDIGO DO BANCO DE DADOS
        // ================================================================

        const travel = await faturaService.getTravel(cnpj);
        const valorFaturaBruta = await faturaService.getValorFatura(cnpj);

        if (await FuncoesCalculoProposta.existeProposta(Number(empresa?.id))) {
            console.log("Empresa já tem proposta");
            return;
        }

        propostaMovelRepository.insert({
            empresa_id: Number(empresa?.id),
            cluster: clusterConta.toString(),
            fatura_atual_movel: fatAtualLinhas.toFixed(2).toString(),
            fatura_limite_movel: limiteInferior.toFixed(2).toString(),
            gap_alvo: gapAlvo.toFixed(2).toString(),
            percentual_limite: percentualMaximoConta.toFixed(2).toString(),
            fatura_bruta_movel: valorFaturaBruta.toFixed(2).toString(),
            mMedio: FuncoesCalculoProposta.calcularMediaM(linhasMoveis).toFixed(2).toString(),
            sva: false,
            travel: travel,
            // 💡 DICA: Você precisará adicionar essas colunas no seu banco/repository depois:
            // linhas_novas_potencial: qtdLinhasNovas,
            // receita_nova_potencial: receitaNovaInjetada.toFixed(2),
        })
    }
}

CalculoProposta();