"""Carga, validação e função sucessora da malha viária (grafo dirigido)."""
import json
import math

TOLERANCIA = 1e-9
CAMPOS_OBRIGATORIOS = ("origem", "destino", "cruzamentos", "ruas")


def carregar_instancia(caminho_arquivo):
    # Lê o arquivo JSON da instância e entrega o dicionário pronto para as buscas.
    with open(caminho_arquivo, encoding="utf-8") as arquivo:
        dados = json.load(arquivo)
    return montar_instancia(dados)


def montar_instancia(dados):
    # Valida os dados brutos e monta adjacencia, distancias, coordenadas e bloqueadas.
    if not isinstance(dados, dict):
        raise ValueError("a instância deve ser um objeto JSON")
    ausentes = [campo for campo in CAMPOS_OBRIGATORIOS if campo not in dados]
    if ausentes:
        raise ValueError(f"campo(s) ausente(s) na instância: {', '.join(ausentes)}")
    instancia = {
        "nome": dados.get("nome", "sem_nome"),
        "origem": dados["origem"],
        "destino": dados["destino"],
        "coordenadas": dados["cruzamentos"],
        "ruas": dados["ruas"],
        "bloqueadas": _bloqueios_nos_dois_sentidos(dados.get("bloqueadas", [])),
    }
    validar_instancia(instancia)
    _montar_adjacencia(instancia)
    return instancia


def _bloqueios_nos_dois_sentidos(pares):
    # Transforma cada bloqueio [a, b] em dois arcos proibidos, (a, b) e (b, a).
    bloqueadas = set()
    for par in pares:
        if not isinstance(par, (list, tuple)) or len(par) != 2:
            raise ValueError(f"bloqueio inválido (esperado [de, para]): {par!r}")
        bloqueadas.update({(par[0], par[1]), (par[1], par[0])})
    return bloqueadas


def validar_instancia(instancia):
    # Recusa origem/destino inexistentes, ruas inválidas e ruas menores que a linha reta.
    coordenadas = instancia["coordenadas"]
    if not isinstance(coordenadas, dict) or not coordenadas:
        raise ValueError("'cruzamentos' deve ser um objeto não vazio {id: [x, y]}")
    for id_cruzamento, ponto in coordenadas.items():
        if not (isinstance(ponto, (list, tuple)) and len(ponto) == 2
                and all(isinstance(v, (int, float)) for v in ponto)):
            raise ValueError(f"coordenada inválida no cruzamento '{id_cruzamento}': {ponto!r}")
    for papel in ("origem", "destino"):
        if instancia[papel] not in coordenadas:
            raise ValueError(f"{papel} '{instancia[papel]}' não existe entre os cruzamentos")
    for a, b in instancia["bloqueadas"]:
        if a not in coordenadas or b not in coordenadas:
            raise ValueError(f"bloqueio refere cruzamento inexistente: ({a}, {b})")
    if not isinstance(instancia["ruas"], list):
        raise ValueError("'ruas' deve ser uma lista")
    for rua in instancia["ruas"]:
        _validar_rua(coordenadas, rua)


def _validar_rua(coordenadas, rua):
    # Confere os campos da rua e a condição que garante a admissibilidade da linha reta.
    if not isinstance(rua, dict) or not {"de", "para", "distancia"} <= set(rua):
        raise ValueError(f"rua inválida (precisa de de/para/distancia): {rua!r}")
    de, para, distancia = rua["de"], rua["para"], rua["distancia"]
    if de not in coordenadas or para not in coordenadas:
        raise ValueError(f"rua refere cruzamento inexistente: {de} -> {para}")
    if not isinstance(distancia, (int, float)) or distancia <= 0:
        raise ValueError(f"distância deve ser positiva na rua {de} -> {para}: {distancia!r}")
    if distancia < math.dist(coordenadas[de], coordenadas[para]) - TOLERANCIA:
        raise ValueError(f"rua {de} -> {para} mais curta que a linha reta "
                         "(a heurística deixaria de ser admissível)")


def _montar_adjacencia(instancia):
    # Constrói a lista de adjacência: mão dupla vira dois arcos, mão única vira um só.
    adjacencia = {cruzamento: [] for cruzamento in instancia["coordenadas"]}
    distancias = {}
    for rua in instancia["ruas"]:
        distancia = float(rua["distancia"])
        arcos = [(rua["de"], rua["para"])]
        if not rua.get("mao_unica", False):
            arcos.append((rua["para"], rua["de"]))
        for de, para in arcos:
            adjacencia[de].append((para, distancia))
            distancias[(de, para)] = min(distancias.get((de, para), math.inf), distancia)
    instancia["adjacencia"] = adjacencia
    instancia["distancias"] = distancias


def sucessores(instancia, estado):
    # Função sucessora: ruas que saem de `estado`, exceto as bloqueadas.
    bloqueadas = instancia["bloqueadas"]
    return [(vizinho, d) for vizinho, d in instancia["adjacencia"][estado]
            if (estado, vizinho) not in bloqueadas]


def custo_do_caminho(instancia, caminho):
    # Soma as distâncias das ruas percorridas ao longo do caminho.
    distancias = instancia["distancias"]
    return sum(distancias[(a, b)] for a, b in zip(caminho, caminho[1:]))
