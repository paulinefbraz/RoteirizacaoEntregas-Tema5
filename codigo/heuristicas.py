"""Heurísticas: linha reta (admissível) e sua versão multiplicada por k (superestima se k > 1)."""
import math


def h_linha_reta(instancia, estado):
    # Distância euclidiana até o destino; admissível e consistente porque toda rua mede >= a linha reta.
    coordenadas = instancia["coordenadas"]
    return math.dist(coordenadas[estado], coordenadas[instancia["destino"]])


def fabricar_h_superestimada(k):
    # Devolve h(n) = k * linha reta; para k > 1 deixa de ser admissível e a otimalidade some.
    def h_superestimada(instancia, estado):
        # Multiplica a linha reta por k para o estado dado.
        return k * h_linha_reta(instancia, estado)
    return h_superestimada
