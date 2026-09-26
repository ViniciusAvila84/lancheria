document.addEventListener('DOMContentLoaded', () => {
  const products = [
    { category: 'Bebidas', name: 'Agua mineral', price: 4.5 },
    { category: 'Bebidas', name: 'Cafe coado', price: 5 },
    { category: 'Bebidas', name: 'Refrigerante lata', price: 6.5 },
    { category: 'Bebidas', name: 'Suco natural', price: 8 },
    { category: 'lanches', name: 'Pao de queijo', price: 5.5 },
    { category: 'lanches', name: 'Misto quente', price: 9 },
    { category: 'lanches', name: 'Sanduiche natural', price: 12 },
    { category: 'comida', name: 'Salada completa', price: 18 },
    { category: 'comida', name: 'Porcao de fritas', price: 16 },
    { category: 'comida', name: 'Prato feito', price: 22 },
    { category: 'combos', name: 'Combo cafe + pao', price: 12 },
    { category: 'combos', name: 'Combo lanche + refri', price: 18 },
  ];

  const categories = ['Bebidas', 'lanches', 'comida', 'combos'].sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
  const money = (value) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const categoryList = document.getElementById('categoryList');
  const receiptItems = document.getElementById('receiptItems');
  const toast = document.getElementById('toast');
  const navItems = document.querySelectorAll('.nav-item');
  const panels = document.querySelectorAll('.page-panel');
  const titleElement = document.querySelector('.topbar h1');
  const cart = new Map();

  const state = {
    activeView: 'caixa',
    nextComandaId: 2,
    openedComandas: [{ id: 1, name: 'Comanda 01', customer: 'Mesa 1', items: [] }],
    selectedComandaId: 1,
  };

  const showToast = (message) => {
    toast.textContent = message;
    toast.classList.add('show');
    window.clearTimeout(showToast.timeoutId);
    showToast.timeoutId = window.setTimeout(() => toast.classList.remove('show'), 1800);
  };

  const getSelectedComanda = () => state.openedComandas.find((comanda) => comanda.id === state.selectedComandaId) || state.openedComandas[0];

  const switchView = (view) => {
    state.activeView = view;
    panels.forEach((panel) => {
      panel.classList.toggle('active', panel.dataset.panel === view);
    });
    navItems.forEach((item) => {
      item.classList.toggle('active', item.dataset.view === view);
    });
    titleElement.textContent = view === 'comandas' ? 'Comandas' : 'Caixa';
    if (view === 'comandas') {
      renderComandas();
    }
  };

  const addProductToCart = (name) => {
    const product = products.find((item) => item.name === name);
    if (!product) return;

    const item = cart.get(name) || { ...product, quantity: 0 };
    item.quantity += 1;
    cart.set(name, item);
    renderReceipt();
  };

  const addProductToComanda = (name) => {
    const comanda = getSelectedComanda();
    if (!comanda) {
      showToast('Selecione uma comanda para adicionar o item');
      return;
    }

    const product = products.find((item) => item.name === name);
    if (!product) return;

    const item = comanda.items.find((entry) => entry.name === product.name) || { ...product, quantity: 0 };
    if (!comanda.items.includes(item)) {
      comanda.items.push(item);
    }

    item.quantity += 1;
    renderComandas();
    showToast(`${product.name} adicionado em ${comanda.name}`);
  };

  const addProductForCurrentView = (name) => {
    if (state.activeView === 'comandas') {
      addProductToComanda(name);
      return;
    }

    addProductToCart(name);
  };

  const renderCategories = (query = '') => {
    const normalizedQuery = query.trim().toLowerCase();
    categoryList.innerHTML = categories.map((category) => {
      const visibleProducts = products
        .filter((product) => product.category === category && product.name.toLowerCase().includes(normalizedQuery))
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }));

      if (normalizedQuery && !visibleProducts.length) return '';

      return `<details class="category" ${normalizedQuery ? 'open' : ''}><summary><span class="category-title">${category}</span><span class="category-count">${visibleProducts.length} ${visibleProducts.length === 1 ? 'item' : 'itens'} <b>＋</b></span></summary><div class="product-list">${visibleProducts.map((product) => `<button class="product" type="button" data-product="${product.name}"><span><strong>${product.name}</strong><small>${category}</small></span><b>${money(product.price)}</b></button>`).join('')}</div></details>`;
    }).join('') || '<p class="no-results">Nenhum produto encontrado.</p>';

    categoryList.querySelectorAll('.product').forEach((button) => {
      button.addEventListener('click', () => addProductForCurrentView(button.dataset.product));
    });
  };

  const renderReceipt = () => {
    const items = [...cart.values()];
    receiptItems.innerHTML = items.length ? items.map((item) => `<div class="receipt-item"><div class="item-details"><strong>${item.name}</strong><small>${money(item.price)} cada</small></div><div class="quantity"><button type="button" data-action="decrease" data-product="${item.name}" aria-label="Remover um">−</button><strong>${item.quantity}</strong><button type="button" data-action="increase" data-product="${item.name}" aria-label="Adicionar um">＋</button></div><b class="item-total">${money(item.price * item.quantity)}</b></div>`).join('') : '<div class="empty-receipt"><span>＋</span><strong>Sua nota esta vazia</strong><small>Selecione um item ao lado para começar</small></div>';

    receiptItems.querySelectorAll('[data-action]').forEach((button) => {
      button.addEventListener('click', () => updateQuantity(button.dataset.product, button.dataset.action));
    });

    updateTotals();
  };

  const updateQuantity = (name, action) => {
    const item = cart.get(name);
    if (!item) return;

    item.quantity += action === 'increase' ? 1 : -1;
    if (item.quantity <= 0) cart.delete(name);
    renderReceipt();
  };

  const updateTotals = () => {
    const total = [...cart.values()].reduce((sum, item) => sum + item.price * item.quantity, 0);
    document.getElementById('subtotal').textContent = money(total);
    document.getElementById('grandTotal').textContent = money(total);
  };

  const renderComandas = () => {
    const comandaList = document.getElementById('comandaList');
    const comandaDetail = document.getElementById('comandaDetail');

    comandaList.innerHTML = state.openedComandas.map((comanda) => {
      const total = comanda.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
      const isSelected = comanda.id === state.selectedComandaId;

      return `<button class="comanda-card ${isSelected ? 'active' : ''}" type="button" data-comanda-id="${comanda.id}"><small>${comanda.customer}</small><strong>${comanda.name}</strong><b>${money(total)}</b></button>`;
    }).join('');

    comandaList.querySelectorAll('.comanda-card').forEach((button) => {
      button.addEventListener('click', () => {
        state.selectedComandaId = Number(button.dataset.comandaId);
        renderComandas();
      });
    });

    const selectedComanda = getSelectedComanda();
    if (!selectedComanda) {
      comandaDetail.innerHTML = '<p class="empty-state">Nenhuma comanda aberta.</p>';
      return;
    }

    const total = selectedComanda.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    comandaDetail.innerHTML = `
      <div class="comanda-header">
        <div>
          <p class="overline">Comanda ativa</p>
          <h2>${selectedComanda.name}</h2>
        </div>
        <button class="clear-button" id="closeComanda" type="button">Fechar</button>
      </div>
      <div class="comanda-meta-row">
        <span>${selectedComanda.customer}</span>
        <span>Total: <strong>${money(total)}</strong></span>
      </div>
      <div class="receipt-items">
        ${selectedComanda.items.length ? selectedComanda.items.map((item) => `
          <div class="receipt-item">
            <div class="item-details">
              <strong>${item.name}</strong>
              <small>${money(item.price)} cada</small>
            </div>
            <div class="quantity">
              <button type="button" data-comanda-action="decrease" data-comanda-product="${item.name}" aria-label="Remover um">−</button>
              <strong>${item.quantity}</strong>
              <button type="button" data-comanda-action="increase" data-comanda-product="${item.name}" aria-label="Adicionar um">＋</button>
            </div>
            <b class="item-total">${money(item.price * item.quantity)}</b>
          </div>
        `).join('') : '<div class="empty-receipt"><span>＋</span><strong>Comanda vazia</strong><small>Selecione um item do catálogo para começar</small></div>'}
      </div>
      <div class="totals">
        <div><span>Subtotal</span><strong>${money(total)}</strong></div>
        <div class="total-row"><span>Total</span><strong>${money(total)}</strong></div>
      </div>
      <button class="finish-button" id="closeComandaButton" type="button">Fechar comanda <span>→</span></button>
    `;

    comandaDetail.querySelectorAll('[data-comanda-action]').forEach((button) => {
      button.addEventListener('click', () => updateComandaQuantity(button.dataset.comandaProduct, button.dataset.comandaAction));
    });

    const closeComandaButton = document.getElementById('closeComanda');
    if (closeComandaButton) {
      closeComandaButton.addEventListener('click', closeSelectedComanda);
    }

    const closeComandaActionButton = document.getElementById('closeComandaButton');
    if (closeComandaActionButton) {
      closeComandaActionButton.addEventListener('click', closeSelectedComanda);
    }
  };

  const updateComandaQuantity = (name, action) => {
    const selectedComanda = getSelectedComanda();
    if (!selectedComanda) return;

    const item = selectedComanda.items.find((entry) => entry.name === name);
    if (!item) return;

    item.quantity += action === 'increase' ? 1 : -1;

    if (item.quantity <= 0) {
      selectedComanda.items = selectedComanda.items.filter((entry) => entry.name !== name);
    }

    renderComandas();
  };

  const closeSelectedComanda = () => {
    const selectedComanda = getSelectedComanda();
    if (!selectedComanda) return;

    state.openedComandas = state.openedComandas.filter((comanda) => comanda.id !== selectedComanda.id);
    state.selectedComandaId = state.openedComandas[0]?.id || null;
    renderComandas();
    showToast(`${selectedComanda.name} fechada`);
  };

  document.getElementById('searchInput').addEventListener('input', (event) => renderCategories(event.target.value));
  document.getElementById('collapseSidebar').addEventListener('click', () => document.body.classList.toggle('sidebar-collapsed'));
  document.getElementById('clearSale').addEventListener('click', () => {
    cart.clear();
    renderReceipt();
  });
  document.getElementById('finishSale').addEventListener('click', () => {
    if (!cart.size) return;
    cart.clear();
    renderReceipt();
    showToast('Venda finalizada');
  });

  document.getElementById('newComanda').addEventListener('click', () => {
    const newComanda = {
      id: state.nextComandaId,
      name: `Comanda ${String(state.nextComandaId).padStart(2, '0')}`,
      customer: `Mesa ${state.nextComandaId}`,
      items: [],
    };

    state.nextComandaId += 1;
    state.openedComandas.unshift(newComanda);
    state.selectedComandaId = newComanda.id;
    renderComandas();
    showToast(`${newComanda.name} aberta`);
  });

  navItems.forEach((item) => {
    item.addEventListener('click', (event) => {
      event.preventDefault();
      switchView(item.dataset.view);
    });
  });

  renderCategories();
  renderReceipt();
  renderComandas();
});
