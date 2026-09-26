#!/usr/bin/env python3
import json
import mimetypes
import os
import sqlite3
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "data" / "dklanches.db"
PRINTER_DEVICE = os.environ.get("DKLANCHES_PRINTER", "/dev/usb/lp0")
STORE_NAME = "DK Restaurante Lancheria"
STORE_CNPJ = "60.437.648/0001-51"


def dict_factory(cursor, row):
    return {col[0]: row[idx] for idx, col in enumerate(cursor.description)}


def get_connection():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = dict_factory
    return conn


def init_db():
    conn = get_connection()

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS produtos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            categoria TEXT NOT NULL,
            preco REAL NOT NULL,
            ativo INTEGER DEFAULT 1
        )
        """
    )

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS vendas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            numero_cupom TEXT UNIQUE NOT NULL,
            data_hora TEXT NOT NULL,
            total REAL NOT NULL,
            forma_pagamento TEXT NOT NULL,
            valor_recebido REAL NOT NULL,
            troco REAL NOT NULL
        )
        """
    )

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS itens_venda (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            venda_id INTEGER NOT NULL,
            produto_id INTEGER NOT NULL,
            nome TEXT NOT NULL,
            quantidade INTEGER NOT NULL,
            preco_unitario REAL NOT NULL,
            subtotal REAL NOT NULL,
            FOREIGN KEY(venda_id) REFERENCES vendas(id),
            FOREIGN KEY(produto_id) REFERENCES produtos(id)
        )
        """
    )

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS fechamentos_caixa (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            data_hora TEXT NOT NULL,
            total_vendas REAL NOT NULL,
            valor_caixa REAL NOT NULL,
            observacao TEXT NOT NULL
        )
        """
    )

    produtos_count = conn.execute("SELECT COUNT(*) AS total FROM produtos").fetchone()["total"]
    if produtos_count == 0:
        produtos = [
            ("Xis", "Lanche", 18.90),
            ("Cachorro Quente", "Lanche", 14.50),
            ("Hamburguer", "Lanche", 20.00),
            ("Batata Frita", "Acompanhamento", 12.00),
            ("Refrigerante", "Bebida", 7.50),
            ("Cerveja", "Bebida", 9.00),
        ]
        conn.executemany(
            "INSERT INTO produtos (nome, categoria, preco) VALUES (?, ?, ?)",
            produtos,
        )

    conn.commit()
    conn.close()


def buscar_produtos():
    conn = get_connection()
    produtos = conn.execute(
        "SELECT id, nome, categoria, preco FROM produtos WHERE ativo = 1 ORDER BY categoria, nome"
    ).fetchall()
    conn.close()
    return produtos


def inserir_produto(payload):
    nome = str(payload.get("nome", "")).strip()
    categoria = str(payload.get("categoria", "")).strip()
    preco = float(payload.get("preco") or 0)

    if not nome or not categoria or preco <= 0:
        raise ValueError("Nome, categoria e preço são obrigatórios")

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO produtos (nome, categoria, preco) VALUES (?, ?, ?)",
        (nome, categoria, preco),
    )
    produto_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return produto_id


def atualizar_produto(produto_id, payload):
    nome = str(payload.get("nome", "")).strip()
    categoria = str(payload.get("categoria", "")).strip()
    preco = float(payload.get("preco") or 0)

    if not nome or not categoria or preco <= 0:
        raise ValueError("Nome, categoria e preço são obrigatórios")

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE produtos SET nome = ?, categoria = ?, preco = ? WHERE id = ? AND ativo = 1",
        (nome, categoria, preco, produto_id),
    )
    conn.commit()
    conn.close()

    if cursor.rowcount == 0:
        raise ValueError("Produto não encontrado")


def excluir_produto(produto_id):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE produtos SET ativo = 0 WHERE id = ?", (produto_id,))
    conn.commit()
    conn.close()

    if cursor.rowcount == 0:
        raise ValueError("Produto não encontrado")


def build_receipt_payload(venda_id):
    conn = get_connection()
    venda = conn.execute("SELECT * FROM vendas WHERE id = ?", (venda_id,)).fetchone()
    if not venda:
        conn.close()
        return None
    itens = conn.execute(
        "SELECT nome, quantidade, preco_unitario, subtotal FROM itens_venda WHERE venda_id = ? ORDER BY id",
        (venda_id,),
    ).fetchall()
    conn.close()

    return {
        "id": venda["id"],
        "nome_loja": STORE_NAME,
        "cnpj_loja": STORE_CNPJ,
        "numero_cupom": venda["numero_cupom"],
        "data_hora": venda["data_hora"],
        "total": float(venda["total"]),
        "forma_pagamento": venda["forma_pagamento"],
        "valor_recebido": float(venda["valor_recebido"] or 0),
        "troco": float(venda["troco"] or 0),
        "itens": itens,
    }


def format_currency(valor):
    return f"R$ {float(valor or 0):.2f}".replace(".", ",")


def imprimir_cupom(cupom):
    linhas = [
        STORE_NAME,
        f"CNPJ: {STORE_CNPJ}",
        "=" * 32,
        f"Cupom: {cupom.get('numero_cupom', '')}",
        f"Data: {cupom.get('data_hora', '')}",
        f"Forma: {cupom.get('forma_pagamento', '')}",
        "",
    ]
    for item in cupom.get("itens", []):
        linhas.append(f"{item.get('nome', '')} x{item.get('quantidade', 0)}")
        linhas.append(f"  {format_currency(item.get('subtotal', 0))}")
    linhas.extend([
        "",
        f"TOTAL:    {format_currency(cupom.get('total', 0))}",
        f"RECEBIDO: {format_currency(cupom.get('valor_recebido', 0))}",
        f"TROCO:    {format_currency(cupom.get('troco', 0))}",
        "=" * 32,
        "Obrigado e volte sempre!",
    ])
    linhas.extend([""] * 10)
    try:
        with open(PRINTER_DEVICE, "wb") as impressora:
            impressora.write(b"\x1b\x40")
            impressora.write("\n".join(linhas).encode("cp850", errors="replace"))
            impressora.write(b"\x1d\x56\x00")
    except OSError as exc:
        raise RuntimeError(f"Não foi possível acessar {PRINTER_DEVICE}: {exc}") from exc


def buscar_vendas(search=""):
    conn = get_connection()
    search_text = f"%{search.strip()}%"

    if search_text and search_text != "%%":
        vendas = conn.execute(
            """
            SELECT id, numero_cupom, data_hora, total, forma_pagamento, valor_recebido, troco
            FROM vendas
            WHERE numero_cupom LIKE ? OR data_hora LIKE ? OR forma_pagamento LIKE ?
            ORDER BY id DESC
            LIMIT 50
            """,
            (search_text, search_text, search_text),
        ).fetchall()
    else:
        vendas = conn.execute(
            """
            SELECT id, numero_cupom, data_hora, total, forma_pagamento, valor_recebido, troco
            FROM vendas
            ORDER BY id DESC
            LIMIT 50
            """
        ).fetchall()

    conn.close()
    return vendas


def buscar_dashboard():
    conn = get_connection()
    hoje = datetime.now().strftime("%Y-%m-%d")

    resumo = conn.execute(
        """
        SELECT
            COUNT(*) AS vendas_hoje,
            COALESCE(SUM(total), 0) AS faturamento_hoje,
            COALESCE(AVG(total), 0) AS ticket_medio
        FROM vendas
        WHERE date(data_hora) = ?
        """,
        (hoje,),
    ).fetchone()

    item_mais_vendido = conn.execute(
        """
        SELECT nome, SUM(quantidade) AS quantidade
        FROM itens_venda
        GROUP BY nome
        ORDER BY quantidade DESC
        LIMIT 1
        """
    ).fetchone()

    ultimo_fechamento = conn.execute(
        """
        SELECT data_hora, total_vendas, valor_caixa, observacao
        FROM fechamentos_caixa
        ORDER BY id DESC
        LIMIT 1
        """
    ).fetchone()

    total_produtos = conn.execute("SELECT COUNT(*) AS total FROM produtos WHERE ativo = 1").fetchone()["total"]
    conn.close()

    return {
        "vendas_hoje": resumo["vendas_hoje"],
        "faturamento_hoje": float(resumo["faturamento_hoje"] or 0),
        "ticket_medio": float(resumo["ticket_medio"] or 0),
        "produto_mais_vendido": item_mais_vendido["nome"] if item_mais_vendido else "Nenhum",
        "total_produtos": total_produtos,
        "ultimo_fechamento": ultimo_fechamento,
    }


def buscar_relatorio(data_inicio, data_fim):
    try:
        inicio = datetime.strptime(data_inicio, "%Y-%m-%d").date()
        fim = datetime.strptime(data_fim, "%Y-%m-%d").date()
    except (TypeError, ValueError) as exc:
        raise ValueError("Informe datas válidas no formato AAAA-MM-DD") from exc

    if inicio.isoformat() != data_inicio or fim.isoformat() != data_fim:
        raise ValueError("Informe datas válidas no formato AAAA-MM-DD")

    if inicio > fim:
        raise ValueError("A data inicial não pode ser posterior à data final")

    conn = get_connection()
    intervalo = (data_inicio, data_fim)
    resumo = conn.execute(
        """
        SELECT COUNT(*) AS quantidade_vendas,
               COALESCE(SUM(total), 0) AS faturamento,
               COALESCE(AVG(total), 0) AS ticket_medio
        FROM vendas
        WHERE date(data_hora) BETWEEN ? AND ?
        """,
        intervalo,
    ).fetchone()
    itens_vendidos = conn.execute(
        """
        SELECT COALESCE(SUM(iv.quantidade), 0) AS quantidade
        FROM itens_venda iv
        JOIN vendas v ON v.id = iv.venda_id
        WHERE date(v.data_hora) BETWEEN ? AND ?
        """,
        intervalo,
    ).fetchone()["quantidade"]
    dias = conn.execute(
        """
        SELECT date(data_hora) AS data,
               COUNT(*) AS quantidade_vendas,
               COALESCE(SUM(total), 0) AS total,
               COALESCE(SUM(CASE WHEN forma_pagamento = 'Dinheiro' THEN total ELSE 0 END), 0) AS dinheiro,
               COALESCE(SUM(CASE WHEN forma_pagamento = 'Cartão' THEN total ELSE 0 END), 0) AS cartao,
               COALESCE(SUM(CASE WHEN forma_pagamento = 'Pix' THEN total ELSE 0 END), 0) AS pix
        FROM vendas
        WHERE date(data_hora) BETWEEN ? AND ?
        GROUP BY date(data_hora)
        ORDER BY date(data_hora) DESC
        """,
        intervalo,
    ).fetchall()
    linhas_vendas = conn.execute(
        """
        SELECT v.id, v.numero_cupom, v.data_hora, v.total, v.forma_pagamento,
               v.valor_recebido, v.troco,
               iv.id AS item_id, iv.nome AS item_nome, iv.quantidade AS item_quantidade,
               iv.preco_unitario AS item_preco_unitario, iv.subtotal AS item_subtotal
        FROM vendas v
        LEFT JOIN itens_venda iv ON iv.venda_id = v.id
        WHERE date(v.data_hora) BETWEEN ? AND ?
        ORDER BY v.data_hora DESC, v.id DESC, iv.id
        """,
        intervalo,
    ).fetchall()
    conn.close()

    vendas_por_id = {}
    for row in linhas_vendas:
        venda = vendas_por_id.get(row["id"])
        if venda is None:
            venda = {
                "id": row["id"],
                "numero_cupom": row["numero_cupom"],
                "data_hora": row["data_hora"],
                "total": float(row["total"]),
                "forma_pagamento": row["forma_pagamento"],
                "valor_recebido": float(row["valor_recebido"] or 0),
                "troco": float(row["troco"] or 0),
                "itens": [],
            }
            vendas_por_id[row["id"]] = venda
        if row["item_id"] is not None:
            venda["itens"].append({
                "nome": row["item_nome"],
                "quantidade": row["item_quantidade"],
                "preco_unitario": float(row["item_preco_unitario"]),
                "subtotal": float(row["item_subtotal"]),
            })

    return {
        "data_inicio": data_inicio,
        "data_fim": data_fim,
        "resumo": {
            "quantidade_vendas": resumo["quantidade_vendas"],
            "faturamento": float(resumo["faturamento"] or 0),
            "ticket_medio": float(resumo["ticket_medio"] or 0),
            "itens_vendidos": int(itens_vendidos or 0),
        },
        "dias": dias,
        "vendas": list(vendas_por_id.values()),
    }


def listar_fechamentos():
    conn = get_connection()
    fechamentos = conn.execute(
        "SELECT id, data_hora, total_vendas, valor_caixa, observacao FROM fechamentos_caixa ORDER BY id DESC LIMIT 10"
    ).fetchall()
    conn.close()
    return fechamentos


def fechar_caixa(payload):
    observacao = str(payload.get("observacao") or "Fechamento do caixa").strip()
    conn = get_connection()
    hoje = datetime.now().strftime("%Y-%m-%d")

    resumo = conn.execute(
        """
        SELECT
            COUNT(*) AS vendas_hoje,
            COALESCE(SUM(total), 0) AS total_vendas,
            COALESCE(SUM(CASE WHEN forma_pagamento = 'Dinheiro' THEN valor_recebido ELSE 0 END), 0) AS valor_caixa
        FROM vendas
        WHERE date(data_hora) = ?
        """,
        (hoje,),
    ).fetchone()

    fechamento = {
        "data_hora": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "total_vendas": float(resumo["total_vendas"] or 0),
        "valor_caixa": float(resumo["valor_caixa"] or 0),
        "observacao": observacao,
    }

    conn.execute(
        "INSERT INTO fechamentos_caixa (data_hora, total_vendas, valor_caixa, observacao) VALUES (?, ?, ?, ?)",
        (fechamento["data_hora"], fechamento["total_vendas"], fechamento["valor_caixa"], fechamento["observacao"]),
    )
    conn.commit()
    conn.close()
    return fechamento


class DkLanchesHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        query = parse_qs(parsed.query)

        if path == "/":
            self.serve_file(BASE_DIR / "index.html")
            return

        if path.startswith("/static/"):
            self.serve_file(BASE_DIR / path.lstrip("/"))
            return

        if path == "/api/produtos":
            self.send_json(200, {"produtos": buscar_produtos()})
            return

        if path == "/api/vendas":
            search = query.get("search", [""])[0]
            self.send_json(200, {"vendas": buscar_vendas(search)})
            return

        if path.startswith("/api/vendas/"):
            try:
                venda_id = int(path.rsplit("/", 1)[1])
                cupom = build_receipt_payload(venda_id)
                if not cupom:
                    self.send_json(404, {"erro": "Venda não encontrada"})
                else:
                    self.send_json(200, {"venda": cupom})
            except (TypeError, ValueError):
                self.send_json(400, {"erro": "Identificador de venda inválido"})
            return

        if path == "/api/dashboard":
            self.send_json(200, {"dashboard": buscar_dashboard()})
            return

        if path == "/api/relatorios":
            data_inicio = query.get("data_inicio", [""])[0]
            data_fim = query.get("data_fim", [""])[0]
            try:
                relatorio = buscar_relatorio(data_inicio, data_fim)
                self.send_json(200, {"relatorio": relatorio})
            except ValueError as exc:
                self.send_json(400, {"erro": str(exc)})
            return

        if path == "/api/fechamentos":
            self.send_json(200, {"fechamentos": listar_fechamentos()})
            return

        self.send_json(404, {"erro": "Página não encontrada"})

    def do_POST(self):
        path = urlparse(self.path).path

        if path == "/api/imprimir-cupom":
            content_length = int(self.headers.get("Content-Length", "0"))
            body = self.rfile.read(content_length).decode("utf-8")
            try:
                imprimir_cupom(json.loads(body or "{}"))
                self.send_json(200, {"mensagem": "Cupom enviado para impressão"})
            except Exception as exc:
                self.send_json(500, {"erro": str(exc)})
            return

        if path == "/api/produtos":
            content_length = int(self.headers.get("Content-Length", "0"))
            body = self.rfile.read(content_length).decode("utf-8")
            payload = json.loads(body or "{}")

            try:
                produto_id = inserir_produto(payload)
                self.send_json(201, {"mensagem": "Produto cadastrado", "id": produto_id})
            except Exception as exc:
                self.send_json(400, {"erro": str(exc)})
            return

        if path == "/api/vendas":
            content_length = int(self.headers.get("Content-Length", "0"))
            body = self.rfile.read(content_length).decode("utf-8")
            payload = json.loads(body or "{}")

            items = payload.get("itens", [])
            forma_pagamento = payload.get("forma_pagamento", "Dinheiro")
            valor_recebido = float(payload.get("valor_recebido") or 0)

            if not items:
                self.send_json(400, {"erro": "A venda precisa ter pelo menos um item"})
                return

            conn = get_connection()
            try:
                total = 0.0
                itens_validos = []

                for item in items:
                    produto = conn.execute(
                        "SELECT id, nome, preco FROM produtos WHERE id = ? AND ativo = 1",
                        (item.get("id"),),
                    ).fetchone()

                    if not produto:
                        raise ValueError(f"Produto inválido: {item.get('id')}")

                    quantidade = int(item.get("quantidade", 1))
                    if quantidade <= 0:
                        raise ValueError(f"Quantidade inválida para {produto['nome']}")

                    subtotal = float(produto["preco"]) * quantidade
                    total += subtotal
                    itens_validos.append({
                        "produto_id": produto["id"],
                        "nome": produto["nome"],
                        "quantidade": quantidade,
                        "preco_unitario": float(produto["preco"]),
                        "subtotal": subtotal,
                    })

                troco = max(0.0, valor_recebido - total) if forma_pagamento == "Dinheiro" else 0.0
                numero_cupom = f"DK-{datetime.now().strftime('%Y%m%d%H%M%S')}"
                data_hora = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

                cursor = conn.cursor()
                cursor.execute(
                    "INSERT INTO vendas (numero_cupom, data_hora, total, forma_pagamento, valor_recebido, troco) VALUES (?, ?, ?, ?, ?, ?)",
                    (numero_cupom, data_hora, total, forma_pagamento, valor_recebido, troco),
                )
                venda_id = cursor.lastrowid

                for item in itens_validos:
                    cursor.execute(
                        "INSERT INTO itens_venda (venda_id, produto_id, nome, quantidade, preco_unitario, subtotal) VALUES (?, ?, ?, ?, ?, ?)",
                        (
                            venda_id,
                            item["produto_id"],
                            item["nome"],
                            item["quantidade"],
                            item["preco_unitario"],
                            item["subtotal"],
                        ),
                    )

                conn.commit()
                self.send_json(201, {"mensagem": "Venda registrada com sucesso", "venda": build_receipt_payload(venda_id)})
            except Exception as exc:
                conn.rollback()
                self.send_json(400, {"erro": str(exc)})
            finally:
                conn.close()
            return

        if path == "/api/fechamentos":
            content_length = int(self.headers.get("Content-Length", "0"))
            body = self.rfile.read(content_length).decode("utf-8")
            payload = json.loads(body or "{}")
            try:
                fechamento = fechar_caixa(payload)
                self.send_json(201, {"mensagem": "Caixa fechado com sucesso", "fechamento": fechamento})
            except Exception as exc:
                self.send_json(400, {"erro": str(exc)})
            return

        self.send_json(404, {"erro": "Rota não encontrada"})

    def do_PUT(self):
        path = urlparse(self.path).path
        if path.startswith("/api/produtos/"):
            produto_id = int(path.rsplit("/", 1)[-1])
            content_length = int(self.headers.get("Content-Length", "0"))
            body = self.rfile.read(content_length).decode("utf-8")
            payload = json.loads(body or "{}")

            try:
                atualizar_produto(produto_id, payload)
                self.send_json(200, {"mensagem": "Produto atualizado"})
            except Exception as exc:
                self.send_json(400, {"erro": str(exc)})
            return

        self.send_json(404, {"erro": "Rota não encontrada"})

    def do_DELETE(self):
        path = urlparse(self.path).path
        if path.startswith("/api/produtos/"):
            produto_id = int(path.rsplit("/", 1)[-1])
            try:
                excluir_produto(produto_id)
                self.send_json(200, {"mensagem": "Produto removido"})
            except Exception as exc:
                self.send_json(400, {"erro": str(exc)})
            return

        self.send_json(404, {"erro": "Rota não encontrada"})

    def serve_file(self, file_path: Path):
        if not file_path.exists():
            self.send_json(404, {"erro": "Arquivo não encontrado"})
            return

        mime_type, _ = mimetypes.guess_type(str(file_path))
        if mime_type is None:
            mime_type = "application/octet-stream"

        content = file_path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", mime_type)
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def send_json(self, status_code, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def run_server():
    init_db()
    host = "0.0.0.0"
    port = 8000
    server = ThreadingHTTPServer((host, port), DkLanchesHandler)
    print(f"DkLanches rodando em http://{host}:{port}")
    server.serve_forever()


if __name__ == "__main__":
    run_server()

