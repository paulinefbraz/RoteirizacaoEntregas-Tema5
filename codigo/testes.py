"""Testes com asserts: valores calculados à mão para a i1, invariantes das demais instâncias e regras do projeto."""
import ast
import json
import subprocess
import sys
import tempfile
from pathlib import Path

from buscas import (busca_a_estrela, busca_custo_uniforme, busca_em_largura, busca_gulosa,
                    reconstruir_caminho)
from gerador import gerar_grade
from grafo import carregar_instancia, montar_instancia, sucessores
from heuristicas import fabricar_h_superestimada, h_linha_reta

BASE = Path(__file__).parent
PASTA_INSTANCIAS = BASE / "instancias"
IMPORTS_PERMITIDOS = {"argparse", "ast", "collections", "csv", "dataclasses", "heapq", "itertools", "json",
                      "math", "pathlib", "platform", "random", "statistics", "subprocess", "sys", "tempfile", "time",
                      "buscas", "experimentos", "gerador", "grafo", "heuristicas", "main", "metricas",
                      "matplotlib"}


def carregar(nome):
    # Carrega uma das instâncias versionadas pelo nome do arquivo.
    return carregar_instancia(PASTA_INSTANCIAS / f"{nome}.json")


def testar_i1_valores_calculados_a_mao():
    # Confere caminho, custo e passos da tabela 1.5 do plano para cada estratégia.
    i1 = carregar("i1_pequena")
    esperado = [
        (busca_em_largura(i1), ["S", "M", "G"], 8.0),
        (busca_custo_uniforme(i1), ["S", "A", "B", "G"], 5.0),
        (busca_a_estrela(i1, h_linha_reta), ["S", "A", "B", "G"], 5.0),
        (busca_a_estrela(i1, fabricar_h_superestimada(2)), ["S", "A", "B", "G"], 5.0),
        (busca_a_estrela(i1, fabricar_h_superestimada(3)), ["S", "M", "G"], 8.0),
        (busca_gulosa(i1, h_linha_reta), ["S", "M", "G"], 8.0),
    ]
    for resultado, caminho, custo in esperado:
        assert resultado.status == "sucesso"
        assert resultado.caminho == caminho, (resultado.caminho, caminho)
        assert abs(resultado.custo - custo) < 1e-9
        assert resultado.passos == len(caminho) - 1


def testar_i1_metricas_do_a_estrela():
    # A* com h na i1: 5 expandidos (S, M, A, C, B) e 8 inserções (G entra duas vezes).
    m = busca_a_estrela(carregar("i1_pequena"), h_linha_reta).metricas
    assert (m.nos_gerados, m.nos_expandidos) == (8, 5)
    assert m.nos_gerados >= m.nos_expandidos


def testar_i1_limiar_de_k():
    # Superestimar tira a garantia, não necessariamente o acerto: k=2 acerta, k=3 erra (limiar ~ 2,06).
    i1 = carregar("i1_pequena")
    assert busca_a_estrela(i1, fabricar_h_superestimada(2.05)).custo == 5.0
    assert busca_a_estrela(i1, fabricar_h_superestimada(2.1)).custo == 8.0


def testar_sucessores_respeitam_sentido_e_bloqueio():
    # A–G bloqueada nos dois sentidos; G→D é mão única; M→G não volta.
    i1 = carregar("i1_pequena")
    assert [v for v, _ in sucessores(i1, "A")] == ["S", "B"]
    assert [v for v, _ in sucessores(i1, "G")] == ["B", "D"]
    assert "M" not in [v for v, _ in sucessores(i1, "G")]
    assert "G" not in [v for v, _ in sucessores(i1, "D")]
    assert i1["adjacencia"]["A"] == [("S", 1.5), ("B", 2.0), ("G", 3.2)]


def testar_custo_uniforme_e_a_estrela_dao_o_mesmo_custo():
    # O custo uniforme é o oráculo: A* com h linha reta nunca pode achar custo diferente.
    for nome in ("i1_pequena", "i2_media", "i3_grande"):
        instancia = carregar(nome)
        oraculo = busca_custo_uniforme(instancia).custo
        assert abs(busca_a_estrela(instancia, h_linha_reta).custo - oraculo) < 1e-9, nome


def testar_heuristica_superestimada_piora_o_custo_em_alguma_instancia():
    # Exigência extra: existe instância em que h×k dá custo maior que o ótimo.
    piorou = [n for n in ("i1_pequena", "i2_media", "i3_grande")
              if busca_a_estrela(carregar(n), fabricar_h_superestimada(3)).custo
              > busca_custo_uniforme(carregar(n)).custo + 1e-9]
    assert "i1_pequena" in piorou and piorou


def testar_heuristica_admissivel_e_consistente():
    # h(n) <= custo ótimo restante e h(n) <= c(n,n') + h(n') em todas as instâncias com solução.
    for nome in ("i1_pequena", "i2_media"):
        instancia = carregar(nome)
        for estado in instancia["coordenadas"]:
            for vizinho, d in sucessores(instancia, estado):
                assert h_linha_reta(instancia, estado) <= d + h_linha_reta(instancia, vizinho) + 1e-9
    i1 = carregar("i1_pequena")
    assert h_linha_reta(i1, "A") <= 3.5
    assert fabricar_h_superestimada(3)(i1, "A") > 3.5


def testar_i4_sem_solucao():
    # Destino só tem ruas saindo dele: todas as buscas esvaziam a fronteira e devolvem sem_solucao.
    i4 = carregar("i4_sem_solucao")
    for resultado in (busca_em_largura(i4), busca_custo_uniforme(i4), busca_a_estrela(i4, h_linha_reta)):
        assert resultado.status == "sem_solucao" and resultado.caminho is None


def testar_origem_igual_destino():
    # Caso-limite: caminho [origem], custo 0 e nenhuma expansão.
    dados = json.loads((PASTA_INSTANCIAS / "i1_pequena.json").read_text(encoding="utf-8"))
    dados["destino"] = dados["origem"]
    instancia = montar_instancia(dados)
    for resultado in (busca_em_largura(instancia), busca_custo_uniforme(instancia)):
        assert resultado.caminho == ["S"] and resultado.custo == 0.0
        assert resultado.metricas.nos_expandidos == 0


def testar_limite_de_expansoes():
    # Caso-limite: ao atingir o limite a busca para com status limite_atingido.
    i3 = carregar("i3_grande")
    assert busca_em_largura(i3, limite_expansoes=5).status == "limite_atingido"
    assert busca_custo_uniforme(i3, limite_expansoes=5).status == "limite_atingido"
    assert busca_custo_uniforme(i3, limite_expansoes=5).metricas.nos_expandidos == 5


def testar_entradas_invalidas():
    # Caso-limite: cada entrada inválida levanta ValueError com mensagem clara.
    base = json.loads((PASTA_INSTANCIAS / "i1_pequena.json").read_text(encoding="utf-8"))
    def com(**mudancas):
        # Cópia da i1 com alguns campos trocados.
        return {**json.loads(json.dumps(base)), **mudancas}
    invalidos = {
        "origem inexistente": com(origem="Z"),
        "destino inexistente": com(destino="Z"),
        "campo ausente": {k: v for k, v in base.items() if k != "ruas"},
        "distancia zero": com(ruas=[{"de": "S", "para": "M", "distancia": 0}]),
        "menor que linha reta": com(ruas=[{"de": "S", "para": "M", "distancia": 1.9}]),
        "rua para cruzamento inexistente": com(ruas=[{"de": "S", "para": "Z", "distancia": 5}]),
        "bloqueio inexistente": com(bloqueadas=[["S", "Z"]]),
    }
    for descricao, dados in invalidos.items():
        try:
            montar_instancia(dados)
        except ValueError as erro:
            assert str(erro), descricao
        else:
            raise AssertionError(f"deveria recusar: {descricao}")


def testar_gerador_deterministico_e_admissivel():
    # Mesma semente gera o mesmo dicionário; nenhuma rua fica menor que a linha reta (montar_instancia valida).
    assert gerar_grade(6, 6, semente=7) == gerar_grade(6, 6, semente=7)
    assert gerar_grade(6, 6, semente=7) != gerar_grade(6, 6, semente=8)
    for nome in ("i2_media", "i3_grande", "i4_sem_solucao"):
        carregar(nome)


def testar_reconstruir_caminho():
    # Segue o dicionário de pais até None e devolve a rota do início ao fim.
    assert reconstruir_caminho({"A": None, "B": "A", "C": "B"}, "C") == ["A", "B", "C"]
    assert reconstruir_caminho({"A": None}, "A") == ["A"]


def _funcoes_do_codigo():
    # Percorre todas as funções definidas nos .py de codigo/, com árvore e linhas do arquivo.
    for arquivo in sorted(BASE.glob("*.py")):
        texto = arquivo.read_text(encoding="utf-8")
        for no in ast.walk(ast.parse(texto)):
            if isinstance(no, ast.FunctionDef):
                yield arquivo.name, no, texto.splitlines()


def testar_toda_funcao_tem_comentario_de_uma_linha():
    # Requisito §2.1: cada função tem um comentário logo abaixo do def, antes do primeiro comando.
    for arquivo, no, linhas in _funcoes_do_codigo():
        entre_def_e_corpo = linhas[no.lineno - 1:no.body[0].lineno - 1]
        assert any(l.strip().startswith("#") for l in entre_def_e_corpo), f"{arquivo}:{no.name} sem comentário"


def testar_trechos_do_artigo_tem_no_maximo_15_linhas():
    # Requisito §5.5: sucessores, reconstruir_caminho e o laço de cada busca cabem em 15 linhas.
    tamanhos = {}
    for arquivo, no, _ in _funcoes_do_codigo():
        if no.name in ("sucessores", "reconstruir_caminho"):
            tamanhos[no.name] = no.end_lineno - no.lineno + 1 - 1  # sem a linha do def
        if no.name in ("busca_em_largura", "busca_melhor_primeiro"):
            laco = next(n for n in ast.walk(no) if isinstance(n, ast.While))
            tamanhos[f"laco de {no.name}"] = laco.end_lineno - laco.lineno + 1
    assert len(tamanhos) == 4, tamanhos
    assert all(t <= 15 for t in tamanhos.values()), tamanhos


def testar_sem_bibliotecas_de_busca_e_sem_pop_zero():
    # Requisito §3.3: só biblioteca padrão permitida; nada de networkx nem lista.pop(0) como fila.
    for arquivo in sorted(BASE.glob("*.py")):
        arvore = ast.parse(arquivo.read_text(encoding="utf-8"))
        for no in ast.walk(arvore):
            modulos = []
            if isinstance(no, ast.Import):
                modulos = [a.name.split(".")[0] for a in no.names]
            elif isinstance(no, ast.ImportFrom):
                modulos = [no.module.split(".")[0]]
            assert set(modulos) <= IMPORTS_PERMITIDOS, (arquivo.name, modulos)
            if isinstance(no, ast.Call) and isinstance(no.func, ast.Attribute) and no.func.attr == "pop":
                assert not (no.args and getattr(no.args[0], "value", None) == 0), f"pop(0) em {arquivo.name}"


def testar_main_nao_gera_traceback_em_arquivo_ruim():
    # Requisito §4: arquivo inexistente ou JSON malformado viram mensagem amigável e código 1.
    with tempfile.TemporaryDirectory() as pasta:
        ruim = Path(pasta) / "ruim.json"
        ruim.write_text("{ quebrado", encoding="utf-8")
        for caminho in (ruim, Path(pasta) / "nao_existe.json"):
            processo = subprocess.run([sys.executable, str(BASE / "main.py"), "--instancia", str(caminho),
                                       "--busca", "largura"], capture_output=True, text=True, encoding="utf-8")
            assert processo.returncode == 1 and processo.stderr.startswith("Erro:"), processo.stderr
            assert "Traceback" not in processo.stderr


def executar_todos():
    # Roda cada função testar_* e imprime o resultado; sai com código 1 se algum falhar.
    testes = [(nome, f) for nome, f in globals().items() if nome.startswith("testar_") and callable(f)]
    falhas = 0
    for nome, teste in testes:
        try:
            teste()
            print(f"ok     {nome}")
        except Exception as erro:  # mostra qualquer falha sem esconder as demais
            falhas += 1
            print(f"FALHOU {nome}: {type(erro).__name__}: {erro}")
    print(f"\n{len(testes) - falhas}/{len(testes)} testes passaram")
    return 1 if falhas else 0


if __name__ == "__main__":
    sys.exit(executar_todos())
