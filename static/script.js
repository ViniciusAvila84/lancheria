const state = {
  produtos: [],
  carrinho: [],
  vendas: [],
  cupomAtual: null,
  produtoEditId: null,
  comandas: [],
  comandaAtivaId: null,
  proximoNumeroComanda: 1
};

const STORE_NAME = 'DK Restaurante Lancheria';
const STORE_CNPJ = '60.437.648/0001-51';

const formatMoney = (valor) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(Number(valor || 0));

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}[character]));

const toDateInputValue = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatReportDate = (value, includeTime = false) => {
  const rawValue = String(value);
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(rawValue);
  const date = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(rawValue.replace(' ', 'T'));
  return Number.isNaN(date.getTime()) ? escapeHtml(value) : date.toLocaleString('pt-BR', includeTime
    ? { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }
    : { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const calcularTotal = () =>
  state.carrinho.reduce((total, item) => total + item.quantidade * item.preco, 0);

const getComandaAtiva = () =>
  state.comandas.find((comanda) => comanda.id === state.comandaAtivaId) || state.comandas[0] || null;

function setActiveView(viewName) {
  document.querySelectorAll('.nav-btn').forEach((button) => {
    button.classList.toggle('active', button.dataset.view === viewName);
  });

  document.querySelectorAll('.view-panel').forEach((panel) => {
    panel.classList.toggle('active-view', panel.id === viewName);
  });

  const titles = {
    caixa: 'Caixa',
    vendas: 'Vendas',
    produtos: 'Produtos',
    comandas: 'Comanda',
    relatorios: 'Relatórios'
  };

  document.getElementById('viewTitle').textContent = titles[viewName] || 'Caixa';
  if (viewName === 'relatorios') carregarRelatorio();
}

function criarComanda() {
  const numero = String(state.proximoNumeroComanda).padStart(2, '0');
  const novaComanda = {
    id: Date.now(),
    numero: `Comanda ${numero}`,
    nome: `Comanda ${numero}`,
    mesa: `Mesa ${numero}`,
    itens: []
  };

  state.proximoNumeroComanda += 1;
  state.comandas.unshift(novaComanda);
  state.comandaAtivaId = novaComanda.id;
  renderComandas();
}

function renomearComandaAtual() {
  const comanda = getComandaAtiva();
  if (!comanda) return;

  const input = document.getElementById('nomeComandaInput');
  const nomeDigitado = input.value.trim();
  comanda.nome = nomeDigitado || comanda.numero;
  renderComandas();
}

function montarCupomComanda(comanda) {
  const itens = comanda.itens.map((item) => ({
    nome: item.nome,
    quantidade: item.quantidade,
    subtotal: item.quantidade * item.preco,
    preco_unitario: item.preco
  }));

  const total = itens.reduce((sum, item) => sum + item.subtotal, 0);
  const formaPagamento = document.getElementById('formaPagamentoComanda')?.value || 'Dinheiro';
  const valorRecebido = Number(document.getElementById('valorRecebidoComanda')?.value || 0);
  const troco = formaPagamento === 'Dinheiro' ? Math.max(0, valorRecebido - total) : 0;

  return {
    nome_loja: STORE_NAME,
    cnpj_loja: STORE_CNPJ,
    numero_cupom: `DK-C-${String(Date.now()).slice(-6)}`,
    data_hora: new Date().toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).replace('/', '-').replace('/', '-'),
    total,
    forma_pagamento: formaPagamento,
    valor_recebido: formaPagamento === 'Dinheiro' ? valorRecebido : total,
    troco,
    nome_comanda: comanda.nome || comanda.numero,
    itens
  };
}

async function fecharComandaAtual() {
  const comanda = getComandaAtiva();
  if (!comanda) return;

  if (!comanda.itens.length) {
    alert('A comanda está vazia. Adicione itens antes de fechar.');
    return;
  }

  const formaPagamento = document.getElementById('formaPagamentoComanda')?.value || 'Dinheiro';
  const valorRecebido = Number(document.getElementById('valorRecebidoComanda')?.value || 0);
  const total = comanda.itens.reduce((sum, item) => sum + item.quantidade * item.preco, 0);

  const payload = {
    forma_pagamento: formaPagamento,
    valor_recebido: formaPagamento === 'Dinheiro' ? valorRecebido : total,
    itens: comanda.itens.map((item) => ({
      id: item.id,
      quantidade: item.quantidade
    }))
  };

  const response = await fetch('/api/vendas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const dados = await response.json();
  if (!response.ok) {
    alert(dados.erro || 'Erro ao registrar comanda.');
    return;
  }

  const cupom = {
    ...dados.venda,
    nome_comanda: comanda.nome || comanda.numero,
    forma_pagamento: formaPagamento,
    valor_recebido: formaPagamento === 'Dinheiro' ? valorRecebido : total,
    troco: formaPagamento === 'Dinheiro' ? Math.max(0, valorRecebido - total) : 0
  };

  const impressao = await enviarCupomParaImpressao(cupom);

  state.comandas = state.comandas.filter((item) => item.id !== comanda.id);
  state.comandaAtivaId = state.comandas[0]?.id || null;
  renderComandas();

  alert(impressao
    ? `Comanda ${comanda.nome || comanda.numero} fechada e registrada no histórico do dia!`
    : `Comanda ${comanda.nome || comanda.numero} registrada, mas não foi possível imprimir.`);

  await carregarVendas();
  await carregarDashboard();
}

function adicionarItemNaComanda(produtoId) {
  const comanda = getComandaAtiva();
  if (!comanda) {
    alert('Crie ou selecione uma comanda antes de adicionar itens.');
    return;
  }

  const produto = state.produtos.find((item) => item.id === produtoId);
  if (!produto) return;

  const itemExistente = comanda.itens.find((item) => item.id === produtoId);
  if (itemExistente) {
    itemExistente.quantidade += 1;
  } else {
    comanda.itens.push({
      id: produto.id,
      nome: produto.nome,
      categoria: produto.categoria,
      preco: Number(produto.preco),
      quantidade: 1
    });
  }

  renderComandas();
}

function alterarQuantidadeComanda(produtoId, delta) {
  const comanda = getComandaAtiva();
  if (!comanda) return;

  const item = comanda.itens.find((entry) => entry.id === produtoId);
  if (!item) return;

  item.quantidade += delta;
  if (item.quantidade <= 0) {
    comanda.itens = comanda.itens.filter((entry) => entry.id !== produtoId);
  }

  renderComandas();
}

function renderListaProdutosComanda() {
  const lista = document.getElementById('listaProdutosComanda');
  const comanda = getComandaAtiva();

  if (!comanda) {
    lista.innerHTML = '<p class="category-empty">Crie uma comanda para adicionar itens.</p>';
    return;
  }

  const categorias = ['Bebidas', 'lanches', 'comida', 'combos', 'balcão'];
  const categoriaProduto = (categoria) => {
    const nome = String(categoria || '').toLowerCase();
    if (nome.includes('bebida')) return 'Bebidas';
    if (nome.includes('lanche')) return 'lanches';
    if (nome.includes('comida') || nome.includes('acompanhamento')) return 'comida';
    if (nome.includes('combo')) return 'combos';
    if (nome.includes('balc')) return 'balcão';
    return categoria;
  };

  lista.innerHTML = categorias.map((categoria) => {
    const produtos = state.produtos
      .filter((produto) => categoriaProduto(produto.categoria) === categoria)
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }));

    if (!produtos.length) return '';

    return `
      <details class="category-group">
        <summary><span>${categoria}</span><small>${produtos.length} ${produtos.length === 1 ? 'item' : 'itens'} <b>+</b></small></summary>
        <div class="category-products">
          ${produtos.map((produto) => `
            <button class="product-card" data-comanda-id="${produto.id}" type="button">
              <div class="top"><h3>${produto.nome}</h3><strong>${formatMoney(produto.preco)}</strong></div>
              <p>${produto.categoria}</p>
            </button>
          `).join('')}
        </div>
      </details>
    `;
  }).join('');

  lista.querySelectorAll('[data-comanda-id]').forEach((botao) => {
    botao.addEventListener('click', () => adicionarItemNaComanda(Number(botao.dataset.comandaId)));
  });
}

function renderComandas() {
  const comandaList = document.getElementById('listaComandas');
  const tabela = document.getElementById('tabelaComanda');
  const resumo = document.getElementById('comandaResumo');
  const titulo = document.getElementById('comandaTitulo');
  const inputNome = document.getElementById('nomeComandaInput');
  const comanda = getComandaAtiva();

  if (!state.comandas.length) {
    comandaList.innerHTML = '<p class="category-empty">Nenhuma comanda aberta.</p>';
    tabela.innerHTML = '';
    resumo.textContent = 'Selecione uma comanda.';
    titulo.textContent = 'Comanda';
    inputNome.value = '';
    renderListaProdutosComanda();
    return;
  }

  comandaList.innerHTML = state.comandas.map((item) => {
    const total = item.itens.reduce((sum, entry) => sum + entry.quantidade * entry.preco, 0);
    const isActive = item.id === state.comandaAtivaId;
    return `
      <button class="comanda-card ${isActive ? 'active' : ''}" data-comanda-select="${item.id}" type="button">
        <small>${item.mesa}</small>
        <strong>${item.nome || item.numero}</strong>
        <b>${formatMoney(total)}</b>
      </button>
    `;
  }).join('');

  comandaList.querySelectorAll('[data-comanda-select]').forEach((botao) => {
    botao.addEventListener('click', () => {
      state.comandaAtivaId = Number(botao.dataset.comandaSelect);
      renderComandas();
    });
  });

  if (!comanda) {
    state.comandaAtivaId = state.comandas[0].id;
    renderComandas();
    return;
  }

  const totalComanda = comanda.itens.reduce((sum, item) => sum + item.quantidade * item.preco, 0);
  const nomeComandaAtual = comanda.nome || comanda.numero;
  titulo.textContent = nomeComandaAtual;
  inputNome.value = nomeComandaAtual;
  resumo.textContent = `${comanda.mesa} · Total: ${formatMoney(totalComanda)}`;

  if (!comanda.itens.length) {
    tabela.innerHTML = '<tr><td colspan="4">Nenhum item adicionado.</td></tr>';
  } else {
    tabela.innerHTML = comanda.itens.map((item) => `
      <tr>
        <td>${item.nome}</td>
        <td>
          <div class="qty-control">
            <button type="button" data-comanda-qty="menos" data-comanda-id="${item.id}">-</button>
            <span>${item.quantidade}</span>
            <button type="button" data-comanda-qty="mais" data-comanda-id="${item.id}">+</button>
          </div>
        </td>
        <td>${formatMoney(item.preco)}</td>
        <td>${formatMoney(item.quantidade * item.preco)}</td>
      </tr>
    `).join('');

    tabela.querySelectorAll('[data-comanda-qty]').forEach((botao) => {
      botao.addEventListener('click', () => {
        const delta = botao.dataset.comandaQty === 'mais' ? 1 : -1;
        alterarQuantidadeComanda(Number(botao.dataset.comandaId), delta);
      });
    });
  }

  renderListaProdutosComanda();
}

async function carregarProdutos() {
  const response = await fetch('/api/produtos');
  const dados = await response.json();
  state.produtos = dados.produtos || [];
  renderProdutos();
  renderTabelaProdutos();
}

async function carregarVendas(search = '') {
  const query = search ? `?search=${encodeURIComponent(search)}` : '';
  const response = await fetch(`/api/vendas${query}`);
  const dados = await response.json();
  state.vendas = dados.vendas || [];
  renderTabelaVendas();
}

async function carregarRelatorio() {
  const dataInicio = document.getElementById('relatorioDataInicio').value;
  const dataFim = document.getElementById('relatorioDataFim').value;
  const erro = document.getElementById('relatorioErro');
  const botao = document.getElementById('aplicarRelatorioBtn');
  if (!dataInicio || !dataFim) {
    erro.textContent = 'Selecione a data inicial e a data final.';
    return;
  }
  if (dataInicio > dataFim) {
    erro.textContent = 'A data inicial não pode ser posterior à data final.';
    return;
  }

  erro.textContent = '';
  const parametros = new URLSearchParams({ data_inicio: dataInicio, data_fim: dataFim });
  botao.disabled = true;
  const textoBotao = botao.textContent;
  botao.textContent = 'Carregando...';
  try {
    const response = await fetch(`/api/relatorios?${parametros}`);
    const dados = await response.json();
    if (!response.ok) {
      erro.textContent = dados.erro || 'Não foi possível carregar o relatório.';
      return;
    }

    renderRelatorio(dados.relatorio);
  } catch (error) {
    erro.textContent = 'Não foi possível conectar ao servidor para carregar as vendas.';
  } finally {
    botao.disabled = false;
    botao.textContent = textoBotao;
  }
}

function renderRelatorio(relatorio) {
  const resumo = relatorio.resumo;
  document.getElementById('relatorioPeriodo').textContent =
    `${formatReportDate(relatorio.data_inicio)} a ${formatReportDate(relatorio.data_fim)}`;
  document.getElementById('vendasPeriodo').textContent = resumo.quantidade_vendas;
  document.getElementById('faturamentoPeriodo').textContent = formatMoney(resumo.faturamento);
  document.getElementById('ticketMedioPeriodo').textContent = formatMoney(resumo.ticket_medio);
  document.getElementById('itensVendidosPeriodo').textContent = resumo.itens_vendidos;

  const tabelaDiaria = document.getElementById('tabelaResumoDiario');
  const totaisPeriodo = relatorio.dias.reduce((totais, dia) => ({
    quantidade_vendas: totais.quantidade_vendas + Number(dia.quantidade_vendas || 0),
    dinheiro: totais.dinheiro + Number(dia.dinheiro || 0),
    cartao: totais.cartao + Number(dia.cartao || 0),
    pix: totais.pix + Number(dia.pix || 0),
    total: totais.total + Number(dia.total || 0)
  }), { quantidade_vendas: 0, dinheiro: 0, cartao: 0, pix: 0, total: 0 });
  tabelaDiaria.innerHTML = relatorio.dias.length ? relatorio.dias.map((dia) => `
    <tr>
      <td>${formatReportDate(dia.data)}</td>
      <td>${dia.quantidade_vendas}</td>
      <td>${formatMoney(dia.dinheiro)}</td>
      <td>${formatMoney(dia.cartao)}</td>
      <td>${formatMoney(dia.pix)}</td>
      <td><strong>${formatMoney(dia.total)}</strong></td>
    </tr>
  `).join('') : '<tr><td colspan="6">Nenhuma venda registrada neste período.</td></tr>';
  document.getElementById('rodapeResumoDiario').innerHTML = relatorio.dias.length ? `
    <tr>
      <th scope="row">Total do período</th>
      <th>${totaisPeriodo.quantidade_vendas}</th>
      <th>${formatMoney(totaisPeriodo.dinheiro)}</th>
      <th>${formatMoney(totaisPeriodo.cartao)}</th>
      <th>${formatMoney(totaisPeriodo.pix)}</th>
      <th><strong>${formatMoney(totaisPeriodo.total)}</strong></th>
    </tr>
  ` : '';

  const tabelaVendas = document.getElementById('tabelaVendasRelatorio');
  document.getElementById('relatorioQuantidadeVendas').textContent = `${relatorio.vendas.length} ${relatorio.vendas.length === 1 ? 'venda' : 'vendas'}`;
  tabelaVendas.innerHTML = relatorio.vendas.length ? relatorio.vendas.map((venda) => `
    <tr>
      <td>${formatReportDate(venda.data_hora, true)}</td>
      <td>${escapeHtml(venda.numero_cupom)}</td>
      <td>${escapeHtml(venda.forma_pagamento)}</td>
      <td>
        <details class="report-item-details">
          <summary>${venda.itens.reduce((total, item) => total + Number(item.quantidade), 0)} ${venda.itens.length === 1 ? 'item' : 'itens'}</summary>
          <ul>${venda.itens.map((item) => `<li><span>${escapeHtml(item.nome)} × ${item.quantidade} <small>${formatMoney(item.preco_unitario)} cada</small></span><strong>${formatMoney(item.subtotal)}</strong></li>`).join('')}</ul>
        </details>
      </td>
      <td><strong>${formatMoney(venda.total)}</strong></td>
    </tr>
  `).join('') : '<tr><td colspan="5">Nenhuma venda registrada neste período.</td></tr>';
}

async function carregarDashboard() {
  const response = await fetch('/api/dashboard');
  const dados = await response.json();
  const dashboard = dados.dashboard || {};

  const resumo = document.getElementById('fechamentoResumo');
  if (!resumo) return;
  const fechamento = dashboard.ultimo_fechamento;
  if (fechamento) {
    resumo.textContent = `Último fechamento: ${new Date(fechamento.data_hora).toLocaleString('pt-BR')} | Total: ${formatMoney(fechamento.total_vendas)} | Caixa: ${formatMoney(fechamento.valor_caixa)}`;
  } else {
    resumo.textContent = 'Ainda não houve fechamento hoje.';
  }

  await carregarFechamentos();
}

async function carregarFechamentos() {
  const response = await fetch('/api/fechamentos');
  const dados = await response.json();
  const lista = document.getElementById('listaFechamentos');
  const fechamentos = dados.fechamentos || [];

  if (!fechamentos.length) {
    lista.innerHTML = '<li>Nenhum fechamento registrado.</li>';
    return;
  }

  lista.innerHTML = fechamentos.map((item) => `
    <li>
      ${new Date(item.data_hora).toLocaleString('pt-BR')} — Total ${formatMoney(item.total_vendas)} — Caixa ${formatMoney(item.valor_caixa)}
    </li>
  `).join('');
}

function renderProdutos(search = '') {
  const lista = document.getElementById('listaProdutos');
  const busca = search.trim().toLocaleLowerCase('pt-BR');
  const categorias = ['Bebidas', 'lanches', 'comida', 'combos', 'balcão'];
  const categoriaProduto = (categoria) => {
    const nome = String(categoria || '').toLowerCase();
    if (nome.includes('bebida')) return 'Bebidas';
    if (nome.includes('lanche')) return 'lanches';
    if (nome.includes('comida') || nome.includes('acompanhamento')) return 'comida';
    if (nome.includes('combo')) return 'combos';
    if (nome.includes('balc')) return 'balcão';
    return categoria;
  };

  lista.innerHTML = categorias.map((categoria) => {
    const produtos = state.produtos
      .filter((produto) => categoriaProduto(produto.categoria) === categoria)
      .filter((produto) => !busca || produto.nome.toLocaleLowerCase('pt-BR').includes(busca))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }));
    if (busca && produtos.length === 0) return '';
    return `
      <details class="category-group">
        <summary><span>${categoria}</span><small>${produtos.length} ${produtos.length === 1 ? 'item' : 'itens'} <b>+</b></small></summary>
        <div class="category-products">
          ${produtos.map((produto) => `
            <button class="product-card" data-id="${produto.id}" type="button">
              <div class="top"><h3>${produto.nome}</h3><strong>${formatMoney(produto.preco)}</strong></div>
              <p>${produto.categoria}</p>
            </button>
          `).join('') || '<p class="category-empty">Nenhum produto cadastrado.</p>'}
        </div>
      </details>
    `;
  }).join('') || '<p class="category-empty">Nenhum produto encontrado.</p>';

  lista.querySelectorAll('.product-card').forEach((botao) => {
    botao.addEventListener('click', () => adicionarProdutoAoCarrinho(Number(botao.dataset.id)));
  });
}

function renderTabelaProdutos() {
  const tabela = document.getElementById('tabelaProdutos');
  tabela.innerHTML = state.produtos.map((produto) => `
    <tr>
      <td>${produto.nome}</td>
      <td>${produto.categoria}</td>
      <td>${formatMoney(produto.preco)}</td>
      <td>
        <button class="action-btn edit" data-action="edit" data-id="${produto.id}" type="button">Editar</button>
        <button class="action-btn delete" data-action="delete" data-id="${produto.id}" type="button">Excluir</button>
      </td>
    </tr>
  `).join('');

  tabela.querySelectorAll('.action-btn').forEach((botao) => {
    botao.addEventListener('click', async () => {
      const action = botao.dataset.action;
      const id = Number(botao.dataset.id);
      if (action === 'edit') {
        abrirEdicaoProduto(id);
      } else {
        await excluirProduto(id);
      }
    });
  });
}

function renderTabelaVendas() {
  const tabela = document.getElementById('tabelaVendas');
  if (!state.vendas.length) {
    tabela.innerHTML = '<tr><td colspan="5">Nenhuma venda registrada.</td></tr>';
    return;
  }

  tabela.innerHTML = state.vendas.map((venda) => `
    <tr>
      <td>${venda.numero_cupom}</td>
      <td>${new Date(venda.data_hora).toLocaleString('pt-BR')}</td>
      <td>${venda.forma_pagamento}</td>
      <td>${formatMoney(venda.total)}</td>
      <td><button class="action-btn print" data-venda-id="${venda.id}" type="button">Imprimir</button></td>
    </tr>
  `).join('');

  tabela.querySelectorAll('[data-venda-id]').forEach((button) => {
    button.addEventListener('click', () => imprimirVendaAnterior(Number(button.dataset.vendaId)));
  });
}

async function imprimirVendaAnterior(vendaId) {
  const response = await fetch(`/api/vendas/${vendaId}`);
  const dados = await response.json();
  if (!response.ok) {
    alert(dados.erro || 'Não foi possível carregar o cupom.');
    return;
  }

  if (await enviarCupomParaImpressao(dados.venda)) {
    alert('Cupom reenviado para a impressora.');
  } else {
    alert('Não foi possível imprimir o cupom.');
  }
}

function abrirEdicaoProduto(id) {
  const produto = state.produtos.find((item) => item.id === id);
  if (!produto) return;

  state.produtoEditId = id;
  document.getElementById('produtoEditId').value = String(id);
  document.getElementById('produtoNome').value = produto.nome;
  const categoriasLegadas = {
    Lanche: 'lanches',
    Bebida: 'Bebidas',
    Acompanhamento: 'comida'
  };
  document.getElementById('produtoCategoria').value = categoriasLegadas[produto.categoria] || produto.categoria;
  document.getElementById('produtoPreco').value = String(produto.preco);

  const submitBtn = document.querySelector('#formProduto button[type="submit"]');
  submitBtn.textContent = 'Salvar alterações';
  document.getElementById('cancelarEdicaoBtn').classList.remove('hidden');
}

function resetFormProduto() {
  state.produtoEditId = null;
  document.getElementById('produtoEditId').value = '';
  document.getElementById('formProduto').reset();
  const submitBtn = document.querySelector('#formProduto button[type="submit"]');
  submitBtn.textContent = 'Adicionar produto';
  document.getElementById('cancelarEdicaoBtn').classList.add('hidden');
}

async function excluirProduto(id) {
  const confirmed = window.confirm('Deseja remover esse produto do sistema?');
  if (!confirmed) return;

  const response = await fetch(`/api/produtos/${id}`, { method: 'DELETE' });
  const dados = await response.json();
  if (!response.ok) {
    alert(dados.erro || 'Erro ao excluir produto');
    return;
  }

  resetFormProduto();
  await carregarProdutos();
  alert('Produto removido com sucesso!');
}

function adicionarProdutoAoCarrinho(produtoId) {
  const produto = state.produtos.find((item) => item.id === produtoId);
  if (!produto) return;

  const itemExistente = state.carrinho.find((item) => item.id === produtoId);
  if (itemExistente) {
    itemExistente.quantidade += 1;
  } else {
    state.carrinho.push({
      id: produto.id,
      nome: produto.nome,
      categoria: produto.categoria,
      preco: Number(produto.preco),
      quantidade: 1
    });
  }

  renderCarrinho();
}

function alterarQuantidade(produtoId, delta) {
  const item = state.carrinho.find((produto) => produto.id === produtoId);
  if (!item) return;

  item.quantidade += delta;
  if (item.quantidade <= 0) {
    state.carrinho = state.carrinho.filter((produto) => produto.id !== produtoId);
  }

  renderCarrinho();
}

function renderCarrinho() {
  const tabela = document.getElementById('carrinhoTabela');
  const vazio = document.getElementById('carrinhoVazio');

  if (state.carrinho.length === 0) {
    tabela.innerHTML = '';
    vazio.style.display = 'block';
  } else {
    vazio.style.display = 'none';
    tabela.innerHTML = state.carrinho.map((item) => `
      <tr>
        <td>${item.nome}</td>
        <td>
          <div class="qty-control">
            <button type="button" data-action="menos" data-id="${item.id}">-</button>
            <span>${item.quantidade}</span>
            <button type="button" data-action="mais" data-id="${item.id}">+</button>
          </div>
        </td>
        <td>${formatMoney(item.preco)}</td>
        <td>${formatMoney(item.quantidade * item.preco)}</td>
      </tr>
    `).join('');

    tabela.querySelectorAll('button[data-action]').forEach((botao) => {
      botao.addEventListener('click', () => {
        const itemId = Number(botao.dataset.id);
        const tipo = botao.dataset.action;
        alterarQuantidade(itemId, tipo === 'mais' ? 1 : -1);
      });
    });
  }

  const total = calcularTotal();
  document.getElementById('totalPedido').textContent = formatMoney(total);

  const valorRecebido = Number(document.getElementById('valorRecebido').value || 0);
  const tipoPagamento = document.getElementById('formaPagamento').value;
  const troco = tipoPagamento === 'Dinheiro' ? Math.max(0, valorRecebido - total) : 0;
  document.getElementById('trocoPedido').textContent = formatMoney(troco);
}

async function finalizarVenda() {
  if (state.carrinho.length === 0) {
    alert('Adicione pelo menos um item antes de finalizar a venda.');
    return;
  }

  const formaPagamento = document.getElementById('formaPagamento').value;
  const valorRecebido = Number(document.getElementById('valorRecebido').value || 0);

  const payload = {
    forma_pagamento: formaPagamento,
    valor_recebido: valorRecebido,
    itens: state.carrinho.map((item) => ({
      id: item.id,
      quantidade: item.quantidade
    }))
  };

  const response = await fetch('/api/vendas', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const dados = await response.json();
  if (!response.ok) {
    alert(dados.erro || 'Erro ao registrar venda.');
    return;
  }

  state.cupomAtual = dados.venda;
  const cupom = state.cupomAtual;
  const conteudo = `
${STORE_NAME}
CNPJ: ${STORE_CNPJ}
====================
Cupom: ${cupom.numero_cupom}
Data: ${cupom.data_hora}
Forma: ${cupom.forma_pagamento}

${cupom.itens.map((item) => `${item.nome} x${item.quantidade} - ${formatMoney(item.subtotal)}`).join('\n')}

TOTAL: ${formatMoney(cupom.total)}
RECEBIDO: ${formatMoney(cupom.valor_recebido)}
TROCO: ${formatMoney(cupom.troco)}
====================
Obrigado e volte sempre!
  `;

  document.getElementById('numeroCupom').textContent = cupom.numero_cupom;
  document.getElementById('cupomConteudo').textContent = conteudo;

  const impressao = await enviarCupomParaImpressao(cupom);

  state.carrinho = [];
  document.getElementById('valorRecebido').value = '0';
  renderCarrinho();
  await carregarVendas();
  await carregarDashboard();
  alert(impressao
    ? 'Venda finalizada e cupom impresso com sucesso!'
    : 'Venda finalizada, mas não foi possível imprimir o cupom.');
}

async function cadastrarProduto(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form).entries());

  const payload = {
    nome: data.nome,
    categoria: data.categoria,
    preco: Number(data.preco)
  };

  let response;
  if (state.produtoEditId) {
    response = await fetch(`/api/produtos/${state.produtoEditId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } else {
    response = await fetch('/api/produtos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  }

  const dados = await response.json();
  if (!response.ok) {
    alert(dados.erro || 'Erro ao salvar produto');
    return;
  }

  form.reset();
  resetFormProduto();
  await carregarProdutos();
  alert(state.produtoEditId ? 'Produto atualizado com sucesso!' : 'Produto cadastrado com sucesso!');
}

async function fecharCaixa() {
  const response = await fetch('/api/fechamentos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ observacao: 'Fechamento do caixa do dia' })
  });

  const dados = await response.json();
  if (!response.ok) {
    alert(dados.erro || 'Erro ao fechar caixa');
    return;
  }

  await carregarDashboard();
  alert('Caixa fechado com sucesso!');
}

function exportarCupom() {
  if (!state.cupomAtual) {
    alert('Nenhum cupom para exportar.');
    return;
  }

  const blob = new Blob([JSON.stringify(state.cupomAtual, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${state.cupomAtual.numero_cupom}.json`;
  link.click();
}

async function enviarCupomParaImpressao(cupom) {
  const response = await fetch('/api/imprimir-cupom', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...cupom, nome_loja: STORE_NAME, cnpj_loja: STORE_CNPJ })
  });
  const dados = await response.json();
  if (!response.ok) {
    console.error(dados.erro || 'Não foi possível imprimir o cupom.');
    return false;
  }
  return true;
}

async function imprimirCupom() {
  if (!state.cupomAtual) {
    alert('Nenhum cupom para imprimir.');
    return;
  }

  if (await enviarCupomParaImpressao(state.cupomAtual)) {
    alert('Cupom enviado para a impressora.');
  } else {
    alert('Não foi possível imprimir o cupom.');
  }
}

document.querySelectorAll('.nav-btn').forEach((button) => {
  button.addEventListener('click', () => setActiveView(button.dataset.view));
});

document.getElementById('toggleSidebarBtn').addEventListener('click', () => {
  document.body.classList.toggle('sidebar-collapsed');
});

document.getElementById('valorRecebido').addEventListener('input', renderCarrinho);
document.getElementById('formaPagamento').addEventListener('change', renderCarrinho);
document.getElementById('finalizarVenda').addEventListener('click', finalizarVenda);
document.getElementById('formProduto').addEventListener('submit', cadastrarProduto);
document.getElementById('cancelarEdicaoBtn').addEventListener('click', resetFormProduto);
document.getElementById('fecharCaixaBtn').addEventListener('click', fecharCaixa);
document.getElementById('aplicarRelatorioBtn').addEventListener('click', carregarRelatorio);
document.querySelectorAll('[data-period]').forEach((button) => {
  button.addEventListener('click', () => {
    const hoje = new Date();
    const dataFim = toDateInputValue(hoje);
    let dataInicio = dataFim;

    if (button.dataset.period === 'yesterday') {
      hoje.setDate(hoje.getDate() - 1);
      dataInicio = toDateInputValue(hoje);
    } else if (button.dataset.period === '7days') {
      hoje.setDate(hoje.getDate() - 6);
      dataInicio = toDateInputValue(hoje);
    } else if (button.dataset.period === 'month') {
      dataInicio = toDateInputValue(new Date(hoje.getFullYear(), hoje.getMonth(), 1));
    }

    document.getElementById('relatorioDataInicio').value = dataInicio;
    document.getElementById('relatorioDataFim').value = button.dataset.period === 'yesterday'
      ? dataInicio
      : dataFim;
    carregarRelatorio();
  });
});
document.getElementById('buscarVendasInput').addEventListener('input', (event) => {
  carregarVendas(event.target.value.trim());
});
document.getElementById('buscarProdutosInput').addEventListener('input', (event) => {
  renderProdutos(event.target.value);
});
document.getElementById('imprimirCupomBtn').addEventListener('click', imprimirCupom);
document.getElementById('exportarCupomBtn').addEventListener('click', exportarCupom);
document.getElementById('novaComandaBtn').addEventListener('click', criarComanda);
document.getElementById('salvarNomeComandaBtn').addEventListener('click', renomearComandaAtual);
document.getElementById('fecharComandaBtn').addEventListener('click', fecharComandaAtual);
document.getElementById('nomeComandaInput').addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    renomearComandaAtual();
  }
});
document.getElementById('formaPagamentoComanda').addEventListener('change', () => {
  const comanda = getComandaAtiva();
  if (!comanda) return;
  const total = comanda.itens.reduce((sum, item) => sum + item.quantidade * item.preco, 0);
  const valorRecebido = document.getElementById('valorRecebidoComanda');
  const forma = document.getElementById('formaPagamentoComanda').value;
  valorRecebido.value = forma === 'Dinheiro' ? String(total) : '0';
});

setActiveView('caixa');
resetFormProduto();
const hojeRelatorio = toDateInputValue(new Date());
document.getElementById('relatorioDataInicio').value = hojeRelatorio;
document.getElementById('relatorioDataFim').value = hojeRelatorio;
carregarProdutos();
carregarVendas();
carregarDashboard();
carregarRelatorio();
renderCarrinho();
renderComandas();
