"""Reproduz tudo: tabela comparativa, varredura de k e figuras em resultados/ (rodar uma única vez após o congelamento)."""
import csv
import math
import platform
import sys
from pathlib import Path

from buscas import busca_a_estrela, busca_custo_uniforme, busca_em_largura, busca_gulosa
from grafo import carregar_instancia
from heuristicas import fabricar_h_superestimada, h_linha_reta
from metricas import cronometrar

BASE = Path(__file__).parent
PASTA_INSTANCIAS = BASE / "instancias"
PASTA_RESULTADOS = BASE / "resultados"
NOMES_INSTANCIAS = ["i1_pequena", "i2_media", "i3_grande", "i4_sem_solucao"]
VALORES_K = [1.0, 1.5, 2.0, 3.0, 5.0]
REPETICOES = 5
TOLERANCIA = 1e-9


def montar_estrategias():
    # Lista (rótulo, função(instancia)) das estratégias que entram na tabela comparativa.
    return [
        ("Largura", busca_em_largura),
        ("Custo uniforme", busca_custo_uniforme),
        ("A* (h)", lambda i: busca_a_estrela(i, h_linha_reta)),
        ("A* (h×2)", lambda i: busca_a_estrela(i, fabricar_h_superestimada(2))),
        ("A* (h×3)", lambda i: busca_a_estrela(i, fabricar_h_superestimada(3))),
        ("Gulosa (h)", lambda i: busca_gulosa(i, h_linha_reta)),
    ]


def _linha_da_tabela(nome, rotulo, resultado, custo_otimo):
    # Converte um resultado de busca em uma linha (dict) da tabela, marcando se o custo é ótimo.
    m = resultado.metricas
    if resultado.custo is None:
        otimo = "—"
    else:
        otimo = "sim" if resultado.custo <= custo_otimo + TOLERANCIA else "não"
    return {"instancia": nome, "estrategia": rotulo, "status": resultado.status,
            "custo": "" if resultado.custo is None else round(resultado.custo, 2),
            "passos": "" if resultado.passos is None else resultado.passos,
            "gerados": m.nos_gerados, "expandidos": m.nos_expandidos,
            "max_fronteira": m.max_fronteira, "tempo_ms": round(m.tempo_ms, 3), "otimo": otimo}


def rodar_tabela(instancias):
    # Roda cada estratégia em cada instância (5 repetições, mediana do tempo) e devolve as linhas da tabela.
    linhas = []
    for nome, instancia in instancias.items():
        custo_otimo = busca_custo_uniforme(instancia).custo
        custo_otimo = math.inf if custo_otimo is None else custo_otimo
        for rotulo, estrategia in montar_estrategias():
            resultado = cronometrar(lambda: estrategia(instancia), REPETICOES)
            linhas.append(_linha_da_tabela(nome, rotulo, resultado, custo_otimo))
    return linhas


def rodar_varredura_k(instancias):
    # Varre k em A* com h×k nas instâncias com solução: custo, custo/ótimo e nós expandidos.
    linhas = []
    for nome, instancia in instancias.items():
        custo_otimo = busca_custo_uniforme(instancia).custo
        if custo_otimo is None:
            continue
        for k in VALORES_K:
            resultado = busca_a_estrela(instancia, fabricar_h_superestimada(k))
            linhas.append({"instancia": nome, "k": k, "status": resultado.status,
                           "custo": round(resultado.custo, 2),
                           "custo_sobre_otimo": round(resultado.custo / custo_otimo, 4),
                           "gerados": resultado.metricas.nos_gerados,
                           "expandidos": resultado.metricas.nos_expandidos})
    return linhas


def gravar_csv(linhas, caminho):
    # Grava a lista de dicts como CSV com cabeçalho.
    with open(caminho, "w", encoding="utf-8", newline="") as arquivo:
        escritor = csv.DictWriter(arquivo, fieldnames=list(linhas[0]))
        escritor.writeheader()
        escritor.writerows(linhas)


def gravar_markdown(linhas, caminho):
    # Grava a lista de dicts como tabela Markdown (vai direto para o artigo).
    colunas = list(linhas[0])
    texto = ["| " + " | ".join(colunas) + " |", "|" + "|".join("---" for _ in colunas) + "|"]
    texto += ["| " + " | ".join(str(linha[c]) for c in colunas) + " |" for linha in linhas]
    Path(caminho).write_text("\n".join(texto) + "\n", encoding="utf-8")


def descrever_ambiente():
    # Texto com versão do Python, sistema operacional e processador (vai para a Metodologia).
    return (f"Python {platform.python_version()} | {platform.platform()} | "
            f"processador: {platform.processor() or 'não informado'} | repetições por medida: {REPETICOES}")


def gerar_figuras(instancias, tabela, varredura):
    # Gera mapa_i1.png, expandidos_por_estrategia.png e varredura_k.png (só aqui entra o matplotlib).
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except ImportError:
        print("matplotlib não instalado: figuras não geradas (pip install matplotlib).")
        return
    _figura_mapa_i1(instancias["i1_pequena"], plt)
    _figura_expandidos(tabela, plt)
    _figura_varredura(varredura, plt)


def _curvatura(p, q, distancia):
    # Curva o arco quando a rua é bem mais longa que a linha reta (avenida sinuosa).
    return -0.45 if distancia > 1.5 * math.dist(p, q) else 0.0


def _desenhar_arco(ax, p, q, curva, estilo):
    # Desenha a seta p -> q com o estilo dado (cor, espessura, tipo de ponta).
    ax.annotate("", xy=q, xytext=p, zorder=estilo.get("z", 1),
                arrowprops=dict(arrowstyle=estilo["seta"], color=estilo["cor"], lw=estilo["lw"],
                                alpha=estilo.get("alpha", 1), linestyle=estilo.get("linha", "-"),
                                shrinkA=11, shrinkB=11, connectionstyle=f"arc3,rad={curva}"))


def _ponto_do_rotulo(p, q, curva):
    # Ponto médio da curva (Bézier quadrática do matplotlib) para pôr o valor da distância.
    dx, dy = q[0] - p[0], q[1] - p[1]
    return (p[0] + dx / 2 + curva / 2 * dy, p[1] + dy / 2 - curva / 2 * dx)


def _figura_mapa_i1(instancia, plt):
    # Desenha o grafo da i1 com o caminho ótimo (A*) e o caminho da h×3 destacados.
    from matplotlib.lines import Line2D
    ax = plt.subplots(figsize=(9, 5))[1]
    coordenadas, bloqueadas = instancia["coordenadas"], instancia["bloqueadas"]
    for rua in instancia["ruas"]:
        p, q = coordenadas[rua["de"]], coordenadas[rua["para"]]
        bloqueada = (rua["de"], rua["para"]) in bloqueadas
        estilo = {"seta": "->" if rua["mao_unica"] else "<->", "cor": "red" if bloqueada else "0.35",
                  "lw": 1.3, "linha": "--" if bloqueada else "-"}
        curva = _curvatura(p, q, rua["distancia"])
        _desenhar_arco(ax, p, q, curva, estilo)
        x, y = _ponto_do_rotulo(p, q, curva)
        ax.text(x, y + 0.07, f"{rua['distancia']:g}", fontsize=8, ha="center", color="0.15")
    caminhos = ((busca_a_estrela(instancia, h_linha_reta).caminho, "tab:green"),
                (busca_a_estrela(instancia, fabricar_h_superestimada(3)).caminho, "tab:orange"))
    for caminho, cor in caminhos:
        for a, b in zip(caminho, caminho[1:]):
            curva = _curvatura(coordenadas[a], coordenadas[b], instancia["distancias"][(a, b)])
            _desenhar_arco(ax, coordenadas[a], coordenadas[b], curva,
                           {"seta": "-|>", "cor": cor, "lw": 4, "alpha": 0.55, "z": 0})
    for nome, (x, y) in coordenadas.items():
        cor = "gold" if nome in (instancia["origem"], instancia["destino"]) else "white"
        ax.scatter([x], [y], s=520, c=cor, edgecolors="black", zorder=3)
        ax.text(x, y, nome, ha="center", va="center", fontweight="bold", zorder=4)
    ax.legend(handles=[Line2D([0], [0], color="tab:green", lw=4, label="A* com h (ótimo, custo 5)"),
                       Line2D([0], [0], color="tab:orange", lw=4, label="A* com h×3 (custo 8)"),
                       Line2D([0], [0], color="red", ls="--", label="rua bloqueada (A–G)")],
              loc="lower center", ncol=3, fontsize=8, frameon=False, bbox_to_anchor=(0.5, -0.1))
    ax.set_title("Instância i1: mão única (seta simples), mão dupla (seta dupla) e bloqueio")
    ax.set_aspect("equal")
    ax.axis("off")
    plt.savefig(PASTA_RESULTADOS / "mapa_i1.png", dpi=150, bbox_inches="tight")
    plt.close()


def _figura_expandidos(tabela, plt):
    # Barras agrupadas: nós expandidos por instância e estratégia (escala log).
    estrategias = [rotulo for rotulo, _ in montar_estrategias()]
    instancias = list(dict.fromkeys(linha["instancia"] for linha in tabela))
    largura = 0.8 / len(estrategias)
    plt.subplots(figsize=(10, 5))
    for i, rotulo in enumerate(estrategias):
        valores = [next(l["expandidos"] for l in tabela if l["instancia"] == inst and l["estrategia"] == rotulo)
                   for inst in instancias]
        plt.bar([x + i * largura for x in range(len(instancias))], valores, largura, label=rotulo)
    plt.xticks([x + 0.4 - largura / 2 for x in range(len(instancias))], instancias)
    plt.yscale("log")
    plt.ylabel("nós expandidos (escala log)")
    plt.title("Nós expandidos por estratégia")
    plt.legend(fontsize=8)
    plt.savefig(PASTA_RESULTADOS / "expandidos_por_estrategia.png", dpi=150, bbox_inches="tight")
    plt.close()


def _figura_varredura(varredura, plt):
    # Um painel por instância: k no eixo x, custo/ótimo (esquerda) e nós expandidos (direita).
    instancias = list(dict.fromkeys(linha["instancia"] for linha in varredura))
    figura, eixos = plt.subplots(1, len(instancias), figsize=(4.5 * len(instancias), 4))
    for ax, nome in zip(eixos, instancias):
        dados = [l for l in varredura if l["instancia"] == nome]
        ks = [l["k"] for l in dados]
        ax.plot(ks, [l["custo_sobre_otimo"] for l in dados], "o-", color="tab:red")
        ax.set_xlabel("k (h = k × linha reta)")
        ax.set_ylabel("custo / ótimo", color="tab:red")
        ax.set_title(nome)
        direito = ax.twinx()
        direito.plot(ks, [l["expandidos"] for l in dados], "s--", color="tab:blue")
        direito.set_ylabel("nós expandidos", color="tab:blue")
    figura.suptitle("Efeito de superestimar a heurística")
    figura.tight_layout()
    plt.savefig(PASTA_RESULTADOS / "varredura_k.png", dpi=150, bbox_inches="tight")
    plt.close()


def principal():
    # Executa o experimento completo e grava tudo em resultados/.
    PASTA_RESULTADOS.mkdir(exist_ok=True)
    ambiente = descrever_ambiente()
    print("Ambiente:", ambiente)
    instancias = {nome: carregar_instancia(PASTA_INSTANCIAS / f"{nome}.json") for nome in NOMES_INSTANCIAS}
    tabela = rodar_tabela(instancias)
    varredura = rodar_varredura_k(instancias)
    gravar_csv(tabela, PASTA_RESULTADOS / "tabela.csv")
    gravar_markdown(tabela, PASTA_RESULTADOS / "tabela.md")
    gravar_csv(varredura, PASTA_RESULTADOS / "varredura_k.csv")
    gravar_markdown(varredura, PASTA_RESULTADOS / "varredura_k.md")
    (PASTA_RESULTADOS / "ambiente.txt").write_text(ambiente + "\n", encoding="utf-8")
    gerar_figuras(instancias, tabela, varredura)
    print((PASTA_RESULTADOS / "tabela.md").read_text(encoding="utf-8"))
    print((PASTA_RESULTADOS / "varredura_k.md").read_text(encoding="utf-8"))


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    principal()
