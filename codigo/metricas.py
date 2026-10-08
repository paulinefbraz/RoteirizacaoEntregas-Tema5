"""Contadores, rastro e cronometragem das buscas."""
import time
from statistics import median


class Metricas:
    # Contadores da busca (gerados, expandidos, maior fronteira) e rastro opcional passo a passo.
    def __init__(self, rastrear=False):
        # Zera os contadores; `rastrear` liga o registro de cada retirada e inserção.
        self.nos_gerados = 0
        self.nos_expandidos = 0
        self.max_fronteira = 0
        self.tempo_ms = 0.0
        self.rastrear = rastrear
        self.rastro = []

    def contar_gerado(self, fronteira, entrada):
        # Registra uma inserção na fronteira e atualiza o tamanho máximo dela.
        self.nos_gerados += 1
        self.max_fronteira = max(self.max_fronteira, len(fronteira))
        if self.rastrear:
            self.rastro.append(("entra", entrada))

    def contar_expandido(self, estado, fronteira, limite):
        # Conta a expansão de `estado`; devolve False, sem contar, se o limite de expansões já foi atingido.
        if self.nos_expandidos >= limite:
            return False
        self.nos_expandidos += 1
        if self.rastrear:
            instantaneo = sorted(fronteira) if isinstance(fronteira, list) else list(fronteira)
            self.rastro.append(("sai", estado, instantaneo))
        return True


def cronometrar(busca, repeticoes=5):
    # Roda `busca` várias vezes; devolve o último resultado com a mediana do tempo (ms) nas métricas.
    tempos = []
    for _ in range(repeticoes):
        inicio = time.perf_counter()
        resultado = busca()
        tempos.append((time.perf_counter() - inicio) * 1000)
    resultado.metricas.tempo_ms = median(tempos)
    return resultado
