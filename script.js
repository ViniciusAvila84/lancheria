document.addEventListener('DOMContentLoaded', () => {
  const products = [
      { category: 'Bebidas', name: 'Agua mineral', price: 4.5 }, { category: 'Bebidas', name: 'Cafe coado', price: 5 }, { category: 'Bebidas', name: 'Refrigerante lata', price: 6.5 }, { category: 'Bebidas', name: 'Suco natural', price: 8 },
      { category: 'lanches', name: 'Pao de queijo', price: 5.5 }, { category: 'lanches', name: 'Misto quente', price: 9 }, { category: 'lanches', name: 'Sanduiche natural', price: 12 },
      { category: 'comida', name: 'Salada completa', price: 18 }, { category: 'comida', name: 'Porcao de fritas', price: 16 }, { category: 'comida', name: 'Prato feito', price: 22 },
      { category: 'combos', name: 'Combo cafe + pao', price: 12 }, { category: 'combos', name: 'Combo lanche + refri', price: 18 },
    ];
  const categories = ['Bebidas', 'lanches', 'comida', 'combos'].sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
  const money = (value) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const categoryList = document.getElementById('categoryList');

    const renderCategories = (query = '') => {
      const normalizedQuery = query.trim().toLowerCase();
      categoryList.innerHTML = categories.map((category) => {
        const visibleProducts = products.filter((product) => product.category === category && product.name.toLowerCase().includes(normalizedQuery)).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }));
        if (normalizedQuery && !visibleProducts.length) return '';
        return `<details class="category" ${normalizedQuery ? 'open' : ''}><summary><span class="category-title">${category}</span><span class="category-count">${visibleProducts.length} ${visibleProducts.length === 1 ? 'item' : 'itens'} <b>＋</b></span></summary><div class="product-list">${visibleProducts.map((product) => `<div class="product"><span><strong>${product.name}</strong><small>${category}</small></span><b>${money(product.price)}</b></div>`).join('')}</div></details>`;
      }).join('') || '<p class="no-results">Nenhum produto encontrado.</p>';
    };


    document.getElementById('searchInput').addEventListener('input', (event) => renderCategories(event.target.value));
    document.getElementById('collapseSidebar').addEventListener('click', () => { document.body.classList.toggle('sidebar-collapsed'); });
    renderCategories();
  });
