# N1 Agentes e Busca — Tema 5: Roteirização de entregas urbanas

Malha viária como grafo dirigido: cruzamentos são estados, ruas são arcos com distância, ruas de mão única viram um único arco e ruas bloqueadas existem no mapa mas não podem ser usadas. Estratégias: busca em largura (não informada) e busca melhor-primeiro (custo uniforme e A\*, mais gulosa opcional). Exigência extra do tema: comparar a heurística admissível (linha reta) com versões que superestimam (k × linha reta) e medir o efeito na otimalidade.


## 1. Integrantes

| Nome | Papel |
|---|---|
| Pauline Fernandes Braz | Modelo do grafo, instâncias e gerador (`grafo.py`, `gerador.py`) |
| Miguel Da Silveira Palhares Leite | Algoritmos de busca e heurísticas (`buscas.py, heuristicas.py`) |
| Nathan David Oliveira da Rocha | Métricas, experimentos, interface/CLI e coordenação  (`metricas.py`, `experimentos.py`, `main.py`) |

Professor: Aldo Henrique Mendes.


**Apresentação 3D interativa:** abra `apresentacao/index.html` no Chrome ou Edge (duplo clique, funciona offline. 12 slides com animações que reproduzem passo a passo os rastros reais das buscas. Teclas: `→`/`←` passo ou slide, `espaço` reproduz, `R` reinicia, `F` tela cheia.

## 2. Como executar

Requer Python ≥ 3.10. A busca usa só a biblioteca padrão; `matplotlib` é opcional e serve apenas para as figuras do `experimentos.py`.

```bash
python main.py --instancia instancias/i1_pequena.json --busca largura
python main.py --instancia instancias/i1_pequena.json --busca custo_uniforme
python main.py --instancia instancias/i1_pequena.json --busca a_estrela
python main.py --instancia instancias/i1_pequena.json --busca a_estrela --heuristica superestimada --k 3
python main.py --instancia instancias/i1_pequena.json --busca a_estrela --rastrear   # fronteira a cada iteração
python main.py --instancia instancias/i4_sem_solucao.json --busca a_estrela          # sem solução
python testes.py                                                                     # 17 testes
pip install matplotlib                                                               # só para as figuras
python experimentos.py                                                               # recria resultados/
python gerador.py                                                                    # regenera i2, i3 e i4
```

Opções do `main.py`: `--busca {largura,custo_uniforme,a_estrela,gulosa}`, `--heuristica {linha_reta,superestimada}`, `--k` (fator da superestimada, padrão 2), `--limite-expansoes` (padrão 100 000), `--rastrear`.

Saída (exemplo real):

```
Instância : i1_pequena   Origem: S   Destino: G
Estratégia: A* (h = linha reta)
Status    : sucesso
Caminho   : S → A → B → G
Custo     : 5.0   Passos: 3
Gerados   : 8     Expandidos: 5   Máx. fronteira: 3   Tempo: 0.01 ms
```

## 3. PEAS e classificação do ambiente

| | Tema 5 |
|---|---|
| **P** (desempenho) | Chegar ao cruzamento de destino percorrendo a menor distância total; nunca usar rua bloqueada nem andar contra o sentido; tempo de cálculo da rota. |
| **E** (ambiente) | Malha viária: cruzamentos com coordenadas, ruas com distância, sentido (mão única/dupla) e estado de bloqueio. |
| **A** (atuadores) | Escolher a próxima rua a seguir a partir do cruzamento atual; emitir a rota final ao entregador. |
| **S** (sensores) | Mapa completo (grafo), cruzamento atual, coordenadas do destino, lista de bloqueios informada antes do cálculo. |

Ambiente: **totalmente observável** (mapa e bloqueios conhecidos antes de planejar), **agente único**, **determinístico** (seguir uma rua leva sempre ao mesmo cruzamento), **sequencial** (cada escolha afeta as seguintes), **estático** (o mapa não muda durante o cálculo), **discreto** (finitos cruzamentos e ruas) e **conhecido** (o efeito de cada ação é dado pelo mapa). Isso é premissa de modelagem: no trânsito real o ambiente seria dinâmico e parcialmente observável.

## 4. Formulação

1. **Estados:** um cruzamento, identificado por `str` (ex.: `"S"`, `"C_3_4"`). Espaço = |V|.
2. **Estado inicial:** `origem` da instância.
3. **Função sucessora:** `sucessores(instancia, estado) → [(vizinho, distancia), ...]`, só arcos que saem de `estado` e que não estão em `bloqueadas`. O sentido de circulação está em quais arcos existem.
4. **Teste de objetivo:** `estado == destino`. Na largura o teste é na geração; em custo uniforme/A\*/gulosa é na retirada da fronteira.
5. **Custo de caminho:** soma das distâncias das ruas percorridas (passo > 0).

Heurística: distância em linha reta ao destino. É admissível e consistente porque `validar_instancia` garante que toda rua mede pelo menos a linha reta entre as pontas (desigualdade triangular). Superestimada: `h × k`, `k > 1`.

Métricas (definições fechadas em `metricas.py`):

| Métrica | Definição |
|---|---|
| `gerados` | inserções na fronteira, incluindo o inicial. Reinserir um estado com `g` menor conta de novo; na largura o objetivo entra na fronteira antes do retorno. |
| `expandidos` | estados retirados da fronteira cujos sucessores foram gerados (entradas obsoletas e o objetivo retirado não contam) |
| `custo` | soma das distâncias do caminho devolvido |
| `passos` | `len(caminho) - 1` |
| `tempo_ms` | `time.perf_counter()`, mediana de 5 execuções |
| `max_fronteira` | maior tamanho da fronteira durante a busca |

## 5. Instâncias e semente

| Instância | Tamanho | Origem | Semente | Observação |
|---|---|---|---|---|
| `i1_pequena` | 7 cruzamentos, escrita à mão | S | — | oráculo: valores calculados à mão viram os asserts do `testes.py` |
| `i2_media` | grade 6×6 (36) | C_0_0 | **43** | semente 42 não gerou caminho; a BFS aceitou a 43 |
| `i3_grande` | grade 20×20 (400) | C_0_0 | 42 | |
| `i4_sem_solucao` | grade 10×10 (100) | C_0_0 | 42 | destino `C_9_9` só tem ruas mão única **saindo** dele |

Gerador: `random.Random(semente)` (nunca o `random` global), espaçamento de 100 m com deslocamento aleatório de ±10, distância = linha reta × `uniforme(1.0, 1.3)` **arredondada para cima**, 30 % de ruas de mão única, 10 % bloqueadas. As instâncias são versionadas em JSON e o experimento lê os arquivos, não regenera.

## 6. Resultados (gerados por `experimentos.py`, em `codigo/resultados/`)

Instância i1 (bate com o cálculo à mão):

| Estratégia | Caminho | Custo | Ótimo? | Expandidos |
|---|---|---|---|---|
| Largura | S → M → G | 8.0 | não | 2 |
| Custo uniforme | S → A → B → G | 5.0 | sim | 6 |
| A\* (h) | S → A → B → G | 5.0 | sim | 5 |
| A\* (h×2) | S → A → B → G | 5.0 | sim | 4 |
| A\* (h×3) | S → M → G | 8.0 | **não** | 2 |

Superestimar tira a garantia, não necessariamente o acerto: na i1 o limiar é k ≈ 2,06. Nas instâncias grandes, aumentar k reduz os expandidos e sobe o custo (i3: k=1 → 304 expandidos, custo/ótimo 1,00; k=3 → 39 expandidos, 1,04). Tabelas completas em `resultados/tabela.md` e `resultados/varredura_k.md`; figuras `mapa_i1.png`, `expandidos_por_estrategia.png` e `varredura_k.png`. O tempo varia de máquina para máquina; os demais números são determinísticos.

## 7. Divisão de autoria

| Integrante | Arquivos / funções |
|---|---|
| Pauline Fernandes Braz | `grafo.py` (`carregar_instancia`, `montar_instancia`, `validar_instancia`, `sucessores`, `custo_do_caminho`), `gerador.py` (`gerar_grade`, `gerar_instancia_com_caminho`), `instancias/*.json` | 
|  Miguel Da Silveira Palhares Leite | `buscas.py` (`busca_em_largura`, `busca_melhor_primeiro`, `reconstruir_caminho`, `ResultadoBusca`, invólucros custo uniforme/A*/gulosa) `heuristicas.py` (h_linha_reta, fabricar_h_superestimada) |
| Nathan David Oliveira da Rocha | `metricas.py` (`Metricas`, `cronometrar`), `experimentos.py`, `main.py`, (slides) |
| Todos | `testes.py`, `documentos/` (artigo), este README | 
