"""Linha de comando: roda uma busca sobre uma instância e imprime o resultado de forma legível."""
import argparse
import sys

from buscas import (LIMITE_EXPANSOES_PADRAO, busca_a_estrela, busca_custo_uniforme,
                    busca_em_largura, busca_gulosa)
from grafo import carregar_instancia
from heuristicas import fabricar_h_superestimada, h_linha_reta
from metricas import cronometrar


def _ler_argumentos():
    # Define e lê as opções da linha de comando.
    analisador = argparse.ArgumentParser(description="Roteirização de entregas urbanas por busca em grafo.")
    analisador.add_argument("--instancia", required=True, help="arquivo JSON da instância")
    analisador.add_argument("--busca", required=True,
                            choices=["largura", "custo_uniforme", "a_estrela", "gulosa"])
    analisador.add_argument("--heuristica", choices=["linha_reta", "superestimada"], default="linha_reta")
    analisador.add_argument("--k", type=float, default=2.0, help="fator da heurística superestimada (k > 0)")
    analisador.add_argument("--limite-expansoes", type=int, default=LIMITE_EXPANSOES_PADRAO)
    analisador.add_argument("--rastrear", action="store_true", help="imprime a fronteira a cada iteração")
    argumentos = analisador.parse_args()
    if argumentos.k <= 0 or argumentos.limite_expansoes < 0:
        analisador.error("--k deve ser > 0 e --limite-expansoes deve ser >= 0")
    return argumentos


def _montar_busca(argumentos, instancia):
    # Devolve (rótulo, função que roda a busca escolhida com as opções dadas).
    opcoes = {"limite_expansoes": argumentos.limite_expansoes}
    if argumentos.heuristica == "superestimada":
        heuristica, rotulo_h = fabricar_h_superestimada(argumentos.k), f"{argumentos.k:g} × linha reta"
    else:
        heuristica, rotulo_h = h_linha_reta, "linha reta"
    if argumentos.busca == "largura":
        return "Largura", lambda rastrear=False: busca_em_largura(instancia, rastrear=rastrear, **opcoes)
    if argumentos.busca == "custo_uniforme":
        return "Custo uniforme", lambda rastrear=False: busca_custo_uniforme(instancia, rastrear=rastrear, **opcoes)
    if argumentos.busca == "gulosa":
        return (f"Gulosa (h = {rotulo_h})",
                lambda rastrear=False: busca_gulosa(instancia, heuristica, rastrear=rastrear, **opcoes))
    return (f"A* (h = {rotulo_h})",
            lambda rastrear=False: busca_a_estrela(instancia, heuristica, rastrear=rastrear, **opcoes))


def _formatar_entrada(entrada):
    # Escreve uma entrada da fronteira: estado puro (largura) ou estado com g e f (heap).
    if isinstance(entrada, tuple):
        f, _, g, estado = entrada
        return f"{estado}(g={g:.2f}, f={f:.2f})"
    return str(entrada)


def _imprimir_rastro(rastro):
    # Mostra a cada iteração o estado que saiu, a fronteira que restou e o que entrou em seguida.
    passo = 0
    print("Rastro da fronteira:")
    print("  início")
    for evento in rastro:
        if evento[0] == "sai":
            passo += 1
            restante = ", ".join(_formatar_entrada(e) for e in evento[2])
            print(f"  {passo:>2}. sai {evento[1]}   fronteira restante: [{restante}]")
        else:
            print(f"        entra {_formatar_entrada(evento[1])}")
    print()


def _imprimir_resultado(instancia, rotulo, resultado):
    # Imprime instância, estratégia, status, caminho e métricas no formato do enunciado.
    m = resultado.metricas
    print(f"Instância : {instancia['nome']}   Origem: {instancia['origem']}   Destino: {instancia['destino']}")
    print(f"Estratégia: {rotulo}")
    print(f"Status    : {resultado.status}")
    if resultado.caminho is None:
        print("Caminho   : —")
        print("Custo     : —   Passos: —")
    else:
        print(f"Caminho   : {' → '.join(resultado.caminho)}")
        print(f"Custo     : {round(resultado.custo, 3)}   Passos: {resultado.passos}")
    print(f"Gerados   : {m.nos_gerados}     Expandidos: {m.nos_expandidos}   "
          f"Máx. fronteira: {m.max_fronteira}   Tempo: {m.tempo_ms:.2f} ms")


def principal():
    # Lê argumentos, carrega a instância (erros viram mensagem amigável), roda a busca e imprime.
    for fluxo in (sys.stdout, sys.stderr):
        fluxo.reconfigure(encoding="utf-8")
    argumentos = _ler_argumentos()
    try:
        instancia = carregar_instancia(argumentos.instancia)
    except OSError as erro:
        print(f"Erro: não foi possível ler '{argumentos.instancia}' ({erro.strerror}).", file=sys.stderr)
        return 1
    except ValueError as erro:  # inclui JSON malformado (JSONDecodeError)
        print(f"Erro: instância inválida em '{argumentos.instancia}': {erro}", file=sys.stderr)
        return 1
    rotulo, executar = _montar_busca(argumentos, instancia)
    if argumentos.rastrear:
        _imprimir_rastro(executar(rastrear=True).metricas.rastro)
    _imprimir_resultado(instancia, rotulo, cronometrar(executar))
    return 0


if __name__ == "__main__":
    sys.exit(principal())
