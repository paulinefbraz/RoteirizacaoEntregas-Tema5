"""Gera malhas em grade com semente fixa e grava as instâncias i2, i3 e i4 em JSON."""
import json
import math
import random
from pathlib import Path

from buscas import busca_em_largura
from grafo import montar_instancia

ESPACAMENTO = 100.0
DESLOCAMENTO_MAXIMO = 10.0
PASTA_INSTANCIAS = Path(__file__).parent / "instancias"


def _id_cruzamento(linha, coluna):
    # Nome do cruzamento na grade, por exemplo "C_3_4".
    return f"C_{linha}_{coluna}"


def gerar_grade(linhas, colunas, semente=42, prob_mao_unica=0.3, prob_bloqueio=0.1,
                destino_isolado=False, nome="grade"):
    # Monta uma malha linhas x colunas (origem no canto 0,0, destino no canto oposto) com `random.Random(semente)`.
    sorteio = random.Random(semente)
    cruzamentos = {}
    for linha in range(linhas):
        for coluna in range(colunas):
            x = coluna * ESPACAMENTO + round(sorteio.uniform(-DESLOCAMENTO_MAXIMO, DESLOCAMENTO_MAXIMO), 1)
            y = linha * ESPACAMENTO + round(sorteio.uniform(-DESLOCAMENTO_MAXIMO, DESLOCAMENTO_MAXIMO), 1)
            cruzamentos[_id_cruzamento(linha, coluna)] = [x, y]
    origem = _id_cruzamento(0, 0)
    destino = _id_cruzamento(linhas - 1, colunas - 1)
    ruas, bloqueadas = [], []
    for linha in range(linhas):
        for coluna in range(colunas):
            for vizinho in ((linha, coluna + 1), (linha + 1, coluna)):
                if vizinho[0] < linhas and vizinho[1] < colunas:
                    de, para = _id_cruzamento(linha, coluna), _id_cruzamento(*vizinho)
                    rua = _sortear_rua(sorteio, cruzamentos, de, para, prob_mao_unica, prob_bloqueio)
                    if destino_isolado and destino in (de, para):
                        rua["de"], rua["para"] = destino, (de if para == destino else para)
                        rua["mao_unica"], rua["bloqueada"] = True, False
                    ruas.append(rua)
    for rua in ruas:
        if rua.pop("bloqueada"):
            bloqueadas.append([rua["de"], rua["para"]])
    return {"nome": nome, "semente": semente, "origem": origem, "destino": destino,
            "cruzamentos": cruzamentos, "ruas": ruas, "bloqueadas": bloqueadas}


def _sortear_rua(sorteio, cruzamentos, de, para, prob_mao_unica, prob_bloqueio):
    # Sorteia distância (linha reta x fator, arredondada PARA CIMA), sentido e bloqueio de uma rua.
    fator = sorteio.uniform(1.0, 1.3)
    mao_unica = sorteio.random() < prob_mao_unica
    inverter = sorteio.random() < 0.5
    bloqueada = sorteio.random() < prob_bloqueio
    distancia = math.ceil(math.dist(cruzamentos[de], cruzamentos[para]) * fator * 10) / 10
    if mao_unica and inverter:
        de, para = para, de
    return {"de": de, "para": para, "distancia": distancia, "mao_unica": mao_unica, "bloqueada": bloqueada}


def gerar_instancia_com_caminho(nome, linhas, colunas, semente_inicial=42):
    # Tenta sementes consecutivas até a BFS confirmar que existe caminho origem -> destino.
    for semente in range(semente_inicial, semente_inicial + 200):
        dados = gerar_grade(linhas, colunas, semente=semente, nome=nome)
        if busca_em_largura(montar_instancia(dados)).status == "sucesso":
            return dados
    raise RuntimeError(f"nenhuma semente a partir de {semente_inicial} gerou {nome} com solução")


def salvar_instancia(dados, caminho):
    # Grava a instância em JSON de forma determinística (mesma semente, arquivo idêntico).
    with open(caminho, "w", encoding="utf-8", newline="\n") as arquivo:
        json.dump(dados, arquivo, indent=1, ensure_ascii=False)
        arquivo.write("\n")


def gerar_todas(pasta=PASTA_INSTANCIAS):
    # Gera e salva i2 (6x6), i3 (20x20) e i4 (10x10, destino só com ruas saindo dele).
    pasta = Path(pasta)
    pasta.mkdir(parents=True, exist_ok=True)
    instancias = [
        gerar_instancia_com_caminho("i2_media", 6, 6),
        gerar_instancia_com_caminho("i3_grande", 20, 20),
        gerar_grade(10, 10, semente=42, destino_isolado=True, nome="i4_sem_solucao"),
    ]
    for dados in instancias:
        salvar_instancia(dados, pasta / f"{dados['nome']}.json")
        print(f"{dados['nome']}: semente {dados['semente']}, {len(dados['cruzamentos'])} cruzamentos")


if __name__ == "__main__":
    gerar_todas()
