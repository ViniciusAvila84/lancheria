document.addEventListener('DOMContentLoaded', () => {
  const products = [
      { category: 'Bebidas', name: 'Agua mineral', price: 4.5 }, { category: 'Bebidas', name: 'Cafe coado', price: 5 }, { category: 'Bebidas', name: 'Refrigerante lata', price: 6.5 }, { category: 'Bebidas', name: 'Suco natural', price: 8 },
      { category: 'lanches', name: 'Pao de queijo', price: 5.5 }, { category: 'lanches', name: 'Misto quente', price: 9 }, { category: 'lanches', name: 'Sanduiche natural', price: 12 },
      { category: 'comida', name: 'Salada completa', price: 18 }, { category: 'comida', name: 'Porcao de fritas', price: 16 }, { category: 'comida', name: 'Prato feito', price: 22 },
      { category: 'combos', name: 'Combo cafe + pao', price: 12 }, { category: 'combos', name: 'Combo lanche + refri', price: 18 },
    ];
  const categories = ['Bebidas', 'lanches', 'comida', 'combos'];
  const cart = new Map();
  const adjustments = [];
  const money = (value) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const categoryList = document.getElementById('categoryList');
  const receiptItems = document.getElementById('receiptItems');
  const adjustmentForm = document.getElementById('adjustmentForm');

    const renderCategories = (query = '') => {
      const normalizedQuery = query.trim().toLowerCase();
      categoryList.innerHTML = categories.map((category) => {
        const visibleProducts = products.filter((product) => product.category === category && product.name.toLowerCase().includes(normalizedQuery)).sort((a, b) => a.price - b.price);
        if (normalizedQuery && !visibleProducts.length) return '';
        return `<details class="category" ${normalizedQuery ? 'open' : ''}><summary><span class="category-title">${category}</span><span class="category-count">${visibleProducts.length} ${visibleProducts.length === 1 ? 'item' : 'itens'} <b>＋</b></span></summary><div class="product-list">${visibleProducts.map((product) => `<button class="product" type="button" data-product="${product.name}"><span><strong>${product.name}</strong><small>${category}</small></span><b>${money(product.price)}</b></button>`).join('')}</div></details>`;
      }).join('') || '<p class="no-results">Nenhum produto encontrado.</p>';
      categoryList.querySelectorAll('.product').forEach((button) => button.addEventListener('click', () => addProduct(button.dataset.product)));
    };

    const addProduct = (name) => {
      const product = products.find((item) => item.name === name);
      const item = cart.get(name) || { ...product, quantity: 0 };
      item.quantity += 1;
      cart.set(name, item);
      renderReceipt();
    };

    const renderReceipt = () => {
      const items = [...cart.values()];
      receiptItems.innerHTML = items.length ? items.map((item) => `<div class="receipt-item"><div class="item-details"><strong>${item.name}</strong><small>${money(item.price)} cada</small></div><div class="quantity"><button type="button" data-action="decrease" data-product="${item.name}" aria-label="Remover um">−</button><strong>${item.quantity}</strong><button type="button" data-action="increase" data-product="${item.name}" aria-label="Adicionar um">＋</button></div><b class="item-total">${money(item.price * item.quantity)}</b></div>`).join('') : '<div class="empty-receipt"><span>＋</span><strong>Sua nota esta vazia</strong><small>Selecione um item ao lado para começar</small></div>';
      receiptItems.querySelectorAll('[data-action]').forEach((button) => button.addEventListener('click', () => updateQuantity(button.dataset.product, button.dataset.action)));
      renderAdjustments();
      updateTotals();
    };

    const updateQuantity = (name, action) => {
      const item = cart.get(name);
      item.quantity += action === 'increase' ? 1 : -1;
      if (item.quantity <= 0) cart.delete(name);
      renderReceipt();
    };

    const renderAdjustments = () => {
      document.getElementById('adjustmentList').innerHTML = adjustments.map((adjustment, index) => `<div class="adjustment-line"><span>${adjustment.description || (adjustment.type === 'additional' ? 'Adicional' : 'Desconto')}<small>${adjustment.type === 'additional' ? 'Adicional' : 'Desconto'}</small></span><strong class="${adjustment.type === 'discount' ? 'negative' : ''}">${adjustment.type === 'discount' ? '-' : '+'} ${money(adjustment.value)}</strong><button type="button" data-adjustment="${index}" aria-label="Remover ajuste">×</button></div>`).join('');
      document.querySelectorAll('[data-adjustment]').forEach((button) => button.addEventListener('click', () => { adjustments.splice(Number(button.dataset.adjustment), 1); renderReceipt(); }));
    };

    const updateTotals = () => {
      const subtotal = [...cart.values()].reduce((sum, item) => sum + item.price * item.quantity, 0);
      const additional = adjustments.filter((item) => item.type === 'additional').reduce((sum, item) => sum + item.value, 0);
      const discount = adjustments.filter((item) => item.type === 'discount').reduce((sum, item) => sum + item.value, 0);
      document.getElementById('subtotal').textContent = money(subtotal + additional);
      document.getElementById('discountTotal').textContent = `- ${money(discount)}`;
      document.getElementById('discountRow').hidden = discount === 0;
      document.getElementById('grandTotal').textContent = money(Math.max(0, subtotal + additional - discount));
    };

    document.getElementById('searchInput').addEventListener('input', (event) => renderCategories(event.target.value));
    document.getElementById('toggleAdjustment').addEventListener('click', () => { adjustmentForm.hidden = !adjustmentForm.hidden; });
    document.getElementById('addAdjustment').addEventListener('click', () => {
      const description = document.getElementById('adjustmentDescription').value.trim();
      const value = Number(document.getElementById('adjustmentValue').value);
      if (!value || value < 0) return;
      adjustments.push({ type: document.getElementById('adjustmentType').value, description, value });
      document.getElementById('adjustmentDescription').value = '';
      document.getElementById('adjustmentValue').value = '';
      adjustmentForm.hidden = true;
      renderReceipt();
    });
    document.getElementById('clearSale').addEventListener('click', () => { cart.clear(); adjustments.length = 0; renderReceipt(); });
    document.getElementById('collapseSidebar').addEventListener('click', () => { document.body.classList.toggle('sidebar-collapsed'); });
    document.getElementById('finishSale').addEventListener('click', () => { if (!cart.size) return; const toast = document.getElementById('toast'); toast.textContent = 'Venda pronta para recebimento.'; toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 2600); });
    renderCategories();
    renderReceipt();
  });
