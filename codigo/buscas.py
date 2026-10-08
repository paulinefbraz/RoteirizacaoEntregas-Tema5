"""Busca em largura e busca melhor-primeiro (custo uniforme, A* e gulosa) sobre a malha viária."""
import heapq
import itertools
from collections import deque
from dataclasses import dataclass

from grafo import custo_do_caminho, sucessores
from metricas import Metricas

LIMITE_EXPANSOES_PADRAO = 100_000


@dataclass
class ResultadoBusca:
    # Retorno padronizado de toda busca: caminho, custo, status e métricas.
    caminho: list
    custo: float
    status: str
    metricas: Metricas

    @property
    def passos(self):
        # Número de ruas percorridas (None quando não há caminho).
        return None if self.caminho is None else len(self.caminho) - 1


def reconstruir_caminho(pais, estado_final):
    # Segue `pais` do objetivo até a origem e inverte, devolvendo a rota em ordem.
    caminho = []
    while estado_final is not None:
        caminho.append(estado_final)
        estado_final = pais[estado_final]
    return caminho[::-1]


def _sucesso(instancia, pais, estado, metricas):
    # Monta o resultado de sucesso a partir do objetivo alcançado.
    caminho = reconstruir_caminho(pais, estado)
    return ResultadoBusca(caminho, custo_do_caminho(instancia, caminho), "sucesso", metricas)


def _encerrar(status, metricas):
    # Monta o resultado sem caminho (sem_solucao ou limite_atingido).
    return ResultadoBusca(None, None, status, metricas)


def _origem_igual_destino(instancia, metricas):
    # Caso-limite: origem = destino devolve [origem] com custo 0 e nenhuma expansão.
    metricas.nos_gerados = 1
    return ResultadoBusca([instancia["origem"]], 0.0, "sucesso", metricas)


def busca_em_largura(instancia, limite_expansoes=LIMITE_EXPANSOES_PADRAO, rastrear=False):
    # Não informada: fronteira FIFO (deque), teste de objetivo na geração, menor número de ruas.
    origem, destino = instancia["origem"], instancia["destino"]
    metricas = Metricas(rastrear)
    if origem == destino:
        return _origem_igual_destino(instancia, metricas)
    fronteira, descobertos, pais = deque([origem]), {origem}, {origem: None}
    metricas.contar_gerado(fronteira, origem)
    while fronteira:
        estado = fronteira.popleft()
        if not metricas.contar_expandido(estado, fronteira, limite_expansoes):
            return _encerrar("limite_atingido", metricas)
        for vizinho, _ in sucessores(instancia, estado):
            if vizinho not in descobertos:
                descobertos.add(vizinho)
                pais[vizinho] = estado
                fronteira.append(vizinho)
                metricas.contar_gerado(fronteira, vizinho)
                if vizinho == destino:
                    return _sucesso(instancia, pais, vizinho, metricas)
    return _encerrar("sem_solucao", metricas)


def busca_melhor_primeiro(instancia, prioridade, limite_expansoes=LIMITE_EXPANSOES_PADRAO, rastrear=False):
    # Busca genérica com heap: custo uniforme, A* e gulosa diferem só em `prioridade(estado, g)`.
    origem, destino = instancia["origem"], instancia["destino"]
    metricas = Metricas(rastrear)
    if origem == destino:
        return _origem_igual_destino(instancia, metricas)
    contador = itertools.count(1)
    fronteira = [(prioridade(origem, 0.0), 0, 0.0, origem)]
    melhor_g, pais = {origem: 0.0}, {origem: None}
    metricas.contar_gerado(fronteira, fronteira[0])
    while fronteira:
        _, _, g, estado = heapq.heappop(fronteira)
        if g > melhor_g[estado]:
            continue
        if estado == destino:
            return _sucesso(instancia, pais, estado, metricas)
        if not metricas.contar_expandido(estado, fronteira, limite_expansoes):
            return _encerrar("limite_atingido", metricas)
        for vizinho, d in sucessores(instancia, estado):
            g_novo = melhor_g[estado] + d
            if vizinho not in melhor_g or g_novo < melhor_g[vizinho]:
                melhor_g[vizinho], pais[vizinho] = g_novo, estado
                entrada = (prioridade(vizinho, g_novo), next(contador), g_novo, vizinho)
                heapq.heappush(fronteira, entrada)
                metricas.contar_gerado(fronteira, entrada)
    return _encerrar("sem_solucao", metricas)


def busca_custo_uniforme(instancia, **opcoes):
    # Custo uniforme: prioridade = g (custo acumulado).
    return busca_melhor_primeiro(instancia, lambda estado, g: g, **opcoes)


def busca_a_estrela(instancia, heuristica, **opcoes):
    # A*: prioridade = g + h.
    return busca_melhor_primeiro(instancia, lambda estado, g: g + heuristica(instancia, estado), **opcoes)


def busca_gulosa(instancia, heuristica, **opcoes):
    # Gulosa: prioridade = h (ignora o custo acumulado).
    return busca_melhor_primeiro(instancia, lambda estado, g: heuristica(instancia, estado), **opcoes)
